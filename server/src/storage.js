const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {Readable} = require("node:stream");
const sharp = require("sharp");
const {v2: cloudinary} = require("cloudinary");
const {ApiError} = require("./errors");

const extensions = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/heic": ".heic",
  "image/heif": ".heic",
};

function inferMimeType(buffer) {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length > 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buffer.length > 12 && buffer.subarray(4, 8).toString() === "ftyp") {
    const brand = buffer.subarray(8, 12).toString();
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heis", "hevm", "heim"].includes(brand)) return "image/heic";
  }
  return null;
}

function validSignature(buffer, mimeType) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    return buffer.length > 12 && buffer.subarray(4, 8).toString() === "ftyp" && ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heis", "hevm", "heim"].includes(buffer.subarray(8, 12).toString());
  }
  return false;
}

function normalizeUploadedFile(file) {
  if (!file) return file;
  const detectedMimeType = inferMimeType(file.buffer) || (file.mimetype === "image/jpg" ? "image/jpeg" : file.mimetype);
  if (detectedMimeType && extensions[detectedMimeType]) {
    file.mimetype = detectedMimeType;
  }
  return file;
}

// Per-purpose compression targets, mirroring the dimension/quality ladder
// the Flutter client already applies client-side (lib/services/image_service.dart)
// so the server doesn't undo that work by re-encoding everything the same
// way. Quality floors are kept higher than the client's own floors because
// the wardrobe_item buffer this produces is also what's fed directly to
// Gemini for analysis (see analyzer.analyzeWardrobe in app.js) — going too
// low here risks unreliable analysis, not just a worse-looking thumbnail.
// No entry (undefined purpose) keeps today's exact behavior: a single
// 1800px / quality 82 pass with no byte-size target.
const IMAGE_PROFILES = {
  wardrobe_item: {dimensionSteps: [1024, 900, 768, 640], qualitySteps: [80, 70, 60, 50], targetMaxBytes: 150 * 1024},
  profile_analysis: {dimensionSteps: [1280, 1100, 950, 800], qualitySteps: [85, 75, 65, 55], targetMaxBytes: 350 * 1024},
  tryon_result: {dimensionSteps: [1280, 1100, 950, 800], qualitySteps: [85, 75, 65, 55], targetMaxBytes: 300 * 1024},
};
const DEFAULT_IMAGE_PROFILE = {dimensionSteps: [1800], qualitySteps: [82], targetMaxBytes: null};

function resizeIfNeeded(image, metadata, maxDimension) {
  const longestSide = Math.max(metadata.width || 0, metadata.height || 0);
  if (longestSide <= maxDimension) return image;
  const scale = maxDimension / longestSide;
  return image.resize({
    width: Math.max(1, Math.round((metadata.width || maxDimension) * scale)),
    height: Math.max(1, Math.round((metadata.height || maxDimension) * scale)),
    fit: "inside",
    withoutEnlargement: false,
  });
}

// Tries each dimension step (largest first) against every quality step
// (highest first), returning the first encode that fits targetMaxBytes. If
// none do (rare — only very detailed images at the smallest/lowest step),
// falls back to the smallest buffer actually produced, so output size never
// regresses past what the ladder could achieve.
async function encodeToTarget(image, metadata, profile) {
  let smallest = null;
  for (const dimension of profile.dimensionSteps) {
    const resized = resizeIfNeeded(image, metadata, dimension);
    for (const quality of profile.qualitySteps) {
      const buffer = await resized.clone().jpeg({quality, progressive: true}).toBuffer();
      if (!profile.targetMaxBytes || buffer.length <= profile.targetMaxBytes) return buffer;
      if (!smallest || buffer.length < smallest.length) smallest = buffer;
    }
  }
  return smallest;
}

async function processUploadedFile(file, purpose) {
  if (!file?.buffer) return file;
  const normalizedFile = normalizeUploadedFile(file);
  if (!normalizedFile?.buffer) return normalizedFile;
  const mimeType = normalizedFile.mimetype;
  if (!mimeType || !extensions[mimeType] || !validSignature(normalizedFile.buffer, mimeType)) return normalizedFile;

  try {
    const image = sharp(normalizedFile.buffer).rotate();
    const metadata = await image.metadata();
    const profile = IMAGE_PROFILES[purpose] || DEFAULT_IMAGE_PROFILE;
    const processedBuffer = await encodeToTarget(image, metadata, profile);
    return {
      ...normalizedFile,
      buffer: processedBuffer,
      size: processedBuffer.length,
      mimetype: "image/jpeg",
      originalname: normalizedFile.originalname ? `${path.parse(normalizedFile.originalname).name || "image"}.jpg` : "image.jpg",
      processed: true,
    };
  } catch {
    if (mimeType === "image/heic" || mimeType === "image/heif") {
      // sharp's libvips build cannot always decode HEIC/HEIF (support varies
      // by platform and is frequently unavailable). Falling back to the
      // original, unconverted HEIC bytes would store a format the Postgres
      // media_assets.mime_type check (jpeg/png/webp only) rejects, and that
      // every storage backend otherwise assumes is always JPEG post-processing.
      // Reject clearly here instead of persisting an inconsistent asset.
      throw new ApiError(400, "IMAGE_PROCESSING_FAILED", "This photo's format (HEIC/HEIF) could not be processed. Please try a different photo, or convert it to JPEG first.");
    }
    return normalizedFile;
  }
}

class LocalAssetStore {
  constructor({uploadDir, publicBaseUrl}) {
    this.uploadDir = uploadDir;
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, "");
  }

  async save(userId, file) {
    const normalizedFile = file?.processed ? file : await processUploadedFile(file);
    const mimeType = normalizedFile?.mimetype;
    if (!normalizedFile || !normalizedFile.buffer || !mimeType || !extensions[mimeType] || !validSignature(normalizedFile.buffer, mimeType)) {
      throw new ApiError(400, "INVALID_IMAGE", "Upload a valid JPG, JPEG, PNG, or HEIC image.");
    }
    const directory = path.join(this.uploadDir, userId);
    await fs.mkdir(directory, {recursive: true});
    const key = `${userId}/${crypto.randomUUID()}${extensions[mimeType]}`;
    await fs.writeFile(path.join(this.uploadDir, key), normalizedFile.buffer, {flag: "wx"});
    return {storageProvider: "local", storageKey: key.replaceAll("\\", "/"), publicUrl: `${this.publicBaseUrl}/uploads/${key.replaceAll("\\", "/")}`, originalFilename: path.basename(normalizedFile.originalname || "image").slice(0, 255), mimeType, byteSize: normalizedFile.size, checksumSha256: crypto.createHash("sha256").update(normalizedFile.buffer).digest("hex")};
  }

  async remove(storageKey) {
    const target = path.resolve(this.uploadDir, storageKey);
    if (!target.startsWith(`${this.uploadDir}${path.sep}`)) return;
    await fs.rm(target, {force: true});
  }

  // Development/testing only: files are served directly by the static
  // /uploads route, so there is nothing to sign or expire.
  async signedUrl(storageKey) {
    return storageKey ? `${this.publicBaseUrl}/uploads/${storageKey}` : "";
  }

  // Reads a previously stored asset's raw bytes directly from disk, for
  // server-side reuse (e.g. feeding it to the virtual try-on model) without
  // an unnecessary self-referential HTTP round trip through publicBaseUrl.
  async readBytes(storageKey) {
    const target = path.resolve(this.uploadDir, storageKey || "");
    if (!storageKey || !target.startsWith(`${this.uploadDir}${path.sep}`)) {
      throw new ApiError(404, "ASSET_NOT_FOUND", "The stored image was not found.");
    }
    let buffer;
    try {
      buffer = await fs.readFile(target);
    } catch (_) {
      throw new ApiError(404, "ASSET_NOT_FOUND", "The stored image was not found.");
    }
    return {buffer, mimetype: inferMimeType(buffer) || "image/jpeg"};
  }
}

// Private object storage backed by Cloudinary. Assets upload under delivery
// type "authenticated" (never the public "upload" type), so nothing is
// servable without a signed URL. signedUrl() always mints that URL on
// demand rather than persisting one. When CLOUDINARY_AUTH_TOKEN_KEY is
// configured (a token-based authentication key created in the Cloudinary
// console under Settings > Security), the signed URL also carries a
// short-lived expiring token, mirroring R2's presigned GetObject URLs;
// without it, the URL is still signed/private but does not expire.
class CloudinaryAssetStore {
  // `cloudinaryClient` is injectable (defaulting to the real SDK) because
  // the Cloudinary SDK is a configured module-level singleton rather than a
  // per-instance client like the S3 SDK, so tests supply a fake instead of
  // mutating shared global state.
  constructor(config, cloudinaryClient = cloudinary) {
    this.folder = (config.cloudinaryFolder || "nera").replace(/^\/+|\/+$/g, "");
    this.signedUrlTtlSeconds = config.cloudinarySignedUrlTtlSeconds || 900;
    this.authTokenKey = config.cloudinaryAuthTokenKey || "";
    this.client = cloudinaryClient;
    this.client.config({
      cloud_name: config.cloudinaryCloudName,
      api_key: config.cloudinaryApiKey,
      api_secret: config.cloudinaryApiSecret,
      secure: true,
    });
  }

  async save(userId, file) {
    const normalizedFile = file?.processed ? file : await processUploadedFile(file);
    const mimeType = normalizedFile?.mimetype;
    if (!normalizedFile || !normalizedFile.buffer || !mimeType || !extensions[mimeType] || !validSignature(normalizedFile.buffer, mimeType)) {
      throw new ApiError(400, "INVALID_IMAGE", "Upload a valid JPG, JPEG, PNG, or HEIC image.");
    }
    const publicId = `${this.folder}/${userId}/${crypto.randomUUID()}`;
    const uploaded = await new Promise((resolve, reject) => {
      const uploadStream = this.client.uploader.upload_stream(
        {public_id: publicId, type: "authenticated", resource_type: "image", overwrite: false},
        (error, result) => (error ? reject(error) : resolve(result)),
      );
      uploadStream.on("error", reject);
      Readable.from(normalizedFile.buffer).pipe(uploadStream);
    });
    return {storageProvider: "cloudinary", storageKey: uploaded.public_id, originalFilename: path.basename(normalizedFile.originalname || "image").slice(0, 255), mimeType, byteSize: normalizedFile.size, checksumSha256: crypto.createHash("sha256").update(normalizedFile.buffer).digest("hex")};
  }

  async remove(storageKey) {
    if (!storageKey) return;
    await this.client.uploader.destroy(storageKey, {type: "authenticated", resource_type: "image", invalidate: true});
  }

  // New public IDs are extensionless and need an explicit JPEG delivery
  // format. Legacy public IDs may already include their source extension;
  // passing format for those would make Cloudinary append a second one.
  async signedUrl(storageKey) {
    if (!storageKey) return "";
    const hasImageExtension = /\.(?:jpe?g|png|webp)$/i.test(storageKey);
    return this.client.url(storageKey, {
      type: "authenticated",
      resource_type: "image",
      ...(!hasImageExtension ? {format: "jpg"} : {}),
      secure: true,
      sign_url: true,
      ...(this.authTokenKey ? {auth_token: {key: this.authTokenKey, duration: this.signedUrlTtlSeconds}} : {}),
    });
  }

  // Cloudinary's authenticated delivery URL is a real external HTTPS
  // endpoint regardless of what host this server itself is reachable on, so
  // (unlike LocalAssetStore) fetching it back over the network is correct.
  async readBytes(storageKey) {
    const url = await this.signedUrl(storageKey);
    if (!url) throw new ApiError(404, "ASSET_NOT_FOUND", "The stored image was not found.");
    let response;
    try {
      response = await fetch(url, {signal: AbortSignal.timeout(20_000)});
    } catch (_) {
      throw new ApiError(502, "ASSET_FETCH_FAILED", "The stored image could not be retrieved.");
    }
    if (!response.ok) throw new ApiError(502, "ASSET_FETCH_FAILED", "The stored image could not be retrieved.");
    const arrayBuffer = await response.arrayBuffer();
    const contentType = (response.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    return {buffer: Buffer.from(arrayBuffer), mimetype: contentType};
  }
}

module.exports = {LocalAssetStore, CloudinaryAssetStore, validSignature, normalizeUploadedFile, processUploadedFile};

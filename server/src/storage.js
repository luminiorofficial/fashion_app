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

async function processUploadedFile(file) {
  if (!file?.buffer) return file;
  const normalizedFile = normalizeUploadedFile(file);
  if (!normalizedFile?.buffer) return normalizedFile;
  const mimeType = normalizedFile.mimetype;
  if (!mimeType || !extensions[mimeType] || !validSignature(normalizedFile.buffer, mimeType)) return normalizedFile;

  try {
    const image = sharp(normalizedFile.buffer).rotate();
    const metadata = await image.metadata();
    const longestSide = Math.max(metadata.width || 0, metadata.height || 0);
    let pipeline = image;

    if (longestSide > 1800) {
      const scale = 1800 / longestSide;
      pipeline = image.resize({
        width: Math.max(1, Math.round((metadata.width || 1800) * scale)),
        height: Math.max(1, Math.round((metadata.height || 1800) * scale)),
        fit: "inside",
        withoutEnlargement: false,
      });
    }

    const processedBuffer = await pipeline.jpeg({quality: 82, progressive: true}).toBuffer();
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

  // Every stored asset is re-encoded to JPEG by processUploadedFile() before
  // it reaches save(), so the delivery format is always "jpg".
  async signedUrl(storageKey) {
    if (!storageKey) return "";
    return this.client.url(storageKey, {
      type: "authenticated",
      resource_type: "image",
      format: "jpg",
      secure: true,
      sign_url: true,
      ...(this.authTokenKey ? {auth_token: {key: this.authTokenKey, duration: this.signedUrlTtlSeconds}} : {}),
    });
  }
}

module.exports = {LocalAssetStore, CloudinaryAssetStore, validSignature, normalizeUploadedFile, processUploadedFile};

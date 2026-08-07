const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");
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
}

module.exports = {LocalAssetStore, validSignature, normalizeUploadedFile, processUploadedFile};

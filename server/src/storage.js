const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {ApiError} = require("./errors");

const extensions = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"};

function validSignature(buffer, mimeType) {
  if (mimeType === "image/jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/webp") return buffer.length > 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
  return false;
}

class LocalAssetStore {
  constructor({uploadDir, publicBaseUrl}) {
    this.uploadDir = uploadDir;
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, "");
  }

  async save(userId, file) {
    if (!file || !extensions[file.mimetype] || !validSignature(file.buffer, file.mimetype)) {
      throw new ApiError(400, "INVALID_IMAGE", "Upload a valid JPEG, PNG, or WebP image.");
    }
    const directory = path.join(this.uploadDir, userId);
    await fs.mkdir(directory, {recursive: true});
    const key = `${userId}/${crypto.randomUUID()}${extensions[file.mimetype]}`;
    await fs.writeFile(path.join(this.uploadDir, key), file.buffer, {flag: "wx"});
    return {storageProvider: "local", storageKey: key.replaceAll("\\", "/"), publicUrl: `${this.publicBaseUrl}/uploads/${key.replaceAll("\\", "/")}`, mimeType: file.mimetype, byteSize: file.size, checksumSha256: crypto.createHash("sha256").update(file.buffer).digest("hex")};
  }

  async remove(storageKey) {
    const target = path.resolve(this.uploadDir, storageKey);
    if (!target.startsWith(`${this.uploadDir}${path.sep}`)) return;
    await fs.rm(target, {force: true});
  }
}

module.exports = {LocalAssetStore, validSignature};

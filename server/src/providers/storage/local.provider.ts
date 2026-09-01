import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {ApiError} from "../../utils/api-error";
import {IMAGE_EXTENSIONS, inferMimeType, processUploadedFile, validSignature} from "../../utils/image-processing";
import type {AssetStore, ReadableAsset, StoredFileMetadata, UploadedFile} from "../../types/provider.types";

export interface LocalAssetStoreConfig {
  uploadDir: string;
  publicBaseUrl: string;
}

// Development/testing-only asset store: files are served directly by the
// static /uploads route in app.ts, so there is nothing to sign or expire.
export class LocalAssetStore implements AssetStore {
  private readonly uploadDir: string;
  private readonly publicBaseUrl: string;

  constructor({uploadDir, publicBaseUrl}: LocalAssetStoreConfig) {
    this.uploadDir = uploadDir;
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, "");
  }

  // `purpose` is accepted (but unused) only to keep this method's signature
  // interchangeable with CloudinaryAssetStore.save, which uses it to route
  // new uploads into purpose-specific sub-folders; local disk storage keeps
  // its existing flat per-user layout.
  async save(userId: string, file: UploadedFile, _purpose?: string): Promise<StoredFileMetadata> {
    const normalizedFile = file?.processed ? file : ((await processUploadedFile(file)) as UploadedFile);
    const mimeType = normalizedFile?.mimetype;
    if (!normalizedFile || !normalizedFile.buffer || !mimeType || !IMAGE_EXTENSIONS[mimeType] || !validSignature(normalizedFile.buffer, mimeType)) {
      throw new ApiError(400, "INVALID_IMAGE", "Upload a valid JPG, JPEG, PNG, or HEIC image.");
    }
    const directory = path.join(this.uploadDir, userId);
    await fs.mkdir(directory, {recursive: true});
    const key = `${userId}/${crypto.randomUUID()}${IMAGE_EXTENSIONS[mimeType]}`;
    await fs.writeFile(path.join(this.uploadDir, key), normalizedFile.buffer, {flag: "wx"});
    return {
      storageProvider: "local",
      storageKey: key.replaceAll("\\", "/"),
      publicUrl: `${this.publicBaseUrl}/uploads/${key.replaceAll("\\", "/")}`,
      originalFilename: path.basename(normalizedFile.originalname || "image").slice(0, 255),
      mimeType,
      byteSize: normalizedFile.size,
      checksumSha256: crypto.createHash("sha256").update(normalizedFile.buffer).digest("hex"),
    };
  }

  async remove(storageKey: string): Promise<void> {
    const target = path.resolve(this.uploadDir, storageKey);
    if (!target.startsWith(`${this.uploadDir}${path.sep}`)) return;
    await fs.rm(target, {force: true});
  }

  async signedUrl(storageKey: string | null | undefined): Promise<string> {
    return storageKey ? `${this.publicBaseUrl}/uploads/${storageKey}` : "";
  }

  // Reads a previously stored asset's raw bytes directly from disk, for
  // server-side reuse (e.g. feeding it to the virtual try-on model) without
  // an unnecessary self-referential HTTP round trip through publicBaseUrl.
  async readBytes(storageKey: string): Promise<ReadableAsset> {
    const target = path.resolve(this.uploadDir, storageKey || "");
    if (!storageKey || !target.startsWith(`${this.uploadDir}${path.sep}`)) {
      throw new ApiError(404, "ASSET_NOT_FOUND", "The stored image was not found.");
    }
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(target);
    } catch {
      throw new ApiError(404, "ASSET_NOT_FOUND", "The stored image was not found.");
    }
    return {buffer, mimetype: inferMimeType(buffer) || "image/jpeg"};
  }
}

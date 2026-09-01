import path from "node:path";
import crypto from "node:crypto";
import {Readable} from "node:stream";
import {v2 as defaultCloudinaryClient} from "cloudinary";
import {ApiError} from "../../utils/api-error";
import {CLOUDINARY_PURPOSE_FOLDERS} from "../../config/constants";
import {MAX_FETCHED_ASSET_BYTES} from "../../config/constants";
import {IMAGE_EXTENSIONS, processUploadedFile, validSignature} from "../../utils/image-processing";
import type {AssetStore, ReadableAsset, StoredFileMetadata, UploadedFile} from "../../types/provider.types";

export interface CloudinaryConfig {
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
  cloudinaryFolder: string;
  cloudinaryAuthTokenKey: string;
  cloudinarySignedUrlTtlSeconds: number;
}

export type CloudinaryClient = typeof defaultCloudinaryClient;

// Private object storage backed by Cloudinary. Assets upload under delivery
// type "authenticated" (never the public "upload" type), so nothing is
// servable without a signed URL. signedUrl() always mints that URL on
// demand rather than persisting one. When CLOUDINARY_AUTH_TOKEN_KEY is
// configured, the signed URL also carries a short-lived expiring token,
// mirroring R2/S3 presigned GetObject URLs; without it, the URL is still
// signed/private but does not expire.
export class CloudinaryAssetStore implements AssetStore {
  private readonly folder: string;
  private readonly signedUrlTtlSeconds: number;
  private readonly authTokenKey: string;
  private readonly client: CloudinaryClient;

  // `cloudinaryClient` is injectable (defaulting to the real SDK) because
  // the Cloudinary SDK is a configured module-level singleton rather than a
  // per-instance client like the S3 SDK, so tests supply a fake instead of
  // mutating shared global state.
  constructor(config: CloudinaryConfig, cloudinaryClient: CloudinaryClient = defaultCloudinaryClient) {
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

  async save(userId: string, file: UploadedFile, purpose?: string): Promise<StoredFileMetadata> {
    const normalizedFile = file?.processed ? file : ((await processUploadedFile(file)) as UploadedFile);
    const mimeType = normalizedFile?.mimetype;
    if (!normalizedFile || !normalizedFile.buffer || !mimeType || !IMAGE_EXTENSIONS[mimeType] || !validSignature(normalizedFile.buffer, mimeType)) {
      throw new ApiError(400, "INVALID_IMAGE", "Upload a valid JPG, JPEG, PNG, or HEIC image.");
    }
    const segment = purpose ? CLOUDINARY_PURPOSE_FOLDERS[purpose] : undefined;
    const publicId = `${this.folder}/${segment ? `${segment}/` : ""}${userId}/${crypto.randomUUID()}`;
    // This Cloudinary product environment uses Dynamic Folders, where the
    // Media Library folder an asset appears under is governed by the
    // asset_folder parameter rather than inferred from slashes in
    // public_id. Without setting it explicitly, uploads still get the
    // intended public_id (and therefore the same delivery URL/storageKey
    // shape) but don't show up under nera/... in the Media Library UI.
    const assetFolder = `${this.folder}${segment ? `/${segment}` : ""}`;
    const uploaded = await new Promise<{public_id: string}>((resolve, reject) => {
      const uploadStream = this.client.uploader.upload_stream(
        {public_id: publicId, asset_folder: assetFolder, type: "authenticated", resource_type: "image", overwrite: false},
        (error, result) => (error ? reject(error) : resolve(result as {public_id: string})),
      );
      uploadStream.on("error", reject);
      Readable.from(normalizedFile.buffer).pipe(uploadStream);
    });
    return {
      storageProvider: "cloudinary",
      storageKey: uploaded.public_id,
      originalFilename: path.basename(normalizedFile.originalname || "image").slice(0, 255),
      mimeType,
      byteSize: normalizedFile.size,
      checksumSha256: crypto.createHash("sha256").update(normalizedFile.buffer).digest("hex"),
    };
  }

  async remove(storageKey: string): Promise<void> {
    if (!storageKey) return;
    await this.client.uploader.destroy(storageKey, {type: "authenticated", resource_type: "image", invalidate: true});
  }

  // New public IDs are extensionless and need an explicit JPEG delivery
  // format. Legacy public IDs may already include their source extension;
  // passing format for those would make Cloudinary append a second one.
  async signedUrl(storageKey: string | null | undefined): Promise<string> {
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
  async readBytes(storageKey: string): Promise<ReadableAsset> {
    const url = await this.signedUrl(storageKey);
    if (!url) throw new ApiError(404, "ASSET_NOT_FOUND", "The stored image was not found.");
    let response: Response;
    try {
      response = await fetch(url, {signal: AbortSignal.timeout(20_000)});
    } catch {
      throw new ApiError(502, "ASSET_FETCH_FAILED", "The stored image could not be retrieved.");
    }
    if (!response.ok) throw new ApiError(502, "ASSET_FETCH_FAILED", "The stored image could not be retrieved.");
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_FETCHED_ASSET_BYTES) throw new ApiError(502, "ASSET_TOO_LARGE", "The stored image is too large to process.");
    const reader = response.body?.getReader();
    if (!reader) throw new ApiError(502, "ASSET_FETCH_FAILED", "The stored image could not be retrieved.");
    const chunks: Buffer[] = [];
    let byteSize = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      byteSize += value.byteLength;
      if (byteSize > MAX_FETCHED_ASSET_BYTES) {
        await reader.cancel();
        throw new ApiError(502, "ASSET_TOO_LARGE", "The stored image is too large to process.");
      }
      chunks.push(Buffer.from(value));
    }
    const contentType = (response.headers.get("content-type") || "image/jpeg").split(";")[0]?.trim() || "image/jpeg";
    return {buffer: Buffer.concat(chunks), mimetype: contentType};
  }
}

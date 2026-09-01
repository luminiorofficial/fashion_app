import path from "node:path";
import sharp, {type Sharp, type Metadata} from "sharp";
import {ApiError} from "./api-error";
import type {UploadedFile} from "../types/provider.types";
import {MAX_IMAGE_PIXELS} from "../config/constants";

export const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/heic": ".heic",
  "image/heif": ".heic",
};

export function inferMimeType(buffer: Buffer): string | null {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length > 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buffer.length > 12 && buffer.subarray(4, 8).toString() === "ftyp") {
    const brand = buffer.subarray(8, 12).toString();
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heis", "hevm", "heim"].includes(brand)) return "image/heic";
  }
  return null;
}

export function validSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    return buffer.length > 12 && buffer.subarray(4, 8).toString() === "ftyp" && ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heis", "hevm", "heim"].includes(buffer.subarray(8, 12).toString());
  }
  return false;
}

export function normalizeUploadedFile<T extends UploadedFile | undefined | null>(file: T): T {
  if (!file) return file;
  const detectedMimeType = inferMimeType(file.buffer) || (file.mimetype === "image/jpg" ? "image/jpeg" : file.mimetype);
  if (detectedMimeType && IMAGE_EXTENSIONS[detectedMimeType]) {
    file.mimetype = detectedMimeType;
  }
  return file;
}

interface ImageProfile {
  dimensionSteps: number[];
  qualitySteps: number[];
  targetMaxBytes: number | null;
}

// Per-purpose compression targets, mirroring the dimension/quality ladder
// the Flutter client already applies client-side (lib/services/image_service.dart)
// so the server doesn't undo that work by re-encoding everything the same
// way. Quality floors are kept higher than the client's own floors because
// the wardrobe_item buffer this produces is also what's fed directly to
// Gemini for analysis (see analyzer.analyzeWardrobe) — going too low here
// risks unreliable analysis, not just a worse-looking thumbnail. No entry
// (undefined purpose) keeps today's exact behavior: a single 1800px /
// quality 82 pass with no byte-size target.
export const IMAGE_PROFILES: Record<string, ImageProfile> = {
  wardrobe_item: {dimensionSteps: [1024, 900, 768, 640], qualitySteps: [80, 70, 60, 50], targetMaxBytes: 150 * 1024},
  profile_analysis: {dimensionSteps: [1280, 1100, 950, 800], qualitySteps: [85, 75, 65, 55], targetMaxBytes: 350 * 1024},
  tryon_result: {dimensionSteps: [1280, 1100, 950, 800], qualitySteps: [85, 75, 65, 55], targetMaxBytes: 300 * 1024},
};
export const DEFAULT_IMAGE_PROFILE: ImageProfile = {dimensionSteps: [1800], qualitySteps: [82], targetMaxBytes: null};

function resizeIfNeeded(image: Sharp, metadata: Metadata, maxDimension: number): Sharp {
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
async function encodeToTarget(image: Sharp, metadata: Metadata, profile: ImageProfile): Promise<Buffer> {
  let smallest: Buffer | null = null;
  for (const dimension of profile.dimensionSteps) {
    const resized = resizeIfNeeded(image, metadata, dimension);
    for (const quality of profile.qualitySteps) {
      const buffer = await resized.clone().jpeg({quality, progressive: true}).toBuffer();
      if (!profile.targetMaxBytes || buffer.length <= profile.targetMaxBytes) return buffer;
      if (!smallest || buffer.length < smallest.length) smallest = buffer;
    }
  }
  return smallest as Buffer;
}

export async function processUploadedFile(file: UploadedFile | null | undefined, purpose?: string): Promise<UploadedFile | null | undefined> {
  if (!file?.buffer) return file;
  const normalizedFile = normalizeUploadedFile(file);
  if (!normalizedFile?.buffer) return normalizedFile;
  const mimeType = normalizedFile.mimetype;
  if (!mimeType || !IMAGE_EXTENSIONS[mimeType] || !validSignature(normalizedFile.buffer, mimeType)) {
    throw new ApiError(400, "INVALID_IMAGE", "The uploaded file is not a valid supported image.");
  }

  try {
    const image = sharp(normalizedFile.buffer, {limitInputPixels: MAX_IMAGE_PIXELS, sequentialRead: true}).rotate();
    const metadata = await image.metadata();
    const pixels = (metadata.width || 0) * (metadata.height || 0);
    if (!metadata.width || !metadata.height || pixels > MAX_IMAGE_PIXELS) {
      throw new ApiError(400, "IMAGE_DIMENSIONS_INVALID", "The image dimensions are invalid or too large.");
    }
    const profile = (purpose && IMAGE_PROFILES[purpose]) || DEFAULT_IMAGE_PROFILE;
    const processedBuffer = await encodeToTarget(image, metadata, profile);
    return {
      ...normalizedFile,
      buffer: processedBuffer,
      size: processedBuffer.length,
      mimetype: "image/jpeg",
      originalname: normalizedFile.originalname ? `${path.parse(normalizedFile.originalname).name || "image"}.jpg` : "image.jpg",
      processed: true,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (mimeType === "image/heic" || mimeType === "image/heif") {
      // sharp's libvips build cannot always decode HEIC/HEIF (support varies
      // by platform and is frequently unavailable). Falling back to the
      // original, unconverted HEIC bytes would store a format the Postgres
      // media_assets.mime_type check (jpeg/png/webp only) rejects, and that
      // every storage backend otherwise assumes is always JPEG post-processing.
      // Reject clearly here instead of persisting an inconsistent asset.
      throw new ApiError(400, "IMAGE_PROCESSING_FAILED", "This photo's format (HEIC/HEIF) could not be processed. Please try a different photo, or convert it to JPEG first.");
    }
    throw new ApiError(400, "IMAGE_PROCESSING_FAILED", "The image is malformed or could not be decoded.");
  }
}

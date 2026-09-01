import multer from "multer";
import {MAX_IMAGE_BYTES} from "../config/constants";
import {ApiError} from "../utils/api-error";

const allowedUploadMimeTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/heic", "image/heif"]);

// Single shared multer instance: uploads are held in memory (never written
// to disk unprocessed) and capped at one 5 MB image per request, matching
// every image-accepting endpoint (profile analysis, wardrobe analysis).
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: MAX_IMAGE_BYTES, files: 1, fields: 10, parts: 12},
  fileFilter: (_request, file, callback) => {
    if (!allowedUploadMimeTypes.has(file.mimetype.toLowerCase())) {
      callback(new ApiError(400, "UNSUPPORTED_IMAGE_TYPE", "Upload a JPEG, PNG, or HEIC image."));
      return;
    }
    callback(null, true);
  },
});

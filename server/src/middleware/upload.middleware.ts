import multer from "multer";
import {MAX_IMAGE_BYTES} from "../config/constants";

// Single shared multer instance: uploads are held in memory (never written
// to disk unprocessed) and capped at one 5 MB image per request, matching
// every image-accepting endpoint (profile analysis, wardrobe analysis).
export const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: MAX_IMAGE_BYTES, files: 1}});

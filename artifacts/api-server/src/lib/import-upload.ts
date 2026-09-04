import type { Request } from "express";
import multer from "multer";

/**
 * Multer instances shared by the import routers. Both keep files in memory —
 * scorecards are parsed straight from the buffer and never touch disk.
 */

/** A single PlayCricket CSV or .xlsx scorecard. */
export const scorecardUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/** A whole-season batch can be many scorecards (or a .zip of them) at once. */
export const batchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 80 },
});

/**
 * Multer's request augmentations. Handlers stay typed as plain `Request` (a
 * narrower parameter is not assignable under `strictFunctionTypes`) and cast
 * to these to read the uploaded file(s).
 */
export type MulterRequest = Request & { file?: Express.Multer.File };
export type MulterArrayRequest = Request & { files?: Express.Multer.File[] };

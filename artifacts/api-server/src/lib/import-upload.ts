import type { Request, RequestHandler } from "express";
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

/** The shirt-number upload size cap (season shirt numbers plan, KTD8). */
export const SHIRT_NUMBER_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

/** An upload whose extension is not .csv or .xlsx; surfaced as 400. */
export class UnsupportedUploadTypeError extends Error {
  readonly status = 400;
  constructor() {
    super("Upload a .csv or .xlsx file.");
    this.name = "UnsupportedUploadTypeError";
  }
}

/**
 * One shirt-number spreadsheet: 2 MB, one file, `.csv` / `.xlsx` only. Mount
 * through {@link shirtNumberFileUpload} so the limits answer 413 / 400 instead
 * of reaching the error handler as a 500.
 */
export const shirtNumberUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SHIRT_NUMBER_UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.(csv|xlsx)$/i.test(file.originalname)) cb(null, true);
    else cb(new UnsupportedUploadTypeError());
  },
});

/**
 * `shirtNumberUpload.single("file")` with its failures mapped to clean
 * statuses: an oversized file is 413, a second file or an unexpected field
 * 400, and a wrong file type 400.
 */
export const shirtNumberFileUpload: RequestHandler = (req, res, next) => {
  shirtNumberUpload.single("file")(req, res, (err?: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "The file is larger than 2 MB." });
      } else {
        res.status(400).json({ error: `Upload one .csv or .xlsx file (${err.message}).` });
      }
      return;
    }
    if (err instanceof UnsupportedUploadTypeError) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  });
};

/**
 * Multer's request augmentations. Handlers stay typed as plain `Request` (a
 * narrower parameter is not assignable under `strictFunctionTypes`) and cast
 * to these to read the uploaded file(s).
 */
export type MulterRequest = Request & { file?: Express.Multer.File };
export type MulterArrayRequest = Request & { files?: Express.Multer.File[] };

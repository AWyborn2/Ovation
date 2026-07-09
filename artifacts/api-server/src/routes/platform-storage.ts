import { Router, type IRouter, type Request, type Response } from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";
import { requirePlatformAdmin } from "../middlewares/require-platform-admin";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Platform-console uploads are logo/favicon assets for tenant branding, signed
// on behalf of a super-admin rather than a tenant's own club-admin. Mirrors the
// self-serve validation in ./storage.ts (POST /storage/uploads/request-url)
// exactly so the two surfaces behave identically — kept separate rather than
// shared because this route is gated by requirePlatformAdmin, not requireAdmin,
// and lives outside the OpenAPI-generated client (see useUpload's basePath
// override).
const ALLOWED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);
const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const ALLOWED_AUDIO_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20MB

/**
 * POST /platform/admin/storage/uploads/request-url
 *
 * Request a presigned URL for file upload from the platform (super-admin)
 * console — e.g. a tenant's logo/favicon. Platform-admin only. The client
 * sends JSON metadata (name, size, contentType) — NOT the file — then
 * uploads the file directly to the returned presigned URL.
 */
router.post(
  "/platform/admin/storage/uploads/request-url",
  requirePlatformAdmin,
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }

    const { name, size, contentType } = parsed.data;

    const isImage = ALLOWED_IMAGE_MIME.has(contentType);
    const isVideo = ALLOWED_VIDEO_MIME.has(contentType);
    const isAudio = ALLOWED_AUDIO_MIME.has(contentType);
    if (!isImage && !isVideo && !isAudio) {
      res.status(400).json({
        error:
          "Unsupported file type. Allowed: PNG, JPEG, WebP, SVG, GIF, MP4/WebM/MOV video, or MP3/WAV/OGG/AAC/M4A audio.",
      });
      return;
    }
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : isAudio ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
    if (size > maxBytes) {
      const limitLabel = isVideo ? "50MB" : isAudio ? "20MB" : "10MB";
      res.status(400).json({
        error: `File too large. Maximum size is ${limitLabel}.`,
      });
      return;
    }

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Error generating platform upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

export default router;

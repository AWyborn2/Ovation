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
// Deliberately narrower than the self-serve storage route: this endpoint
// exists for brand assets (logo/favicon), so only images are presigned.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

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

    if (!ALLOWED_IMAGE_MIME.has(contentType)) {
      res.status(400).json({
        error: "Unsupported file type. Allowed: PNG, JPEG, WebP, SVG, GIF.",
      });
      return;
    }
    if (size > MAX_IMAGE_BYTES) {
      res.status(400).json({
        error: "File too large. Maximum size is 10MB.",
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

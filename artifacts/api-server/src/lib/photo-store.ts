import { randomUUID } from "node:crypto";
import { ObjectStorageService, objectStorageClient } from "./objectStorage";

/**
 * The byte-level storage the photo library needs: read an uploaded object,
 * write a converted one, delete the original. Object-storage backed in the
 * app; swapped for an in-memory store in tests (CI has no object storage).
 * Paths are object entity paths (`/objects/...`).
 */
export interface PhotoStore {
  read(objectPath: string): Promise<Buffer>;
  write(data: Buffer, contentType: string): Promise<string>;
  remove(objectPath: string): Promise<void>;
}

const service = new ObjectStorageService();

function splitBucketPath(fullPath: string): { bucketName: string; objectName: string } {
  const path = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const parts = path.split("/");
  if (parts.length < 3) throw new Error("Invalid object path: must contain a bucket name");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

const objectStore: PhotoStore = {
  async read(objectPath) {
    const file = await service.getObjectEntityFile(objectPath);
    const [data] = await file.download();
    return data;
  },
  async write(data, contentType) {
    const dir = service.getPrivateObjectDir();
    const id = `library/${randomUUID()}`;
    const { bucketName, objectName } = splitBucketPath(`${dir.replace(/\/$/, "")}/${id}`);
    await objectStorageClient
      .bucket(bucketName)
      .file(objectName)
      .save(data, { contentType, resumable: false });
    return `/objects/${id}`;
  },
  async remove(objectPath) {
    const file = await service.getObjectEntityFile(objectPath);
    await file.delete({ ignoreNotFound: true });
  },
};

let override: PhotoStore | null = null;

export function photoStore(): PhotoStore {
  return override ?? objectStore;
}

/** Test seam: route photo-library storage through `store` (null restores). */
export function setPhotoStore(store: PhotoStore | null): void {
  override = store;
}

/** Public URL for an object entity path. */
export function objectUrl(objectPath: string): string {
  return `/api/storage${objectPath}`;
}

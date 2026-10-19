import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, clubPhotosTable } from "@workspace/db";
import type { QueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { presentPhotos } from "./club-photo-library";

/** Client permission markers alone never authorise a junior image. */
export async function validJuniorStockSelection(tenantId: number, carousel: QueuedCarousel) {
  const selected = carousel.slides.filter((s) => s.junior && s.data.photoUrl);
  if (!selected.length) return true;
  const ids = selected.map((s) => Number(s.input.juniorStockPhotoId));
  const rows = await db
    .select()
    .from(clubPhotosTable)
    .where(
      and(
        eq(clubPhotosTable.tenantId, tenantId),
        eq(clubPhotosTable.juniorStock, true),
        isNull(clubPhotosTable.grade),
        inArray(clubPhotosTable.id, ids),
      ),
    );
  const allowed = (await presentPhotos(tenantId, rows)).filter((p) => !p.playerIds.length);
  return selected.every((s) =>
    allowed.some((p) => p.id === s.input.juniorStockPhotoId && p.url === s.data.photoUrl),
  );
}

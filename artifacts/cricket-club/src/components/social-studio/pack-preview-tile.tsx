import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PackCard } from "@/components/pack-card";
import { SIZES, type ShareCardInput } from "@/lib/share-card";
import { type PackCardData } from "@/lib/pack-render";
import { type CardTheme as ApiCardTheme } from "@workspace/api-client-react";
import { THUMB_SIZE } from "@/lib/social-studio";

/**
 * A card tile with a live pack-rendered preview above a caption/controls slot.
 *
 * The Design packs section and the Card types gallery show the same thing —
 * "here is what a card looks like" — and differ only in the controls underneath
 * (apply-to-everything vs. a per-kind selector). They had drifted into two
 * copies of the same `Card` + aspect-ratio wrapper + `CardContent` shell, so a
 * change to the thumbnail treatment had to be made twice.
 *
 * `children` is the footer slot; everything above it is fixed.
 */
export function PackPreviewTile({
  input,
  theme,
  data,
  packId,
  children,
}: {
  input: ShareCardInput;
  theme: ApiCardTheme | null;
  data: PackCardData | null;
  /** The pack to render with; `null` uses the renderer's default. */
  packId: string | null;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div
        className="overflow-hidden rounded bg-muted"
        style={{
          aspectRatio: `${SIZES[THUMB_SIZE].w} / ${SIZES[THUMB_SIZE].h}`,
        }}
      >
        <PackCard
          input={input}
          size={THUMB_SIZE}
          sponsorsOn
          junior={false}
          theme={theme}
          data={data}
          packId={packId}
        />
      </div>
      <CardContent className="space-y-2 p-3">{children}</CardContent>
    </Card>
  );
}

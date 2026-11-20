/**
 * "Edit this slide" in the set editor (studio-create-consolidation S8, New
 * Studio only): opens the slide on show in the full card editor, which saves
 * it back into the set as that slide's own layout. Unsaved set changes must
 * be saved first, so the card editor opens the set as it stands.
 */
import { TOP_BAR_BUTTON } from "./editor-shell";
import { Link } from "wouter";
import { SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { canEditSlideAlone, slideEditorHref } from "@/lib/set-draft";
import type { SetShareContext } from "./export/share-panel";

export function EditSlideButton({
  draftId,
  set,
  dirty,
}: {
  draftId: number;
  set: SetShareContext;
  dirty: boolean;
}) {
  const slide = set.slides.find((s) => s.key === set.current) ?? set.slides[0];
  if (!slide || !canEditSlideAlone(slide)) return null;
  return (
    <Link
      href={slideEditorHref(draftId, slide.key)}
      aria-disabled={dirty}
      tabIndex={dirty ? -1 : undefined}
      title={dirty ? "Save your changes first" : `Open ${slide.label} in the card editor`}
      className={cn(TOP_BAR_BUTTON, dirty && "pointer-events-none opacity-40")}
    >
      <SquarePen className="h-4 w-4" aria-hidden /> Edit this slide
    </Link>
  );
}

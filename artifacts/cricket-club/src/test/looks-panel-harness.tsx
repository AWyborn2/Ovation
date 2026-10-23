import type { LibraryLookList } from "@workspace/api-client-react";
import { LooksPanel } from "@/components/template-library/looks-panel";
import { useLibraryPreviewData } from "@/components/template-library/previews";

/** Templates → Looks as the page mounts it, with its own preview data. */
export function LooksTab() {
  const preview = useLibraryPreviewData();
  return <LooksPanel preview={preview} />;
}

/** One library look per active design pack, with no templates of their own. */
export const PACK_LOOKS: LibraryLookList = {
  looks: [
    ["broadcast-dark", "Broadcast Dark"],
    ["club-kit", "Club Kit"],
    ["duotone", "Duotone"],
  ].map(([slug, name], i) => ({
    id: 10 + i,
    slug: slug!,
    name: name!,
    description: null,
    authorName: "Ovation",
    templates: [],
  })),
};

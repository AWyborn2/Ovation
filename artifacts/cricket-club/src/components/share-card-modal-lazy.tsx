import { lazy, Suspense, type ComponentProps } from "react";
import type { ShareCardModal } from "@/components/share-card-modal";

/**
 * Code-split wrapper for {@link ShareCardModal}.
 *
 * The modal pulls in the whole canvas card renderer (share-card.ts, the layout
 * editor, pack templates, sticker library, jszip). Public pages only need that
 * once a visitor actually clicks Share, so the chunk is fetched on first open
 * and nothing is mounted while the modal is closed.
 */
const Modal = lazy(() =>
  import("@/components/share-card-modal").then((m) => ({ default: m.ShareCardModal })),
);

export type LazyShareCardModalProps = ComponentProps<typeof ShareCardModal>;

export function LazyShareCardModal(props: LazyShareCardModalProps) {
  if (!props.open) return null;
  return (
    <Suspense fallback={null}>
      <Modal {...props} />
    </Suspense>
  );
}

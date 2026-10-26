/**
 * "Add a page → From another template" (carousel set editor plan, part 2):
 * pick one of the club's templates and one of its pages; the page's layers
 * are copied into the set as a design page of that kind.
 */
import { useState } from "react";
import {
  getGetClubTemplateQueryKey,
  getListClubTemplatesQueryKey,
  useGetClubTemplate,
  useListClubTemplates,
} from "@workspace/api-client-react";
import {
  normaliseDocument,
  type PageKey,
  type TemplateLayerV2,
} from "@workspace/scorecard/kind-templates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { FreeLayer } from "@/lib/pack-render";
import { kindLabel } from "@/lib/social-studio";
import { PAGE_LABEL } from "./template-doc";

export type PickedPage = { kind: string; page: PageKey; name: string; layers: FreeLayer[] };

export function PageFromTemplateDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (page: PickedPage) => void;
}) {
  const listQ = useListClubTemplates(undefined, {
    query: { queryKey: getListClubTemplatesQueryKey(), enabled: open },
  });
  const [id, setId] = useState<number | null>(null);
  const [page, setPage] = useState<PageKey | null>(null);
  const templateQ = useGetClubTemplate(id ?? 0, {
    query: { queryKey: getGetClubTemplateQueryKey(id ?? 0), enabled: open && id !== null },
  });
  const templates = listQ.data?.templates ?? [];
  const chosen = templates.find((t) => t.id === id);
  const pages = (chosen?.coverage.pages ?? []) as PageKey[];

  const add = () => {
    const t = templateQ.data;
    const p = page ?? pages[0];
    if (!t || !p) return;
    const doc = normaliseDocument(t.document, t.kind);
    const layers = (doc.pages[p]?.layers ?? []) as TemplateLayerV2[];
    onPick({
      kind: t.kind,
      page: p,
      name: `${t.name}${pages.length > 1 ? ` · ${PAGE_LABEL[p]}` : ""}`.slice(0, 60),
      layers: layers as unknown as FreeLayer[],
    });
    onClose();
  };

  const select =
    "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a page from another template</DialogTitle>
          <DialogDescription>
            The page is copied into this set. It shows the club&apos;s brand and no card data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm font-medium">
            <span>Template</span>
            <select
              className={select}
              value={id ?? ""}
              onChange={(e) => {
                setId(e.target.value ? Number(e.target.value) : null);
                setPage(null);
              }}
            >
              <option value="">Choose one of your templates…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({kindLabel(t.kind as never)})
                </option>
              ))}
            </select>
          </label>
          {pages.length > 1 && (
            <label className="block space-y-1 text-sm font-medium">
              <span>Page</span>
              <select
                className={select}
                value={page ?? pages[0]}
                onChange={(e) => setPage(e.target.value as PageKey)}
              >
                {pages.map((p) => (
                  <option key={p} value={p}>
                    {PAGE_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={add} disabled={!templateQ.data || templateQ.data.id !== id}>
            Add page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

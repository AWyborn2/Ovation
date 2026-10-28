import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetFigmaConnectionQueryKey,
  getListClubTemplatesQueryKey,
  useGetFigmaConnection,
  useImportFigmaClubTemplate,
  type FigmaClubImportResult,
} from "@workspace/api-client-react";
import { TEMPLATE_CARD_KINDS } from "@workspace/scorecard/kind-templates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { kindLabel } from "@/lib/social-studio";
import { FIGMA_SETTINGS_HREF } from "./figma-connection-card";
import { FigmaReport, figmaImportError } from "./figma-report";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Your templates → Import from Figma (template library release 2, R2-E): a
 * Figma link, read with the club's own Figma connection, becomes a private
 * club template, with a report of what was changed or left out.
 */
export function FigmaImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const conn = useGetFigmaConnection({
    query: { queryKey: getGetFigmaConnectionQueryKey(), enabled: open },
  });
  const [fileUrl, setFileUrl] = useState("");
  const [kind, setKind] = useState<string>(TEMPLATE_CARD_KINDS[0]);
  const [name, setName] = useState("");
  const [result, setResult] = useState<FigmaClubImportResult | null>(null);
  const [failure, setFailure] = useState<ReturnType<typeof figmaImportError> | null>(null);
  const run = useImportFigmaClubTemplate({
    mutation: {
      onSuccess: (r) => {
        setFailure(null);
        setResult(r);
        qc.invalidateQueries({ queryKey: getListClubTemplatesQueryKey() });
      },
      onError: (err) => {
        setResult(null);
        setFailure(figmaImportError(err));
        // A refused connection is marked for reconnecting: show that in settings.
        qc.invalidateQueries({ queryKey: getGetFigmaConnectionQueryKey() });
      },
    },
  });

  const close = (next: boolean) => {
    if (!next) {
      setResult(null);
      setFailure(null);
    }
    onOpenChange(next);
  };

  const connected = !!conn.data?.connected;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import from Figma</DialogTitle>
          <DialogDescription>
            Turn a frame from the club&rsquo;s Figma into a card template only your club sees.
          </DialogDescription>
        </DialogHeader>

        {conn.isLoading ? (
          <p className="text-sm text-muted-foreground">Checking the Figma connection…</p>
        ) : !connected ? (
          <p className="text-sm">
            {conn.data?.status === "needs_reconnect"
              ? (conn.data.statusReason ?? "Figma needs connecting again.")
              : "Connect the club's Figma account first."}{" "}
            <Link href={FIGMA_SETTINGS_HREF} className="underline" onClick={() => close(false)}>
              Open Figma settings
            </Link>
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Reading Figma as <span className="font-medium">{conn.data?.figmaHandle}</span>. Name
              each frame <code>&lt;page&gt;/&lt;size&gt;</code> (card/square, card/story…) or size
              it like a card. Text with <code>{"{{tokens}}"}</code> becomes live fields and layers
              named <code>{"{{photo}}"}</code> or <code>{"{{clubLogo}}"}</code> become the photo and
              crest.
            </p>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                run.mutate({
                  data: {
                    fileUrl: fileUrl.trim(),
                    kind,
                    ...(name.trim() ? { name: name.trim() } : {}),
                  },
                });
              }}
            >
              <Input
                aria-label="Figma link"
                placeholder="https://www.figma.com/design/…"
                className="h-9"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label="Card kind"
                  className={selectClass}
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  {TEMPLATE_CARD_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {kindLabel(k)}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label="Template name"
                  placeholder="Name (optional)"
                  className="h-9 min-w-[10rem] flex-1"
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button type="submit" size="sm" disabled={!fileUrl.trim() || run.isPending}>
                  {run.isPending ? "Importing…" : "Import"}
                </Button>
              </div>
            </form>
          </>
        )}

        {failure ? (
          <div role="alert" className="text-sm text-destructive">
            <p>{failure.message}</p>
            {failure.problems.length > 1 ? (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {failure.problems.slice(1, 6).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
            <FigmaReport lines={failure.report} />
          </div>
        ) : null}

        {result ? (
          <div role="status" className="text-sm">
            <p>
              Imported &ldquo;{result.template.name}&rdquo; from {result.fileName || "Figma"} (
              {result.frames.length} {result.frames.length === 1 ? "frame" : "frames"}).
            </p>
            {result.fonts.length ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Fonts replaced: {result.fonts.map((f) => `${f.from} → ${f.to}`).join(", ")}
              </p>
            ) : null}
            <FigmaReport lines={result.report} />
            <Button size="sm" className="mt-3" asChild>
              <Link href={`/admin/social/template/${result.template.id}`}>Open the template</Link>
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

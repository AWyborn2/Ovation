import { useState } from "react";
import { Link } from "wouter";
import {
  useImportFigmaTemplate,
  type ConsoleLibraryLook,
  type FigmaImportResult,
} from "@workspace/api-client-react";
import { TEMPLATE_CARD_KINDS } from "@workspace/scorecard/kind-templates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { kindLabel } from "@/lib/social-studio";
import { FigmaReport, figmaImportError } from "@/components/template-library/figma-report";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const inputClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Console → Library → Import from Figma (ADR-011 L8-B, T8.9): a Figma link
 * becomes an unlisted console template, with a report of what was changed or
 * left out. Frames are named `<page>/<size>`; colour styles named
 * `ovation/*` become the club's colours.
 */
export function FigmaImportCard({
  looks,
  onImported,
  editHref,
}: {
  looks: readonly ConsoleLibraryLook[];
  onImported: () => void;
  editHref: (id: number) => string;
}) {
  const [fileUrl, setFileUrl] = useState("");
  const [kind, setKind] = useState<string>(TEMPLATE_CARD_KINDS[0]);
  const [name, setName] = useState("");
  const [look, setLook] = useState("");
  const [result, setResult] = useState<FigmaImportResult | null>(null);
  const [failure, setFailure] = useState<ReturnType<typeof figmaImportError> | null>(null);
  const run = useImportFigmaTemplate({
    mutation: {
      onSuccess: (r) => {
        setFailure(null);
        setResult(r);
        onImported();
      },
      onError: (err) => {
        setResult(null);
        setFailure(figmaImportError(err));
      },
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import from Figma</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          Name each frame <code>&lt;page&gt;/&lt;size&gt;</code> (card/square, fixture/story…) or
          size it like a card. Text with <code>{"{{tokens}}"}</code> becomes live fields, colour
          styles named <code>ovation/accent</code>, <code>ovation/panel</code>,{" "}
          <code>ovation/ink</code> and <code>ovation/gold</code> follow the club&rsquo;s colours,
          auto layout frames become stacks, <code>rows:&lt;list&gt;</code> frames become lists, and
          layers named <code>{"{{photo}}"}</code> or <code>{"{{clubLogo}}"}</code> become the photo
          and crest.
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run.mutate({
              data: {
                fileUrl: fileUrl.trim(),
                kind,
                ...(name.trim() ? { name: name.trim() } : {}),
                lookId: look ? Number(look) : null,
              },
            });
          }}
        >
          <input
            aria-label="Figma link"
            placeholder="https://www.figma.com/design/…"
            className={`${inputClass} min-w-[18rem] flex-1`}
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
          />
          <select
            aria-label="Imported template's kind"
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
          <input
            aria-label="Imported template's name"
            placeholder="Name (optional)"
            className={inputClass}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            aria-label="Imported template's look"
            className={selectClass}
            value={look}
            onChange={(e) => setLook(e.target.value)}
          >
            <option value="">No look</option>
            {looks.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={!fileUrl.trim() || run.isPending}>
            {run.isPending ? "Importing…" : "Import"}
          </Button>
        </form>

        {failure ? (
          <div role="alert" className="mt-3 text-sm text-destructive">
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
          <div role="status" className="mt-3 text-sm">
            <p>
              Imported &ldquo;{result.template.name}&rdquo; from {result.fileName || "Figma"}:{" "}
              {result.frames.length} {result.frames.length === 1 ? "frame" : "frames"},{" "}
              {result.rendered.vectors} {result.rendered.vectors === 1 ? "vector" : "vectors"} and{" "}
              {result.rendered.images} {result.rendered.images === 1 ? "image" : "images"}.{" "}
              <Link href={editHref(result.template.id)} className="underline">
                Open the template
              </Link>
            </p>
            {result.fonts.length ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Fonts replaced: {result.fonts.map((f) => `${f.from} → ${f.to}`).join(", ")}
              </p>
            ) : null}
            <FigmaReport lines={result.report} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

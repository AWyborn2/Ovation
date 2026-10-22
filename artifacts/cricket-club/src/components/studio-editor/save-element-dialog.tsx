/**
 * "Save as element" (editable-elements plan, D4): name, category and tags for
 * the selected layers, published to every club at once (decision E1) and
 * credited to the club. The dialog says what publishing does to the club's
 * content (`element-save.ts`) before anything is saved.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  getListLibraryElementsQueryKey,
  useSaveLibraryElement,
  type LibraryElementCategory,
} from "@workspace/api-client-react";
import {
  ELEMENT_CATEGORIES,
  ELEMENT_CATEGORY_LABELS,
  MAX_ELEMENT_NAME,
  MAX_ELEMENT_TAG,
  MAX_ELEMENT_TAGS,
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
import { elementFromSelection, type ElementSaveContext } from "./element-save";

/** The server's 400 body: a sentence, and the rules a document broke. */
function failureOf(err: unknown): string {
  const data = (err as { data?: { error?: unknown; errors?: unknown } } | null)?.data;
  const errors = Array.isArray(data?.errors)
    ? data.errors.filter((e) => typeof e === "string")
    : [];
  const head = typeof data?.error === "string" ? data.error : "The element couldn't be saved.";
  return [head, ...errors.slice(0, 3)].join(" ");
}

const tagsOf = (text: string): string[] =>
  [
    ...new Set(
      text
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
    .map((t) => t.slice(0, MAX_ELEMENT_TAG))
    .slice(0, MAX_ELEMENT_TAGS);

export function SaveElementDialog({
  layers,
  context,
  clubName,
  open,
  onClose,
}: {
  layers: FreeLayer[];
  context: ElementSaveContext;
  /** The club the element is credited to. */
  clubName: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useSaveLibraryElement();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<LibraryElementCategory>("badges");
  const [tags, setTags] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const draft = useMemo(() => elementFromSelection(layers, context), [layers, context]);
  const empty = draft.document.layers.length === 0;

  const close = () => {
    setName("");
    setTags("");
    setFailure(null);
    setSaved(null);
    onClose();
  };

  const submit = async () => {
    setFailure(null);
    try {
      const element = await save.mutateAsync({
        data: { name: name.trim(), category, tags: tagsOf(tags), document: draft.document },
      });
      await queryClient.invalidateQueries({ queryKey: getListLibraryElementsQueryKey() });
      setSaved(element.name);
    } catch (err) {
      setFailure(failureOf(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as element</DialogTitle>
          <DialogDescription>
            Every club will be able to add it from the element library, credited to {clubName}.
          </DialogDescription>
        </DialogHeader>
        {saved ? (
          <p role="status" className="text-sm">
            &ldquo;{saved}&rdquo; is in the element library now.
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                Your crest becomes each club&apos;s own crest; other pictures become a photo slot.
              </li>
              <li>Your text becomes sample text; live fields stay live.</li>
              <li>Your club colours become brand colours, so it takes each club&apos;s colours.</li>
            </ul>
            {draft.skipped.length > 0 && (
              <p className="text-amber-700">
                Left out (the library can&apos;t hold them): {draft.skipped.join(", ")}.
              </p>
            )}
            {empty && (
              <p className="text-destructive">Nothing selected can be saved as an element.</p>
            )}
            {!empty && draft.errors.length > 0 && (
              <p className="text-destructive">{draft.errors.slice(0, 2).join(" ")}</p>
            )}
            <label className="flex flex-col gap-1">
              Name
              <input
                aria-label="Element name"
                value={name}
                maxLength={MAX_ELEMENT_NAME}
                onChange={(e) => setName(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              Category
              <select
                aria-label="Element category"
                value={category}
                onChange={(e) => setCategory(e.target.value as LibraryElementCategory)}
                className="h-9 rounded-md border border-input bg-background px-2"
              >
                {ELEMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {ELEMENT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Tags (separated by commas)
              <input
                aria-label="Element tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2"
              />
            </label>
            {failure && (
              <p role="alert" className="text-destructive">
                {failure}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          {saved ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={!name.trim() || empty || draft.errors.length > 0 || save.isPending}
              >
                {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Publish element
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

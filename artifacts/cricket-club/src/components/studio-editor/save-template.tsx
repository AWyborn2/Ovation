import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useSaveDraftAsTemplate,
  getListEditorTemplatesQueryKey,
} from "@workspace/api-client-react";
import { handleAdminMutationError } from "@/lib/admin-auth";

/**
 * "Save as template" (U18): keeps this card's design and editor layers so new
 * cards can start from it on Create a card. Unsaved edits are saved first, so
 * the template is exactly what's on screen.
 */
export function SaveTemplateButton({
  draftId,
  beforeSave,
}: {
  draftId: number;
  /** Save pending editor changes; resolves once the draft is up to date. */
  beforeSave: () => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const saveTemplate = useSaveDraftAsTemplate();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await beforeSave();
      await saveTemplate.mutateAsync({ id: draftId, data: { name: name.trim() } });
      qc.invalidateQueries({ queryKey: getListEditorTemplatesQueryKey() });
      setDone(true);
    } catch (e) {
      setError(handleAdminMutationError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setDone(false);
          setName("");
        }}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--ed-line)] px-3 text-sm font-semibold hover:bg-[var(--ed-card)]"
      >
        <LayoutTemplate className="h-4 w-4" aria-hidden />
        <span className="hidden lg:inline">Save as template</span>
        <span className="sr-only lg:hidden">Save as template</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              {done
                ? "Saved. Find it under Your templates on Create a card."
                : "Keep this design and its layers to start new cards from."}
            </DialogDescription>
          </DialogHeader>
          {!done && (
            <form
              id="save-template"
              className="space-y-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) void submit();
              }}
            >
              <Label htmlFor="template-name">Template name</Label>
              <Input
                id="template-name"
                value={name}
                maxLength={80}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Signing with game time"
              />
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </form>
          )}
          <DialogFooter>
            {done ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <Button type="submit" form="save-template" disabled={busy || !name.trim()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Save template
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

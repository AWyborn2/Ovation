import { Button } from "@/components/ui/button";

/**
 * The sticky save bar (Social Studio KTD13): shown only while a form has
 * unsaved changes, with Reset and Save.
 */
export function SaveBar({
  dirty,
  saving = false,
  onSave,
  onReset,
  message = "You have unsaved changes",
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onReset: () => void;
  message?: string;
}) {
  if (!dirty) return null;
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="sticky bottom-4 z-30 mx-auto flex w-full max-w-3xl items-center gap-3 rounded-xl border border-border bg-[var(--pop)] px-4 py-3 shadow-lg backdrop-blur-xl"
    >
      <p className="min-w-0 flex-1 truncate text-sm text-foreground">{message}</p>
      <Button type="button" variant="ghost" onClick={onReset} disabled={saving}>
        Reset
      </Button>
      <Button type="button" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

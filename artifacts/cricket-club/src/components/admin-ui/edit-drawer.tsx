import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/**
 * The admin edit drawer (Social Studio KTD13): a 480px right-hand sheet with a
 * scrolling body and a footer — Delete on the left, Cancel / Save on the right.
 * Escape and the backdrop close it (Radix). Footer buttons appear only for the
 * handlers passed in.
 */
export type EditDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onSave?: () => void;
  onDelete?: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  deleteLabel?: string;
  /** Replaces the default footer entirely. */
  footer?: ReactNode;
};

export function EditDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSave,
  onDelete,
  saving = false,
  saveDisabled = false,
  saveLabel = "Save",
  deleteLabel = "Delete",
  footer,
}: EditDrawerProps) {
  const hasFooter = footer !== undefined || !!onSave || !!onDelete;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b border-border px-6 py-4 text-left">
          <SheetTitle>{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">Edit details</SheetDescription>
          )}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {hasFooter && (
          <div className="flex items-center gap-2 border-t border-border px-6 py-4">
            {footer ?? (
              <>
                {onDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={onDelete}
                    disabled={saving}
                  >
                    {deleteLabel}
                  </Button>
                )}
                <div className="ml-auto flex gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  {onSave && (
                    <Button type="button" onClick={onSave} disabled={saving || saveDisabled}>
                      {saving ? "Saving…" : saveLabel}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateSocialDraft } from "@workspace/api-client-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import type { ShareCardInput } from "@/lib/share-card";

/**
 * Opens a card in the Studio editor (U18): makes an ad-hoc draft of it
 * (awaiting review, never auto-posted) and goes to the editor. Replaces the
 * old card layout editor wherever a card could be customised.
 */
export function OpenInEditorButton({
  input,
  packId,
  onOpened,
  children,
}: {
  input: ShareCardInput;
  packId: string | null;
  /** Called once the draft exists, before navigating (e.g. close a dialog). */
  onOpened?: () => void;
  children: ReactNode;
}) {
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const create = useCreateSocialDraft();

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={create.isPending}
        onClick={() => {
          setError(null);
          create.mutate(
            { data: { cardInput: input as unknown as Record<string, unknown>, packId } },
            {
              onSuccess: (draft) => {
                onOpened?.();
                navigate(`/admin/social/editor/${draft.id}`);
              },
              onError: (e) => setError(handleAdminMutationError(e)),
            },
          );
        }}
      >
        {create.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
        {children}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}

import { useState } from "react";
import { Download } from "lucide-react";
import {
  useGetSocialSettings,
  getGetSocialSettingsQueryKey,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import type { ShareCardInput } from "@/lib/share-card";
import type { EngineKey } from "@/components/share-card-modal/constants";
import { LazyShareCardModal } from "@/components/share-card-modal-lazy";

/**
 * The small "Share" button shown on public stats pages (records, player and
 * grade pages, milestone cards). Deliberately tiny: it imports only types from
 * the card renderer and mounts the heavy {@link LazyShareCardModal} chunk on
 * first click, so visitors who never share never download it.
 */
export function ShareButton({
  input,
  engine = "ondemand",
  appPath,
  trackedSlug,
  playerId,
  size = "sm",
  variant = "outline",
  label = "Share",
  className,
  iconOnly = false,
}: {
  input: ShareCardInput;
  engine?: EngineKey;
  appPath?: string;
  trackedSlug?: string | null;
  playerId?: number | null;
  size?: "sm" | "default" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
  label?: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const settingsQ = useGetSocialSettings({
    query: { queryKey: getGetSocialSettingsQueryKey() },
  });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  if (bundle) {
    const s = bundle.settings;
    const enabled =
      engine === "ondemand"
        ? s.engineOnDemand !== false
        : engine === "milestone"
          ? s.engineMilestone !== false
          : engine === "roundup"
            ? s.engineRoundUp !== false
            : s.engineRecap !== false;
    if (!enabled) return null;
  }
  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        aria-label={iconOnly ? label : undefined}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
      >
        <Download className={iconOnly ? "h-4 w-4" : "h-3.5 w-3.5 mr-1"} />
        {iconOnly ? null : label}
      </Button>
      <LazyShareCardModal
        open={open}
        onOpenChange={setOpen}
        input={input}
        engine={engine}
        appPath={appPath}
        trackedSlug={trackedSlug ?? null}
        playerId={playerId ?? null}
      />
    </>
  );
}

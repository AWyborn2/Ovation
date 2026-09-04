import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORM_LIMITS } from "@/lib/captions";
import { PLATFORMS } from "./constants";
import type { useCaptions } from "./use-captions";

type Captions = ReturnType<typeof useCaptions>;

/** Per-platform caption drafts with a copy button. */
export function CaptionsPanel({ captions }: { captions: Captions }) {
  const { platform, setPlatform, captionDraft, setCaptionDraft, copied, handleCopyCaption } =
    captions;
  return (
    <>
      <Tabs value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
        <TabsList className="w-full">
          {PLATFORMS.map((p) => (
            <TabsTrigger key={p.value} value={p.value} className="flex-1 text-xs">
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Textarea
        value={captionDraft}
        onChange={(e) => setCaptionDraft(e.target.value)}
        rows={8}
        className="font-mono text-xs"
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {captionDraft.length} / {PLATFORM_LIMITS[platform]}
        </span>
        <Button type="button" size="sm" variant="outline" onClick={handleCopyCaption}>
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 mr-1" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copy caption
            </>
          )}
        </Button>
      </div>
    </>
  );
}

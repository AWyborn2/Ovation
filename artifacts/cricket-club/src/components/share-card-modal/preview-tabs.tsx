import { Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { CardTheme as ApiCardTheme } from "@workspace/api-client-react";
import { PackCard } from "@/components/pack-card";
import {
  SIZES,
  type CardSize,
  type PhotoTransform,
  type RenderOptions,
  type ShareCardInput,
} from "@/lib/share-card";
import type { PackCardData } from "@/lib/pack-render";
import { AnimatedCardPreview } from "./animated-card-preview";

/** Size tabs + the live preview (animated / pack DOM / canvas PNG). */
export function PreviewTabs({
  input,
  activeSize,
  setActiveSize,
  enabledSizes,
  animated,
  buildOpts,
  renderTransform,
  animSig,
  soundOn,
  isPackCard,
  includeSponsors,
  effectiveTheme,
  isJunior,
  buildPackData,
  packId,
  rendering,
  previewUrls,
}: {
  input: ShareCardInput;
  activeSize: CardSize;
  setActiveSize: (s: CardSize) => void;
  enabledSizes: CardSize[];
  animated: boolean;
  buildOpts: (size: CardSize, transform: PhotoTransform) => RenderOptions;
  renderTransform: PhotoTransform;
  animSig: string;
  soundOn: boolean;
  isPackCard: boolean;
  includeSponsors: boolean;
  effectiveTheme: ApiCardTheme | null | undefined;
  isJunior: boolean;
  buildPackData: (transform: PhotoTransform) => PackCardData;
  packId: string | null;
  rendering: boolean;
  previewUrls: Partial<Record<CardSize, string | null>>;
}) {
  return (
    <Tabs value={activeSize} onValueChange={(v) => setActiveSize(v as CardSize)}>
      <TabsList className="w-full">
        {enabledSizes.map((s) => (
          <TabsTrigger key={s} value={s} className="flex-1 text-xs">
            {SIZES[s].label.split(" ")[0]}
            <span className="ml-1 text-muted-foreground">{SIZES[s].code}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {enabledSizes.map((s) => (
        <TabsContent key={s} value={s} className="mt-3">
          <div
            className="bg-muted border rounded-md flex items-center justify-center overflow-hidden"
            style={{ aspectRatio: `${SIZES[s].w} / ${SIZES[s].h}`, maxHeight: 500 }}
          >
            {animated ? (
              <AnimatedCardPreview
                input={input}
                opts={buildOpts(s, renderTransform)}
                sig={animSig}
                soundOn={soundOn}
              />
            ) : input && isPackCard ? (
              // Pack cards preview as a live scaled DOM subtree; only BYO
              // templates use the canvas path below. Reuses `isPackCard`
              // rather than re-deriving the condition, so the preview and
              // the export path can never disagree about which renderer
              // owns this card.
              <PackCard
                input={input}
                size={s}
                sponsorsOn={includeSponsors}
                theme={effectiveTheme}
                junior={isJunior}
                data={buildPackData(renderTransform)}
                packId={packId}
              />
            ) : rendering && !previewUrls[s] ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : previewUrls[s] ? (
              <img src={previewUrls[s]!} alt="Card preview" className="w-full h-full object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">Preparing preview…</span>
            )}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}

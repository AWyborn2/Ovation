import { useState } from "react";
import { Copy, Download, Loader2, Share2 } from "lucide-react";
import {
  useCreatePostPack,
  markSocialDraftPosted,
  type PostPack,
  type SocialDraft,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

/** Whether this browser can share image files through the OS share sheet. */
export function canShareFiles(): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [new File([""], "card.png", { type: "image/png" })] })
    );
  } catch {
    return false;
  }
}

async function toFiles(pack: PostPack, kind: string): Promise<File[]> {
  return Promise.all(
    pack.images.map(async (img) => {
      const blob = await (await fetch(img.url, { credentials: "include" })).blob();
      return new File([blob], `${kind}-${img.size}.png`, { type: "image/png" });
    }),
  );
}

/**
 * The post pack (Social Studio R7, KTD9): render every enabled format once,
 * then share. On a phone a second tap opens the share sheet with the images
 * (social apps don't take archives, and sharing needs a fresh tap) and puts
 * the caption on the clipboard; on a desktop the zip downloads. Afterwards,
 * "Mark posted" closes the loop.
 */
export function PostPackButton({ draft, onPosted }: { draft: SocialDraft; onPosted?: () => void }) {
  const [pack, setPack] = useState<PostPack | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [posting, setPosting] = useState(false);
  const create = useCreatePostPack({
    mutation: {
      onSuccess: (p) => {
        setPack(p as PostPack);
        setNote(null);
      },
      onError: () => setNote("The post pack couldn't be made. Try again in a moment."),
    },
  });
  const kind = (draft.cardInput as { kind?: string } | null)?.kind ?? "card";

  const copyCaption = async () => {
    if (!pack) return;
    try {
      await navigator.clipboard.writeText(pack.caption);
      setNote("Caption copied.");
    } catch {
      setNote("Couldn't copy the caption — select it and copy by hand.");
    }
  };

  const share = async () => {
    if (!pack) return;
    setSharing(true);
    try {
      // Copy first: most apps drop shared text, so the caption goes in by paste.
      await navigator.clipboard.writeText(pack.caption).catch(() => undefined);
      await navigator.share({ files: await toFiles(pack, kind) });
      setNote("Caption copied — paste it into your post.");
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") {
        setNote("Sharing didn't work here. Download the zip instead.");
      }
    } finally {
      setSharing(false);
    }
  };

  const markPosted = async () => {
    setPosting(true);
    try {
      await markSocialDraftPosted(draft.id);
      onPosted?.();
    } finally {
      setPosting(false);
    }
  };

  if (!pack) {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          onClick={() => create.mutate({ id: draft.id })}
          disabled={create.isPending}
        >
          {create.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Share2 className="mr-2 h-4 w-4" aria-hidden />
          )}
          {create.isPending ? "Making post pack…" : "Post pack"}
        </Button>
        {note && <p className="text-sm text-destructive">{note}</p>}
      </div>
    );
  }

  const shareable = canShareFiles();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {pack.images.map((img) => (
          <figure key={img.size} className="space-y-1">
            <img
              src={img.url}
              alt={`${img.size} card`}
              className="w-full rounded-md border border-border"
            />
            <figcaption className="text-center text-xs capitalize text-muted-foreground">
              {img.size}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {shareable ? (
          <Button type="button" onClick={share} disabled={sharing}>
            <Share2 className="mr-2 h-4 w-4" aria-hidden /> Share
          </Button>
        ) : (
          <Button type="button" asChild>
            <a href={pack.zipUrl} download>
              <Download className="mr-2 h-4 w-4" aria-hidden /> Download zip
            </a>
          </Button>
        )}
        <Button type="button" variant="outline" onClick={copyCaption}>
          <Copy className="mr-2 h-4 w-4" aria-hidden /> Copy caption
        </Button>
        {draft.status !== "posted" && (
          <Button type="button" variant="outline" onClick={markPosted} disabled={posting}>
            Mark posted
          </Button>
        )}
      </div>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

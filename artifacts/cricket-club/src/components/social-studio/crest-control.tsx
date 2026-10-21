import { useMemo, useRef, useState } from "react";
import {
  getListKnownCardCrestsQueryKey,
  useListKnownCardCrests,
  type CardCrestChoice,
  type CardCrestSource,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, RotateCcw, Upload } from "lucide-react";

/** A club's crest choice as the API takes it; null = back to the automatic crest. */
export type CrestChoiceUpdate = { crestSource: CardCrestChoice; crestUrl: string | null } | null;

/** The most known crests the picker shows at once (type to narrow). */
const MAX_SHOWN = 48;

/** The crest a card shows, or the initials badge that stands in for it. */
export function CrestBadge({
  crestUrl,
  monogram,
  size = "h-8 w-8",
}: {
  crestUrl: string | null;
  monogram: string;
  size?: string;
}) {
  if (crestUrl) {
    return (
      <img
        src={crestUrl}
        alt=""
        className={`${size} flex-none rounded bg-white object-contain p-0.5`}
        loading="lazy"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${size} flex flex-none items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground`}
    >
      {monogram}
    </span>
  );
}

const SOURCE_LABEL: Record<CardCrestSource, string> = {
  auto: "Automatic (PlayHQ)",
  upload: "Uploaded",
  known: "Picked",
  initials: "Initials badge",
};

/**
 * A team's crest on cards, and the control to change it: upload an image,
 * pick a crest Ovation already knows (PlayHQ organisation logos), or use the
 * initials badge; reset goes back to the automatic crest. Used by the senior
 * and junior name settings alike.
 */
export function CrestControl({
  teamName,
  searchSeed = teamName,
  crestUrl,
  crestSource,
  autoCrestUrl,
  monogram,
  saving,
  onChoose,
}: {
  teamName: string;
  /** What the known-crest search starts with (the automatic short name). */
  searchSeed?: string;
  crestUrl: string | null;
  crestSource: CardCrestSource;
  autoCrestUrl: string | null;
  monogram: string;
  saving: boolean;
  onChoose: (choice: CrestChoiceUpdate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(searchSeed);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const known = useListKnownCardCrests({
    query: { enabled: open, queryKey: getListKnownCardCrestsQueryKey(), staleTime: 300_000 },
  });
  const { uploadFile, isUploading } = useUpload({ onError: (e) => setError(e.message) });

  const choose = (choice: CrestChoiceUpdate) => {
    onChoose(choice);
    setOpen(false);
  };

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const all = known.data?.crests ?? [];
    const hits = words.length
      ? all.filter((c) => words.every((w) => c.name.toLowerCase().includes(w)))
      : all;
    return hits.slice(0, MAX_SHOWN);
  }, [known.data, query]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    const result = await uploadFile(file);
    if (result) choose({ crestSource: "upload", crestUrl: `/api/storage${result.objectPath}` });
  };

  return (
    <>
      <button
        type="button"
        className="flex-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Change the crest for ${teamName}`}
        title={`Crest: ${SOURCE_LABEL[crestSource]}. Click to change.`}
        disabled={saving}
        onClick={() => {
          setQuery(searchSeed);
          setError(null);
          setOpen(true);
        }}
      >
        <CrestBadge crestUrl={crestUrl} monogram={monogram} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Crest for {teamName}</DialogTitle>
            <DialogDescription>
              Every new card uses this crest for {teamName}. Now: {SOURCE_LABEL[crestSource]}.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label={`Upload a crest image for ${teamName}`}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isUploading || saving}
              onClick={() => fileRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Upload className="mr-1 h-3.5 w-3.5" aria-hidden />
              )}
              Upload image
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving || crestSource === "initials"}
              onClick={() => choose({ crestSource: "initials", crestUrl: null })}
            >
              <CrestBadge crestUrl={null} monogram={monogram} size="mr-1 h-5 w-5" />
              Use initials badge
            </Button>
            {crestSource !== "auto" && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => choose(null)}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
                Reset to automatic
                {autoCrestUrl ? "" : " (initials)"}
              </Button>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Pick a crest Ovation knows</p>
            <Input
              value={query}
              placeholder="Search clubs"
              aria-label="Search known crests"
              className="h-8"
              onChange={(e) => setQuery(e.target.value)}
            />
            {known.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading crests…
              </p>
            ) : matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No known crest matches. Try another name, or upload one.
              </p>
            ) : (
              <ul className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
                {matches.map((c) => (
                  <li key={c.orgId}>
                    <button
                      type="button"
                      className={`flex w-full items-center gap-2 rounded border p-1.5 text-left text-xs hover:bg-muted ${
                        c.logoUrl === crestUrl ? "border-primary" : "border-transparent"
                      }`}
                      disabled={saving}
                      onClick={() => choose({ crestSource: "known", crestUrl: c.logoUrl })}
                    >
                      <CrestBadge crestUrl={c.logoUrl} monogram="" />
                      <span className="line-clamp-2">{c.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

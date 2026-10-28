import { useMemo, useState } from "react";
import { Images } from "lucide-react";
import {
  useListClubPhotos,
  getListClubPhotosQueryKey,
  useListClubUploads,
  getListClubUploadsQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Choose an image from the club's photo library or its Uploads, for an image
 * field or a slot image on a card made by hand. Only image uploads are offered
 * (an SVG upload is a vector, which a slot can't hold).
 */
export function LibraryImagePicker({
  label,
  onPick,
}: {
  label: string;
  onPick: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Choose ${label} from the library`}
      >
        <Images className="h-3.5 w-3.5 mr-1" /> Choose from library
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* The library loads only while the picker is open. */}
        {open && (
          <PickerContent
            label={label}
            onPick={(url) => {
              onPick(url);
              setOpen(false);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function PickerContent({ label, onPick }: { label: string; onPick: (url: string) => void }) {
  const [tab, setTab] = useState<"photos" | "uploads">("photos");
  const [q, setQ] = useState("");
  const photosQ = useListClubPhotos(undefined, {
    query: { queryKey: getListClubPhotosQueryKey() },
  });
  const uploadsQ = useListClubUploads(undefined, {
    query: { queryKey: getListClubUploadsQueryKey() },
  });

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const photos = useMemo(() => {
    const matches = (text: string) => words.every((w) => text.toLowerCase().includes(w));
    return (photosQ.data ?? []).filter((p) =>
      matches([p.grade ?? "Club-wide", p.season ?? "", ...(p.photoTypes ?? [])].join(" ")),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photosQ.data, q]);
  const uploads = useMemo(() => {
    const matches = (text: string) => words.every((w) => text.toLowerCase().includes(w));
    return (uploadsQ.data ?? []).filter((u) => u.kind === "image" && u.url && matches(u.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadsQ.data, q]);
  const loading = tab === "photos" ? photosQ.isLoading : uploadsQ.isLoading;
  const items =
    tab === "photos"
      ? photos.map((p) => ({
          key: `p${p.id}`,
          url: p.url,
          thumb: p.thumbUrl,
          title: p.grade ?? "Club-wide",
        }))
      : uploads.map((u) => ({
          key: `u${u.id}`,
          url: u.url!,
          thumb: u.thumbUrl ?? u.url!,
          title: u.name,
        }));

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[640px]">
      <DialogHeader>
        <DialogTitle>Choose an image</DialogTitle>
        <DialogDescription>For {label}, from your photo library or your Uploads.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2">
        {(["photos", "uploads"] as const).map((t) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={tab === t ? "default" : "outline"}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t === "photos" ? "Photo library" : "Uploads"}
          </Button>
        ))}
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === "photos" ? "Search by grade, season or type" : "Search by name"}
          aria-label="Search images"
          className="h-8 min-w-0 flex-1"
        />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {words.length
            ? "Nothing matches that search."
            : tab === "photos"
              ? "No photos in the library yet."
              : "No image uploads yet. Add some in the Studio editor's Uploads."}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Images">
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className="block w-full overflow-hidden rounded-md border text-left hover:ring-2 hover:ring-primary"
                onClick={() => onPick(item.url)}
                aria-label={`Use ${item.title}`}
              >
                <img
                  src={item.thumb}
                  alt=""
                  className={cn(
                    "aspect-square w-full bg-muted",
                    tab === "uploads" ? "object-contain" : "object-cover",
                  )}
                />
                <span className="block truncate px-1.5 py-1 text-[11px] text-muted-foreground">
                  {item.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </DialogContent>
  );
}

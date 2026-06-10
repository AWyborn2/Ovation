import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetSocialSettings,
  useUpdateSocialSettings,
  useListSponsors,
  useCreateSponsor,
  useUpdateSponsor,
  useDeleteSponsor,
  useUpsertCaptionTemplate,
  useListCardThemes,
  useCreateCardTheme,
  useUpdateCardTheme,
  useDeleteCardTheme,
  useListCardAudioTracks,
  useCreateCardAudioTrack,
  useUpdateCardAudioTrack,
  useDeleteCardAudioTrack,
  getGetSocialSettingsQueryKey,
  getListSponsorsQueryKey,
  getListCardThemesQueryKey,
  getListCardAudioTracksQueryKey,
  type Sponsor,
  type SocialSettings,
  type CardTheme,
  type CardAudioTrack,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Upload, Save, Loader2 } from "lucide-react";
import { KNOWN_TOKENS, type Platform } from "@/lib/captions";
import type { CardKind } from "@/lib/share-card";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { CardKindPicker } from "@/components/card-kind-picker";
import { TemplatesCard } from "@/components/card-template-builder";
import { LoadingState, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";

const ENGINES: { value: "ondemand" | "milestone" | "roundup" | "recap"; label: string; desc: string }[] = [
  { value: "ondemand", label: "On-demand share", desc: "Share buttons on player, record and leaderboard pages." },
  { value: "milestone", label: "Auto-milestone", desc: "Detect tier-crossings after each import and queue cards." },
  { value: "roundup", label: "Round-up", desc: "Top performers per grade after each import." },
  { value: "recap", label: "Season recap", desc: "Manual season-end recap per grade." },
];

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "twitter", label: "X / Twitter" },
];

const SIZE_KEYS: { key: "sizeSquare" | "sizePortrait" | "sizeStory"; label: string; code: string }[] = [
  { key: "sizeSquare", label: "Feed square", code: "1080×1080" },
  { key: "sizePortrait", label: "Feed portrait", code: "1080×1350" },
  { key: "sizeStory", label: "Story / TikTok", code: "1080×1920" },
];

export default function AdminSocial() {
  const qc = useQueryClient();
  const bundle = useGetSocialSettings();
  const sponsorsQ = useListSponsors();
  const themesQ = useListCardThemes();
  const audioTracksQ = useListCardAudioTracks();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
    qc.invalidateQueries({ queryKey: getListSponsorsQueryKey() });
  };

  const invalidateThemes = () => {
    qc.invalidateQueries({ queryKey: getListCardThemesQueryKey() });
  };

  const invalidateAudioTracks = () => {
    qc.invalidateQueries({ queryKey: getListCardAudioTracksQueryKey() });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground mt-1">
          Branded share-card factory for Instagram, Facebook, TikTok and X.
        </p>
      </div>

      {bundle.isError ? (
        <QueryError onRetry={() => bundle.refetch()} />
      ) : bundle.isLoading ? (
        <LoadingState label="Loading social settings…" />
      ) : bundle.data ? (
        <>
          <SettingsCard settings={bundle.data.settings} onSaved={invalidate} />
          <ThemesCard themes={themesQ.data ?? []} onChanged={invalidateThemes} />
          <AudioTracksCard tracks={audioTracksQ.data ?? []} onChanged={invalidateAudioTracks} />
          <TemplatesCard />
          <SponsorsCard sponsors={sponsorsQ.data ?? []} onChanged={invalidate} />
          <CaptionTemplatesCard
            templates={bundle.data.captionTemplates}
            onSaved={invalidate}
          />
        </>
      ) : (
        <QueryError onRetry={() => bundle.refetch()} />
      )}
    </div>
  );
}

function SettingsCard({
  settings,
  onSaved,
}: {
  settings: SocialSettings;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<SocialSettings>(settings);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateSocialSettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        onSaved();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });

  useEffect(() => setDraft(settings), [settings]);

  const save = () => update.mutate({ data: draft });

  const set = <K extends keyof SocialSettings>(k: K, v: SocialSettings[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Engines, sizes and tone</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Content engines
          </h3>
          <div className="space-y-2">
            {ENGINES.map((eng) => {
              const key =
                eng.value === "ondemand"
                  ? "engineOnDemand"
                  : eng.value === "milestone"
                    ? "engineMilestone"
                    : eng.value === "roundup"
                      ? "engineRoundUp"
                      : "engineRecap";
              return (
                <div key={eng.value} className="flex items-start justify-between gap-3 border rounded p-3">
                  <div>
                    <div className="font-medium">{eng.label}</div>
                    <div className="text-xs text-muted-foreground">{eng.desc}</div>
                  </div>
                  <Switch
                    checked={(draft[key] as boolean) ?? false}
                    onCheckedChange={(v) => set(key, v as SocialSettings[typeof key])}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Output sizes
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SIZE_KEYS.map((s) => (
              <div key={s.key} className="flex items-center justify-between border rounded p-3">
                <div>
                  <div className="font-medium text-sm">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.code}</div>
                </div>
                <Switch
                  checked={(draft[s.key] as boolean) ?? false}
                  onCheckedChange={(v) => set(s.key, v as SocialSettings[typeof s.key])}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="clubUrl">Club URL (shown in card footer + caption)</Label>
            <Input
              id="clubUrl"
              value={draft.clubUrl}
              onChange={(e) => set("clubUrl", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clubHashtag">Default hashtag</Label>
            <Input
              id="clubHashtag"
              value={draft.clubHashtag}
              onChange={(e) => set("clubHashtag", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between border rounded p-3">
            <div>
              <div className="font-medium text-sm">Sponsors enabled</div>
              <div className="text-xs text-muted-foreground">
                Stamp active sponsor logos on the bottom strip.
              </div>
            </div>
            <Switch
              checked={draft.sponsorsEnabled}
              onCheckedChange={(v) => set("sponsorsEnabled", v)}
            />
          </div>
          <div className="flex items-center justify-between border rounded p-3">
            <div>
              <div className="font-medium text-sm">Auto-generate captions</div>
              <div className="text-xs text-muted-foreground">
                Pre-fill captions per platform from your templates.
              </div>
            </div>
            <Switch
              checked={draft.captionsEnabled}
              onCheckedChange={(v) => set("captionsEnabled", v)}
            />
          </div>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex justify-end">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SponsorsCard({
  sponsors,
  onChanged,
}: {
  sponsors: Sponsor[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const create = useCreateSponsor({ mutation: { onSuccess: onChanged } });
  const remove = useDeleteSponsor({ mutation: { onSuccess: onChanged } });
  const update = useUpdateSponsor({ mutation: { onSuccess: onChanged } });

  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [activeFrom, setActiveFrom] = useState("");
  const [activeTo, setActiveTo] = useState("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [cardKinds, setCardKinds] = useState<CardKind[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { uploadFile, isUploading } = useUpload({
    onError: (e) => setError(e.message),
  });

  const handleFile = async (file: File) => {
    setError(null);
    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    }
    const result = await uploadFile(file);
    if (result) {
      setLogoUrl(`/api/storage${result.objectPath}`);
    }
  };

  const add = () => {
    setError(null);
    if (!name.trim()) return setError("Name required.");
    if (isUploading) return setError("Logo is still uploading.");
    if (!logoUrl) return setError("Logo required.");
    create.mutate(
      {
        data: {
          name: name.trim(),
          logoUrl,
          link: link.trim(),
          activeFrom: activeFrom || null,
          activeTo: activeTo || null,
          cardKinds,
          displayOrder: sponsors.length,
        },
      },
      {
        onSuccess: () => {
          setName("");
          setLink("");
          setActiveFrom("");
          setActiveTo("");
          setLogoUrl("");
          setPreviewUrl("");
          setCardKinds([]);
          if (fileRef.current) fileRef.current.value = "";
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sponsor library</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-6">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="sp-name">Sponsor name</Label>
              <Input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-link">Link (optional)</Label>
              <Input id="sp-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="sp-from">Active from</Label>
                <Input id="sp-from" type="date" value={activeFrom} onChange={(e) => setActiveFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sp-to">Active to</Label>
                <Input id="sp-to" type="date" value={activeTo} onChange={(e) => setActiveTo(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Show on card types</Label>
              <CardKindPicker value={cardKinds} onChange={setCardKinds} />
              <p className="text-xs text-muted-foreground">
                No specific types selected = logo shows on all card types.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <Label>Logo (PNG / SVG, transparent)</Label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!isUploading) setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (isUploading) return;
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              className={`border border-dashed rounded p-4 flex flex-col items-center gap-3 transition-colors ${
                isDragging ? "border-primary bg-primary/5" : ""
              }`}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="logo" className="max-h-24 object-contain" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/svg+xml,image/webp,image/jpeg"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                disabled={isUploading}
                className="text-xs"
              />
              {isUploading && (
                <div className="flex items-center text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Uploading…
                </div>
              )}
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button onClick={add} disabled={create.isPending || isUploading} className="w-full">
              Add sponsor
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {sponsors.length === 0 ? (
            <EmptyState
              title="No sponsors yet"
              message="Add a sponsor above to feature their logo on share cards."
            />
          ) : (
            sponsors.map((s) => (
              <div key={s.id} className="border rounded p-2 space-y-2">
                <div className="flex items-center gap-3">
                  <img src={s.logoUrl} alt={s.name} className="h-10 w-16 object-contain bg-muted rounded" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.link || "no link"} • {s.activeFrom ?? "no start"} → {s.activeTo ?? "no end"}
                    </div>
                  </div>
                  <Input
                    type="number"
                    className="w-16"
                    defaultValue={s.displayOrder}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v !== s.displayOrder) {
                        update.mutate({ id: s.id, data: { displayOrder: v } });
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Delete sponsor",
                          description: `Delete sponsor "${s.name}"?`,
                          confirmText: "Delete",
                          destructive: true,
                        })
                      )
                        remove.mutate({ id: s.id });
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="pl-[4.75rem]">
                  <CardKindPicker
                    value={s.cardKinds}
                    onChange={(next) => update.mutate({ id: s.id, data: { cardKinds: next } })}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const DEFAULT_THEME_COLORS = {
  bgDark: "#322F3D",
  bgPanel: "#3F3C4C",
  accent: "#FBD039",
  textLight: "#F5F2E8",
};

function ThemesCard({
  themes,
  onChanged,
}: {
  themes: CardTheme[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const create = useCreateCardTheme({ mutation: { onSuccess: onChanged } });
  const update = useUpdateCardTheme({ mutation: { onSuccess: onChanged } });
  const remove = useDeleteCardTheme({ mutation: { onSuccess: onChanged } });

  const [name, setName] = useState("");
  const [colors, setColors] = useState({ ...DEFAULT_THEME_COLORS });
  const [bgImageUrl, setBgImageUrl] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const bgRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const bgUpload = useUpload({ onError: (e) => setError(e.message) });
  const logoUpload = useUpload({ onError: (e) => setError(e.message) });

  const handleBg = async (file: File) => {
    setError(null);
    const r = await bgUpload.uploadFile(file);
    if (r) setBgImageUrl(`/api/storage${r.objectPath}`);
  };
  const handleLogo = async (file: File) => {
    setError(null);
    const r = await logoUpload.uploadFile(file);
    if (r) setLogoUrl(`/api/storage${r.objectPath}`);
  };

  const reset = () => {
    setName("");
    setColors({ ...DEFAULT_THEME_COLORS });
    setBgImageUrl("");
    setLogoUrl("");
    if (bgRef.current) bgRef.current.value = "";
    if (logoRef.current) logoRef.current.value = "";
  };

  const add = () => {
    setError(null);
    if (!name.trim()) return setError("Theme name required.");
    if (bgUpload.isUploading || logoUpload.isUploading) return setError("Image is still uploading.");
    create.mutate(
      {
        data: {
          name: name.trim(),
          bgDark: colors.bgDark,
          bgPanel: colors.bgPanel,
          accent: colors.accent,
          textLight: colors.textLight,
          backgroundImageUrl: bgImageUrl || null,
          logoUrl: logoUrl || null,
          displayOrder: themes.length,
        },
      },
      { onSuccess: reset },
    );
  };

  const colorFields: { key: keyof typeof colors; label: string }[] = [
    { key: "bgDark", label: "Background" },
    { key: "bgPanel", label: "Panel" },
    { key: "accent", label: "Accent" },
    { key: "textLight", label: "Text" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Card themes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-6">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="th-name">Theme name</Label>
              <Input id="th-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finals Night" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {colorFields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">{f.label}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={colors[f.key]}
                      onChange={(e) => setColors((c) => ({ ...c, [f.key]: e.target.value }))}
                      className="h-9 w-10 rounded border bg-transparent p-0.5"
                    />
                    <Input
                      value={colors[f.key]}
                      onChange={(e) => setColors((c) => ({ ...c, [f.key]: e.target.value }))}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Background image (optional)</Label>
              <div className="border border-dashed rounded p-3 flex flex-col items-center gap-2">
                {bgImageUrl ? (
                  <img src={bgImageUrl} alt="background" className="max-h-20 object-cover rounded" />
                ) : (
                  <Upload className="h-6 w-6 text-muted-foreground" />
                )}
                <input
                  ref={bgRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => e.target.files?.[0] && handleBg(e.target.files[0])}
                  disabled={bgUpload.isUploading}
                  className="text-xs"
                />
                {bgUpload.isUploading && (
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Uploading…
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Logo override (optional)</Label>
              <div className="border border-dashed rounded p-3 flex flex-col items-center gap-2">
                {logoUrl ? (
                  <img src={logoUrl} alt="logo" className="max-h-16 object-contain" />
                ) : (
                  <Upload className="h-6 w-6 text-muted-foreground" />
                )}
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/webp"
                  onChange={(e) => e.target.files?.[0] && handleLogo(e.target.files[0])}
                  disabled={logoUpload.isUploading}
                  className="text-xs"
                />
                {logoUpload.isUploading && (
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Uploading…
                  </div>
                )}
              </div>
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button onClick={add} disabled={create.isPending || bgUpload.isUploading || logoUpload.isUploading} className="w-full">
              Add theme
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {themes.length === 0 ? (
            <EmptyState
              title="No themes yet"
              message="Create a theme above to restyle your share cards."
            />
          ) : (
            themes.map((t) => (
              <div key={t.id} className="flex items-center gap-3 border rounded p-2">
                <div className="flex gap-1">
                  {[t.bgDark, t.bgPanel, t.accent, t.textLight].map((c, i) => (
                    <span key={i} className="h-8 w-4 rounded-sm border" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {t.name}
                    {t.isDefault && (
                      <span className="text-[10px] uppercase tracking-wide bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.backgroundImageUrl ? "bg image • " : ""}
                    {t.logoUrl ? "custom logo" : "club logo"}
                  </div>
                </div>
                {!t.isDefault && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => update.mutate({ id: t.id, data: { isDefault: true } })}
                    disabled={update.isPending}
                  >
                    Set default
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Delete theme",
                        description: `Delete theme "${t.name}"?`,
                        confirmText: "Delete",
                        destructive: true,
                      })
                    )
                      remove.mutate({ id: t.id });
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AudioTracksCard({
  tracks,
  onChanged,
}: {
  tracks: CardAudioTrack[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const create = useCreateCardAudioTrack({ mutation: { onSuccess: onChanged } });
  const update = useUpdateCardAudioTrack({ mutation: { onSuccess: onChanged } });
  const remove = useDeleteCardAudioTrack({ mutation: { onSuccess: onChanged } });

  const [name, setName] = useState("");
  const [trackUrl, setTrackUrl] = useState<string>("");
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useUpload({ onError: (e) => setError(e.message) });

  const handleFile = async (file: File) => {
    setError(null);
    setDurationMs(null);
    const r = await upload.uploadFile(file);
    if (r) {
      setTrackUrl(`/api/storage${r.objectPath}`);
      if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ""));
      // Read the track length from the file so the trim UI knows the range.
      try {
        const objUrl = URL.createObjectURL(file);
        const probe = new Audio();
        probe.preload = "metadata";
        probe.src = objUrl;
        probe.addEventListener("loadedmetadata", () => {
          if (Number.isFinite(probe.duration)) {
            setDurationMs(Math.round(probe.duration * 1000));
          }
          URL.revokeObjectURL(objUrl);
        });
      } catch {
        /* duration is optional */
      }
    }
  };

  const reset = () => {
    setName("");
    setTrackUrl("");
    setDurationMs(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const add = () => {
    setError(null);
    if (!name.trim()) return setError("Track name required.");
    if (!trackUrl) return setError("Upload an audio file first.");
    if (upload.isUploading) return setError("Audio is still uploading.");
    create.mutate(
      {
        data: {
          name: name.trim(),
          url: trackUrl,
          durationMs,
          displayOrder: tracks.length,
        },
      },
      { onSuccess: reset },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Card music tracks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Background music for animated video clips. Admins pick a track (with
          volume + trim) in the share dialog; the exported MP4/WebM includes it.
          Only upload tracks you are licensed to use.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-6">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="au-name">Track name</Label>
              <Input
                id="au-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Upbeat Stadium Loop"
              />
            </div>
            {durationMs != null && (
              <div className="text-xs text-muted-foreground">
                Length: {(durationMs / 1000).toFixed(1)}s
              </div>
            )}
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button
              onClick={add}
              disabled={create.isPending || upload.isUploading || !trackUrl}
              className="w-full"
            >
              Add track
            </Button>
          </div>
          <div className="space-y-1">
            <Label>Audio file</Label>
            <div className="border border-dashed rounded p-3 flex flex-col items-center gap-2">
              {trackUrl ? (
                <audio src={trackUrl} controls className="w-full" />
              ) : (
                <Upload className="h-6 w-6 text-muted-foreground" />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac,audio/mp4,audio/x-m4a"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                disabled={upload.isUploading}
                className="text-xs"
              />
              {upload.isUploading && (
                <div className="flex items-center text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Uploading…
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {tracks.length === 0 ? (
            <EmptyState
              title="No music tracks yet"
              message="Upload a track above to offer background music on animated clips."
            />
          ) : (
            tracks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 border rounded p-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {t.name}
                    {t.isCurated && (
                      <span className="text-[10px] uppercase tracking-wide bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                        Library
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.durationMs ? `${(t.durationMs / 1000).toFixed(1)}s` : "length unknown"}
                  </div>
                </div>
                <audio src={`/api/storage${t.url}`.replace("/api/storage/api/storage", "/api/storage")} controls className="h-8 max-w-[14rem]" />
                <Input
                  type="number"
                  className="w-16"
                  defaultValue={t.displayOrder}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v !== t.displayOrder) {
                      update.mutate({ id: t.id, data: { displayOrder: v } });
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Delete track",
                        description: `Delete music track "${t.name}"?`,
                        confirmText: "Delete",
                        destructive: true,
                      })
                    )
                      remove.mutate({ id: t.id });
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CaptionTemplatesCard({
  templates,
  onSaved,
}: {
  templates: { engine: string; platform: string; template: string }[];
  onSaved: () => void;
}) {
  const upsert = useUpsertCaptionTemplate({ mutation: { onSuccess: onSaved } });
  const [engine, setEngine] = useState<string>("ondemand");
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [draft, setDraft] = useState<string>("");
  const initial = useMemo(
    () => templates.find((t) => t.engine === engine && t.platform === platform)?.template ?? "",
    [templates, engine, platform],
  );

  useEffect(() => setDraft(initial), [initial]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Caption templates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          Tokens auto-substitute from the card's data. Available:{" "}
          <code className="font-mono">{KNOWN_TOKENS.join(" ")}</code>
        </div>

        <Tabs value={engine} onValueChange={setEngine}>
          <TabsList className="w-full">
            {ENGINES.map((e) => (
              <TabsTrigger key={e.value} value={e.value} className="flex-1 text-xs">
                {e.label.replace(" (coming soon)", "")}
              </TabsTrigger>
            ))}
          </TabsList>
          {ENGINES.map((e) => (
            <TabsContent key={e.value} value={e.value} className="mt-3">
              <Tabs value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                <TabsList className="w-full">
                  {PLATFORMS.map((p) => (
                    <TabsTrigger key={p.value} value={p.value} className="flex-1 text-xs">
                      {p.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Textarea
                value={draft}
                onChange={(ev) => setDraft(ev.target.value)}
                rows={6}
                className="font-mono text-xs mt-3"
              />
              <div className="flex justify-end mt-3">
                <Button
                  onClick={() =>
                    upsert.mutate({
                      data: { engine: e.value, platform, template: draft },
                    })
                  }
                  disabled={upsert.isPending || draft === initial}
                >
                  Save template
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

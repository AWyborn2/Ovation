import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetSocialSettings,
  useUpdateSocialSettings,
  useListSponsors,
  useCreateSponsor,
  useUpdateSponsor,
  useDeleteSponsor,
  useUpsertCaptionTemplate,
  getGetSocialSettingsQueryKey,
  getListSponsorsQueryKey,
  type Sponsor,
  type SocialSettings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Upload, Save, Loader2 } from "lucide-react";
import { KNOWN_TOKENS, type Platform } from "@/lib/captions";
import { handleAdminMutationError } from "@/lib/admin-auth";

const ENGINES: { value: "ondemand" | "milestone" | "roundup" | "recap"; label: string; desc: string }[] = [
  { value: "ondemand", label: "On-demand share", desc: "Share buttons on player, record and leaderboard pages." },
  { value: "milestone", label: "Auto-milestone (coming soon)", desc: "Detect tier-crossings after each import and queue cards." },
  { value: "roundup", label: "Round-up (coming soon)", desc: "Top performers per grade after each import." },
  { value: "recap", label: "Season recap (coming soon)", desc: "Manual season-end recap per grade." },
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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
    qc.invalidateQueries({ queryKey: getListSponsorsQueryKey() });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Social cards</h1>
        <p className="text-muted-foreground mt-1">
          Branded share-card factory for Instagram, Facebook, TikTok and X.
        </p>
      </div>

      {bundle.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : bundle.data ? (
        <>
          <SettingsCard settings={bundle.data.settings} onSaved={invalidate} />
          <SponsorsCard sponsors={sponsorsQ.data ?? []} onChanged={invalidate} />
          <CaptionTemplatesCard
            templates={bundle.data.captionTemplates}
            onSaved={invalidate}
          />
        </>
      ) : (
        <div className="text-sm text-destructive">Failed to load settings.</div>
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
  const create = useCreateSponsor({ mutation: { onSuccess: onChanged } });
  const remove = useDeleteSponsor({ mutation: { onSuccess: onChanged } });
  const update = useUpdateSponsor({ mutation: { onSuccess: onChanged } });

  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [activeFrom, setActiveFrom] = useState("");
  const [activeTo, setActiveTo] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (file.size > 500 * 1024) {
      setError("Logo file must be under 500KB. Use a smaller PNG/SVG.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(String(reader.result));
    reader.onerror = () => setError("Failed to read file.");
    reader.readAsDataURL(file);
  };

  const add = () => {
    setError(null);
    if (!name.trim()) return setError("Name required.");
    if (!logoDataUrl) return setError("Logo required.");
    create.mutate(
      {
        data: {
          name: name.trim(),
          logoDataUrl,
          link: link.trim(),
          activeFrom: activeFrom || null,
          activeTo: activeTo || null,
          displayOrder: sponsors.length,
        },
      },
      {
        onSuccess: () => {
          setName("");
          setLink("");
          setActiveFrom("");
          setActiveTo("");
          setLogoDataUrl("");
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
          </div>
          <div className="space-y-3">
            <Label>Logo (PNG / SVG, transparent, &lt; 500KB)</Label>
            <div className="border border-dashed rounded p-4 flex flex-col items-center gap-3">
              {logoDataUrl ? (
                <img src={logoDataUrl} alt="logo" className="max-h-24 object-contain" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/svg+xml,image/webp,image/jpeg"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="text-xs"
              />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button onClick={add} disabled={create.isPending} className="w-full">
              Add sponsor
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {sponsors.length === 0 ? (
            <div className="text-sm text-muted-foreground">No sponsors yet.</div>
          ) : (
            sponsors.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border rounded p-2">
                <img src={s.logoDataUrl} alt={s.name} className="h-10 w-16 object-contain bg-muted rounded" />
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
                  onClick={() => {
                    if (confirm(`Delete sponsor "${s.name}"?`)) remove.mutate({ id: s.id });
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

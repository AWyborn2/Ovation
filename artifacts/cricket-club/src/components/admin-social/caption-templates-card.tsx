import { useEffect, useMemo, useState } from "react";
import { useUpsertCaptionTemplate } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KNOWN_TOKENS, type Platform } from "@/lib/captions";
import { ENGINES, PLATFORMS } from "./constants";

/** Per-engine × per-platform caption templates with token substitution. */
export function CaptionTemplatesCard({
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

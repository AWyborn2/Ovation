import { useEffect, useMemo, useState } from "react";
import { useUpdateSocialSettings, type SocialSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";

// ---------------------------------------------------------------------------
// Match summary auto-draft settings
// ---------------------------------------------------------------------------

/** Per-grade match summary config shape (matches the OpenAPI schema). */
type MatchSummaryGradeConfig = Record<string, { enabled: boolean }>;

const SENIOR_GRADES = ["A Grade", "B Grade", "C Grade", "D Grade", "One Day", "T20"];
const JUNIOR_GRADES = ["Under 10", "Under 12", "Under 14", "Under 16"];
const ALL_DEFAULT_GRADES = [...SENIOR_GRADES, ...JUNIOR_GRADES];

function isJuniorGrade(grade: string): boolean {
  return JUNIOR_GRADES.includes(grade) || /^under\s/i.test(grade);
}

export function MatchSummarySettings({
  settings,
  onSaved,
}: {
  settings: SocialSettings;
  onSaved: () => void;
}) {
  const [masterEnabled, setMasterEnabled] = useState<boolean>(settings.engineMatchSummary === true);
  const [autoseedEnabled, setAutoseedEnabled] = useState<boolean>(
    settings.autoseedCarousels === true,
  );
  const [gradeConfig, setGradeConfig] = useState<MatchSummaryGradeConfig>(
    () => settings.matchSummaryGradeConfig ?? {},
  );
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

  useEffect(() => {
    setMasterEnabled(settings.engineMatchSummary === true);
    setAutoseedEnabled(settings.autoseedCarousels === true);
    setGradeConfig(settings.matchSummaryGradeConfig ?? {});
  }, [settings]);

  // Merge default grades with any extra grades stored in the config.
  const allGrades = useMemo(() => {
    const set = new Set(ALL_DEFAULT_GRADES);
    for (const g of Object.keys(gradeConfig)) set.add(g);
    return Array.from(set);
  }, [gradeConfig]);

  const isGradeEnabled = (grade: string): boolean => {
    if (gradeConfig[grade] !== undefined) return gradeConfig[grade].enabled;
    // Default: senior grades ON, junior grades OFF.
    return !isJuniorGrade(grade);
  };

  const toggleGrade = (grade: string, enabled: boolean) => {
    setGradeConfig((prev) => ({ ...prev, [grade]: { enabled } }));
  };

  const save = () => {
    setError(null);
    update.mutate({
      data: {
        engineMatchSummary: masterEnabled,
        autoseedCarousels: autoseedEnabled,
        matchSummaryGradeConfig: gradeConfig,
      },
    });
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Match summary auto-draft</h2>
      <Card>
        <CardContent className="space-y-6 pt-6">
          {/* Master toggle */}
          <div className="flex items-start justify-between gap-3 border rounded p-3">
            <div>
              <div className="font-medium">Match Summary Auto-Draft</div>
              <div className="text-xs text-muted-foreground">
                Automatically draft match summary cards when results are committed
              </div>
            </div>
            <Switch checked={masterEnabled} onCheckedChange={setMasterEnabled} />
          </div>

          {/* Per-grade config — visible only when master switch is on */}
          {masterEnabled && (
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold mb-1 text-sm uppercase tracking-wide text-muted-foreground">
                  Grade Configuration
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Control which grades auto-draft match summary cards. Senior grades default to ON,
                  junior grades default to OFF.
                </p>
              </div>

              <div className="space-y-2">
                {allGrades.map((grade) => {
                  const junior = isJuniorGrade(grade);
                  return (
                    <div
                      key={grade}
                      className="flex items-center justify-between gap-3 border rounded p-3"
                    >
                      <div className="flex items-center gap-2">
                        {junior && (
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: "#42342B" }}
                            title="Junior grade"
                          />
                        )}
                        <span className="font-medium text-sm">{grade}</span>
                        {junior && (
                          <span className="text-[10px] text-muted-foreground">Junior</span>
                        )}
                      </div>
                      <Switch
                        checked={isGradeEnabled(grade)}
                        onCheckedChange={(v) => toggleGrade(grade, v)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Auto-seed carousels toggle (dormant by default). Turns a round's
              APPROVED match-summary drafts into a carousel set. */}
          <div className="flex items-start justify-between gap-3 border rounded p-3">
            <div>
              <div className="font-medium">Auto-Seed Round Carousels</div>
              <div className="text-xs text-muted-foreground">
                When a round's match-summary drafts are approved, assemble them into one carousel
                set (re-running updates the same set)
              </div>
            </div>
            <Switch checked={autoseedEnabled} onCheckedChange={setAutoseedEnabled} />
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <div className="flex justify-end">
            <Button onClick={save} disabled={update.isPending}>
              {update.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

import { useEffect, useState } from "react";
import {
  useGetTourContent,
  useUpdateTourContent,
  getGetTourContentQueryKey,
  type TourContent,
  type TourContentUpdate,
  type TourStepContent,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { LoadingState, QueryError } from "@/components/data-states";
import {
  defaultFanSteps,
  defaultAdminSteps,
  DEFAULT_WELCOME_TITLE,
  DEFAULT_WELCOME_BODY,
} from "@/lib/tour";

// Build the editable rows: one per in-code step definition (the structure stays
// in code), pre-filled with any saved override or — when blank — the default.
type EditableStep = {
  key: string;
  defaultTitle: string;
  defaultDescription: string;
  title: string;
  description: string;
};

function mergeSteps(
  defs: { key: string; title: string; description: string }[],
  saved: TourStepContent[] | undefined,
): EditableStep[] {
  const byKey = new Map((saved ?? []).map((s) => [s.key, s]));
  return defs.map((d) => {
    const o = byKey.get(d.key);
    return {
      key: d.key,
      defaultTitle: d.title,
      defaultDescription: d.description,
      title: o?.title ?? "",
      description: o?.description ?? "",
    };
  });
}

export default function AdminTourContent() {
  const qc = useQueryClient();
  const contentQ = useGetTourContent();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Welcome & guided tour</h1>
        <p className="text-muted-foreground mt-1">
          Edit the first-visit welcome message and the wording of each guided-tour step. Leave
          a field blank to use the built-in default. Which sections the tour points at is fixed,
          but you can re-word every title and description — changes go live for visitors right
          away, no developer needed.
        </p>
      </div>

      {contentQ.isError ? (
        <QueryError onRetry={() => contentQ.refetch()} />
      ) : contentQ.isLoading ? (
        <LoadingState label="Loading tour content…" />
      ) : contentQ.data ? (
        <Editor
          content={contentQ.data}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: getGetTourContentQueryKey() })
          }
        />
      ) : (
        <QueryError onRetry={() => contentQ.refetch()} />
      )}
    </div>
  );
}

function Editor({
  content,
  onSaved,
}: {
  content: TourContent;
  onSaved: () => void;
}) {
  const [welcomeTitle, setWelcomeTitle] = useState(content.welcomeTitle);
  const [welcomeBody, setWelcomeBody] = useState(content.welcomeBody);
  const [fanSteps, setFanSteps] = useState<EditableStep[]>(
    mergeSteps(defaultFanSteps(), content.fanSteps),
  );
  const [adminSteps, setAdminSteps] = useState<EditableStep[]>(
    mergeSteps(defaultAdminSteps(), content.adminSteps),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWelcomeTitle(content.welcomeTitle);
    setWelcomeBody(content.welcomeBody);
    setFanSteps(mergeSteps(defaultFanSteps(), content.fanSteps));
    setAdminSteps(mergeSteps(defaultAdminSteps(), content.adminSteps));
  }, [content]);

  const update = useUpdateTourContent({
    mutation: {
      onSuccess: () => {
        setError(null);
        onSaved();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });

  const setStep = (
    list: "fan" | "admin",
    idx: number,
    field: "title" | "description",
    value: string,
  ) => {
    const setter = list === "fan" ? setFanSteps : setAdminSteps;
    setter((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const save = () => {
    setError(null);
    const toPayload = (steps: EditableStep[]): TourStepContent[] =>
      steps.map((s) => ({
        key: s.key,
        title: s.title.trim(),
        description: s.description.trim(),
      }));
    const data: TourContentUpdate = {
      welcomeTitle: welcomeTitle.trim(),
      welcomeBody: welcomeBody.trim(),
      fanSteps: toPayload(fanSteps),
      adminSteps: toPayload(adminSteps),
    };
    update.mutate({ data });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Welcome message</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Shown once per visitor the first time they open the site. Blank fields fall back to
            the defaults.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="welcome-title">Title</Label>
            <Input
              id="welcome-title"
              value={welcomeTitle}
              onChange={(e) => setWelcomeTitle(e.target.value)}
              placeholder={DEFAULT_WELCOME_TITLE}
              data-testid="input-welcome-title"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="welcome-body">Body</Label>
            <textarea
              id="welcome-body"
              value={welcomeBody}
              onChange={(e) => setWelcomeBody(e.target.value)}
              placeholder={DEFAULT_WELCOME_BODY}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              data-testid="input-welcome-body"
            />
          </div>
        </CardContent>
      </Card>

      <StepEditor
        title="Visitor tour steps"
        description="The public walkthrough launched from the welcome dialog and the Help button."
        list="fan"
        steps={fanSteps}
        onChange={setStep}
      />

      <StepEditor
        title="Admin tour steps"
        description="The walkthrough shown to signed-in admins from the Help button and admin hub."
        list="admin"
        steps={adminSteps}
        onChange={setStep}
      />

      {error && <div className="text-sm text-destructive">{error}</div>}
      <div className="flex justify-end">
        <Button onClick={save} disabled={update.isPending} data-testid="button-save-tour-content">
          {update.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save tour content
        </Button>
      </div>
    </div>
  );
}

function StepEditor({
  title,
  description,
  list,
  steps,
  onChange,
}: {
  title: string;
  description: string;
  list: "fan" | "admin";
  steps: EditableStep[];
  onChange: (
    list: "fan" | "admin",
    idx: number,
    field: "title" | "description",
    value: string,
  ) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-xs text-muted-foreground">{description}</p>
        {steps.map((s, idx) => (
          <div
            key={s.key}
            className="space-y-2 border rounded-md p-4"
            data-testid={`tour-step-${s.key}`}
          >
            <div className="text-xs font-mono text-muted-foreground">
              Step {idx + 1}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${s.key}-title`}>Title</Label>
              <Input
                id={`${s.key}-title`}
                value={s.title}
                onChange={(e) => onChange(list, idx, "title", e.target.value)}
                placeholder={s.defaultTitle}
                data-testid={`input-step-title-${s.key}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${s.key}-desc`}>Description</Label>
              <textarea
                id={`${s.key}-desc`}
                value={s.description}
                onChange={(e) => onChange(list, idx, "description", e.target.value)}
                placeholder={s.defaultDescription}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                data-testid={`input-step-desc-${s.key}`}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

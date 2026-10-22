import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Monitor } from "lucide-react";
import {
  getGetConsoleLibraryTemplateQueryKey,
  getListConsoleLibraryTemplatesQueryKey,
  useDuplicateConsoleLibraryTemplate,
  useGetConsoleLibraryTemplate,
  useSaveConsoleLibraryTemplate,
  type ConsoleLibraryTemplate,
} from "@workspace/api-client-react";
import { kindFields } from "@workspace/scorecard/kind-templates";
import { LoadingState, QueryError } from "@/components/data-states";
import {
  TEMPLATE_EDITOR_MIN_WIDTH,
  TemplateEditorV2,
  useViewport,
  type EditorHost,
} from "@/pages/admin-template-editor";
import { editHref } from "./library";

const LIBRARY = "/platform-admin/library";

const chip =
  "rounded-full bg-[var(--ed-card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ed-ink2)]";

/**
 * A library template in editor v2, from the platform console (ADR-011 L7-A,
 * T7.2). Each save is a new version, checked by the fit job; clubs holding an
 * unedited copy see an update. Bundle templates open read-only with a way to
 * duplicate them.
 */
export default function LibraryEditorPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const viewport = useViewport();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const templateQ = useGetConsoleLibraryTemplate(id, {
    query: {
      queryKey: getGetConsoleLibraryTemplateQueryKey(id),
      enabled: Number.isInteger(id),
      retry: false,
    },
  });
  const duplicate = useDuplicateConsoleLibraryTemplate({
    mutation: {
      onSuccess: (t) => {
        void qc.invalidateQueries({ queryKey: getListConsoleLibraryTemplatesQueryKey() });
        navigate(editHref(t.id));
      },
    },
  });

  const centred = (node: React.ReactNode) => (
    <div className="studio-editor grid min-h-screen place-items-center p-6 text-center">{node}</div>
  );
  if (viewport.w < TEMPLATE_EDITOR_MIN_WIDTH) {
    return centred(
      <p className="flex max-w-xs items-center gap-2 text-sm text-[var(--ed-ink2)]">
        <Monitor className="h-4 w-4 shrink-0" aria-hidden /> Open on a computer or tablet to edit
        templates.
      </p>,
    );
  }
  if (templateQ.isLoading) return centred(<LoadingState label="Opening the template…" />);
  if (templateQ.isError || !templateQ.data) {
    return (templateQ.error as { status?: number } | null)?.status === 404
      ? centred(<p>That template isn&apos;t in the library.</p>)
      : centred(<QueryError onRetry={() => templateQ.refetch()} />);
  }
  const t = templateQ.data;
  if (!kindFields(t.kind)) {
    return centred(<p>There&apos;s no card called &ldquo;{t.kind}&rdquo;.</p>);
  }
  if (t.readOnly) {
    return centred(
      <div className="max-w-sm space-y-3 text-sm">
        <p>“{t.name}” comes from a bundle, so it changes only with a deploy.</p>
        <p className="text-[var(--ed-ink2)]">Duplicate it to edit a console copy.</p>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            disabled={duplicate.isPending}
            onClick={() => duplicate.mutate({ id: t.id, data: {} })}
            className="rounded-full bg-[var(--ed-accent)] px-3 py-1 font-semibold text-[var(--ed-on-accent)]"
          >
            Duplicate to edit
          </button>
          <Link
            href={LIBRARY}
            className="rounded-full border border-[var(--ed-line)] px-3 py-1 font-semibold"
          >
            Back to the library
          </Link>
        </div>
      </div>,
    );
  }
  return (
    <ConsoleTemplateEditor
      key={t.id}
      template={t}
      viewport={viewport}
      onReload={async () => (await templateQ.refetch()).data}
    />
  );
}

function ConsoleTemplateEditor({
  template,
  viewport,
  onReload,
}: {
  template: ConsoleLibraryTemplate;
  viewport: { w: number; h: number };
  onReload: () => Promise<ConsoleLibraryTemplate | undefined>;
}) {
  const qc = useQueryClient();
  const save = useSaveConsoleLibraryTemplate();
  const [current, setCurrent] = useState(template);
  const host: EditorHost<ConsoleLibraryTemplate> = {
    club: false,
    backHref: LIBRARY,
    save: async (baseVersion, document) => {
      const t = await save.mutateAsync({ id: template.id, data: { baseVersion, document } });
      setCurrent(t);
      qc.setQueryData(getGetConsoleLibraryTemplateQueryKey(template.id), t);
      void qc.invalidateQueries({ queryKey: getListConsoleLibraryTemplatesQueryKey() });
      return t;
    },
    reload: async () => {
      const t = await onReload();
      if (t) setCurrent(t);
      return t;
    },
    status: (version) => (
      <span className="flex items-center gap-2">
        <span className={chip}>Library · v{version}</span>
        <span className={chip}>{current.listed ? "Listed" : "Unlisted"}</span>
      </span>
    ),
  };
  return <TemplateEditorV2 template={template} viewport={viewport} host={host} />;
}

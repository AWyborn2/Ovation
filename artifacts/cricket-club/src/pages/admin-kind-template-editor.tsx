import { Link, useParams } from "wouter";
import { getListClubTemplatesQueryKey, useListClubTemplates } from "@workspace/api-client-react";
import { kindFields } from "@workspace/scorecard/kind-templates";
import { LoadingState, QueryError } from "@/components/data-states";
import { kindLabel } from "@/lib/social-studio";
import AdminTemplateEditor from "./admin-template-editor";

/**
 * `/admin/social/templates/:kind` (the Studio's "Edit" for a card kind): opens
 * the kind's default club template in editor v2 (ADR-011 L5-B). A kind with
 * no default yet gets one with its first card; until then the library is the
 * way in.
 */
export default function AdminKindTemplateEditor() {
  const { kind = "" } = useParams<{ kind: string }>();
  const known = kindFields(kind) !== null;
  const params = { kind };
  const listQ = useListClubTemplates(params, {
    query: { queryKey: getListClubTemplatesQueryKey(params), enabled: known },
  });
  const centred = (node: React.ReactNode) => (
    <div className="studio-editor grid min-h-screen place-items-center p-6 text-center">{node}</div>
  );
  if (!known) return centred(<p>There&apos;s no card called &ldquo;{kind}&rdquo;.</p>);
  if (listQ.isError) return centred(<QueryError onRetry={() => listQ.refetch()} />);
  if (listQ.isLoading) return centred(<LoadingState label="Opening the template…" />);
  const def = listQ.data?.templates.find((t) => t.isDefault);
  if (!def) {
    return centred(
      <div className="max-w-sm space-y-3 text-sm">
        <p>Your club has no {kindLabel(kind).toLowerCase()} design yet.</p>
        <p className="text-[var(--ed-ink2)]">
          Pick one in the template library, or make a card of this kind and it starts from your
          club&apos;s look.
        </p>
        <Link
          href="/admin/social/template-library"
          className="inline-block rounded-full bg-[var(--ed-accent)] px-3 py-1 font-semibold text-[var(--ed-on-accent)]"
        >
          Open the template library
        </Link>
      </div>,
    );
  }
  return <AdminTemplateEditor id={def.id} />;
}

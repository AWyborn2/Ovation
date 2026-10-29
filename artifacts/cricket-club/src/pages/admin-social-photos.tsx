import { lazy, Suspense, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { UnderlineTabs } from "@/components/broadcast";
import { LoadingState } from "@/components/data-states";
import { useEntitlements } from "@/lib/entitlements";
import { useSearchParamState } from "@/lib/use-search-param";
import { UploadsPanel } from "@/components/studio-editor/uploads-panel";
import { CollectionTiles } from "@/components/social-queue/photo-collections";

const AdminPhotoLibrary = lazy(() => import("@/pages/admin-photo-library"));
const AdminJuniorPhotoLibrary = lazy(() => import("@/pages/admin-junior-photo-library"));

type PhotoTab = "senior" | "junior" | "uploads" | "collections";

const PHOTO_TABS: readonly string[] = ["senior", "junior", "uploads", "collections"];

/** The editor's Uploads panel in the admin page's own colours. */
const ADMIN_PANEL = {
  "--ed-line": "hsl(var(--border))",
  "--ed-card": "hsl(var(--muted))",
  "--ed-ink": "hsl(var(--foreground))",
  "--ed-ink2": "hsl(var(--muted-foreground))",
  "--ed-muted": "hsl(var(--muted-foreground))",
  "--ed-accent": "hsl(var(--primary))",
} as CSSProperties;

/**
 * New Studio → Photos (studio-create-consolidation): the senior photo library,
 * the junior photo library, Uploads and Collections as tabs (`?tab=`). Each
 * tab is existing data and screens, unchanged: junior photos keep their own
 * routes and the fail-closed consent rule; Uploads are the club's logos and
 * artwork (`club_uploads`, the editor's Uploads panel); a collection opens in
 * the senior library, where collections live (S11).
 */
export default function AdminSocialPhotos() {
  const entitlements = useEntitlements();
  const [param, setTab] = useSearchParamState("tab", "senior");
  const [location, navigate] = useLocation();
  const tabs: { value: PhotoTab; label: string }[] = [
    { value: "senior", label: "Senior photos" },
    ...(entitlements.juniors ? [{ value: "junior" as const, label: "Junior photos" }] : []),
    { value: "uploads", label: "Uploads" },
    { value: "collections", label: "Collections" },
  ];
  const tab: PhotoTab =
    PHOTO_TABS.includes(param) && (param !== "junior" || entitlements.juniors)
      ? (param as PhotoTab)
      : "senior";
  return (
    <div className="space-y-6">
      <UnderlineTabs label="Photos" tabs={tabs} value={tab} onChange={setTab} />
      <div role="tabpanel" aria-label={tabs.find((t) => t.value === tab)?.label}>
        <Suspense fallback={<LoadingState label="Loading…" />}>
          {tab === "junior" ? (
            <AdminJuniorPhotoLibrary />
          ) : tab === "uploads" ? (
            <div style={ADMIN_PANEL} className="max-w-5xl">
              <UploadsPanel size="square" wide />
            </div>
          ) : tab === "collections" ? (
            <div className="space-y-3">
              <p className="max-w-[70ch] text-[15px] text-muted-foreground">
                Hand-picked sets of senior photos (&ldquo;Matchday crowd&rdquo;, &ldquo;Sponsor
                night&rdquo;) a template&rsquo;s photo layer can pick from. Open one to add or
                remove photos.
              </p>
              {/* A collection opens in the senior library, where its photos are managed. */}
              <CollectionTiles onOpen={(id) => navigate(`${location}?collection=${id}`)} />
            </div>
          ) : (
            <AdminPhotoLibrary />
          )}
        </Suspense>
      </div>
    </div>
  );
}

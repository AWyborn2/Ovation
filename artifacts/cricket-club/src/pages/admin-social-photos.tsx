import { lazy, Suspense } from "react";
import { UnderlineTabs } from "@/components/broadcast";
import { LoadingState } from "@/components/data-states";
import { useEntitlements } from "@/lib/entitlements";
import { useSearchParamState } from "@/lib/use-search-param";

const AdminPhotoLibrary = lazy(() => import("@/pages/admin-photo-library"));
const AdminJuniorPhotoLibrary = lazy(() => import("@/pages/admin-junior-photo-library"));

type PhotoTab = "senior" | "junior";

/**
 * New Studio → Photos (studio-create-consolidation): the senior photo library
 * and the junior photo library as tabs (`?tab=junior`). Each tab is the
 * existing page, unchanged: junior photos keep their own routes and the
 * fail-closed consent rule.
 */
export default function AdminSocialPhotos() {
  const entitlements = useEntitlements();
  const [param, setTab] = useSearchParamState("tab", "senior");
  const tabs: { value: PhotoTab; label: string }[] = [
    { value: "senior", label: "Senior photos" },
    ...(entitlements.juniors ? [{ value: "junior" as const, label: "Junior photos" }] : []),
  ];
  const tab: PhotoTab = param === "junior" && entitlements.juniors ? "junior" : "senior";
  return (
    <div className="space-y-6">
      <UnderlineTabs label="Photos" tabs={tabs} value={tab} onChange={setTab} />
      <div role="tabpanel" aria-label={tabs.find((t) => t.value === tab)?.label}>
        <Suspense fallback={<LoadingState label="Loading…" />}>
          {tab === "junior" ? <AdminJuniorPhotoLibrary /> : <AdminPhotoLibrary />}
        </Suspense>
      </div>
    </div>
  );
}

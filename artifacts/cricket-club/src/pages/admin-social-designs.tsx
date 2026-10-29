import { useSearch } from "wouter";
import { useLibraryPreviewData } from "@/components/template-library/previews";
import { YourDesigns } from "@/components/studio-home/recent-designs";

/**
 * New Studio → Your designs (studio-create-consolidation): the club's drafts,
 * templates and carousel sets as their own menu item. `?type=` starts it
 * filtered (the old Carousel sets URL lands on `?type=set`).
 */
export default function AdminSocialDesigns() {
  const preview = useLibraryPreviewData();
  const type = new URLSearchParams(useSearch()).get("type") ?? "";
  return <YourDesigns preview={preview} initialType={type} showBack={false} />;
}

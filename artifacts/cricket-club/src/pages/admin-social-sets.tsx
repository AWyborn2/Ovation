import { useState } from "react";
import { useSearch } from "wouter";
import { SetList, SetEditor } from "@/components/social-sets";
import { WeekendCarousel } from "@/components/weekend-carousel";

/**
 * Carousel sets: the list of sets, or the editor for the one that is open.
 * `?open=<id>` opens a set straight away (Studio home's Continue designing).
 * Everything else lives under `components/social-sets/` (plan.md §5.6).
 */
export default function AdminSocialSets() {
  const search = useSearch();
  const [openId, setOpenId] = useState<number | null>(() => {
    const id = Number(new URLSearchParams(search).get("open"));
    return Number.isInteger(id) && id > 0 ? id : null;
  });

  if (openId != null) {
    return <SetEditor id={openId} onBack={() => setOpenId(null)} />;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Need this weekend's match-day posts? Build them straight from fixtures, no set required.
        </p>
        <WeekendCarousel />
      </div>
      <SetList onOpen={setOpenId} />
    </div>
  );
}

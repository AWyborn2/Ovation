import { useState } from "react";
import { SetList, SetEditor } from "@/components/social-sets";

/**
 * Carousel sets: the list of sets, or the editor for the one that is open.
 * Everything else lives under `components/social-sets/` (plan.md §5.6).
 */
export default function AdminSocialSets() {
  const [openId, setOpenId] = useState<number | null>(null);

  if (openId != null) {
    return <SetEditor id={openId} onBack={() => setOpenId(null)} />;
  }
  return <SetList onOpen={setOpenId} />;
}

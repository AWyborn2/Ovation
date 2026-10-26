import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HonoursDisplayForm } from "../use-honours-display-settings";
import { RotationBuilder } from "./rotation-builder";
import { RotationItemPanel } from "./rotation-item-panel";
import { KioskPreview } from "./kiosk-preview";

/**
 * The TV rotation (B2) with a live preview (B4) and the selected item's
 * settings (B3) beside it. The club-wide timings moved to the Look tab.
 */
export function KioskSection({ form }: { form: HonoursDisplayForm }) {
  const [selected, setSelected] = useState<string | null>(null);
  // A removed item can't stay selected.
  const current = selected && form.sequence.includes(selected) ? selected : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>TV kiosk</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <RotationBuilder form={form} selected={current} onSelect={setSelected} />
        <div className="space-y-4 lg:pt-7">
          <KioskPreview form={form} token={current} />
          <RotationItemPanel form={form} token={current} />
        </div>
      </CardContent>
    </Card>
  );
}

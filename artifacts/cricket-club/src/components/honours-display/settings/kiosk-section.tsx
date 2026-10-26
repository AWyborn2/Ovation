import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { HonoursDisplayForm } from "../use-honours-display-settings";
import { RotationBuilder } from "./rotation-builder";

/** TV kiosk rotation (builder) + scroll timings. */
export function KioskSection({ form }: { form: HonoursDisplayForm }) {
  const { dwell, setDwell, speed, setSpeed, endHold, setEndHold } = form;
  return (
    <Card>
      <CardHeader>
        <CardTitle>TV kiosk</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <RotationBuilder form={form} />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Dwell before scroll (ms)
            </span>
            <Input
              type="number"
              value={dwell}
              onChange={(e) => setDwell(e.target.value)}
              data-testid="input-dwell"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Scroll speed (px/sec)</span>
            <Input
              type="number"
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              data-testid="input-speed"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Hold after scroll (ms)
            </span>
            <Input
              type="number"
              value={endHold}
              onChange={(e) => setEndHold(e.target.value)}
              data-testid="input-endhold"
            />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

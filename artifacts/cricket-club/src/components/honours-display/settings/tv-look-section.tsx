import { RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { HonoursDisplayForm } from "../use-honours-display-settings";
import { MOTION_KEYS, TvMotionFields, motionDefaults } from "./tv-motion-fields";

/**
 * The club's TV defaults (honours kiosk redesign B3), saved to `kiosk_look`.
 * Every board in the rotation follows them unless it sets its own.
 */
export function TvLookSection({ form }: { form: HonoursDisplayForm }) {
  const { kioskLook, resolveLook, patchLook, resetLook } = form;
  const changed = MOTION_KEYS.some((k) => kioskLook[k] !== undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle>TV defaults</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="max-w-[75ch] text-xs text-muted-foreground">
          How boards move and how big their text is on the clubroom TV. Each board follows these
          unless you change it in the rotation.
        </p>
        <div className="max-w-2xl">
          <TvMotionFields
            value={kioskLook}
            defaults={motionDefaults(kioskLook, resolveLook)}
            onPatch={patchLook}
            maxColumns={5}
            columnsLabel="Grade columns per screen (season grids)"
            idPrefix="look"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!changed}
          onClick={resetLook}
          data-testid="look-reset"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Back to built-in defaults
        </Button>
      </CardContent>
    </Card>
  );
}

import HonoursKiosk from "@/pages/honours-kiosk";
import { KIOSK_FIXTURE } from "@/dev/kiosk-fixture";

/** Dev-only: the clubroom-TV kiosk running on sample data (no login or token). */
export default function KioskFixtureHarness() {
  return <HonoursKiosk fixture={KIOSK_FIXTURE} />;
}

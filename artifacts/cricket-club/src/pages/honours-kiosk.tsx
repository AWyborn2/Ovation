import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetHonourDisplay,
  useGetKioskDisplay,
  getGetHonourDisplayQueryKey,
  getGetKioskDisplayQueryKey,
} from "@workspace/api-client-react";
import { resolveClubLook } from "@workspace/scorecard/kiosk-display";
import { SponsorStrip } from "@/components/honours-display/sponsor-ads";
import { rootStyle } from "@/components/honours-display/theme";
import { skinClass } from "@/components/honours-display/types";
import type { HonourDisplayBundle } from "@workspace/api-client-react";
import {
  useApproachingBoard,
  applyBoardConfig,
} from "@/components/honours-display/use-approaching-board";
import { KioskPlayer } from "@/components/honours-display/player/kiosk-player";
import { buildRotation } from "@/components/honours-display/player/rotation";
import { ensureHonourFontsLoaded } from "@/lib/honour-fonts";
import "@/styles/honour-boards.css";

/**
 * Height (px) reserved at the bottom of the screen for the persistent sponsor
 * strip, published as `--kiosk-strip-h` so the player stage stops above it.
 */
const KIOSK_STRIP_PX = 96;

/**
 * Minimum age of the display feed before a rotation wrap-around re-fetches it.
 * `refetch()` bypasses staleTime, so without this guard an unattended TV would
 * hit the API on every rotation; with it the kiosk still picks up new results
 * within ~10 minutes of them landing, without a reload.
 */
const KIOSK_REFRESH_MS = 10 * 60 * 1000;

export default function HonoursKiosk({ fixture }: { fixture?: HonourDisplayBundle } = {}) {
  // A kiosk token (issued by an admin) drives the public, login-free kiosk feed
  // for a fixed clubroom TV. It arrives via the short `/tv/:token` path, or the
  // legacy `?token=` query for older saved links. Without one we're the in-app
  // admin preview.
  const routeParams = useParams<{ token?: string }>();
  const kioskToken = useMemo(
    () => routeParams.token ?? new URLSearchParams(window.location.search).get("token"),
    [routeParams.token],
  );
  const adminQ = useGetHonourDisplay({
    query: { enabled: !kioskToken && !fixture, queryKey: getGetHonourDisplayQueryKey() },
  });
  const tokenQ = useGetKioskDisplay(
    { token: kioskToken ?? "" },
    {
      query: {
        enabled: !!kioskToken && !fixture,
        queryKey: getGetKioskDisplayQueryKey({ token: kioskToken ?? "" }),
      },
    },
  );
  const live = kioskToken ? tokenQ : adminQ;
  // The dev-only harness (`/__kiosk-fixture`) passes sample data instead of fetching.
  const { data, refetch, dataUpdatedAt, isError } = fixture
    ? { data: fixture, refetch: () => {}, dataUpdatedAt: Date.now(), isError: false }
    : live;
  const approachingBoard = useApproachingBoard();
  const [, navigate] = useLocation();

  const boards = useMemo(() => {
    const base = data?.boards ?? [];
    if (!approachingBoard) return base;
    return [...base, applyBoardConfig(approachingBoard, data?.settings?.boardConfigs)];
  }, [data?.boards, data?.settings, approachingBoard]);
  const settings = data?.settings;
  const brand = data?.brand;
  const look = useMemo(() => resolveClubLook(settings), [settings]);

  // Sponsor advertising (admin-toggleable, independent of share-card sponsors).
  // The admin may show only a subset of active sponsors (empty = all).
  const allSponsors = data?.activeSponsors;
  const chosenIds = settings?.kioskSponsorIds;
  const activeSponsors = useMemo(() => {
    const all = allSponsors ?? [];
    return chosenIds?.length ? all.filter((s) => chosenIds.includes(s.id)) : all;
  }, [allSponsors, chosenIds]);
  // Both modes need at least one (chosen) active sponsor to render anything.
  // The strip is redundant on a full-screen sponsor or ad slide, so it hides
  // (and gives back its space) while one is showing.
  const [overlayShowing, setOverlayShowing] = useState(false);
  const sponsorStripOn =
    !!settings?.kioskSponsorStrip && activeSponsors.length > 0 && !overlayShowing;
  const sponsorSlidesOn = !!settings?.kioskSponsorSlides && activeSponsors.length > 0;

  const items = useMemo(
    () =>
      settings
        ? buildRotation({
            boards,
            settings,
            look,
            sponsors: activeSponsors,
            ads: settings.kioskAds ?? [],
            sponsorSlides: sponsorSlidesOn,
          })
        : [],
    [boards, settings, look, activeSponsors, sponsorSlidesOn],
  );

  const exit = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    // Token kiosks (clubroom TV) have no admin to return to — just leave
    // fullscreen and stay on the rotation. Admin previews go back to the display.
    if (!kioskToken) navigate("/honours-display");
  };

  useEffect(() => ensureHonourFontsLoaded(), []);

  // Enter fullscreen on first user interaction (browsers block auto-fullscreen).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exit();
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data || !settings || !brand || !items.length) {
    // An unattended TV must never sit on "Preparing…" forever after a failed
    // fetch: say so, and keep retrying in the background.
    if (isError && !data) {
      return (
        <div
          role="alert"
          className="hb-kiosk flex flex-col items-center justify-center gap-3 text-white"
        >
          <div className="text-sm opacity-80">Couldn’t load the honour boards.</div>
          <button
            type="button"
            className="rounded border border-white/40 px-3 py-1 text-sm opacity-90 hover:opacity-100"
            onClick={() => void refetch()}
          >
            Try again
          </button>
        </div>
      );
    }
    return (
      <div className="hb-kiosk flex items-center justify-center text-white">
        <div className="text-sm opacity-70">Preparing honour boards…</div>
      </div>
    );
  }

  return (
    <div
      className="hb-kiosk"
      style={
        sponsorStripOn ? ({ "--kiosk-strip-h": `${KIOSK_STRIP_PX}px` } as CSSProperties) : undefined
      }
    >
      <div
        className={`hb ${skinClass(settings.defaultTemplate)}`}
        style={rootStyle(brand, settings)}
      >
        <KioskPlayer
          items={items}
          brand={brand}
          look={look}
          boardConfigs={settings.boardConfigs}
          skins={settings.skins}
          sponsors={activeSponsors}
          onItem={(item) => setOverlayShowing(item.kind !== "board")}
          onCycle={() => {
            // Refresh the feed on wrap-around, but only when the data is old.
            if (Date.now() - dataUpdatedAt >= KIOSK_REFRESH_MS) void refetch();
          }}
        />
      </div>
      {sponsorStripOn && <SponsorStrip sponsors={activeSponsors} />}
      <button className="hb-kexit" onClick={exit}>
        ✕ Exit kiosk (Esc)
      </button>
    </div>
  );
}

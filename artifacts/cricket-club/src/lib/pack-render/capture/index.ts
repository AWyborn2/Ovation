/**
 * The pack converter's capture (social template library, ADR-011 §5, slice
 * L4-A1). The card render harness exposes it as `capture(packId, input,
 * size)` on the dev server and in `vite build --mode capture` (CI) only: it
 * is loaded through a dynamic import behind a build-time constant, so a
 * production bundle carries none of it (`ci.yml` checks).
 *
 * A capture mounts one pack card at native size, as the server's still render
 * does, except that a hidden pack (Gold Foil, Bold Type, Neon Night, Sunset)
 * renders as itself rather than as Club Kit: the converter needs their real
 * looks. Then it walks the DOM (`./dom.ts`).
 */

import {
  PACK_CAPTURE_FORMAT,
  type CaptureRender,
  type CaptureSize,
  type CaptureVariant,
  type ColourMode,
  type PackCapture,
} from "@workspace/scorecard/pack-capture";
import { ensureCardFontsLoaded } from "@/lib/card-fonts";
import { applyPackData, bindInput } from "../bind";
import { packColourModeFor } from "../render";
import { prepareTeamNames } from "../team-name-fit";
import { packNativeSize } from "../tokens";
import { captureCardDom, shortenUrls } from "./dom";
import { captureRender, captureVariants, prepareCard } from "./plan";

/** The harness methods this module adds. */
export interface CaptureApi {
  /** Every variant a pack captures (kind × page × design × preset × branch). */
  captureVariants(packId: string): CaptureVariant[];
  /** The input one of a variant's renders draws at a size. */
  captureRender(
    packId: string,
    variant: CaptureVariant,
    render: CaptureVariant["renders"][number],
    size: CaptureSize,
    colourMode?: ColourMode,
  ): CaptureRender;
  /** Mount `input` for `packId` at `size` and record its DOM. */
  capture(packId: string, input: CaptureRender, size: CaptureSize): Promise<PackCapture>;
}

const CAPTURE_ROOT_ID = "pack-capture-root";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function waitForImages(root: HTMLElement, timeoutMs = 8000): Promise<void> {
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map(async (img) => {
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
      if (!(img.complete && img.naturalWidth > 0)) {
        await Promise.race([
          new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
          timeout,
        ]);
      }
      try {
        await Promise.race([img.decode(), timeout]);
      } catch {
        // A broken image paints blank; the capture reports it.
      }
    }),
  );
}

/** The root's custom properties as written, and as colours where they are one. */
function rootVariables(root: HTMLElement): {
  vars: Record<string, string>;
  colours: Record<string, string>;
} {
  const cs = getComputedStyle(root);
  const vars: Record<string, string> = {};
  const colours: Record<string, string> = {};
  const probe = root.ownerDocument.createElement("span");
  probe.style.display = "none";
  root.appendChild(probe);
  try {
    for (const name of Array.from(root.style)) {
      if (!name.startsWith("--")) continue;
      const value = cs.getPropertyValue(name).trim();
      vars[name] = value;
      if (value && CSS.supports("color", value)) {
        probe.style.color = value;
        colours[name] = getComputedStyle(probe).color;
      }
    }
  } finally {
    probe.remove();
  }
  return { vars, colours };
}

function fontFailures(): string[] {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return [];
  const failed = new Set<string>();
  fonts.forEach((face) => {
    if (face.status === "error") failed.add(face.family.replace(/^["']|["']$/g, ""));
  });
  return [...failed];
}

export async function capture(
  packId: string,
  render: CaptureRender,
  size: CaptureSize,
): Promise<PackCapture> {
  const started = performance.now();
  const card = prepareCard(packId, render, size);
  if (!card.html) throw new Error(`${packId} has no design for ${card.input.kind}`);

  const native = packNativeSize(size);
  document.getElementById(CAPTURE_ROOT_ID)?.remove();
  const container = document.createElement("div");
  container.id = CAPTURE_ROOT_ID;
  Object.assign(container.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: `${native.w}px`,
    height: `${native.h}px`,
    margin: "0",
    padding: "0",
    overflow: "hidden",
    zIndex: "2147483647",
  } as Partial<CSSStyleDeclaration>);
  container.innerHTML = card.html;
  document.body.appendChild(container);

  try {
    // As the still render: fonts, slot images, then the team-name fit.
    await ensureCardFontsLoaded();
    try {
      await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
    } catch {
      // No Font Loading API: system fallback.
    }
    await frame();
    await waitForImages(container);
    await prepareTeamNames(container);
    await frame();
    await frame();

    const root = (container.querySelector(".pack-card-root") ??
      container.firstElementChild) as HTMLElement;
    const { elements, keyframes } = captureCardDom(root, render.detail);
    const { vars, colours } = rootVariables(root);

    const bound = bindInput(card.input, packId, card.data.names);
    applyPackData(bound, card.data, card.input.kind);
    const warnings: string[] = [];
    for (const img of Array.from(container.querySelectorAll("img")))
      if (!img.complete || img.naturalWidth === 0)
        warnings.push(
          `image did not load: ${shortenUrls(img.getAttribute("src") ?? "") || "(empty src)"}`,
        );
    for (const el of elements)
      for (const run of el.text ?? [])
        if (/\{\{\s*[\w.]+\s*\}\}/.test(run.text))
          warnings.push(`placeholder left in text: ${run.text}`);

    return {
      format: PACK_CAPTURE_FORMAT,
      packId,
      size,
      native,
      colourMode: packColourModeFor(card.data, packId),
      detail: render.detail,
      rootVars: vars,
      rootColours: colours,
      tokens: Object.fromEntries(
        Object.entries(card.tokens).filter((e): e is [string, string] => typeof e[1] === "string"),
      ),
      fields: card.fields,
      markers: card.markers,
      rows: Object.fromEntries(
        Object.entries(bound.rows).map(([key, list]) => [
          key,
          list.map((r) => ({ ...(r.variant ? { variant: r.variant } : {}), values: r.values })),
        ]),
      ),
      images: Object.fromEntries(
        Object.entries(bound.images).map(([key, url]) => [key, shortenUrls(url)]),
      ),
      keyframes,
      fontFailures: fontFailures(),
      elements,
      warnings,
      ms: Math.round(performance.now() - started),
    };
  } finally {
    container.remove();
  }
}

/** The methods the harness installs (dev and CI builds only). */
export function captureApi(): CaptureApi {
  return { captureVariants, captureRender, capture };
}

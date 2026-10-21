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
import type { PageKey } from "@workspace/scorecard/kind-templates";
import { ensureCardFontsLoaded } from "@/lib/card-fonts";
import { ensureDocumentFonts } from "@/lib/document-fonts";
import type { CardAdjustments } from "../adjustments";
import { applyPackData, bindInput } from "../bind";
import { fitLayersInDom } from "../layer-fit";
import { BLANK_PACK_ID, packColourModeFor, renderPackCard } from "../render";
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
  /**
   * Mount a card and leave it for a screenshot (`#pack-capture-root`): the
   * pack's own card, or with `document` a converted template's page drawn on
   * the blank base from the same input. Returns the layout warnings.
   */
  mount(
    packId: string,
    input: CaptureRender,
    size: CaptureSize,
    opts?: { document?: unknown; page?: string },
  ): Promise<{ selector: string; warnings: string[] }>;
  unmount(): void;
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
  const container = await mountHtml(card.html, size);

  try {
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

/** Mount `html` at native size in the capture container and settle it as the still render does. */
async function mountHtml(html: string, size: CaptureSize): Promise<HTMLElement> {
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
  container.innerHTML = html;
  document.body.appendChild(container);
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
  return container;
}

async function mount(
  packId: string,
  render: CaptureRender,
  size: CaptureSize,
  opts: { document?: unknown; page?: string } = {},
): Promise<{ selector: string; warnings: string[] }> {
  const card = prepareCard(packId, { ...render, markFields: false }, size);
  let html = card.html;
  if (opts.document) {
    html = renderPackCard(
      card.input,
      size,
      render.sponsorsOn,
      card.tokens,
      card.junior,
      card.data,
      BLANK_PACK_ID,
      opts.document as CardAdjustments,
      { page: opts.page as PageKey | undefined },
    );
  }
  const container = await mountHtml(html, size);
  // The converted template's own fit: text that still overflows at its minimum.
  await ensureDocumentFonts(opts.document ? (opts.document as CardAdjustments) : null);
  const warnings = opts.document
    ? fitLayersInDom(container, size).map((w) => `${w.reason}${w.detail ? `: ${w.detail}` : ""}`)
    : [];
  await frame();
  return { selector: `#${CAPTURE_ROOT_ID}`, warnings };
}

function unmount(): void {
  document.getElementById(CAPTURE_ROOT_ID)?.remove();
}

/** The methods the harness installs (dev and CI builds only). */
export function captureApi(): CaptureApi {
  return { captureVariants, captureRender, capture, mount, unmount };
}

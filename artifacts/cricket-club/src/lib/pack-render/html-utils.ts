/**
 * Pack renderer — pure html transforms over the transcribed templates: escaping
 * (security invariant), balanced <div> scanning, sponsor-variant selection,
 * repeat expansion, image-slot resolution and the post-bind cleanups.
 *
 * Every substituted value is HTML-escaped — do not remove.
 */

import type { PackCardTemplate } from "../pack-templates/types";
import type { PackRow } from "./types";

// ---------------------------------------------------------------------------
// HTML escaping (security invariant)
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Balanced <div> scanning (no regex can balance nested tags)
// ---------------------------------------------------------------------------

interface DivBounds {
  /** Index of the first char after the opening tag's `>`. */
  contentStart: number;
  /** Index of the matching `</div>` opening `<`. */
  contentEnd: number;
  /** Index just after the matching `</div>`. */
  end: number;
}

/** Given `openIdx` at a `<div`, return the bounds of its balanced content. */
export function divBounds(html: string, openIdx: number): DivBounds {
  const contentStart = html.indexOf(">", openIdx) + 1;
  let depth = 1;
  const re = /<\/?div\b/g;
  re.lastIndex = contentStart;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (html[m.index + 1] === "/") {
      depth--;
      if (depth === 0) {
        const contentEnd = m.index;
        const end = html.indexOf(">", m.index) + 1;
        return { contentStart, contentEnd, end };
      }
    } else {
      depth++;
    }
  }
  // Unbalanced (shouldn't happen for transcribed templates) — treat rest as body.
  return { contentStart, contentEnd: html.length, end: html.length };
}

/** Split a run of sibling top-level `<div>…</div>` into separate strings. */
export function splitTopLevelDivs(inner: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < inner.length) {
    const open = inner.indexOf("<div", i);
    if (open < 0) break;
    const b = divBounds(inner, open);
    out.push(inner.slice(open, b.end));
    i = b.end;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sponsor variant selection
// ---------------------------------------------------------------------------

/** Remove every `<div data-sponsors="loser">…</div>` block, keeping the winner. */
/**
 * Remove any element marked `data-drop-if-empty="<slotKey>"` when that image
 * slot resolved to nothing.
 *
 * An optional hero photo would otherwise render as a large empty framed box —
 * technically the placeholder working as designed, but on a Match Result posted
 * without a photo it reads as a broken card. Dropping the whole block lets a
 * flex-column layout close the space instead.
 *
 * Strips the marker attribute when the slot IS filled so the emitted html
 * carries no leftover authoring hooks.
 */
export function dropEmptyImageBlocks(html: string, images: Record<string, string>): string {
  const re = /<div[^>]*?\sdata-drop-if-empty="([^"]+)"/;
  let out = html;
  let m = re.exec(out);
  while (m) {
    const key = m[1];
    if (images[key]) {
      // Keep the block; remove the marker so the next exec moves past it.
      out =
        out.slice(0, m.index) +
        out.slice(m.index).replace(` data-drop-if-empty="${key}"`, "");
    } else {
      out = out.slice(0, m.index) + out.slice(divBounds(out, m.index).end);
    }
    m = re.exec(out);
  }
  return out;
}

export function selectSponsorVariant(html: string, sponsorsOn: boolean): string {
  const loser = sponsorsOn ? "off" : "on";
  const needle = `<div data-sponsors="${loser}"`;
  let out = html;
  let idx = out.indexOf(needle);
  while (idx >= 0) {
    const b = divBounds(out, idx);
    out = out.slice(0, idx) + out.slice(b.end);
    idx = out.indexOf(needle);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Repeat expansion
// ---------------------------------------------------------------------------
export function substituteRow(
  template: string,
  values: Record<string, string>,
  defaults: Record<string, string>,
): string {
  return template.replace(/\{\{\s*row\.([\w.]+)\s*\}\}/g, (_all, key: string) => {
    const raw = key in values ? values[key] : defaults[key] ?? "";
    return escapeHtml(raw);
  });
}

/** Expand every `<div data-repeat="key">…</div>` over the supplied rows. */
export function expandRepeats(
  html: string,
  rowsByKey: Record<string, PackRow[]>,
  template: PackCardTemplate,
): string {
  let out = html;
  const OPEN = '<div data-repeat="';
  let searchFrom = 0;
  while (true) {
    const idx = out.indexOf(OPEN, searchFrom);
    if (idx < 0) break;
    const keyStart = idx + OPEN.length;
    const keyEnd = out.indexOf('"', keyStart);
    const key = out.slice(keyStart, keyEnd);
    const b = divBounds(out, idx);
    const inner = out.slice(b.contentStart, b.contentEnd);
    const rowTemplates = splitTopLevelDivs(inner);
    const byVariant: Record<string, string> = {};
    let base = rowTemplates[0] ?? "";
    for (const t of rowTemplates) {
      const vm = t.match(/data-repeat-variant="([^"]+)"/);
      if (vm) byVariant[vm[1]] = t;
      else base = t;
    }
    const repeatDef = template.repeats?.find((r) => r.key === key);
    const rowDefaults: Record<string, string> = {};
    for (const f of repeatDef?.fields ?? []) rowDefaults[f.key] = f.sample;

    const rows = rowsByKey[key] ?? [];
    const expanded = rows
      .map((row) => {
        const chosen = (row.variant && byVariant[row.variant]) || base;
        return substituteRow(chosen, row.values, rowDefaults);
      })
      .join("");

    // Neutralise the `data-repeat` attribute so the container is not re-matched,
    // keep the opening/closing tags, and swap in the expanded rows.
    const openTag = out.slice(idx, b.contentStart);
    const newOpenTag = openTag.replace(` data-repeat="${key}"`, "");
    out = out.slice(0, idx) + newOpenTag + expanded + out.slice(b.contentEnd);
    searchFrom = idx + newOpenTag.length + expanded.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Image slot resolution
// ---------------------------------------------------------------------------

// For an unresolved logo/photo slot we render an initials chip; the source name
// is looked up in the bound values by slot-key convention.
const SLOT_NAME_SOURCE: Record<string, string> = {
  clubLogo: "clubName",
  "club.logo": "club.name",
  "opposition.logo": "opposition.name",
  photo: "playerName",
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const letters = parts.slice(0, 2).map((p) => p[0]);
  return letters.join("").toUpperCase();
}

/**
 * Turn a photo transform's focal point into an `object-position` suffix. Only
 * the focal point maps cleanly onto an `object-fit:cover` image; `zoom` has no
 * DOM equivalent that is safe to apply inside the fixed-size slot wrappers, so
 * it is intentionally ignored here (canvas path still honours it). A centred
 * focal point yields no override so untransformed renders are byte-identical.
 */
export function photoPositionStyle(
  transform?: { focalX: number; focalY: number } | null,
): string {
  if (!transform) return "";
  const clamp = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100);
  const fx = clamp(transform.focalX);
  const fy = clamp(transform.focalY);
  if (fx === 50 && fy === 50) return "";
  return `;object-position:${fx}% ${fy}%`;
}

/** Marker that opens the player hero photo slot placeholder. */
const PHOTO_SLOT_OPEN = '<div data-slot="photo" data-slot-type="photo"';

/**
 * Full-card legibility scrim injected behind the text ONLY on a full-bleed
 * render. The templates' own scrims are column-scoped (e.g. Player Spotlight's
 * gradients are `width:600px` / `width:56%`), so once the photo covers the whole
 * 1080 canvas the large `{{playerName}}` — which carries no text-shadow — would
 * otherwise sit over the RAW photo on the left. These two full-canvas gradients
 * (top-down for the header, bottom-up for the name/stats/footer) darken the
 * photo where text lands, mirroring the values the always-full-bleed `debut`
 * card already uses. Layered directly after the photo (over it) but before the
 * template's own scrims and text, so text stays fully on top. Marked with
 * `data-fullbleed-scrim` for testability. `pointer-events:none` so it never
 * intercepts interaction. Never emitted in contained mode → byte-identical.
 */
const FULL_BLEED_SCRIM =
  `<div data-fullbleed-scrim="1" style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,14,.78) 0%,rgba(8,10,14,.12) 26%,transparent 40%)"></div>` +
  `<div data-fullbleed-scrim="1" style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(0deg,rgba(6,8,11,.94) 0%,rgba(6,8,11,.45) 30%,transparent 60%)"></div>`;

/**
 * Promote the player hero photo to a full-bleed action shot by rewriting the
 * geometry of its immediate wrapper to cover the whole card
 * (`position:absolute;inset:0`), and inject a full-card legibility scrim
 * ({@link FULL_BLEED_SCRIM}) right after it. The templates wrap the hero slot in
 * a single positioned box whose only child is the slot placeholder
 * (`<div style="position:absolute;…">${slot("photo","photo")}</div>`), so the
 * wrapper is the `<div …>` directly preceding the placeholder. Rewriting the
 * wrapper (not the placeholder) keeps the photo in its original DOM position —
 * after the background base, before the scrim/gradient layers and text — so it
 * fills the frame while the scrims (the template's column ones plus the injected
 * full-card one) still overlay it and the text stays legible.
 *
 * ASSUMPTION (template-author warning): the `data-slot="photo"` placeholder must
 * be the DIRECT, sole child of a single positioned wrapper `<div>`. A hero photo
 * nested inside extra wrapper divs would fail the "nothing between" check and
 * silently stay contained (no full-bleed) rather than mis-rewrite the wrong box.
 * Keep new player templates to that one-wrapper shape for full-bleed to work.
 *
 * Only `data-slot="photo"` is targeted; logo and sponsor slots are left
 * contained. Returns the html
 * unchanged when no such wrapper is found (byte-identical to contained).
 */
export function makePhotoSlotFullBleed(html: string): string {
  let out = html;
  let searchFrom = 0;
  while (true) {
    const photoIdx = out.indexOf(PHOTO_SLOT_OPEN, searchFrom);
    if (photoIdx < 0) break;
    // The wrapper is the `<div …>` immediately before the placeholder. Search
    // strictly before `photoIdx` so we don't match the placeholder's own tag.
    const wrapperOpen = out.lastIndexOf("<div ", photoIdx - 1);
    const wrapperGt = wrapperOpen >= 0 ? out.indexOf(">", wrapperOpen) : -1;
    // Confirm the wrapper directly wraps the slot (nothing between `>` and the
    // placeholder). If not, leave this occurrence contained and move on.
    if (
      wrapperOpen < 0 ||
      wrapperGt < 0 ||
      wrapperGt >= photoIdx ||
      out.slice(wrapperGt + 1, photoIdx).trim() !== ""
    ) {
      searchFrom = photoIdx + PHOTO_SLOT_OPEN.length;
      continue;
    }
    const wrapperTag = out.slice(wrapperOpen, wrapperGt + 1);
    const newTag = /style="[^"]*"/.test(wrapperTag)
      ? wrapperTag.replace(/style="[^"]*"/, 'style="position:absolute;inset:0"')
      : wrapperTag.replace("<div ", '<div style="position:absolute;inset:0" ');
    // The wrapper contains exactly the flat photo-slot div, so its closing
    // `</div>` is the second `</div>` after the placeholder (first closes the
    // slot itself). Inject the full-card scrim as the wrapper's next sibling.
    const slotClose = out.indexOf("</div>", photoIdx);
    const wrapperCloseStart =
      slotClose >= 0 ? out.indexOf("</div>", slotClose + 6) : -1;
    const wrapperCloseEnd = wrapperCloseStart >= 0 ? wrapperCloseStart + 6 : -1;
    if (wrapperCloseEnd < 0) {
      // Malformed wrapper (shouldn't happen) — just rewrite the geometry.
      out = out.slice(0, wrapperOpen) + newTag + out.slice(wrapperGt + 1);
      searchFrom = wrapperOpen + newTag.length + PHOTO_SLOT_OPEN.length;
      continue;
    }
    const rebuilt =
      newTag + out.slice(wrapperGt + 1, wrapperCloseEnd) + FULL_BLEED_SCRIM;
    out = out.slice(0, wrapperOpen) + rebuilt + out.slice(wrapperCloseEnd);
    // Advance past the rewritten wrapper AND the injected scrim so neither the
    // same slot nor the scrim markup is re-scanned (the scrim carries no
    // photo-slot marker, but advancing keeps the loop strictly progressing).
    searchFrom = wrapperOpen + rebuilt.length;
  }
  return out;
}

export function resolveSlots(
  html: string,
  images: Record<string, string>,
  values: Record<string, string>,
  photoTransform?: { focalX: number; focalY: number } | null,
  photoFullBleed = false,
): string {
  if (photoFullBleed) html = makePhotoSlotFullBleed(html);
  const slotRe =
    /<div data-slot="([^"]+)" data-slot-type="([^"]+)"([^>]*)><\/div>/g;
  return html.replace(slotRe, (_all, key: string, type: string, rest: string) => {
    const url = images[key];
    // Sponsor logos are contained (never cropped) even without an explicit
    // data-fit; club logos already carry data-fit="contain".
    const contain = type === "sponsor" || /data-fit="contain"/.test(rest);
    const fit = contain ? "contain" : "cover";
    if (url) {
      const pos = type === "photo" ? photoPositionStyle(photoTransform) : "";
      return `<img src="${escapeHtml(url)}" alt="" style="width:100%;height:100%;object-fit:${fit}${pos};display:block" />`;
    }
    // No URL → placeholder (never an empty <img src>).
    if (type === "sponsor") {
      return `<div class="pack-slot-placeholder" style="width:100%;height:100%;background:rgba(255,255,255,.12)"></div>`;
    }
    const sourceKey = SLOT_NAME_SOURCE[key];
    const initials = sourceKey ? initialsOf(values[sourceKey] ?? "") : "";
    const chip = initials
      ? `<span style="font-family:var(--disp,'Anton'),sans-serif;font-size:2.4em;line-height:1;color:rgba(255,255,255,.55)">${escapeHtml(initials)}</span>`
      : "";
    return `<div class="pack-slot-placeholder" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08)">${chip}</div>`;
  });
}

// ---------------------------------------------------------------------------
// Field substitution + cleanup
// ---------------------------------------------------------------------------

export function substituteFields(html: string, values: Record<string, string>): string {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_all, key: string) => {
    const raw = values[key] ?? "";
    return escapeHtml(raw);
  });
}

/** Drop team-list role parentheticals rendered empty (no role on that player). */
export function cleanupEmptyRoles(html: string): string {
  return html.replace(/\s*<span[^>]*>\(\)<\/span>/g, "");
}

/**
 * Remove the whole "presented by <sponsor>" line when the presenting sponsor is
 * empty, so no orphan prose ("presented by", "proudly supported by", …) is left
 * behind. Every such line — via the `presentedBy` fragment or inline — ends with
 * the sponsor name wrapped in the unique `<span style="color:#fff;font-weight:700">`
 * marker, so the tightest enclosing `<div>…</div>` is matched and dropped. Called
 * BEFORE field substitution, while the raw `{{sponsorPresentedBy}}` placeholder is
 * still present. The clubHashtag sibling in footer rows is untouched.
 */
export function dropEmptyPresentedBy(html: string): string {
  return html.replace(
    /<div[^>]*>[^<]*<span style="color:#fff;font-weight:700">\{\{sponsorPresentedBy\}\}<\/span><\/div>/g,
    "",
  );
}

/**
 * Remove the whole "CAP <n>" line from a debut card when no cap number resolved,
 * so no orphan "CAP" label is left behind. Every pack puts the literal prefix
 * OUTSIDE the placeholder — `<div style="…">CAP {{capNumber}}</div>` — in each
 * of its formats, so the enclosing `<div>` is matched and dropped. Called BEFORE
 * field substitution, while the raw placeholder is still present. A bound number
 * (the normal case, and every sample/preview) keeps the line.
 */
export function dropEmptyCapNumber(html: string): string {
  return html.replace(/<div[^>]*>CAP \{\{capNumber\}\}<\/div>/g, "");
}

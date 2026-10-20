/**
 * The one name-fit rule every pack shares (ADR-010 P1). Names used to sit on
 * one line and be cut off with "…" ("WHITE KNIGHTS B…"). Now a name box marked
 * `data-fit="<characters at full size>"`:
 *   1. shrinks to fit its box, down to {@link MIN_FIT};
 *   2. past that, wraps onto a second line (never more);
 *   3. only a name too long for two lines at the minimum ends in "…".
 * A box in a list row also carries `data-fit-row`: it wraps only at the
 * minimum size, so two lines take about the height of the row's one line and
 * a long name can't push the rows below it off the card.
 *
 * The names arrive already short: `resolveCardTeamName`
 * (@workspace/scorecard/card-names) gives the club's own short name, else the
 * automatic one ("White Knights Baldivis Cricket Club Inc" → "White Knights
 * Baldivis"), before a name reaches its box.
 */

/** The smallest a name is scaled before it wraps onto a second line. */
export const MIN_FIT = 0.6;

/** Visible character count of already-escaped text (an entity counts once). */
function textLength(escaped: string): number {
  return escaped.replace(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi, "_").trim().length;
}

/**
 * The longer line when `words` are split into two lines as evenly as the word
 * breaks allow ("WHITE KNIGHTS BALDIVIS" → "WHITE KNIGHTS" / "BALDIVIS" → 13).
 */
export function balancedLongestLine(words: string[]): number {
  if (words.length < 2) return words.join(" ").length;
  let best = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length;
    const b = words.slice(i).join(" ").length;
    best = Math.min(best, Math.max(a, b));
  }
  return best;
}

/**
 * The scale and line count for a name in a box that holds `capacity`
 * characters at full size. `words` is the name split on spaces; a two-line
 * name is sized by its longer line, so neither line is cut off.
 */
export function fitFor(
  length: number,
  capacity: number,
  words?: string[],
): { scale: number; lines: 1 | 2 } {
  if (length <= capacity) return { scale: 1, lines: 1 };
  const oneLine = capacity / length;
  if (oneLine >= MIN_FIT) return { scale: oneLine, lines: 1 };
  // One word can't wrap ("ABANDONED" in a WIN-sized headline): shrink it to fit.
  if (words && words.length === 1) return { scale: oneLine, lines: 1 };
  const longest = words && words.length > 1 ? balancedLongestLine(words) : length / 2;
  return { scale: Math.max(MIN_FIT, Math.min(1, capacity / longest)), lines: 2 };
}

/**
 * Size every element marked `data-fit="<capacity>"` to its text. The element's
 * font size must be written as `calc(<size> * var(--fit,1))`; a name that needs
 * two lines also gets wrapping (clamped to two lines).
 */
export function fitNames(html: string): string {
  return html.replace(
    /<(div|span)([^>]*?)\sdata-fit="(\d+)"([^>]*)>([^<]*)<\/\1>/g,
    (all, tag: string, before: string, cap: string, after: string, text: string) => {
      const plain = text.replace(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi, "_").trim();
      // Hyphenated names ("ROCKINGHAM-MANDURAH") can break after the hyphen.
      const fit = fitFor(textLength(text), Number(cap), plain.split(/\s+|(?<=-)/));
      // A list row keeps its height: a name wraps there only at the minimum size.
      const row = /\sdata-fit-row\b/.test(` ${before} ${after}`);
      const { scale, lines } = row && fit.lines === 2 ? { scale: MIN_FIT, lines: 2 as const } : fit;
      if (scale === 1 && lines === 1) return all;
      let attrs = `${before}${after}`;
      attrs = attrs.replace(/style="/, `style="--fit:${scale.toFixed(3)};`);
      if (lines === 2) {
        attrs = attrs.replace(
          /white-space:nowrap/,
          "white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.02",
        );
      }
      return `<${tag}${attrs}>${text}</${tag}>`;
    },
  );
}

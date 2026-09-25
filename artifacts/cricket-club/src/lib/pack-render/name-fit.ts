/**
 * Fitting club and team names on a card. Names used to sit on one line and be
 * cut off with "…" ("WHITE KNIGHTS B…"). Now:
 *   1. `cardTeamName` drops "Cricket Club" / "CC" / "Inc": the card's header
 *      already says "Cricket Club", and it's the words that make a club.
 *   2. `fitNames` shrinks a marked name to fit its box, and as a last resort
 *      lets it wrap onto a second line rather than cutting it off.
 */

const SUFFIX =
  /\s+(?:cricket\s+club(?:\s+inc(?:orporated)?\.?)?|cricket\s+inc\.?|c\.?\s?c\.?|inc(?:orporated)?\.?)$/i;

/** "White Knights Baldivis Cricket Club Inc" → "White Knights Baldivis". */
export function cardTeamName(name: string | null | undefined): string {
  const original = (name ?? "").trim();
  let out = original;
  for (let i = 0; i < 3 && SUFFIX.test(out); i++) out = out.replace(SUFFIX, "").trim();
  return out || original;
}

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
      const { scale, lines } = fitFor(textLength(text), Number(cap), plain.split(/\s+/));
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

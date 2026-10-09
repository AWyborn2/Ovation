/**
 * Built-in Team Lists. Measure at native card size, never the transformed
 * preview's viewport size. This runs after fonts load in BOTH PackCard and the
 * still harness; no character-count estimates or changes to authored templates.
 */
export const TEAM_NAME_MIN_RATIO = 1.8 / 2.3;
type Measure = (text: string) => number;

/** Keep every code point. Prefer spaces/hyphens, then grapheme boundaries. */
export function splitTeamName(text: string, width: number, measure: Measure): string[] | null {
  if (measure(text) <= width) return [text];
  const segments = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text));
  const breaks = segments.slice(1).map(s => s.index);
  const candidates = breaks.map(index => {
    const a = text.slice(0, index), b = text.slice(index);
    return { a, b, natural: /[\s\-\u2010\u2011]$/u.test(a), width: Math.max(measure(a), measure(b)) };
  }).filter(c => c.width <= width);
  candidates.sort((a, b) => Number(b.natural) - Number(a.natural) || a.width - b.width);
  const best = candidates[0];
  return best ? [best.a, best.b] : null;
}

/** Widest permissible list-wide size, bounded by a readable minimum. */
export function teamNameSize(rows: { text: string; width: number }[], base: number, measure: Measure, minRatio = TEAM_NAME_MIN_RATIO): number {
  return Math.max(base * minRatio, Math.min(base,
    ...rows.map(row => base * row.width / Math.max(1, measure(row.text)))));
}

const originalText = new WeakMap<HTMLElement, string>();

export async function prepareTeamNames(root: HTMLElement): Promise<void> {
  const lists = Array.from(root.querySelectorAll<HTMLElement>('[data-xi-fit="1"]'));
  if (!lists.length) return;
  // These are the actual three faces used by the name, number and role cells.
  const fonts = await Promise.all([
    document.fonts.load('600 24px "IBM Plex Sans"'),
    document.fonts.load('900 32px "Barlow Condensed"'),
    document.fonts.load('500 16px "IBM Plex Mono"'),
  ]);
  if (fonts.some(faces => faces.length === 0)) {
    throw new Error("Team-list fonts could not be loaded. Please retry before exporting.");
  }
  await document.fonts.ready;
  for (const list of lists) fitList(list);
  for (const heading of root.querySelectorAll<HTMLElement>("[data-team-grade]")) fitGrade(heading);
}

const headingSize = new WeakMap<HTMLElement, number>();

/** A fixed heading band prevents long grades from displacing rows or metadata. */
function fitGrade(heading: HTMLElement): void {
  if (!headingSize.has(heading)) headingSize.set(heading, parseFloat(getComputedStyle(heading).fontSize));
  const base = headingSize.get(heading)!;
  let size = base;
  heading.style.fontSize = `${size}px`;
  while ((heading.scrollWidth > heading.clientWidth + 1 || heading.scrollHeight > heading.clientHeight + 1)
    && size > base * .18) {
    size -= .5;
    heading.style.fontSize = `${size}px`;
  }
  if (heading.scrollWidth > heading.clientWidth + 1 || heading.scrollHeight > heading.clientHeight + 1) {
    throw new Error("The team grade is too long to fit legibly.");
  }
  heading.dataset.teamGradeReady = "true";
}

function fitList(list: HTMLElement): void {
  const names = Array.from(list.querySelectorAll<HTMLElement>("[data-xi-name]"));
  if (!names.length) return;
  if (list.dataset.xiLayout === "single-column") {
    fitSingleColumnList(list, names);
    return;
  }
  const body = list.closest<HTMLElement>("[data-skeleton-body]");
  const card = list.closest<HTMLElement>("[data-pack-skeleton]");
  list.style.removeProperty("--xi-name-size");
  // Reset before measuring: repeated harness calls and responsive previews are
  // deterministic, rather than shrinking an already fitted result.
  for (const name of names) {
    if (!originalText.has(name)) originalText.set(name, name.textContent ?? "");
    name.textContent = originalText.get(name)!;
    name.style.removeProperty("width");
    name.style.flex = "1";
  }
  const style = getComputedStyle(names[0]);
  const base = parseFloat(style.fontSize);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to measure team-list names.");
  const measureAt = (size: number): Measure => {
    ctx.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
    return text => ctx.measureText(text).width;
  };
  // clientWidth ignores the preview's CSS transform. Retain a pixel of slack
  // for fractional flex layout and browser rasterisation.
  const widths = () => names.map(name => Math.max(0, name.clientWidth - 1));
  const texts = names.map(name => originalText.get(name)!);
  const minRatio = Number(list.dataset.xiMinRatio) || TEAM_NAME_MIN_RATIO;
  const min = base * minRatio;
  let available = widths();
  const atMin = measureAt(min);
  const fitsTwo = () => texts.every((text, i) => splitTeamName(text, available[i], atMin));

  // Exceptionally long names beside role badges need more than the original
  // narrow half-card. Borrow only the width needed from the side photo, keeping
  // its diagonal frame clear of the list. Short lineups never enter this path.
  const frame = card?.querySelector<HTMLElement>('[data-ck-frame="side"]');
  if (body && frame) {
    body.style.maxWidth = "52%";
    available = widths();
    let percent = 52;
    while (!fitsTwo() && percent < 88) {
      body.style.maxWidth = `${++percent}%`;
      available = widths();
    }
    const shift = (percent - 52) / 100 * body.parentElement!.clientWidth;
    // The frame and its three trim bands are contiguous siblings.
    const pieces = [frame, frame.previousElementSibling, frame.previousElementSibling?.previousElementSibling,
      frame.previousElementSibling?.previousElementSibling?.previousElementSibling];
    for (const piece of pieces) if (piece instanceof HTMLElement) {
      piece.style.transform = shift ? `translateX(${shift}px)` : "";
    }
  }
  if (!fitsTwo()) throw new Error("A team-list name is too long to fit legibly on two lines.");
  const size = teamNameSize(texts.map((text, i) => ({ text, width: available[i] })), base, measureAt(base), minRatio);
  list.style.setProperty("--xi-name-size", `${size}px`);
  const measure = measureAt(size);
  names.forEach((name, i) => {
    const lines = splitTeamName(texts[i], available[i], measure)!;
    name.replaceChildren();
    lines.forEach((line, index) => {
      if (index) name.appendChild(document.createElement("br"));
      name.appendChild(document.createTextNode(line));
    });
    // Use the painted name's width, not the entire remaining row. A short
    // name's role stays beside it; wrapped names and roles still fit together.
    name.style.flex = "0 0 auto";
    name.style.width = `${Math.ceil(Math.max(...lines.map(measure)))}px`;
  });
  list.dataset.xiReady = "true";
}

/**
 * Broadcast's vertical list keeps each initial + surname intact and keeps the
 * role immediately after that name. Fit type against the available name cell;
 * exceptionally long names wrap naturally, without changing column or photo
 * geometry and without introducing ellipses or surname abbreviations.
 */
function fitSingleColumnList(list: HTMLElement, names: HTMLElement[]): void {
  list.style.removeProperty("--xi-name-size");
  for (const name of names) {
    if (!originalText.has(name)) originalText.set(name, name.textContent ?? "");
    name.textContent = originalText.get(name)!;
    name.style.removeProperty("width");
    // Restore the authored measuring layout before reading clientWidth. This
    // also makes repeated native/preview preparations deterministic.
    name.style.flex = "1";
    name.style.whiteSpace = "normal";
    name.style.overflowWrap = "anywhere";
  }
  const availableWidths = names.map(name => Math.max(1, name.clientWidth - 1));

  const style = getComputedStyle(names[0]);
  const base = parseFloat(style.fontSize);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to measure team-list names.");
  const measureAt = (size: number): Measure => {
    ctx.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
    return text => ctx.measureText(text).width;
  };
  const minRatio = Number(list.dataset.xiMinRatio) || TEAM_NAME_MIN_RATIO;
  const texts = names.map(name => originalText.get(name)!);
  // The authored row is already a flex line. Its name cell width is what
  // remains after the registered number and role badge have taken their space.
  const widths = availableWidths;
  const size = teamNameSize(
    texts.map((text, i) => ({ text, width: widths[i] })),
    base,
    measureAt(base),
    minRatio,
  );
  list.style.setProperty("--xi-name-size", `${size}px`);

  const measure = measureAt(size);
  names.forEach((name, index) => {
    const paintedWidth = Math.min(widths[index], Math.ceil(measure(texts[index])));
    name.style.flex = "0 1 auto";
    name.style.width = `${paintedWidth}px`;
  });
  list.dataset.xiReady = "true";
}

/**
 * Normalise the dismissal text stored on a match line into conventional
 * scorecard notation. The stored formats (from the master DB / scorecard
 * import) are colon-delimited and frequently have empty names because the
 * source masks them:
 *
 *   "c: <catcher> b: <bowler>"   caught
 *   "c&b: <bowler>"              caught & bowled
 *   "b: <bowler>"               bowled
 *   "lbw: <bowler>"             lbw
 *   "st: <keeper> b: <bowler>"  stumped
 *   "run out (<fielder>)"       run out (parens, may be empty)
 *   "run out"                   run out
 *   "not out"                   not out
 *   "retired" / "retired hurt"  retired
 *   "did not bat"               dnb
 *
 * Unknown shapes are passed through unchanged. Empty names are dropped so we
 * never render dangling "b" with nothing after it.
 */
export function formatDismissal(
  raw: string | null | undefined,
  notOut: boolean,
): string {
  if (notOut) return "not out";
  if (!raw) return "";
  const text = raw.trim();
  if (!text) return "";

  const lower = text.toLowerCase();

  if (lower === "did not bat" || lower === "dnb") return "did not bat";
  if (lower.startsWith("not out")) return "not out";
  if (lower.startsWith("retired")) return text.toLowerCase();

  // run out (fielder) — parens, not colon.
  if (lower.startsWith("run out")) {
    const paren = /\(([^)]*)\)/.exec(text);
    const fielder = paren?.[1]?.trim();
    return fielder ? `run out (${fielder})` : "run out";
  }

  const after = (label: string): string => {
    const idx = lower.indexOf(label);
    if (idx === -1) return "";
    return text.slice(idx + label.length).trim();
  };

  // caught & bowled
  if (lower.startsWith("c&b") || lower.startsWith("c & b")) {
    const bowler = after(lower.startsWith("c&b") ? "c&b:" : "c & b:");
    return bowler ? `c & b ${bowler}` : "c & b";
  }

  // stumped: "st: KEEPER b: BOWLER"
  if (lower.startsWith("st")) {
    const keeperPart = text.slice(text.indexOf(":") + 1);
    const bIdx = keeperPart.toLowerCase().indexOf("b:");
    const keeper = (bIdx === -1 ? keeperPart : keeperPart.slice(0, bIdx)).trim();
    const bowler = bIdx === -1 ? "" : keeperPart.slice(bIdx + 2).trim();
    let out = keeper ? `st ${keeper}` : "st";
    if (bowler) out += ` b ${bowler}`;
    return out;
  }

  // caught: "c: CATCHER b: BOWLER"
  if (lower.startsWith("c:") || lower.startsWith("c ")) {
    const rest = text.slice(text.indexOf(":") + 1);
    const bIdx = rest.toLowerCase().indexOf("b:");
    const catcher = (bIdx === -1 ? rest : rest.slice(0, bIdx)).trim();
    const bowler = bIdx === -1 ? "" : rest.slice(bIdx + 2).trim();
    let out = catcher ? `c ${catcher}` : "caught";
    if (bowler) out += ` b ${bowler}`;
    return out;
  }

  // lbw: "lbw: BOWLER"
  if (lower.startsWith("lbw")) {
    const bowler = after("lbw:");
    return bowler ? `lbw b ${bowler}` : "lbw";
  }

  // bowled: "b: BOWLER"
  if (lower.startsWith("b:") || lower.startsWith("b ")) {
    const bowler = after("b:") || text.slice(2).trim();
    return bowler ? `b ${bowler}` : "bowled";
  }

  return text;
}

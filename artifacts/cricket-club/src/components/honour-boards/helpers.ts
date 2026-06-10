export function formatMatchDate(d: string | null): string | null {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
    const dt = new Date(`${d.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    }
  }
  // Free-text dates (e.g. "12:30 PM, Saturday, 07 Feb 2026").
  const m = d.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (m) {
    const parsed = new Date(`${m[1]} ${m[2]} ${m[3]}`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    }
  }
  return d;
}

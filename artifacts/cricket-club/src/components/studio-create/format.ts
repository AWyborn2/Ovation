/** A fixture's start as "Sat 1 Nov, 12:30pm", in Perth time like the rest of the admin. */
export function fmtFixtureWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Australia/Perth",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Australia/Perth",
  })
    .format(d)
    .replace(/\s/g, "")
    .toLowerCase();
  return `${day}, ${time}`;
}

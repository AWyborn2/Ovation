/**
 * verify-central-club.ts — end-to-end check that a central club's stats
 * surface through the app's REAL central read path (`@workspace/db/central-queries`),
 * i.e. the same functions the API routes call for a `reads_from_central` tenant.
 *
 * Built to prove a newly projected association (WA Premier Cricket, club ids 101+)
 * reads exactly like a PCA club: grade labels resolve via classifyCentralGrade,
 * careers aggregate, juniors stay excluded. Works for any central club id.
 *
 *   CENTRAL_DATABASE_URL=... pnpm --filter @workspace/scripts run verify-central-club -- 101
 */
import { appGradeFromCentral } from "@workspace/db/central-queries";

async function main(): Promise<void> {
  const clubId = Number(process.argv[2] ?? 101);
  if (!process.env.CENTRAL_DATABASE_URL) {
    console.error("CENTRAL_DATABASE_URL is not set");
    process.exit(1);
  }
  // Dynamic import: the module opens the central pool at load time.
  const cq: Record<string, unknown> = await import("@workspace/db/central-queries");
  const fn = <T>(name: string) => cq[name] as T | undefined;

  const getClubMatchRows =
    fn<(id: number) => Promise<{ matchId: number; grade: string | null; season: string | null }[]>>(
      "getClubMatchRows",
    );
  const centralPlayerCareers =
    fn<
      (
        id: number,
      ) => Promise<
        Array<{
          displayName: string | null;
          runs: number;
          wickets: number;
          games: number;
          grades: string[];
        }>
      >
    >("centralPlayerCareers");

  console.log(`\n=== central club ${clubId} ===`);

  if (getClubMatchRows) {
    const rows = await getClubMatchRows(clubId);
    const byApp = new Map<string, number>();
    let excluded = 0;
    for (const r of rows) {
      const g = appGradeFromCentral(r.grade);
      if (!g) {
        excluded++;
        continue;
      }
      byApp.set(g, (byApp.get(g) ?? 0) + 1);
    }
    console.log(
      `matches: ${rows.length}; mapped to app grades: ${rows.length - excluded}; excluded (junior/unmapped): ${excluded}`,
    );
    console.log(
      "by app grade:",
      [...byApp.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([g, n]) => `${g}=${n}`)
        .join(" | "),
    );
  } else {
    console.log("getClubMatchRows not exported — skipping grade breakdown");
  }

  if (centralPlayerCareers) {
    const careers = await centralPlayerCareers(clubId);
    careers.sort((a, b) => b.runs - a.runs);
    console.log(`\ncareers: ${careers.length} players`);
    for (const c of careers.slice(0, 5)) {
      console.log(
        `  ${c.displayName ?? "?"}: ${c.games} games, ${c.runs} runs, ${c.wickets} wkts [${c.grades.join(", ")}]`,
      );
    }
  } else {
    console.log("centralPlayerCareers not exported — skipping careers");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

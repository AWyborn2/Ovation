/**
 * playhq-upload.ts — send a harness dump collected by hand (the `playcricket-stats-scraper`
 * skill, run in a browser tab) to the API's scheduled-sync ingest endpoint, the same path the
 * hourly runner uses (docs/plans/2026-10-01-001-feat-playhq-scheduled-sync-plan.md, U7).
 *
 * Usage (OVATION_API_URL = https://<app>/api, PLAYHQ_SYNC_SECRET = the API's sync secret):
 *   pnpm --filter @workspace/scripts run playhq-upload -- --file=<dump>.json
 *   pnpm --filter @workspace/scripts run playhq-upload -- --file=<dump>.json --plan=matchday
 *
 * Unlike `playhq-load`, this needs no database credential: the API loads the dump through its
 * playhq-scoped role, drops junior grades, projects fixtures for every linked tenant and runs
 * their draft sweep. `--plan=<name>` stamps the run with a scheduled plan name, which also
 * marks that plan done for the dump's organisation (so the hourly runner skips it).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const PLAN_NAMES = ["weekly", "preweekend", "matchmorn", "matchday", "dayafter", "catchup"];

export interface UploadBody {
  collector: "manual";
  planName?: string;
  sourceName: string;
  dump: { version: string; exportedAt: string; records: unknown[] };
}

/** Validate a dump file's JSON and wrap it as an ingest request body. */
export function uploadBody(json: string, fileName: string, planName?: string): UploadBody {
  const dump = JSON.parse(json) as UploadBody["dump"];
  if (!dump || !Array.isArray(dump.records) || typeof dump.version !== "string")
    throw new Error(`${fileName}: not a harness dump (needs version and records[])`);
  if (planName && !PLAN_NAMES.includes(planName))
    throw new Error(`--plan must be one of ${PLAN_NAMES.join(", ")}`);
  return {
    collector: "manual",
    ...(planName ? { planName } : {}),
    sourceName: fileName,
    dump,
  };
}

function argValue(flag: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : undefined;
}

async function main(): Promise<void> {
  const file = argValue("--file");
  if (!file) throw new Error("Pass --file=<dump>.json");
  const base = process.env.OVATION_API_URL;
  const secret = process.env.PLAYHQ_SYNC_SECRET;
  if (!base || !secret) throw new Error("OVATION_API_URL and PLAYHQ_SYNC_SECRET must be set.");

  const body = uploadBody(fs.readFileSync(file, "utf8"), path.basename(file), argValue("--plan"));
  console.log(`${file}: ${body.dump.records.length} records → ${base}`);
  const res = await fetch(`${base.replace(/\/+$/, "")}/internal/playhq/ingest`, {
    method: "POST",
    headers: {
      "x-sync-secret": secret,
      "content-type": "application/json",
      "content-encoding": "gzip",
    },
    body: gzipSync(Buffer.from(JSON.stringify(body))),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ingest → HTTP ${res.status} ${text.slice(0, 500)}`);
  console.log(text);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly)
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });

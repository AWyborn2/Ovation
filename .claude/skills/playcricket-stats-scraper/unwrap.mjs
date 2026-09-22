#!/usr/bin/env node
// Reassemble a harness export into a plain JSON dump.
//
//   node .claude/skills/playcricket-stats-scraper/unwrap.mjs <out.json> <chunk...>
//
// Each <chunk> is either
//   - a javascript-tool "result saved to file" spill (a JSON array whose first element's
//     `text` holds the tool's rendering of the returned base64 string), or
//   - a file containing the raw base64 chunk (when the tool returned it inline and you
//     saved it yourself with Write).
// Chunks are concatenated in the order given, base64-decoded and gunzipped.
import fs from "node:fs";
import zlib from "node:zlib";

const [out, ...chunks] = process.argv.slice(2);
if (!out || chunks.length === 0) {
  console.error("usage: unwrap.mjs <out.json> <chunk1> [chunk2 ...]");
  process.exit(2);
}

function extract(file) {
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text.startsWith("[")) return text.replace(/^"|"$/g, "").replace(/\s+/g, "");
  const arr = JSON.parse(text);
  let body = String(arr[0] && arr[0].text ? arr[0].text : "");
  const cut = body.indexOf("\n\n(captured at origin");
  if (cut >= 0) body = body.slice(0, cut);
  body = body.trim();
  // The tool renders a returned string as a JSON string literal.
  if (body.startsWith('"')) body = JSON.parse(body);
  return body.replace(/\s+/g, "");
}

const b64 = chunks.map(extract).join("");
const json = zlib.gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
const parsed = JSON.parse(json); // validate before writing
fs.writeFileSync(out, json);
const kinds = {};
for (const r of parsed.records || []) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
console.log(
  `wrote ${out}: ${(parsed.records || []).length} records ${JSON.stringify(kinds)} (${json.length} chars)`,
);

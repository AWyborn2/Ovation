/**
 * Card kinds that carry a single sponsor logo: a match result and a
 * premiership card keep the spotlight on the result, so their "Supported by"
 * strip shows one logo rather than the usual row.
 */
const ONE_SPONSOR_KINDS: ReadonlySet<string> = new Set(["matchSummary", "premiership"]);

/** The most sponsor logos a card of `kind` shows; undefined = the renderer's own cap. */
export function maxSponsorLogos(kind: string): number | undefined {
  return ONE_SPONSOR_KINDS.has(kind) ? 1 : undefined;
}

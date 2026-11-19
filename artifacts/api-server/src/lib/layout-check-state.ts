/**
 * A templated draft's layout check state (card kind templates, KTD10; retest 7).
 *
 * `layoutCheckPending` keeps a draft out of automation until its layout check
 * has run. The sweep counts its tries: after LAYOUT_CHECK_MAX_ATTEMPTS failed
 * tries the check gives up and the draft reads "check failed, needs a look".
 * It stays pending, so automation still leaves it alone (fail closed); only an
 * admin can approve or post it, as for any card that needs a look.
 *
 * Anything that changes what the card draws (an edit, a template apply, a data
 * refresh, a revert) writes `layoutCheckOwed()`, which also clears the tries,
 * so the sweep starts again from the first.
 */

/** Failed tries before the sweep stops trying and the queue says the check failed. */
export const LAYOUT_CHECK_MAX_ATTEMPTS = 3;

/** The longest failure reason kept on the draft. */
export const LAYOUT_CHECK_ERROR_MAX = 300;

/** The columns that make a draft owe a fresh layout check. */
export type LayoutCheckOwed = {
  layoutCheckPending: true;
  layoutCheckAttempts: 0;
  layoutCheckLastTriedAt: null;
  layoutCheckFailed: false;
  layoutCheckError: null;
};

/** The patch that makes a draft owe a fresh layout check, tries cleared. */
export function layoutCheckOwed(): LayoutCheckOwed {
  return {
    layoutCheckPending: true,
    layoutCheckAttempts: 0,
    layoutCheckLastTriedAt: null,
    layoutCheckFailed: false,
    layoutCheckError: null,
  };
}

/** The patch for a draft that owes no layout check (a pack design), tries cleared. */
export function layoutCheckNotOwed() {
  return {
    layoutCheckPending: false,
    layoutCheckAttempts: 0,
    layoutCheckLastTriedAt: null,
    layoutCheckFailed: false,
    layoutCheckError: null,
  } as const;
}

/** A failure reason short enough to store and show: its first line, trimmed. */
export function layoutCheckErrorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const first = (raw.split("\n")[0] ?? "").trim() || "The card could not be drawn.";
  return first.length > LAYOUT_CHECK_ERROR_MAX
    ? `${first.slice(0, LAYOUT_CHECK_ERROR_MAX - 1)}…`
    : first;
}

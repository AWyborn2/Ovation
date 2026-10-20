import type { EmailList, EmailListInput, EmailSend } from "@workspace/api-client-react";

type SendMode = NonNullable<EmailListInput["sendMode"]>;

/** The editor's working copy of a list (members as editable rows). */
export type EmailListDraft = {
  id: number | null;
  kind: EmailListInput["kind"];
  name: string;
  /** Team-sheet lists. */
  sendMode: SendMode;
  scheduleDow: number;
  scheduleTime: string;
  resendOnChange: boolean;
  /** Social lists. */
  assetReady: boolean;
  reviewNeeded: boolean;
  milestone: boolean;
  active: boolean;
  gradeKeys: string[];
  members: { name: string; email: string }[];
};

export const SEND_MODE_LABELS: Record<SendMode, string> = {
  on_publish: "Automatically when the side is finalised",
  scheduled: "Every week at a set time",
  manual: "Only when I press Email team sheet",
  off: "Off",
};

export const KIND_LABELS: Record<EmailListInput["kind"], string> = {
  team_sheet: "Team sheets",
  social: "Social media cards",
};

/** The social emails a list can get, in the order the editor shows them. */
export const SOCIAL_TOGGLES = [
  {
    key: "assetReady",
    label: "Card ready to post",
    hint: "Each card as it's ready, image attached",
  },
  {
    key: "reviewNeeded",
    label: "Cards to review",
    hint: "One email per sweep listing new cards",
  },
  {
    key: "milestone",
    label: "Milestones and achievements",
    hint: "One email per sweep listing new milestone cards",
  },
] as const;

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const SEND_STATUS_LABELS: Record<EmailSend["status"], string> = {
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  skipped: "Not sent",
};

/** One line describing when a list is emailed. */
export function listSummary(list: EmailList): string {
  if (list.kind === "social") {
    const on = SOCIAL_TOGGLES.filter((t) => list[t.key]).map((t) => t.label);
    return on.length > 0 ? on.join(", ") : "No emails switched on";
  }
  if (list.sendMode === "scheduled" && list.schedule) {
    return `${DAY_NAMES[list.schedule.dow]}s at ${list.schedule.time}`;
  }
  return SEND_MODE_LABELS[list.sendMode];
}

export function emptyDraft(kind: EmailListInput["kind"] = "team_sheet"): EmailListDraft {
  return {
    id: null,
    kind,
    name: kind === "social" ? "Social media" : "",
    sendMode: "on_publish",
    scheduleDow: 4,
    scheduleTime: "18:00",
    resendOnChange: true,
    assetReady: true,
    reviewNeeded: true,
    milestone: true,
    active: true,
    gradeKeys: [],
    members: [{ name: "", email: "" }],
  };
}

export function draftFrom(list: EmailList): EmailListDraft {
  return {
    id: list.id,
    kind: list.kind,
    name: list.name,
    sendMode: list.sendMode,
    scheduleDow: list.schedule?.dow ?? 4,
    scheduleTime: list.schedule?.time ?? "18:00",
    resendOnChange: list.resendOnChange,
    assetReady: list.assetReady,
    reviewNeeded: list.reviewNeeded,
    milestone: list.milestone,
    active: list.active,
    gradeKeys: [...list.gradeKeys],
    members:
      list.members.length > 0 ? list.members.map((m) => ({ ...m })) : [{ name: "", email: "" }],
  };
}

// Deliberately loose (the server checks too): something@something.tld.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value: string) => EMAIL_RE.test(value.trim());
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** What's wrong with the draft, or null when it can be saved. Blank rows are ignored. */
export function draftProblem(draft: EmailListDraft): string | null {
  if (!draft.name.trim()) return "Give the list a name.";
  if (draft.kind === "team_sheet" && draft.sendMode === "scheduled") {
    if (!TIME_RE.test(draft.scheduleTime)) return "Choose a time for the weekly email.";
  }
  const filled = draft.members.filter((m) => m.name.trim() || m.email.trim());
  const bad = filled.find((m) => !isEmail(m.email));
  if (bad) return `"${bad.email.trim() || bad.name.trim()}" isn't an email address.`;
  if (filled.length > 50) return "A list can have up to 50 contacts.";
  return null;
}

/** The request body: blank rows dropped, values trimmed, only the kind's own settings. */
export function toInput(draft: EmailListDraft): EmailListInput {
  const members = draft.members
    .filter((m) => m.email.trim())
    .map((m) => ({ name: m.name.trim(), email: m.email.trim() }));
  const base = { kind: draft.kind, name: draft.name.trim(), active: draft.active, members };
  if (draft.kind === "social") {
    return {
      ...base,
      gradeKeys: [],
      assetReady: draft.assetReady,
      reviewNeeded: draft.reviewNeeded,
      milestone: draft.milestone,
    };
  }
  return {
    ...base,
    sendMode: draft.sendMode,
    schedule:
      draft.sendMode === "scheduled" ? { dow: draft.scheduleDow, time: draft.scheduleTime } : null,
    resendOnChange: draft.resendOnChange,
    gradeKeys: draft.gradeKeys,
  };
}

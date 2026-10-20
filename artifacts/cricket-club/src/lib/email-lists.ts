import type { EmailList, EmailListInput, EmailSend } from "@workspace/api-client-react";

/** The editor's working copy of a list (members as editable rows). */
export type EmailListDraft = {
  id: number | null;
  name: string;
  sendMode: EmailListInput["sendMode"];
  active: boolean;
  gradeKeys: string[];
  members: { name: string; email: string }[];
};

export const SEND_MODE_LABELS: Record<EmailListInput["sendMode"], string> = {
  on_publish: "Automatically when the side is finalised",
  manual: "Only when I press Email team sheet",
  off: "Off",
};

export const SEND_STATUS_LABELS: Record<EmailSend["status"], string> = {
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  skipped: "Not sent",
};

export function emptyDraft(): EmailListDraft {
  return {
    id: null,
    name: "",
    sendMode: "on_publish",
    active: true,
    gradeKeys: [],
    members: [{ name: "", email: "" }],
  };
}

export function draftFrom(list: EmailList): EmailListDraft {
  return {
    id: list.id,
    name: list.name,
    sendMode: list.sendMode,
    active: list.active,
    gradeKeys: [...list.gradeKeys],
    members:
      list.members.length > 0 ? list.members.map((m) => ({ ...m })) : [{ name: "", email: "" }],
  };
}

// Deliberately loose (the server checks too): something@something.tld.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value: string) => EMAIL_RE.test(value.trim());

/** What's wrong with the draft, or null when it can be saved. Blank rows are ignored. */
export function draftProblem(draft: EmailListDraft): string | null {
  if (!draft.name.trim()) return "Give the list a name.";
  const filled = draft.members.filter((m) => m.name.trim() || m.email.trim());
  const bad = filled.find((m) => !isEmail(m.email));
  if (bad) return `"${bad.email.trim() || bad.name.trim()}" isn't an email address.`;
  if (filled.length > 50) return "A list can have up to 50 contacts.";
  return null;
}

/** The request body: blank rows dropped, values trimmed. */
export function toInput(draft: EmailListDraft): EmailListInput {
  return {
    kind: "team_sheet",
    name: draft.name.trim(),
    sendMode: draft.sendMode,
    active: draft.active,
    gradeKeys: draft.gradeKeys,
    members: draft.members
      .filter((m) => m.email.trim())
      .map((m) => ({ name: m.name.trim(), email: m.email.trim() })),
  };
}

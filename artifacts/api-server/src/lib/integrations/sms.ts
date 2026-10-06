import { env } from "../../config";

/**
 * SMS through Twilio's Messages REST API (plan 2026-10-06-002 KTD3), mirroring
 * the email adapter: off when the credentials or a sender are missing, one
 * retry, then the failure goes back to the caller — SMS never blocks the state
 * change it describes.
 *
 * STOP is Twilio's built-in opt-out (Advanced Opt-Out on a two-way Australian
 * number or Messaging Service pool). A send to a number that replied STOP
 * fails with error 21610, reported here as `opted_out` so the caller can flag
 * that contact and go email-only for it (R13). There is no inbound webhook.
 *
 * Results and errors never carry a number, an address or a credential: any
 * error text is passed through {@link redactContact} before it leaves here.
 */
export type SmsMessage = { to: string; body: string };
export type SmsResult =
  { sent: true } | { sent: false; reason: "disabled" | "failed" | "opted_out"; error?: string };

export type SmsTransport = (message: SmsMessage) => Promise<void>;

/** Twilio error 21610: the recipient replied STOP to this sender. */
export const TWILIO_OPTED_OUT = 21610;

/** A transport failure carrying Twilio's numeric error code when it gave one. */
export class SmsTransportError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "SmsTransportError";
  }
}

const twilioTransport: SmsTransport = async (message) => {
  const sid = env.TWILIO_ACCOUNT_SID() ?? "";
  const token = env.TWILIO_AUTH_TOKEN() ?? "";
  const form = new URLSearchParams({ To: message.to, Body: message.body });
  // A Messaging Service picks the sender from its pool; prefer it when set.
  const service = env.TWILIO_MESSAGING_SERVICE_SID();
  if (service) form.set("MessagingServiceSid", service);
  else form.set("From", env.TWILIO_FROM() ?? "");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
  );
  if (res.ok) return;
  let body: { code?: unknown; message?: unknown } | null = null;
  try {
    body = (await res.json()) as { code?: unknown; message?: unknown };
  } catch {
    body = null;
  }
  const code = typeof body?.code === "number" ? body.code : undefined;
  const detail = typeof body?.message === "string" ? `: ${body.message}` : "";
  throw new SmsTransportError(`Twilio responded ${res.status}${detail}`, code);
};

let override: SmsTransport | null = null;

/** Test seam: route SMS through `transport` (null restores Twilio). */
export function setSmsTransport(transport: SmsTransport | null): void {
  override = transport;
}

export function smsEnabled(): boolean {
  if (override != null) return true;
  return (
    !!env.TWILIO_ACCOUNT_SID() &&
    !!env.TWILIO_AUTH_TOKEN() &&
    (!!env.TWILIO_FROM() || !!env.TWILIO_MESSAGING_SERVICE_SID())
  );
}

/**
 * An Australian mobile in E.164 (`+614xxxxxxxx`), or null when the value is not
 * one: landlines and overseas numbers can't take these messages. Accepts the
 * usual spellings — `0412 345 678`, `+61 412 345 678`, `61412345678`,
 * `412345678` — with spaces, dashes, dots or brackets.
 */
export function normaliseAuMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^[+\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  let national: string;
  if (trimmed.startsWith("+") || digits.startsWith("61")) {
    if (!digits.startsWith("61")) return null;
    national = digits.slice(2);
    if (national.startsWith("0")) national = national.slice(1);
  } else if (digits.startsWith("0")) {
    national = digits.slice(1);
  } else {
    national = digits;
  }
  return /^4\d{8}$/.test(national) ? `+61${national}` : null;
}

// Phone-number shapes (runs of 8+ digits, allowing spaces/dashes and a leading
// +) and email addresses. Deliberately broad: a log line loses nothing useful.
const CONTACT_SHAPES = [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, /\+?\d[\d\s().-]{6,}\d/g];

/**
 * Strip anything number- or email-shaped, plus the exact secrets in play
 * (modelled on `redact()` in `publishing/meta-client.ts`). Twilio echoes the
 * `To` number in some error messages, so every error passes through here.
 */
export function redactContact(text: string, secrets: (string | null | undefined)[] = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("[redacted]");
  for (const re of CONTACT_SHAPES) out = out.replace(re, "[redacted]");
  return out;
}

// The GSM 03.38 basic alphabet and its extension table (extension characters
// cost two of the 160). Anything else forces UCS-2 and a 70-character limit.
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€";

/** True when every character is in the GSM-7 alphabet (so 160 per segment). */
export function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (!GSM_BASIC.includes(ch) && !GSM_EXTENDED.includes(ch)) return false;
  }
  return true;
}

/** Length in GSM-7 septets (extension characters count twice). */
export function gsm7Length(text: string): number {
  let n = 0;
  for (const ch of text) n += GSM_EXTENDED.includes(ch) ? 2 : 1;
  return n;
}

function errorCode(err: unknown): number | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "number" ? code : undefined;
}

export async function sendSms(message: SmsMessage): Promise<SmsResult> {
  if (!smsEnabled()) return { sent: false, reason: "disabled" };
  const to = normaliseAuMobile(message.to);
  if (!to) return { sent: false, reason: "failed", error: "not an Australian mobile number" };
  const transport = override ?? twilioTransport;
  const secrets = [message.to, to, env.TWILIO_ACCOUNT_SID(), env.TWILIO_AUTH_TOKEN()];
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await transport({ to, body: message.body });
      return { sent: true };
    } catch (err) {
      // An opt-out is final: retrying would only fail the same way.
      if (errorCode(err) === TWILIO_OPTED_OUT) return { sent: false, reason: "opted_out" };
      lastError = err;
    }
  }
  const text = lastError instanceof Error ? lastError.message : String(lastError);
  const code = errorCode(lastError);
  return {
    sent: false,
    reason: "failed",
    error: redactContact(code != null ? `${text} (code ${code})` : text, secrets),
  };
}

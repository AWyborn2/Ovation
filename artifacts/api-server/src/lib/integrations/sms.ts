import { env } from "../../config";

/**
 * SMS through Twilio's Messages REST API or ClickSend's v3 SMS API, mirroring
 * the email adapter: off when the credentials or a sender are missing, each
 * request bounded by {@link SMS_TIMEOUT_MS}, one retry for a failure that may
 * be transient (a network error, a timeout, a 429 or a 5xx), then the failure
 * goes back to the caller — SMS never blocks the state change it describes.
 *
 * Which provider sends is {@link smsProvider}: `SMS_PROVIDER` when set, else
 * whichever is fully configured, Twilio first when both are (adding ClickSend
 * keys never silently moves an existing Twilio setup).
 *
 * Twilio: STOP is Twilio's built-in opt-out (Advanced Opt-Out on a two-way
 * Australian number or Messaging Service pool). A send to a number that
 * replied STOP fails with error 21610, reported here as `opted_out` so the
 * caller can flag that contact and go email-only for it. There is no inbound
 * webhook.
 *
 * ClickSend: sends from the club's own verified mobile ("own number" sender),
 * so replies — STOP included — go to that phone and never reach us. Messages
 * then carry a link-based opt-out instead (see {@link smsRepliesReachUs}). A
 * per-message status naming ClickSend's own opt-out list is still reported as
 * `opted_out`.
 *
 * Results and errors never carry a number, an address or a credential: any
 * error text is passed through {@link redactContact} before it leaves here.
 */
export type SmsMessage = { to: string; body: string };
export type SmsResult =
  { sent: true } | { sent: false; reason: "disabled" | "failed" | "opted_out"; error?: string };

export type SmsTransport = (message: SmsMessage) => Promise<void>;

export type SmsProvider = "twilio" | "clicksend";

/** Twilio error 21610: the recipient replied STOP to this sender. */
export const TWILIO_OPTED_OUT = 21610;

/** How long one provider request may take before it is abandoned. */
export const SMS_TIMEOUT_MS = 10_000;

/**
 * A transport failure carrying Twilio's numeric error code and the HTTP status
 * when it gave them.
 */
export class SmsTransportError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SmsTransportError";
  }
}

/** The provider refused the send because the recipient is on its opt-out list. */
export class SmsOptedOutError extends SmsTransportError {
  constructor(message: string) {
    super(message);
    this.name = "SmsOptedOutError";
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
      signal: AbortSignal.timeout(SMS_TIMEOUT_MS),
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
  throw new SmsTransportError(`Twilio responded ${res.status}${detail}`, code, res.status);
};

type ClickSendBody = {
  response_code?: unknown;
  data?: { messages?: { status?: unknown }[] };
};

/**
 * ClickSend's `POST /v3/sms/send`: JSON `{ messages: [...] }` with HTTP basic
 * auth (API username : API key). A 200 only means the request was accepted —
 * each message carries its own `status`, and only "SUCCESS" means queued.
 */
const clickSendTransport: SmsTransport = async (message) => {
  const user = env.CLICKSEND_USERNAME() ?? "";
  const key = env.CLICKSEND_API_KEY() ?? "";
  const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${user}:${key}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          source: "ovation",
          from: env.CLICKSEND_FROM() ?? "",
          to: message.to,
          body: message.body,
        },
      ],
    }),
    signal: AbortSignal.timeout(SMS_TIMEOUT_MS),
  });
  let body: ClickSendBody | null = null;
  try {
    body = (await res.json()) as ClickSendBody;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const code = typeof body?.response_code === "string" ? `: ${body.response_code}` : "";
    throw new SmsTransportError(`ClickSend responded ${res.status}${code}`, undefined, res.status);
  }
  const status = body?.data?.messages?.[0]?.status;
  if (status === "SUCCESS") return;
  const label = typeof status === "string" && status ? status : "no message status";
  // ClickSend's own opt-out list; the status names are not documented, so match loosely.
  if (/UNSUBSCRIB|OPT/i.test(label)) throw new SmsOptedOutError(`ClickSend status ${label}`);
  // Answered 200 with a per-message refusal: final, so never retried.
  throw new SmsTransportError(`ClickSend status ${label}`, undefined, res.status);
};

let override: { transport: SmsTransport; provider: SmsProvider } | null = null;

/**
 * Test seam: route SMS through `transport`, standing in for `provider`
 * (Twilio by default) so message wording follows it. Null restores the real
 * providers.
 */
export function setSmsTransport(
  transport: SmsTransport | null,
  provider: SmsProvider = "twilio",
): void {
  override = transport ? { transport, provider } : null;
}

function twilioConfigured(): boolean {
  return (
    !!env.TWILIO_ACCOUNT_SID() &&
    !!env.TWILIO_AUTH_TOKEN() &&
    (!!env.TWILIO_FROM() || !!env.TWILIO_MESSAGING_SERVICE_SID())
  );
}

function clickSendConfigured(): boolean {
  return !!env.CLICKSEND_USERNAME() && !!env.CLICKSEND_API_KEY() && !!env.CLICKSEND_FROM();
}

/**
 * The provider that sends, or null when SMS is off. `SMS_PROVIDER` wins when
 * set (and means off if that provider isn't fully configured); unset, Twilio
 * when it is configured, else ClickSend when it is.
 */
export function smsProvider(): SmsProvider | null {
  if (override != null) return override.provider;
  const explicit = env.SMS_PROVIDER();
  if (explicit === "twilio") return twilioConfigured() ? "twilio" : null;
  if (explicit === "clicksend") return clickSendConfigured() ? "clicksend" : null;
  if (twilioConfigured()) return "twilio";
  if (clickSendConfigured()) return "clicksend";
  return null;
}

/**
 * True when a reply (STOP in particular) reaches the provider and opts the
 * contact out — Twilio only. ClickSend's own-number sender delivers replies to
 * the club's phone, so messages must offer a link-based opt-out instead.
 */
export function smsRepliesReachUs(): boolean {
  return smsProvider() === "twilio";
}

export function smsEnabled(): boolean {
  return smsProvider() != null;
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

/**
 * True when trying again might work: a network error or timeout (anything that
 * isn't Twilio's answer), a 429 or a 5xx. Another 4xx, or a Twilio error code
 * without a status, would only fail the same way.
 */
function retryable(err: unknown): boolean {
  if (!(err instanceof SmsTransportError)) return true;
  if (err.status != null) return err.status === 429 || err.status >= 500;
  return err.code == null;
}

export async function sendSms(message: SmsMessage): Promise<SmsResult> {
  const provider = smsProvider();
  if (provider == null) return { sent: false, reason: "disabled" };
  const to = normaliseAuMobile(message.to);
  if (!to) return { sent: false, reason: "failed", error: "not an Australian mobile number" };
  const transport =
    override?.transport ?? (provider === "clicksend" ? clickSendTransport : twilioTransport);
  const secrets = [
    message.to,
    to,
    env.TWILIO_ACCOUNT_SID(),
    env.TWILIO_AUTH_TOKEN(),
    env.CLICKSEND_USERNAME(),
    env.CLICKSEND_API_KEY(),
    env.CLICKSEND_FROM(),
  ];
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await transport({ to, body: message.body });
      return { sent: true };
    } catch (err) {
      // An opt-out is final: retrying would only fail the same way.
      if (err instanceof SmsOptedOutError || errorCode(err) === TWILIO_OPTED_OUT)
        return { sent: false, reason: "opted_out" };
      lastError = err;
      if (!retryable(err)) break;
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

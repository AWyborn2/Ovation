import { env } from "../../config";

/**
 * Transactional email through Resend (Social Studio KTD5/KTD14). Off when
 * RESEND_API_KEY or EMAIL_FROM is missing. Best-effort: each request bounded
 * by {@link EMAIL_TIMEOUT_MS}, one retry, then the failure is reported to the
 * caller, which logs it — email never blocks the state change it describes.
 */
export type EmailMessage = { to: string; subject: string; text: string };
export type EmailResult =
  { sent: true } | { sent: false; reason: "disabled" | "failed"; error?: string };

export type EmailTransport = (message: EmailMessage) => Promise<void>;

/** How long one Resend request may take before it is abandoned. */
export const EMAIL_TIMEOUT_MS = 10_000;

const resendTransport: EmailTransport = async (message) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM(),
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
    signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}`);
};

let override: EmailTransport | null = null;

/** Test seam: route email through `transport` (null restores Resend). */
export function setEmailTransport(transport: EmailTransport | null): void {
  override = transport;
}

export function emailEnabled(): boolean {
  return override != null || (!!env.RESEND_API_KEY() && !!env.EMAIL_FROM());
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!emailEnabled()) return { sent: false, reason: "disabled" };
  const transport = override ?? resendTransport;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await transport(message);
      return { sent: true };
    } catch (err) {
      lastError = err;
    }
  }
  return {
    sent: false,
    reason: "failed",
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

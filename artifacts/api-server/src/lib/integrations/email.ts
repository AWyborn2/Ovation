import { env } from "../../config";

/**
 * Transactional email through Resend (Social Studio KTD5/KTD14). Off when
 * RESEND_API_KEY or EMAIL_FROM is missing. Best-effort: each request bounded
 * by {@link EMAIL_TIMEOUT_MS}, one retry, then the failure is reported to the
 * caller, which logs it — email never blocks the state change it describes.
 */
export type EmailAttachment = { filename: string; content: Buffer; contentType?: string };
export type EmailMessage = {
  /** One address or several; a list email puts its recipients in `bcc` instead. */
  to: string | string[];
  /** Hidden recipients, so a list's contacts never see each other's addresses. */
  bcc?: string[];
  subject: string;
  text: string;
  attachments?: EmailAttachment[];
};
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
      to: Array.isArray(message.to) ? message.to : [message.to],
      ...(message.bcc?.length ? { bcc: message.bcc } : {}),
      subject: message.subject,
      text: message.text,
      ...(message.attachments?.length
        ? {
            attachments: message.attachments.map((a) => ({
              filename: a.filename,
              content: a.content.toString("base64"),
              ...(a.contentType ? { content_type: a.contentType } : {}),
            })),
          }
        : {}),
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

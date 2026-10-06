import { describe, it, expect, afterEach, vi } from "vitest";
import { sendEmail } from "./email";

/**
 * Email adapter: a stubbed fetch stands in for Resend — nothing leaves the
 * process.
 */

const KEYS = ["RESEND_API_KEY", "EMAIL_FROM"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("sendEmail (Resend)", () => {
  it("bounds each Resend request with a timeout signal", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "club@example.com";
    const signals: (AbortSignal | null | undefined)[] = [];
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      signals.push(init.signal);
      return new Response(JSON.stringify({ id: "e1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy);
    await expect(sendEmail({ to: "a@example.com", subject: "s", text: "t" })).resolves.toEqual({
      sent: true,
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it("reports a timed-out request as failed after one retry", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "club@example.com";
    const fetchSpy = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      sendEmail({ to: "a@example.com", subject: "s", text: "t" }),
    ).resolves.toMatchObject({ sent: false, reason: "failed" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

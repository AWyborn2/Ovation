import { describe, it, expect, afterEach, vi } from "vitest";
import {
  sendSms,
  setSmsTransport,
  smsEnabled,
  normaliseAuMobile,
  redactContact,
  isGsm7,
  SmsTransportError,
  type SmsMessage,
} from "./sms";

/**
 * SMS adapter (plan 2026-10-06-002 U2, KTD3): pure unit tests with a fake
 * transport or a stubbed fetch — nothing reaches Twilio.
 */

const TWILIO_KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
] as const;
const saved = Object.fromEntries(TWILIO_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  setSmsTransport(null);
  vi.unstubAllGlobals();
  for (const k of TWILIO_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function clearTwilioEnv() {
  for (const k of TWILIO_KEYS) delete process.env[k];
}

describe("normaliseAuMobile", () => {
  it("normalises Australian mobiles to E.164", () => {
    expect(normaliseAuMobile("0412 345 678")).toBe("+61412345678");
    expect(normaliseAuMobile("0412-345-678")).toBe("+61412345678");
    expect(normaliseAuMobile("+61 412 345 678")).toBe("+61412345678");
    expect(normaliseAuMobile("61412345678")).toBe("+61412345678");
    expect(normaliseAuMobile("412345678")).toBe("+61412345678");
    expect(normaliseAuMobile("(0412) 345678")).toBe("+61412345678");
  });

  it("returns null for anything that is not a mobile number", () => {
    expect(normaliseAuMobile(null)).toBeNull();
    expect(normaliseAuMobile("")).toBeNull();
    expect(normaliseAuMobile("call me")).toBeNull();
    expect(normaliseAuMobile("0412 345")).toBeNull();
    expect(normaliseAuMobile("08 9581 1234")).toBeNull(); // a landline can't take SMS
    expect(normaliseAuMobile("+1 415 555 0100")).toBeNull();
  });
});

describe("isGsm7", () => {
  it("accepts plain text and rejects characters outside the GSM alphabet", () => {
    expect(isGsm7("HHCC: Are you available? https://x.y/a/b_c-d Reply STOP to opt out.")).toBe(
      true,
    );
    expect(isGsm7("was J. Hale · no reply")).toBe(false);
    expect(isGsm7("“quoted”")).toBe(false);
  });
});

describe("redactContact", () => {
  it("strips phone numbers, emails and given secrets", () => {
    const text =
      "The 'To' number +61412345678 is not valid; also 0412 345 678 and j.hale@example.com (AC123secretsid)";
    const out = redactContact(text, ["AC123secretsid"]);
    expect(out).not.toContain("+61412345678");
    expect(out).not.toContain("0412 345 678");
    expect(out).not.toContain("j.hale@example.com");
    expect(out).not.toContain("AC123secretsid");
    expect(out).toContain("is not valid");
  });
});

describe("sendSms", () => {
  it("is disabled, without throwing, when Twilio env vars are missing", async () => {
    clearTwilioEnv();
    expect(smsEnabled()).toBe(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(sendSms({ to: "0412345678", body: "hi" })).resolves.toEqual({
      sent: false,
      reason: "disabled",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is disabled without a sender even when credentials are set", () => {
    clearTwilioEnv();
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "secret-token-value";
    expect(smsEnabled()).toBe(false);
    process.env.TWILIO_FROM = "+61400000000";
    expect(smsEnabled()).toBe(true);
  });

  it("sends through the transport with the number in E.164", async () => {
    const sent: SmsMessage[] = [];
    setSmsTransport(async (m) => {
      sent.push(m);
    });
    await expect(sendSms({ to: "0412 345 678", body: "hello" })).resolves.toEqual({ sent: true });
    expect(sent).toEqual([{ to: "+61412345678", body: "hello" }]);
  });

  it("retries once, then reports a redacted failure", async () => {
    let calls = 0;
    setSmsTransport(async (m) => {
      calls++;
      throw new SmsTransportError(`The 'To' number ${m.to} is not a valid phone number.`, 21211);
    });
    const result = await sendSms({ to: "0412345678", body: "x" });
    expect(calls).toBe(2);
    expect(result).toMatchObject({ sent: false, reason: "failed" });
    expect(JSON.stringify(result)).not.toContain("412345678");
  });

  it("succeeds on the retry after one transient failure", async () => {
    let calls = 0;
    setSmsTransport(async () => {
      calls++;
      if (calls === 1) throw new Error("socket hang up");
    });
    await expect(sendSms({ to: "0412345678", body: "x" })).resolves.toEqual({ sent: true });
    expect(calls).toBe(2);
  });

  it("maps Twilio error 21610 to opted_out and does not retry", async () => {
    let calls = 0;
    setSmsTransport(async () => {
      calls++;
      throw new SmsTransportError("Attempt to send to unsubscribed recipient", 21610);
    });
    await expect(sendSms({ to: "0412345678", body: "x" })).resolves.toEqual({
      sent: false,
      reason: "opted_out",
    });
    expect(calls).toBe(1);
  });

  it("reports an unparseable number as failed without calling the transport", async () => {
    const transport = vi.fn(async () => {});
    setSmsTransport(transport);
    const result = await sendSms({ to: "not a number", body: "x" });
    expect(result).toMatchObject({ sent: false, reason: "failed" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("posts to the Twilio Messages API with basic auth and the messaging service", async () => {
    clearTwilioEnv();
    process.env.TWILIO_ACCOUNT_SID = "ACtest123";
    process.env.TWILIO_AUTH_TOKEN = "authtoken-secret";
    process.env.TWILIO_FROM = "+61400000000";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MGservice";
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ sid: "SM1" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await expect(sendSms({ to: "0412345678", body: "hello" })).resolves.toEqual({ sent: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACtest123/Messages.json");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("ACtest123:authtoken-secret").toString("base64")}`,
    );
    const form = new URLSearchParams(String(init.body));
    expect(form.get("To")).toBe("+61412345678");
    expect(form.get("Body")).toBe("hello");
    expect(form.get("MessagingServiceSid")).toBe("MGservice");
    expect(form.get("From")).toBeNull();
  });

  it("reads Twilio's error code from the response body (21610 → opted_out)", async () => {
    clearTwilioEnv();
    process.env.TWILIO_ACCOUNT_SID = "ACtest123";
    process.env.TWILIO_AUTH_TOKEN = "authtoken-secret";
    process.env.TWILIO_FROM = "+61400000000";
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ code: 21610, message: "Attempt to send to unsubscribed recipient" }),
          { status: 400 },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await expect(sendSms({ to: "0412345678", body: "x" })).resolves.toEqual({
      sent: false,
      reason: "opted_out",
    });
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const form = new URLSearchParams(String(init.body));
    expect(form.get("From")).toBe("+61400000000");
  });
});

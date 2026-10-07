import { describe, it, expect, afterEach, vi } from "vitest";
import {
  sendSms,
  setSmsTransport,
  smsEnabled,
  smsProvider,
  smsRepliesReachUs,
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
  "SMS_PROVIDER",
  "CLICKSEND_USERNAME",
  "CLICKSEND_API_KEY",
  "CLICKSEND_FROM",
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

  it("retries a 5xx once, then reports a redacted failure", async () => {
    let calls = 0;
    setSmsTransport(async (m) => {
      calls++;
      throw new SmsTransportError(`Twilio responded 503 sending to ${m.to}`, undefined, 503);
    });
    const result = await sendSms({ to: "0412345678", body: "x" });
    expect(calls).toBe(2);
    expect(result).toMatchObject({ sent: false, reason: "failed" });
    expect(JSON.stringify(result)).not.toContain("412345678");
  });

  it("retries a 429, but not another 4xx or a Twilio error code", async () => {
    let calls = 0;
    setSmsTransport(async () => {
      calls++;
      throw new SmsTransportError("Twilio responded 429: Too Many Requests", 20429, 429);
    });
    await sendSms({ to: "0412345678", body: "x" });
    expect(calls).toBe(2);

    calls = 0;
    setSmsTransport(async (m) => {
      calls++;
      throw new SmsTransportError(`The 'To' number ${m.to} is not a valid phone number.`, 21211);
    });
    const invalid = await sendSms({ to: "0412345678", body: "x" });
    expect(calls).toBe(1);
    expect(invalid).toMatchObject({ sent: false, reason: "failed" });
    expect(JSON.stringify(invalid)).not.toContain("412345678");

    calls = 0;
    setSmsTransport(async () => {
      calls++;
      throw new SmsTransportError("Twilio responded 401", undefined, 401);
    });
    await sendSms({ to: "0412345678", body: "x" });
    expect(calls).toBe(1);
  });

  it("gives up on a hung Twilio request after a timeout and retries it once", async () => {
    clearTwilioEnv();
    process.env.TWILIO_ACCOUNT_SID = "ACtest123";
    process.env.TWILIO_AUTH_TOKEN = "authtoken-secret";
    process.env.TWILIO_FROM = "+61400000000";
    const signals: AbortSignal[] = [];
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      signals.push(init.signal!);
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const result = await sendSms({ to: "0412345678", body: "x" });
    expect(result).toMatchObject({ sent: false, reason: "failed" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
  });

  it("does not retry a 400 from Twilio", async () => {
    clearTwilioEnv();
    process.env.TWILIO_ACCOUNT_SID = "ACtest123";
    process.env.TWILIO_AUTH_TOKEN = "authtoken-secret";
    process.env.TWILIO_FROM = "+61400000000";
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 21211, message: "Invalid 'To' Phone Number" }), {
          status: 400,
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await expect(sendSms({ to: "0412345678", body: "x" })).resolves.toMatchObject({
      sent: false,
      reason: "failed",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
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

function setTwilioEnv() {
  process.env.TWILIO_ACCOUNT_SID = "ACtest123";
  process.env.TWILIO_AUTH_TOKEN = "authtoken-secret";
  process.env.TWILIO_FROM = "+61400000000";
}

function setClickSendEnv() {
  process.env.CLICKSEND_USERNAME = "club.owner@example.com";
  process.env.CLICKSEND_API_KEY = "CS-API-KEY-SECRET";
  process.env.CLICKSEND_FROM = "+61498765432";
}

/** A ClickSend v3 /sms/send response with one message of the given status. */
function clickSendResponse(status: string, http = 200) {
  return new Response(
    JSON.stringify({
      http_code: http,
      response_code: http === 200 ? "SUCCESS" : "BAD_REQUEST",
      response_msg: "Messages queued for delivery.",
      data: {
        total_count: 1,
        queued_count: status === "SUCCESS" ? 1 : 0,
        messages: [{ to: "+61412345678", body: "x", message_id: "M1", status }],
      },
    }),
    { status: http, headers: { "Content-Type": "application/json" } },
  );
}

describe("smsProvider", () => {
  it("is null when nothing is configured", () => {
    clearTwilioEnv();
    expect(smsProvider()).toBeNull();
    expect(smsEnabled()).toBe(false);
    expect(smsRepliesReachUs()).toBe(false);
  });

  it("picks whichever provider is fully configured", () => {
    clearTwilioEnv();
    setTwilioEnv();
    expect(smsProvider()).toBe("twilio");
    expect(smsRepliesReachUs()).toBe(true);

    clearTwilioEnv();
    setClickSendEnv();
    expect(smsProvider()).toBe("clicksend");
    expect(smsEnabled()).toBe(true);
    expect(smsRepliesReachUs()).toBe(false);
  });

  it("needs the ClickSend sender as well as the credentials", () => {
    clearTwilioEnv();
    setClickSendEnv();
    delete process.env.CLICKSEND_FROM;
    expect(smsProvider()).toBeNull();
  });

  it("keeps Twilio when both are configured and SMS_PROVIDER is unset", () => {
    clearTwilioEnv();
    setTwilioEnv();
    setClickSendEnv();
    expect(smsProvider()).toBe("twilio");
  });

  it("follows an explicit SMS_PROVIDER, and is off when that provider is not configured", () => {
    clearTwilioEnv();
    setTwilioEnv();
    setClickSendEnv();
    process.env.SMS_PROVIDER = "clicksend";
    expect(smsProvider()).toBe("clicksend");
    process.env.SMS_PROVIDER = "twilio";
    expect(smsProvider()).toBe("twilio");

    clearTwilioEnv();
    setTwilioEnv();
    process.env.SMS_PROVIDER = "clicksend";
    expect(smsProvider()).toBeNull();
    expect(smsEnabled()).toBe(false);
  });

  it("a test transport reports the provider it stands in for (Twilio by default)", () => {
    clearTwilioEnv();
    setSmsTransport(async () => {});
    expect(smsProvider()).toBe("twilio");
    setSmsTransport(async () => {}, "clicksend");
    expect(smsProvider()).toBe("clicksend");
    expect(smsRepliesReachUs()).toBe(false);
  });
});

describe("sendSms through ClickSend", () => {
  it("posts to the v3 send API with basic auth, the own-number sender and a JSON body", async () => {
    clearTwilioEnv();
    setClickSendEnv();
    const fetchSpy = vi.fn(async () => clickSendResponse("SUCCESS"));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(sendSms({ to: "0412 345 678", body: "hello" })).resolves.toEqual({ sent: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://rest.clicksend.com/v3/sms/send");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("club.owner@example.com:CS-API-KEY-SECRET").toString("base64")}`,
    );
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({
      messages: [{ source: "ovation", from: "+61498765432", to: "+61412345678", body: "hello" }],
    });
  });

  it("reports a non-SUCCESS message status as failed, without retrying or leaking contact data", async () => {
    clearTwilioEnv();
    setClickSendEnv();
    for (const status of ["INVALID_RECIPIENT", "INSUFFICIENT_CREDIT", "COUNTRY_NOT_ENABLED"]) {
      const fetchSpy = vi.fn(async () => clickSendResponse(status));
      vi.stubGlobal("fetch", fetchSpy);
      const result = await sendSms({ to: "0412345678", body: "x" });
      expect(result).toMatchObject({ sent: false, reason: "failed" });
      expect(result.sent === false && result.error).toContain(status);
      const text = JSON.stringify(result);
      expect(text).not.toContain("412345678");
      expect(text).not.toContain("498765432");
      expect(text).not.toContain("CS-API-KEY-SECRET");
      expect(text).not.toContain("club.owner@example.com");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    }
  });

  it("maps ClickSend's own opt-out list to opted_out", async () => {
    clearTwilioEnv();
    setClickSendEnv();
    for (const status of ["UNSUBSCRIBED", "RECIPIENT_OPTED_OUT"]) {
      const fetchSpy = vi.fn(async () => clickSendResponse(status));
      vi.stubGlobal("fetch", fetchSpy);
      await expect(sendSms({ to: "0412345678", body: "x" })).resolves.toEqual({
        sent: false,
        reason: "opted_out",
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    }
  });

  it("retries a timeout and a 5xx once", async () => {
    clearTwilioEnv();
    setClickSendEnv();
    const hung = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    vi.stubGlobal("fetch", hung);
    await expect(sendSms({ to: "0412345678", body: "x" })).resolves.toMatchObject({
      sent: false,
      reason: "failed",
    });
    expect(hung).toHaveBeenCalledTimes(2);

    const down = vi.fn(async () => new Response("Service Unavailable", { status: 503 }));
    vi.stubGlobal("fetch", down);
    await sendSms({ to: "0412345678", body: "x" });
    expect(down).toHaveBeenCalledTimes(2);

    let calls = 0;
    const flaky = vi.fn(async () =>
      ++calls === 1 ? clickSendResponse("x", 502) : clickSendResponse("SUCCESS"),
    );
    vi.stubGlobal("fetch", flaky);
    await expect(sendSms({ to: "0412345678", body: "x" })).resolves.toEqual({ sent: true });
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx such as bad credentials", async () => {
    clearTwilioEnv();
    setClickSendEnv();
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            http_code: 401,
            response_code: "INVALID_CREDENTIALS",
            response_msg: "Invalid credentials for club.owner@example.com",
          }),
          { status: 401 },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const result = await sendSms({ to: "0412345678", body: "x" });
    expect(result).toMatchObject({ sent: false, reason: "failed" });
    expect(result.sent === false && result.error).toContain("INVALID_CREDENTIALS");
    expect(JSON.stringify(result)).not.toContain("club.owner@example.com");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("routes to Twilio, unchanged, when SMS_PROVIDER=twilio", async () => {
    clearTwilioEnv();
    setTwilioEnv();
    setClickSendEnv();
    process.env.SMS_PROVIDER = "twilio";
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ sid: "SM1" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await expect(sendSms({ to: "0412345678", body: "x" })).resolves.toEqual({ sent: true });
    const [url] = fetchSpy.mock.calls[0] as unknown as [string];
    expect(url).toContain("api.twilio.com");
  });
});

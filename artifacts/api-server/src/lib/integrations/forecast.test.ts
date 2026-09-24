/**
 * Social Studio U19 — the Open-Meteo forecast adapter. Mocked `fetch` only;
 * no real network calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  OPEN_METEO_CUSTOMER_URL,
  OPEN_METEO_FREE_URL,
  ForecastError,
  clearForecastCache,
  describeWeatherCode,
  forecastHour,
  getForecast,
} from "./forecast";

const NOW = new Date("2026-10-08T00:00:00.000Z");
const START = new Date("2026-10-10T02:30:00.000Z"); // floors to 02:00 UTC
const LAT = -32.5412;
const LON = 115.7461;

function openMeteo(hour: string, temperature: number | null, code: number | null) {
  return new Response(
    JSON.stringify({
      hourly: { time: [hour], temperature_2m: [temperature], weather_code: [code] },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearForecastCache();
  delete process.env.OPEN_METEO_API_KEY;
  fetchMock = vi.fn(async () => openMeteo("2026-10-10T02:00", 23.6, 1));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPEN_METEO_API_KEY;
});

describe("getForecast", () => {
  it("returns temperature and conditions for the venue at the start hour, from the BOM model", async () => {
    const f = await getForecast(LAT, LON, START, NOW);
    expect(f).toEqual({
      hour: "2026-10-10T02:00:00.000Z",
      temperatureC: 24,
      weatherCode: 1,
      conditions: "Mostly sunny",
      attribution: expect.stringMatching(/Open-Meteo/),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe(OPEN_METEO_FREE_URL);
    expect(url.searchParams.get("models")).toBe("bom_access_global");
    expect(url.searchParams.get("latitude")).toBe("-32.5412");
    expect(url.searchParams.get("longitude")).toBe("115.7461");
    expect(url.searchParams.get("start_hour")).toBe("2026-10-10T02:00");
    expect(url.searchParams.get("end_hour")).toBe("2026-10-10T02:00");
    expect(url.searchParams.get("timezone")).toBe("GMT");
    expect(url.searchParams.has("apikey")).toBe(false);
  });

  it("serves a second request for the same venue and hour from the cache", async () => {
    await getForecast(LAT, LON, START, NOW);
    const later = new Date(NOW.getTime() + 30 * 60_000);
    const again = await getForecast(LAT, LON, new Date("2026-10-10T02:59:00.000Z"), later);
    expect(again?.temperatureC).toBe(24);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after the cache hour, and for a different venue or hour", async () => {
    await getForecast(LAT, LON, START, NOW);
    await getForecast(LAT + 0.5, LON, START, NOW);
    await getForecast(LAT, LON, new Date("2026-10-10T03:10:00.000Z"), NOW);
    await getForecast(LAT, LON, START, new Date(NOW.getTime() + 61 * 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("returns null without calling out when the start is beyond the forecast range", async () => {
    const f = await getForecast(LAT, LON, new Date("2026-11-30T02:00:00.000Z"), NOW);
    expect(f).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when the model has no value for the hour", async () => {
    fetchMock.mockResolvedValueOnce(openMeteo("2026-10-10T02:00", null, null));
    expect(await getForecast(LAT, LON, START, NOW)).toBeNull();
  });

  it("throws a ForecastError when Open-Meteo fails, and caches nothing", async () => {
    fetchMock.mockResolvedValueOnce(new Response("down", { status: 503 }));
    await expect(getForecast(LAT, LON, START, NOW)).rejects.toBeInstanceOf(ForecastError);
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    await expect(getForecast(LAT, LON, START, NOW)).rejects.toThrow(/could not be reached/);
    await getForecast(LAT, LON, START, NOW);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses the commercial customer API when OPEN_METEO_API_KEY is set", async () => {
    process.env.OPEN_METEO_API_KEY = "om-test-key";
    await getForecast(LAT, LON, START, NOW);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe(OPEN_METEO_CUSTOMER_URL);
    expect(url.searchParams.get("apikey")).toBe("om-test-key");
  });
});

describe("helpers", () => {
  it("floors a start time to its UTC hour", () => {
    expect(forecastHour(new Date("2026-10-10T02:45:12.345Z")).toISOString()).toBe(
      "2026-10-10T02:00:00.000Z",
    );
  });

  it("describes WMO weather codes in plain words", () => {
    expect(describeWeatherCode(0)).toBe("Sunny");
    expect(describeWeatherCode(3)).toBe("Cloudy");
    expect(describeWeatherCode(63)).toBe("Showers");
    expect(describeWeatherCode(95)).toBe("Thunderstorms");
    expect(describeWeatherCode(42)).toBe("Mixed conditions");
  });
});

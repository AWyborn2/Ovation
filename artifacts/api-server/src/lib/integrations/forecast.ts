import { env } from "../../config";

/**
 * Match-day forecasts (Social Studio U19, R22; KTD14) from Open-Meteo's
 * Bureau of Meteorology model (ACCESS-G, `models=bom_access_global`) for a
 * venue's coordinates and the fixture's start hour.
 *
 * Open-Meteo's free API needs no key but is non-commercial only; setting
 * OPEN_METEO_API_KEY switches to the commercial customer API, which is needed
 * before Ovation charges clubs. Only coordinates and an hour are sent.
 *
 * Results are cached in-process per venue (coordinates to ~100 m) and hour for
 * an hour, so a panel re-opening or several admins viewing the same fixture
 * make one upstream call.
 */
export const OPEN_METEO_FREE_URL = "https://api.open-meteo.com/v1/forecast";
export const OPEN_METEO_CUSTOMER_URL = "https://customer-api.open-meteo.com/v1/forecast";
export const FORECAST_ATTRIBUTION = "Weather data by Open-Meteo.com (BOM ACCESS-G)";

/** How far ahead the BOM model forecasts, and how far back a start hour is still served. */
export const FORECAST_HORIZON_DAYS = 10;
const PAST_GRACE_MS = 24 * 3600_000;
export const FORECAST_CACHE_TTL_MS = 3600_000;
const PROVIDER_TIMEOUT_MS = 15_000;

export type Forecast = {
  /** The forecast hour (UTC, on the hour). */
  hour: string;
  temperatureC: number;
  weatherCode: number;
  conditions: string;
  attribution: string;
};

export class ForecastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForecastError";
  }
}

/** WMO weather interpretation codes (as Open-Meteo returns them) in plain words. */
export function describeWeatherCode(code: number): string {
  if (code === 0) return "Sunny";
  if (code === 1) return "Mostly sunny";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code === 61 || code === 80) return "Light showers";
  if (code === 63 || code === 81) return "Showers";
  if (code === 65 || code === 82) return "Heavy rain";
  if (code === 66 || code === 67) return "Freezing rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "Snow";
  if (code === 95) return "Thunderstorms";
  if (code === 96 || code === 99) return "Storms with hail";
  return "Mixed conditions";
}

/** The start time floored to its UTC hour. */
export function forecastHour(startAt: Date): Date {
  const d = new Date(startAt.getTime());
  d.setUTCMinutes(0, 0, 0);
  return d;
}

/** Open-Meteo's `start_hour` / `end_hour` format in GMT: `YYYY-MM-DDTHH:00`. */
function isoHour(d: Date): string {
  return d.toISOString().slice(0, 13) + ":00";
}

const cache = new Map<string, { at: number; value: Forecast }>();

/** Test seam: forget every cached forecast. */
export function clearForecastCache(): void {
  cache.clear();
}

export function forecastCacheKey(latitude: number, longitude: number, hour: Date): string {
  return `${latitude.toFixed(3)},${longitude.toFixed(3)}@${isoHour(hour)}`;
}

/**
 * The forecast for a venue at a start time, or null when the hour is outside
 * the model's range (more than FORECAST_HORIZON_DAYS ahead, or already a day
 * past) or the model has no value for it. Throws ForecastError when Open-Meteo
 * fails.
 */
export async function getForecast(
  latitude: number,
  longitude: number,
  startAt: Date,
  now: Date = new Date(),
): Promise<Forecast | null> {
  const hour = forecastHour(startAt);
  const ahead = hour.getTime() - now.getTime();
  if (ahead > FORECAST_HORIZON_DAYS * 24 * 3600_000 || ahead < -PAST_GRACE_MS) return null;

  const key = forecastCacheKey(latitude, longitude, hour);
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < FORECAST_CACHE_TTL_MS) return hit.value;

  const apiKey = env.OPEN_METEO_API_KEY();
  const url = new URL(apiKey ? OPEN_METEO_CUSTOMER_URL : OPEN_METEO_FREE_URL);
  url.searchParams.set("latitude", latitude.toFixed(4));
  url.searchParams.set("longitude", longitude.toFixed(4));
  url.searchParams.set("hourly", "temperature_2m,weather_code");
  url.searchParams.set("models", "bom_access_global");
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("start_hour", isoHour(hour));
  url.searchParams.set("end_hour", isoHour(hour));
  if (apiKey) url.searchParams.set("apikey", apiKey);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  } catch {
    throw new ForecastError("The forecast service could not be reached.");
  }
  if (!res.ok) throw new ForecastError(`The forecast service responded ${res.status}.`);
  const body = (await res.json().catch(() => null)) as {
    hourly?: {
      time?: string[];
      temperature_2m?: (number | null)[];
      weather_code?: (number | null)[];
    };
  } | null;
  const hourly = body?.hourly;
  const i = hourly?.time?.indexOf(isoHour(hour)) ?? -1;
  const temperature = i >= 0 ? hourly?.temperature_2m?.[i] : null;
  const code = i >= 0 ? hourly?.weather_code?.[i] : null;
  if (typeof temperature !== "number" || typeof code !== "number") return null;

  const value: Forecast = {
    hour: hour.toISOString(),
    temperatureC: Math.round(temperature),
    weatherCode: code,
    conditions: describeWeatherCode(code),
    attribution: FORECAST_ATTRIBUTION,
  };
  cache.set(key, { at: now.getTime(), value });
  return value;
}

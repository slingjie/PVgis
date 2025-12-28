import { fetchJson } from "@/lib/http";
import { parsePvgisTimeToIsoUtc } from "@/lib/time";
import type { IrradiancePoint, IrradianceResponse } from "@/lib/types";

const PVGIS_BASE_URL = process.env.PVGIS_BASE_URL ?? "https://re.jrc.ec.europa.eu/api/v5_3";

type PvgisTmyResponse = {
  inputs: unknown;
  outputs: {
    tmy_hourly: Array<Record<string, number | string | null>>;
  };
};

type PvgisSeriesResponse = {
  inputs: unknown;
  outputs: {
    hourly: Array<Record<string, number | string | null>>;
  };
};

type PvgisSeriesInputsMounting = {
  mounting_system?: {
    fixed?: {
      slope?: { value?: number; optimal?: boolean };
      azimuth?: { value?: number; optimal?: boolean };
      type?: string;
    };
  };
};

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeExtras(raw: Record<string, number | string | null>, skipKeys: Set<string>): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (skipKeys.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function fetchPvgisTmy(lat: number, lon: number): Promise<IrradianceResponse> {
  const url = new URL(`${PVGIS_BASE_URL}/tmy`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("outputformat", "json");

  const json = await fetchJson<PvgisTmyResponse>(url.toString(), { timeoutMs: 20_000, retries: 1 });
  const rows = json.outputs.tmy_hourly ?? [];

  const data: IrradiancePoint[] = rows.map((r) => {
    const timeKey = "time(UTC)";
    const rawTime = r[timeKey];
    if (typeof rawTime !== "string") throw new Error("PVGIS TMY missing time(UTC)");

    const ghi = numberOrNull(r["G(h)"]);
    const dni = numberOrNull(r["Gb(n)"]);
    const dhi = numberOrNull(r["Gd(h)"]);

    const skip = new Set([timeKey, "G(h)", "Gb(n)", "Gd(h)"]);
    return {
      time: parsePvgisTimeToIsoUtc(rawTime),
      ghi,
      dni,
      dhi,
      extras: normalizeExtras(r, skip)
    };
  });

  return {
    metadata: {
      source: "pvgis",
      queryType: "tmy",
      lat,
      lon,
      timeRef: "UTC",
      unit: { irradiance: "W/m2" },
      requestUrl: url.toString(),
      rawInputs: json.inputs
    },
    data
  };
}

export async function fetchPvgisSeries(lat: number, lon: number, startYear: number, endYear: number): Promise<IrradianceResponse> {
  const url = new URL(`${PVGIS_BASE_URL}/seriescalc`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("startyear", String(startYear));
  url.searchParams.set("endyear", String(endYear));
  url.searchParams.set("outputformat", "json");
  url.searchParams.set("browser", "0");
  url.searchParams.set("components", "1");

  const json = await fetchJson<PvgisSeriesResponse>(url.toString(), { timeoutMs: 25_000, retries: 1 });
  const rows = json.outputs.hourly ?? [];

  const data: IrradiancePoint[] = rows.map((r) => {
    const rawTime = r.time;
    if (typeof rawTime !== "string") throw new Error("PVGIS series missing time");

    // For seriescalc with components=1, PVGIS often returns plane-of-array components:
    // Gb(i), Gd(i), Gr(i). With slope=0 default, their sum is horizontal global irradiance.
    const gb = numberOrNull(r["Gb(i)"]);
    const gd = numberOrNull(r["Gd(i)"]);
    const gr = numberOrNull(r["Gr(i)"]);
    const ghi = gb !== null || gd !== null || gr !== null ? (gb ?? 0) + (gd ?? 0) + (gr ?? 0) : null;

    const skip = new Set(["time"]);
    return {
      time: parsePvgisTimeToIsoUtc(rawTime),
      ghi,
      dni: null,
      dhi: null,
      extras: normalizeExtras(r, skip)
    };
  });

  return {
    metadata: {
      source: "pvgis",
      queryType: "series",
      lat,
      lon,
      timeRef: "UTC",
      unit: { irradiance: "W/m2" },
      requestUrl: url.toString(),
      rawInputs: json.inputs
    },
    data
  };
}

export type PvgisOptimalSummary = {
  lat: number;
  lon: number;
  startYear: number;
  endYear: number;
  optimalTiltDeg: number | null;
  optimalAzimuthDeg: number | null;
  annualPoaKwhM2: number;
  annualPoaWm2Sum: number;
  rawInputs?: unknown;
  requestUrl?: string;
};

export async function fetchPvgisOptimalSummary(lat: number, lon: number, startYear: number, endYear: number): Promise<PvgisOptimalSummary> {
  const url = new URL(`${PVGIS_BASE_URL}/seriescalc`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("startyear", String(startYear));
  url.searchParams.set("endyear", String(endYear));
  url.searchParams.set("outputformat", "json");
  url.searchParams.set("browser", "0");
  url.searchParams.set("components", "1");
  url.searchParams.set("optimalangles", "1");

  const json = await fetchJson<PvgisSeriesResponse>(url.toString(), { timeoutMs: 25_000, retries: 1 });
  const rows = json.outputs.hourly ?? [];

  let sum = 0;
  for (const r of rows) {
    const gb = numberOrNull(r["Gb(i)"]);
    const gd = numberOrNull(r["Gd(i)"]);
    const gr = numberOrNull(r["Gr(i)"]);
    const poa = (gb ?? 0) + (gd ?? 0) + (gr ?? 0);
    if (Number.isFinite(poa)) sum += poa;
  }

  const inputs = json.inputs as PvgisSeriesInputsMounting;
  const optimalTilt = inputs?.mounting_system?.fixed?.slope?.value;
  const optimalAzimuth = inputs?.mounting_system?.fixed?.azimuth?.value;

  return {
    lat,
    lon,
    startYear,
    endYear,
    optimalTiltDeg: typeof optimalTilt === "number" ? optimalTilt : null,
    optimalAzimuthDeg: typeof optimalAzimuth === "number" ? optimalAzimuth : null,
    annualPoaWm2Sum: sum,
    annualPoaKwhM2: sum / 1000,
    rawInputs: json.inputs,
    requestUrl: url.toString()
  };
}

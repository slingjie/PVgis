import { fetchText } from "@/lib/http";
import type { IrradiancePoint, IrradianceResponse, IrradianceUnit } from "@/lib/types";

const SODA_WPS_BASE_URL = process.env.CAMS_SODA_WPS_URL ?? "https://api.soda-solardata.com/service/wps";

export type CamsIdentifier = "cams_radiation" | "mcclear";
export type CamsTimeStep = "1min" | "15min" | "1h" | "1d" | "1M";

export type FetchCamsSeriesParams = {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  email: string; // SoDa account email
  identifier?: CamsIdentifier;
  timeStep?: CamsTimeStep;
  integrated?: boolean;
};

function numberOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const v = Number(value);
  return Number.isFinite(v) ? v : null;
}

function normalizeExtras(raw: Record<string, string>, skipKeys: Set<string>): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (skipKeys.has(k)) continue;
    const n = Number(v);
    out[k] = Number.isFinite(n) ? n : v;
  }
  return out;
}

function toIsoUtcFromObservationPeriod(value: string): string {
  // CAMS CSV "Observation period" typically looks like:
  // 2025-01-01T00:00:00Z/2025-01-01T01:00:00Z
  const start = value.split("/")[0]?.trim() ?? "";
  if (!start) throw new Error("CAMS CSV missing observation period start");
  const hasTz = /z$/i.test(start) || /[+-]\d{2}:?\d{2}$/.test(start);
  const normalized = hasTz ? start : `${start}Z`;
  const dt = new Date(normalized);
  if (!Number.isFinite(dt.getTime())) throw new Error(`Unsupported CAMS time format: ${value}`);
  return dt.toISOString();
}

function parseCamsCsv(csv: string): { rows: Array<Record<string, string>>; meta: Record<string, string> } {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const meta: Record<string, string> = {};
  let headerLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("#")) {
      const trimmed = line.replace(/^#\s*/, "");
      const m = /^([^:]+):\s*(.*)$/.exec(trimmed);
      if (m) meta[m[1].trim()] = m[2].trim();
      if (/^Observation period\s*;/.test(trimmed)) headerLineIdx = i;
    }
  }

  if (headerLineIdx < 0) throw new Error("CAMS CSV missing header line");
  const headerLine = lines[headerLineIdx]!.replace(/^#\s*/, "");
  const headers = headerLine.split(";").map((h) => h.trim());

  const rows: Array<Record<string, string>> = [];
  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("#")) continue;
    const parts = line.split(";").map((p) => p.trim());
    if (parts.length !== headers.length) continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]!] = parts[j]!;
    rows.push(obj);
  }

  return { rows, meta };
}

export async function fetchCamsSeries(lat: number, lon: number, params: FetchCamsSeriesParams): Promise<IrradianceResponse> {
  const identifier = params.identifier ?? "cams_radiation";
  const timeStep = params.timeStep ?? "1h";
  const integrated = params.integrated ?? false;

  if (!params.email.trim()) throw new Error("CAMS requires SoDa email (set CAMS_SODA_EMAIL or pass email)");

  const emailEscaped = params.email.trim().replaceAll("@", "%2540");

  const url = new URL(SODA_WPS_BASE_URL);
  url.searchParams.set(
    "DataInputs",
    [
      `latitude=${lat}`,
      `longitude=${lon}`,
      "altitude=-999",
      `date_begin=${params.start}`,
      `date_end=${params.end}`,
      "time_ref=UT",
      `time_step=${timeStep}`,
      `email=${emailEscaped}`,
      "verbose=false",
      "outputformat=csv",
      `integrated=${integrated ? "true" : "false"}`
    ].join(";")
  );
  url.searchParams.set("Service", "WPS");
  url.searchParams.set("Request", "Execute");
  url.searchParams.set("Identifier", `get_${identifier}`);
  url.searchParams.set("version", "1.0.0");
  url.searchParams.set("RawDataOutput", "irradiation");

  const csv = await fetchText(url.toString(), { timeoutMs: 30_000, retries: 1 });
  const { rows, meta } = parseCamsCsv(csv);

  const data: IrradiancePoint[] = rows.map((r) => {
    const observationKey = "Observation period";
    const rawTime = r[observationKey];
    if (!rawTime) throw new Error("CAMS CSV missing Observation period column");

    const ghi = numberOrNull(r.GHI);
    const dni = numberOrNull(r.BNI);
    const dhi = numberOrNull(r.DHI);

    const skip = new Set([observationKey, "GHI", "BNI", "DHI"]);
    return {
      time: toIsoUtcFromObservationPeriod(rawTime),
      ghi,
      dni,
      dhi,
      extras: normalizeExtras(r, skip)
    };
  });

  const unit: IrradianceUnit = integrated ? { irradiation: "Wh/m2" } : { irradiance: "W/m2" };

  return {
    metadata: {
      source: "cams",
      queryType: "series",
      lat,
      lon,
      timeRef: "UTC",
      unit,
      provider: "soda",
      requestUrl: url.toString(),
      rawInputs: { params: { ...params, email: undefined }, soda: meta }
    },
    data
  };
}


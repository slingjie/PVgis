import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { fetchCamsSeries } from "@/lib/cams";
import { fetchPvgisSeries } from "@/lib/pvgis";
import { IrradianceSeriesRequestSchema } from "@/lib/schemas";
import type { IrradianceResponse } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = IrradianceSeriesRequestSchema.parse(body);
    if (parsed.source === "pvgis") {
      if (parsed.endYear < parsed.startYear) {
        return NextResponse.json({ error: "endYear must be >= startYear" }, { status: 400 });
      }

      const cacheKey = `pvgis:series:${parsed.lat},${parsed.lon}:${parsed.startYear}-${parsed.endYear}`;
      const cached = cacheGet<IrradianceResponse>(cacheKey);
      if (cached) return NextResponse.json({ ...cached, metadata: { ...cached.metadata, cached: true } });

      const result = await fetchPvgisSeries(parsed.lat, parsed.lon, parsed.startYear, parsed.endYear);
      cacheSet(cacheKey, result, 60 * 60 * 1000);
      return NextResponse.json(result);
    }

    const email = process.env.CAMS_SODA_EMAIL;
    if (!email) return NextResponse.json({ error: "Missing CAMS_SODA_EMAIL in server env" }, { status: 400 });
    if (parsed.end < parsed.start) return NextResponse.json({ error: "end must be >= start" }, { status: 400 });

    const cacheKey = `cams:series:${parsed.lat},${parsed.lon}:${parsed.start}:${parsed.end}:${parsed.timeStep ?? "1h"}:${parsed.identifier ?? "cams_radiation"}:${
      parsed.integrated ? "1" : "0"
    }`;
    const cached = cacheGet<IrradianceResponse>(cacheKey);
    if (cached) return NextResponse.json({ ...cached, metadata: { ...cached.metadata, cached: true } });

    const result = await fetchCamsSeries(parsed.lat, parsed.lon, {
      start: parsed.start,
      end: parsed.end,
      timeStep: parsed.timeStep,
      identifier: parsed.identifier,
      integrated: parsed.integrated,
      email
    });
    cacheSet(cacheKey, result, 60 * 60 * 1000);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const m = /between\s+(\d{4})\s+and\s+(\d{4})/i.exec(message);
    if (m) {
      const yearMin = Number(m[1]);
      const yearMax = Number(m[2]);
      if (Number.isFinite(yearMin) && Number.isFinite(yearMax)) {
        return NextResponse.json(
          {
            error: message,
            yearMin,
            yearMax
          },
          { status: 400 }
        );
      }
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

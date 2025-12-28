import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { IrradianceOptimalRequestSchema } from "@/lib/schemas";
import { fetchPvgisOptimalSummary } from "@/lib/pvgis";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = IrradianceOptimalRequestSchema.parse(body);

    const year = parsed.year ?? new Date().getUTCFullYear() - 1;
    const startYear = year;
    const endYear = year;

    const cacheKey = `pvgis:optimal:${parsed.lat},${parsed.lon}:${startYear}-${endYear}`;
    const cached = cacheGet<unknown>(cacheKey);
    if (cached) return NextResponse.json({ ...(cached as any), cached: true });

    const summary = await fetchPvgisOptimalSummary(parsed.lat, parsed.lon, startYear, endYear);
    cacheSet(cacheKey, summary, 12 * 60 * 60 * 1000);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

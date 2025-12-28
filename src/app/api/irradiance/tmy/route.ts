import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { fetchPvgisTmy } from "@/lib/pvgis";
import { IrradianceTmyRequestSchema } from "@/lib/schemas";
import type { IrradianceResponse } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = IrradianceTmyRequestSchema.parse(body);

    const cacheKey = `pvgis:tmy:${parsed.lat},${parsed.lon}`;
    const cached = cacheGet<IrradianceResponse>(cacheKey);
    if (cached) return NextResponse.json({ ...cached, metadata: { ...cached.metadata, cached: true } });

    const result = await fetchPvgisTmy(parsed.lat, parsed.lon);
    cacheSet(cacheKey, result, 12 * 60 * 60 * 1000);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


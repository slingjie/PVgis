import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { geocodeAddressWithCountryCodes } from "@/lib/geocode";
import { GeocodeRequestSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = GeocodeRequestSchema.parse(body);
    const limit = parsed.limit ?? 5;
    const countryCodes = parsed.countryCodes;

    const cacheKey = `geocode:nominatim:${parsed.query}:${limit}:${countryCodes ?? "all"}`;
    const cached = cacheGet<unknown>(cacheKey);
    if (cached) return NextResponse.json(cached);

    const { requestUrl, candidates } = await geocodeAddressWithCountryCodes(parsed.query, limit, countryCodes);
    const result = { requestUrl, candidates, countryCodes: countryCodes ?? null };

    cacheSet(cacheKey, result, 24 * 60 * 60 * 1000);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

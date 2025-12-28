import { fetchJson } from "@/lib/http";

export type GeocodeCandidate = {
  lat: number;
  lon: number;
  displayName: string;
  provider: "nominatim";
  confidence: number | null;
};

type NominatimItem = {
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
};

export async function geocodeAddress(query: string, limit = 5): Promise<GeocodeCandidate[]> {
  const baseUrl = process.env.NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org/search";
  const url = new URL(baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", process.env.GEOCODE_LANGUAGE ?? "zh-CN");

  const ua = process.env.GEOCODE_USER_AGENT ?? "pvgis-irradiance-web/0.1 (local dev)";
  const items = await fetchJson<NominatimItem[]>(url.toString(), {
    timeoutMs: 15_000,
    retries: 1,
    headers: { "User-Agent": ua }
  });

  return (items ?? []).map((it) => ({
    lat: Number(it.lat),
    lon: Number(it.lon),
    displayName: it.display_name,
    provider: "nominatim",
    confidence: typeof it.importance === "number" ? it.importance : null
  }));
}

export async function geocodeAddressWithCountryCodes(
  query: string,
  limit: number,
  countryCodes?: string
): Promise<{ requestUrl: string; candidates: GeocodeCandidate[] }> {
  const baseUrl = process.env.NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org/search";
  const url = new URL(baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", process.env.GEOCODE_LANGUAGE ?? "zh-CN");
  if (countryCodes) url.searchParams.set("countrycodes", countryCodes);

  const ua = process.env.GEOCODE_USER_AGENT ?? "pvgis-irradiance-web/0.1 (local dev)";
  const items = await fetchJson<NominatimItem[]>(url.toString(), {
    timeoutMs: 15_000,
    retries: 1,
    headers: { "User-Agent": ua }
  });

  const candidates: GeocodeCandidate[] = (items ?? []).map((it) => ({
    lat: Number(it.lat),
    lon: Number(it.lon),
    displayName: it.display_name,
    provider: "nominatim" as const,
    confidence: typeof it.importance === "number" ? it.importance : null
  }));

  return { requestUrl: url.toString(), candidates };
}

export function parsePvgisTimeToIsoUtc(value: string): string {
  // PVGIS commonly uses "YYYYMMDD:HHMM" (and in TMY: "time(UTC)" key).
  const m = /^(\d{4})(\d{2})(\d{2}):(\d{2})(\d{2})$/.exec(value.trim());
  if (!m) throw new Error(`Unsupported PVGIS time format: ${value}`);
  const [, y, mo, d, hh, mm] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), 0));
  return dt.toISOString();
}


"use client";

import { useEffect, useMemo, useState } from "react";
import type { IrradianceResponse } from "@/lib/types";
import { BarChart } from "@/app/ui/BarChart";
import { LineChart } from "@/app/ui/LineChart";

type LocationMode = "address" | "coords";
type QueryType = "tmy" | "series";
type TimeMode = "cn" | "utc";

type Candidate = {
  lat: number;
  lon: number;
  displayName: string;
  provider: string;
  confidence: number | null;
};

type GeocodeDebug = {
  requestUrl: string | null;
  countryCodes: string | null;
  query: string;
};

function normalizeLabel(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function truncateLabel(s: string, max = 90) {
  const v = normalizeLabel(s);
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

type OptimalSummary = {
  lat: number;
  lon: number;
  startYear: number;
  endYear: number;
  optimalTiltDeg: number | null;
  optimalAzimuthDeg: number | null;
  annualPoaKwhM2: number;
  cached?: boolean;
  requestUrl?: string;
};

function formatNumber(v: number | null | undefined, digits = 2) {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function getChinaParts(valueIsoUtc: string): { y: number; m: number; d: number; hh: number; mm: number; ss: number } | null {
  const date = new Date(valueIsoUtc);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const hh = Number(get("hour"));
  const mm = Number(get("minute"));
  const ss = Number(get("second"));
  if (![y, m, d, hh, mm, ss].every((n) => Number.isFinite(n))) return null;
  return { y, m, d, hh, mm, ss };
}

function getUtcParts(valueIsoUtc: string): { y: number; m: number; d: number; hh: number; mm: number; ss: number } | null {
  const date = new Date(valueIsoUtc);
  if (!Number.isFinite(date.getTime())) return null;
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
    hh: date.getUTCHours(),
    mm: date.getUTCMinutes(),
    ss: date.getUTCSeconds()
  };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dayKeyFromParts(p: { y: number; m: number; d: number }) {
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

function formatChinaTime(valueIsoUtc: string): string {
  const parts = getChinaParts(valueIsoUtc);
  if (!parts) return valueIsoUtc;
  // China standard time is UTC+08:00 (no DST)
  return `${parts.y}-${pad2(parts.m)}-${pad2(parts.d)}T${pad2(parts.hh)}:${pad2(parts.mm)}:${pad2(parts.ss)}+08:00`;
}

function buildCsv(result: IrradianceResponse): string {
  const extrasKeys = new Set<string>();
  for (const row of result.data) {
    for (const k of Object.keys(row.extras ?? {})) extrasKeys.add(k);
  }
  const extras = Array.from(extrasKeys);

  const header = ["time_cn", "time_utc", "ghi", "dni", "dhi", ...extras].map(csvCell).join(",");
  const lines = [header];
  for (const row of result.data) {
    const base = [
      formatChinaTime(row.time),
      row.time,
      row.ghi ?? "",
      row.dni ?? "",
      row.dhi ?? "",
      ...extras.map((k) => (row.extras?.[k] ?? "") as any)
    ];
    lines.push(base.map(csvCell).join(","));
  }

  // Add metadata as commented JSON at the top (Excel-friendly enough).
  const meta = `# metadata=${safeJsonStringify({ ...result.metadata, exportTimeRef: "Asia/Shanghai", exportOffset: "+08:00" })}`;
  return [meta, ...lines].join("\n");
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildOsmEmbedUrl(lat: number, lon: number): { embed: string; view: string } {
  // Simple bbox around the marker; good enough for verification.
  const dLat = 0.02;
  const dLon = 0.02;
  const left = lon - dLon;
  const right = lon + dLon;
  const top = lat + dLat;
  const bottom = lat - dLat;
  const bbox = `${left},${bottom},${right},${top}`;
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(
    `${lat},${lon}`
  )}`;
  const view = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(lat))}&mlon=${encodeURIComponent(String(lon))}#map=14/${encodeURIComponent(
    String(lat)
  )}/${encodeURIComponent(String(lon))}`;
  return { embed, view };
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function App() {
  const [mode, setMode] = useState<LocationMode>("address");
  const [queryType, setQueryType] = useState<QueryType>("tmy");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [geocodeScope, setGeocodeScope] = useState<"cn" | "global">("cn");
  const [startYear, setStartYear] = useState("2020");
  const [endYear, setEndYear] = useState("2020");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateIdx, setCandidateIdx] = useState("0");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IrradianceResponse | null>(null);
  const [optimal, setOptimal] = useState<OptimalSummary | null>(null);
  const [optimalError, setOptimalError] = useState<string | null>(null);
  const [geocodeDebug, setGeocodeDebug] = useState<GeocodeDebug>({ requestUrl: null, countryCodes: "cn", query: "" });
  const [showDebug, setShowDebug] = useState(false);
  const [confirmLocation, setConfirmLocation] = useState(false);
  const [copiedHint, setCopiedHint] = useState<string | null>(null);

  const [monthFilter, setMonthFilter] = useState<number | "all">("all");
  const [timeMode, setTimeMode] = useState<TimeMode>("cn");
  const [chartDay, setChartDay] = useState<string>(""); // YYYY-MM-DD in chosen time mode
  const [tableFollowChartDay, setTableFollowChartDay] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 100;

  const selectedCandidate = candidates[Number(candidateIdx) ?? 0];

  const resolvedLat = useMemo(() => {
    if (mode === "coords") return Number(lat);
    if (selectedCandidate) return selectedCandidate.lat;
    return NaN;
  }, [mode, lat, selectedCandidate]);

  const resolvedLon = useMemo(() => {
    if (mode === "coords") return Number(lon);
    if (selectedCandidate) return selectedCandidate.lon;
    return NaN;
  }, [mode, lon, selectedCandidate]);

  const filteredRows = useMemo(() => {
    if (!result) return [];
    const rows = result.data;
    const withMonth =
      monthFilter === "all"
        ? rows
        : rows.filter((r) => {
            const parts = timeMode === "utc" ? getUtcParts(r.time) : getChinaParts(r.time);
            if (!parts) return false;
            return parts.m === monthFilter;
          });

    if (!tableFollowChartDay || !chartDay) return withMonth;
    return withMonth.filter((r) => {
      const parts = timeMode === "utc" ? getUtcParts(r.time) : getChinaParts(r.time);
      if (!parts) return false;
      return dayKeyFromParts(parts) === chartDay;
    });
  }, [result, monthFilter, timeMode, chartDay, tableFollowChartDay]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredRows.length / pageSize)), [filteredRows.length]);
  const pageRows = useMemo(() => filteredRows.slice((page - 1) * pageSize, page * pageSize), [filteredRows, page]);

  const monthlySeries = useMemo((): { out: Array<{ month: number; kwh_m2: number }>; usedKey: "ghi" | "extras:Gb(i)+Gd(i)+Gr(i)" | "extras:Int" | null } => {
    if (!result) return { out: [], usedKey: null };
    const sums = Array.from({ length: 12 }, () => 0);
    let usedKey: "ghi" | "extras:Gb(i)+Gd(i)+Gr(i)" | "extras:Int" | null = null;

    for (const r of result.data) {
      const parts = timeMode === "utc" ? getUtcParts(r.time) : getChinaParts(r.time);
      if (!parts) continue;
      const m = parts.m - 1;
      let v: number | null = r.ghi;
      if (v !== null && v !== undefined) usedKey = "ghi";
      if (v === null || v === undefined) {
        const gb = typeof r.extras?.["Gb(i)"] === "number" ? (r.extras["Gb(i)"] as number) : null;
        const gd = typeof r.extras?.["Gd(i)"] === "number" ? (r.extras["Gd(i)"] as number) : null;
        const gr = typeof r.extras?.["Gr(i)"] === "number" ? (r.extras["Gr(i)"] as number) : null;
        if (gb !== null || gd !== null || gr !== null) {
          v = (gb ?? 0) + (gd ?? 0) + (gr ?? 0);
          usedKey = usedKey ?? "extras:Gb(i)+Gd(i)+Gr(i)";
        } else if (typeof r.extras?.Int === "number") {
          v = r.extras.Int as number;
          usedKey = usedKey ?? "extras:Int";
        }
      }
      if (typeof v === "number" && Number.isFinite(v)) sums[m] += v;
    }

    // NOTE: PVGIS fields can be W/m² (hourly average). Here we show a simple sum/1000 as a rough monthly kWh/m² index.
    const out = sums.map((s, idx) => ({
      month: idx + 1,
      kwh_m2: s / 1000
    }));
    return { out, usedKey };
  }, [result, timeMode]);

  useEffect(() => {
    // Keep chartDay in sync when data/time mode/month filter changes.
    if (!result) {
      setChartDay("");
      return;
    }
    const rows = result.data;
    const firstInMonth =
      monthFilter === "all"
        ? rows[0]
        : rows.find((r) => {
            const parts = timeMode === "utc" ? getUtcParts(r.time) : getChinaParts(r.time);
            return parts ? parts.m === monthFilter : false;
          });
    if (!firstInMonth) {
      setChartDay("");
      return;
    }
    const parts = timeMode === "utc" ? getUtcParts(firstInMonth.time) : getChinaParts(firstInMonth.time);
    if (!parts) return;
    setChartDay(dayKeyFromParts(parts));
    setPage(1);
  }, [result, monthFilter, timeMode]);

  const annualHorizontalKwhM2 = useMemo(() => {
    if (!result) return null;
    let sum = 0;
    let used = false;
    for (const r of result.data) {
      const v = typeof r.ghi === "number" ? r.ghi : null;
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += v;
        used = true;
      }
    }
    if (!used) return null;
    return sum / 1000;
  }, [result]);

  const dailySeries = useMemo(() => {
    if (!result) return null;
    const rows = result.data;
    if (rows.length === 0) return null;

    if (!chartDay) return null;
    const [yy, mm, dd] = chartDay.split("-").map((x) => Number(x));
    if (![yy, mm, dd].every((n) => Number.isFinite(n))) return null;

    const dayStart =
      timeMode === "utc"
        ? Date.UTC(yy, mm - 1, dd, 0, 0, 0)
        : Date.UTC(yy, mm - 1, dd, 0, 0, 0) - 8 * 60 * 60 * 1000; // China is UTC+8
    const dayEnd =
      timeMode === "utc"
        ? Date.UTC(yy, mm - 1, dd, 23, 59, 59)
        : Date.UTC(yy, mm - 1, dd, 23, 59, 59) - 8 * 60 * 60 * 1000;

    const dayRows = rows.filter((r) => {
      const t = Date.parse(r.time);
      return t >= dayStart && t <= dayEnd;
    });

    const points = dayRows
      .map((r) => {
        const parts = timeMode === "utc" ? getUtcParts(r.time) : getChinaParts(r.time);
        const hour = parts?.hh ?? 0;
        const minute = parts?.mm ?? 0;
        const x = hour * 60 + minute; // minutes since midnight (for better granularity)
        const v =
          typeof r.ghi === "number"
            ? r.ghi
            : typeof r.extras?.["Gb(i)"] === "number" || typeof r.extras?.["Gd(i)"] === "number" || typeof r.extras?.["Gr(i)"] === "number"
              ? ((typeof r.extras?.["Gb(i)"] === "number" ? (r.extras["Gb(i)"] as number) : 0) +
                (typeof r.extras?.["Gd(i)"] === "number" ? (r.extras["Gd(i)"] as number) : 0) +
                (typeof r.extras?.["Gr(i)"] === "number" ? (r.extras["Gr(i)"] as number) : 0))
              : typeof r.extras?.Int === "number"
                ? (r.extras.Int as number)
                : null;
        return { x, y: typeof v === "number" && Number.isFinite(v) ? v : 0 };
      })
      .sort((a, b) => a.x - b.x);

    return {
      dateLabel: `${chartDay} (${timeMode === "utc" ? "UTC" : "CN"})`,
      points
    };
  }, [result, timeMode, chartDay]);

  async function handleGeocode() {
    setError(null);
    setLoading(true);
    setCandidates([]);
    setCandidateIdx("0");
    setConfirmLocation(false);
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: address,
          limit: 5,
          countryCodes: geocodeScope === "cn" ? "cn" : undefined
        })
      });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json?.error ?? "geocode failed");
      setGeocodeDebug({
        requestUrl: typeof json?.requestUrl === "string" ? json.requestUrl : null,
        countryCodes: typeof json?.countryCodes === "string" ? json.countryCodes : null,
        query: address
      });
      setCandidates(json.candidates ?? []);
      if (!json.candidates?.length) setError("未解析到位置：请补充城市/区县或改用经纬度。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "geocode failed");
    } finally {
      setLoading(false);
    }
  }

  async function geocodeInline(query: string): Promise<Candidate[]> {
    if (query.trim().length < 2) throw new Error("请输入更完整的地址（至少 2 个字符）。");
    const res = await fetch("/api/geocode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        limit: 5,
        countryCodes: geocodeScope === "cn" ? "cn" : undefined
      })
    });
    const json = (await res.json()) as any;
    if (!res.ok) throw new Error(json?.error ?? "geocode failed");
    setGeocodeDebug({
      requestUrl: typeof json?.requestUrl === "string" ? json.requestUrl : null,
      countryCodes: typeof json?.countryCodes === "string" ? json.countryCodes : null,
      query
    });
    return (json.candidates ?? []) as Candidate[];
  }

  async function handleQuery() {
    setError(null);
    setLoading(true);
    setResult(null);
    setPage(1);

    try {
      let latNum = resolvedLat;
      let lonNum = resolvedLon;

      if (mode === "address" && (!Number.isFinite(latNum) || !Number.isFinite(lonNum))) {
        const cs = await geocodeInline(address);
        setCandidates(cs);
        setCandidateIdx("0");
        setConfirmLocation(false);
        latNum = cs[0]?.lat ?? NaN;
        lonNum = cs[0]?.lon ?? NaN;
      }

      if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
        throw new Error("缺少合法经纬度：请先解析地址或直接输入 lat/lon。");
      }

      if (mode === "address" && candidates.length > 0 && !confirmLocation) {
        throw new Error("请先确认候选位置坐标（勾选“我已确认该坐标用于查询”），再发起数据查询。");
      }

      if (queryType === "tmy") {
        const res = await fetch("/api/irradiance/tmy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lat: latNum, lon: lonNum })
        });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.error ?? "tmy query failed");
        setResult(json as IrradianceResponse);
        return;
      }

      const sy = Number(startYear);
      const ey = Number(endYear);
      if (!Number.isInteger(sy) || !Number.isInteger(ey) || sy < 1990 || ey < 1990 || sy > 2100 || ey > 2100) {
        throw new Error("请输入合法年份（1990–2100）。");
      }
      const res = await fetch("/api/irradiance/series", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat: latNum, lon: lonNum, startYear: sy, endYear: ey })
      });
      const json = (await res.json()) as any;
      if (!res.ok) {
        if (typeof json?.yearMin === "number" && typeof json?.yearMax === "number") {
          setStartYear(String(json.yearMin));
          setEndYear(String(json.yearMax));
          throw new Error(`PVGIS 该地点可用年份范围为 ${json.yearMin}–${json.yearMax}，已自动填入范围，请重新点击查询。`);
        }
        throw new Error(json?.error ?? "series query failed");
      }
      setResult(json as IrradianceResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "query failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let canceled = false;
    async function loadOptimal() {
      setOptimal(null);
      setOptimalError(null);
      if (!result) return;
      if (result.metadata.source !== "pvgis") return;
      // For MVP we show optimal tilt summary when we have a resolved location.
      // Pick PVGIS tmy year_max if present, else default to last year.
      const rawInputs: any = result.metadata.rawInputs as any;
      const yearMax = rawInputs?.meteo_data?.year_max;
      const year = typeof yearMax === "number" ? yearMax : new Date().getUTCFullYear() - 1;
      try {
        const res = await fetch("/api/irradiance/optimal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lat: result.metadata.lat, lon: result.metadata.lon, year })
        });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.error ?? "optimal query failed");
        if (!canceled) setOptimal(json as OptimalSummary);
      } catch (e) {
        if (!canceled) setOptimalError(e instanceof Error ? e.message : "optimal query failed");
      }
    }
    void loadOptimal();
    return () => {
      canceled = true;
    };
  }, [result]);

  useEffect(() => {
    if (!copiedHint) return;
    const t = setTimeout(() => setCopiedHint(null), 1200);
    return () => clearTimeout(t);
  }, [copiedHint]);

  return (
    <main className="grid" style={{ gap: 16 }}>
      <div style={{ display: "grid", gap: 6, marginBottom: 4 }}>
        <h1>太阳辐照数据查询（PVGIS）</h1>
        <p>
          一期 MVP：地址/经纬度 → 查询 PVGIS 典型年（TMY）或逐时序列（Series），展示图表与表格并导出 CSV。
        </p>
      </div>

      <section className="grid cols-2">
        <div className="card">
          <h2>查询</h2>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="pill">数据源：PVGIS</span>
            <span className="pill">数据时间基准：UTC</span>
            <span className="pill">显示：{timeMode === "utc" ? "UTC" : "中国时间"}</span>
          </div>

          <div className="row">
            <div className="field">
              <div className="label">位置输入方式</div>
              <select value={mode} onChange={(e) => setMode(e.target.value as LocationMode)}>
                <option value="address">地址/公司名称（后端解析）</option>
                <option value="coords">经纬度</option>
              </select>
            </div>

            <div className="field">
              <div className="label">查询类型</div>
              <select value={queryType} onChange={(e) => setQueryType(e.target.value as QueryType)}>
                <option value="tmy">典型年（TMY，8760）</option>
                <option value="series">逐时序列（SeriesCalc）</option>
              </select>
            </div>
          </div>

          {mode === "address" ? (
            <div className="row" style={{ marginTop: 10 }}>
              <div className="field" style={{ minWidth: 360 }}>
                <div className="label">地址/公司名称（建议包含城市/区县）</div>
                <input
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setConfirmLocation(false);
                  }}
                  placeholder="例：某某公司 杭州 余杭区"
                />
              </div>
              <div className="field" style={{ minWidth: 180, flex: 0 }}>
                <div className="label">解析范围</div>
                <select value={geocodeScope} onChange={(e) => setGeocodeScope(e.target.value as any)}>
                  <option value="cn">中国优先</option>
                  <option value="global">全球</option>
                </select>
              </div>
              <button className="secondary" disabled={loading || address.trim().length < 2} onClick={handleGeocode}>
                解析地址
              </button>
            </div>
          ) : (
            <div className="row" style={{ marginTop: 10 }}>
              <div className="field">
                <div className="label">纬度 lat</div>
                <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="例：30.27" />
              </div>
              <div className="field">
                <div className="label">经度 lon</div>
                <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="例：120.15" />
              </div>
            </div>
          )}

          {queryType === "series" ? (
            <div className="row" style={{ marginTop: 10 }}>
              <div className="field">
                <div className="label">开始年份</div>
                <input value={startYear} onChange={(e) => setStartYear(e.target.value)} placeholder="2020" />
              </div>
              <div className="field">
                <div className="label">结束年份</div>
                <input value={endYear} onChange={(e) => setEndYear(e.target.value)} placeholder="2020" />
              </div>
            </div>
          ) : null}

          {candidates.length ? (
            <div className="row" style={{ marginTop: 10 }}>
              <div className="field" style={{ minWidth: 360 }}>
                <div className="label">候选位置（选择后用于查询）</div>
                <div className="candidateList" role="list">
                  {candidates.map((c, idx) => {
                    const id = String(idx);
                    const selected = candidateIdx === id;
                    return (
                      <label key={`${c.lat},${c.lon},${idx}`} className={`candidateItem ${selected ? "selected" : ""}`}>
                        <input
                          type="radio"
                          name="candidate"
                          value={id}
                          checked={selected}
                          onChange={(e) => {
                            setCandidateIdx(e.target.value);
                            setConfirmLocation(false);
                          }}
                        />
                        <div className="candidateText">
                          <div className="candidateTitle">
                            {truncateLabel(c.displayName, 70)}{" "}
                            <span className="candidateCoord">
                              ({c.lat.toFixed(5)}, {c.lon.toFixed(5)})
                            </span>
                          </div>
                          <div className="candidateSub" title={normalizeLabel(c.displayName)}>
                            {normalizeLabel(c.displayName)}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="pill">
                lat/lon：{formatNumber(selectedCandidate?.lat, 5)},{formatNumber(selectedCandidate?.lon, 5)}
              </div>
              {selectedCandidate?.displayName ? (
                <div className="pill" title={normalizeLabel(selectedCandidate.displayName)}>
                  {truncateLabel(selectedCandidate.displayName, 60)}
                </div>
              ) : null}
              <label className="pill" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={confirmLocation} onChange={(e) => setConfirmLocation(e.target.checked)} />
                我已确认该坐标用于查询
              </label>
            </div>
          ) : null}

          <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
            <button disabled={loading || (mode === "address" && candidates.length > 0 && !confirmLocation)} onClick={handleQuery}>
              {loading ? "查询中…" : "查询辐照数据"}
            </button>
            {result ? (
              <button
                className="secondary"
                onClick={() => downloadText(`irradiance_${result.metadata.queryType}_${result.metadata.lat}_${result.metadata.lon}.csv`, buildCsv(result))}
              >
                导出 CSV
              </button>
              ) : null}
          </div>

          {error ? (
            <div className="error" style={{ marginTop: 10 }}>
              {error}
            </div>
          ) : null}
        </div>

        <div className="card">
          <h2>概览</h2>
          {!result ? (
            <p>请先发起查询。</p>
          ) : (
            <div className="grid" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="pill">
                  坐标：{result.metadata.lat.toFixed(5)}, {result.metadata.lon.toFixed(5)}
                </span>
                {result.metadata.cached ? <span className="pill">缓存命中</span> : <span className="pill">实时请求</span>}
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="pill">类型：{result.metadata.queryType.toUpperCase()}</span>
                <span className="pill">记录数：{result.data.length}</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="pill">字段：GHI/DNI/DHI + extras</span>
                <span className="pill">单位：{result.metadata.unit.irradiance ?? "—"}</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="pill">最佳倾角：{optimal ? `${optimal.optimalTiltDeg ?? "—"}°` : "加载中…"}</span>
                <span className="pill">最佳方位角：{optimal ? `${optimal.optimalAzimuthDeg ?? "—"}°` : "加载中…"}</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="pill">
                  年水平面辐照量：{annualHorizontalKwhM2 !== null ? `${annualHorizontalKwhM2.toFixed(1)} kWh/m²` : "—"}
                </span>
                <span className="pill">
                  年最佳倾角面辐照量：{optimal ? `${optimal.annualPoaKwhM2.toFixed(1)} kWh/m²` : "加载中…"}
                </span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <button className="secondary" onClick={() => setShowDebug((v) => !v)}>
                  {showDebug ? "隐藏调试信息" : "显示调试信息"}
                </button>
                {copiedHint ? <span className="pill">{copiedHint}</span> : <span className="pill">可复制 URL/inputs</span>}
              </div>
              {showDebug ? (
                <div className="grid" style={{ gap: 10 }}>
                  <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}>
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                      <span className="pill">位置解析（Geocode）</span>
                      {geocodeDebug.requestUrl ? (
                        <button
                          className="secondary"
                          onClick={async () => {
                            const ok = await copyToClipboard(geocodeDebug.requestUrl ?? "");
                            setCopiedHint(ok ? "已复制 geocode URL" : "复制失败");
                          }}
                        >
                          复制 URL
                        </button>
                      ) : null}
                    </div>
                    <p style={{ fontSize: 12 }}>query：{geocodeDebug.query || "—"}</p>
                    <p style={{ fontSize: 12 }}>countryCodes：{geocodeDebug.countryCodes ?? "all"}</p>
                    <p style={{ fontSize: 12, wordBreak: "break-all" }}>requestUrl：{geocodeDebug.requestUrl ?? "—"}</p>
                  </div>

                  <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}>
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                      <span className="pill">PVGIS 请求</span>
                      {result.metadata.requestUrl ? (
                        <button
                          className="secondary"
                          onClick={async () => {
                            const ok = await copyToClipboard(result.metadata.requestUrl ?? "");
                            setCopiedHint(ok ? "已复制 PVGIS URL" : "复制失败");
                          }}
                        >
                          复制 URL
                        </button>
                      ) : null}
                    </div>
                    <p style={{ fontSize: 12, wordBreak: "break-all" }}>requestUrl：{result.metadata.requestUrl ?? "—"}</p>
                    <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
                      <span className="pill">PVGIS inputs（raw）</span>
                      <button
                        className="secondary"
                        onClick={async () => {
                          const ok = await copyToClipboard(safeJsonStringify(result.metadata.rawInputs));
                          setCopiedHint(ok ? "已复制 PVGIS inputs" : "复制失败");
                        }}
                      >
                        复制 inputs
                      </button>
                    </div>
                    <pre
                      style={{
                        margin: "8px 0 0",
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.25)",
                        maxHeight: 160,
                        overflow: "auto",
                        fontSize: 11,
                        color: "rgba(255,255,255,0.8)"
                      }}
                    >
                      {JSON.stringify(result.metadata.rawInputs, null, 2)}
                    </pre>
                    {optimal?.requestUrl ? (
                      <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
                        <span className="pill">最佳倾角计算 URL</span>
                        <button
                          className="secondary"
                          onClick={async () => {
                            const ok = await copyToClipboard(optimal.requestUrl ?? "");
                            setCopiedHint(ok ? "已复制 optimal URL" : "复制失败");
                          }}
                        >
                          复制 URL
                        </button>
                      </div>
                    ) : null}
                    {optimal?.requestUrl ? (
                      <p style={{ fontSize: 12, wordBreak: "break-all", marginTop: 6 }}>{optimal.requestUrl}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {optimalError ? <div className="error">最佳倾角/倾角面辐照量获取失败：{optimalError}</div> : null}
              <p style={{ fontSize: 12 }}>
                注：SeriesCalc 不一定直接给出 GHI/DNI/DHI，本页会把 PVGIS 原始字段放在 extras 中展示与导出。
              </p>
            </div>
          )}
        </div>
      </section>

      {mode === "address" && selectedCandidate && Number.isFinite(selectedCandidate.lat) && Number.isFinite(selectedCandidate.lon) ? (
        <section className="card">
          <h2>地图确认（OpenStreetMap）</h2>
          <p style={{ fontSize: 12, marginBottom: 10 }}>
            用于确认“解析到的坐标是否就是你要查询的地址”。若不一致，请更换候选或补充更具体的地址（城市/区县/园区/街道）。
          </p>
          {(() => {
            const { embed, view } = buildOsmEmbedUrl(selectedCandidate.lat, selectedCandidate.lon);
            return (
              <div className="grid" style={{ gap: 10 }}>
                <iframe
                  title="osm"
                  src={embed}
                  style={{ width: "100%", height: 320, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12 }}
                />
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="pill">
                    {selectedCandidate.lat.toFixed(5)}, {selectedCandidate.lon.toFixed(5)}
                  </span>
                  <a className="pill" href={view} target="_blank" rel="noreferrer">
                    在新窗口打开地图
                  </a>
                </div>
              </div>
            );
          })()}
        </section>
      ) : null}

      {result ? (
        <section className="grid cols-2">
          <div className="card">
            <h2>月度概览（简单求和）</h2>
            <p style={{ fontSize: 12, marginBottom: 10 }}>
              指标：∑(逐时值)/1000 ≈ kWh/m²（月）。使用字段：{monthlySeries.usedKey ?? "—"}
            </p>
            <BarChart
              data={monthlySeries.out}
              xKey="month"
              yKey="kwh_m2"
              yLabel="kWh/m²"
              height={180}
            />
            <div className="row" style={{ marginTop: 10 }}>
              <div className="field" style={{ minWidth: 200, flex: 0 }}>
                <div className="label">按月份筛选（影响表格/日曲线）</div>
                <select
                  value={monthFilter}
                  onChange={(e) => {
                    const v = e.target.value === "all" ? "all" : Number(e.target.value);
                    setMonthFilter(v);
                    setPage(1);
                  }}
                >
                  <option value="all">全部</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m} 月
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ minWidth: 180, flex: 0 }}>
                <div className="label">时间显示</div>
                <select value={timeMode} onChange={(e) => setTimeMode(e.target.value as TimeMode)}>
                  <option value="cn">中国时间</option>
                  <option value="utc">UTC</option>
                </select>
              </div>
              <div className="field" style={{ minWidth: 170, flex: 0 }}>
                <div className="label">曲线日期</div>
                <input
                  type="date"
                  value={chartDay}
                  onChange={(e) => {
                    setChartDay(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <label className="pill" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={tableFollowChartDay}
                  onChange={(e) => {
                    setTableFollowChartDay(e.target.checked);
                    setPage(1);
                  }}
                />
                表格仅显示该日
              </label>
              <div className="pill">当前筛选记录：{filteredRows.length}</div>
            </div>
          </div>

          <div className="card">
            <h2>日内曲线（示例日）</h2>
            {dailySeries ? (
              <>
                <p style={{ fontSize: 12, marginBottom: 10 }}>{dailySeries.dateLabel}</p>
                <LineChart
                  points={dailySeries.points}
                  height={180}
                  yLabel="W/m²"
                  xLabel={`time (${timeMode === "utc" ? "UTC" : "CN"})`}
                  xTicks={[0, 240, 480, 720, 960, 1200, 1440]}
                  xTickFormatter={(m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`}
                />
                <p style={{ fontSize: 12, marginTop: 10 }}>
                  注：逐时数据是离散采样（常见时间戳在 :30 表示小时中心），所以日出/日落附近可能呈现“阶跃”，并非连续曲线。
                </p>
              </>
            ) : (
              <p>暂无可绘制数据。</p>
            )}
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="card">
          <h2>数据表（分页）</h2>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <span className="pill">
              第 {page} / {totalPages} 页（每页 {pageSize}）
            </span>
            <div className="row">
              <button className="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                上一页
              </button>
              <button
                className="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </button>
            </div>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>time ({timeMode === "utc" ? "UTC ISO" : "CN"})</th>
                  <th>ghi</th>
                  <th>dni</th>
                  <th>dhi</th>
                  <th>extras（示例）</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.time}>
                    <td>
                      {timeMode === "utc" ? r.time : formatChinaTime(r.time)}
                    </td>
                    <td>{r.ghi ?? "—"}</td>
                    <td>{r.dni ?? "—"}</td>
                    <td>{r.dhi ?? "—"}</td>
                    <td style={{ maxWidth: 520, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {Object.keys(r.extras ?? {}).length ? safeJsonStringify(r.extras).slice(0, 180) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

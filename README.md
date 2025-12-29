# PVGIS + CAMS 太阳辐照数据查询（Next.js Web）

输入地址/公司名称或经纬度，查询并展示太阳辐照逐时序列/典型年（TMY）数据；支持数据源 **PVGIS** 与 **CAMS（SoDa）**，并提供可验证、可复现的请求信息与 CSV 导出。需求与设计汇总见：`docs/需求文档与开发计划｜太阳辐照数据查询展示（PVGIS+CAMS）与光伏发电量评估（远期）.md`。

## 功能（一期 MVP 已落地）

- 位置输入：地址（支持“公司名 + 城市/园区/街道”等）/ 经纬度两种模式
- 地址解析：后端 Nominatim 地理编码返回候选列表；支持默认 `cn` 限定与“全球”切换
- 可验证性：候选点单选 + 强制“确认坐标”后才可查询；页面内嵌 OpenStreetMap 地图确认
- 数据源
  - PVGIS：`TMY(8760)`、`Series(按年)`；并提供“最佳倾角/方位角”摘要
  - CAMS（SoDa WPS）：逐时序列（默认 `1h`，可配时间范围、`identifier`、步长、是否输出能量积分）
- 展示：图表 + 表格（支持月份筛选/分页）
- 时间口径：后端统一输出 `UTC`（ISO8601）；前端显示支持 `UTC` / `中国时间(Asia/Shanghai)` 切换（`UTC 00:00` 显示为中国时间 `08:00` 属正常时区换算）
- 导出：CSV（同时包含 `time_cn`、`time_utc`；顶部附带 `metadata` JSON 注释，便于追溯）
- 稳定性：同参缓存（内存），第三方请求 URL 可复制复现

## 当前进展（2025-12-29）

- 已完成：CAMS 逐时序列接入（后端代理 + 字段规范化 + 缓存 + 前端查询面板）
- 已完成：统一 `metadata + data[]` 输出，支持 `unit.irradiance(W/m2)` 与 `unit.irradiation(Wh/m2)` 两种口径（CAMS `integrated` 控制）
- 已完成：前端数据源选择逻辑：`TMY` 模式固定 PVGIS（不覆盖你在 `Series` 模式选过的 CAMS）

## 本地运行

```bash
npm i
npm run dev
```

打开：`http://localhost:3000`

## 环境变量（.env.local）

PVGIS / Geocode：

- `PVGIS_BASE_URL`：默认 `https://re.jrc.ec.europa.eu/api/v5_3`
- `NOMINATIM_BASE_URL`：默认 `https://nominatim.openstreetmap.org/search`
- `GEOCODE_USER_AGENT`：建议设置（示例：`your-app/0.1 (contact@email)`）

CAMS（使用 CAMS 数据源时必填）：

- `CAMS_SODA_EMAIL`：SoDa 账户 email（服务端使用）
- `CAMS_SODA_WPS_URL`：可选，默认 `https://api.soda-solardata.com/service/wps`
- SoDa 注册地址：`https://www.soda-pro.com`

示例：

```bash
GEOCODE_USER_AGENT="pvgis-irradiance-web/0.1 (your@email)"
CAMS_SODA_EMAIL="you@example.com"
```

## API（后端代理 / BFF）

统一原则：浏览器不直连第三方；所有第三方调用均经 `src/app/api/**` 代理（校验、缓存、口径统一）。

### 1) `POST /api/geocode`

请求：

```json
{ "query": "某某公司 杭州 余杭区 xx路", "limit": 5, "countryCodes": "cn" }
```

响应（候选点 + 可复制的 `requestUrl`）：

```json
{ "requestUrl": "…", "candidates": [{ "lat": 30.27, "lon": 120.15, "displayName": "…", "provider": "nominatim", "confidence": 0.7 }] }
```

### 2) `POST /api/irradiance/tmy`（PVGIS）

请求：

```json
{ "lat": 30.27, "lon": 120.15 }
```

### 3) `POST /api/irradiance/series`（PVGIS / CAMS）

PVGIS（按年）请求：

```json
{ "source": "pvgis", "lat": 30.27, "lon": 120.15, "startYear": 2020, "endYear": 2020 }
```

CAMS 请求：

```json
{ "source": "cams", "lat": 30.27, "lon": 120.15, "start": "2025-01-01", "end": "2025-01-31", "timeStep": "1h", "identifier": "cams_radiation", "integrated": false }
```

> CAMS 需服务端配置 `CAMS_SODA_EMAIL`；时间范围为闭区间字符串（`YYYY-MM-DD`）。
>
> 注意：SoDa WPS 的底层参数是 `username + summarization`，本项目会根据 `timeStep` 映射为 SoDa 的 `summarization`（例如 `1h -> PT01H`）。

### 4) `POST /api/irradiance/optimal`（PVGIS）

请求：

```json
{ "lat": 30.27, "lon": 120.15, "year": 2024 }
```

用于返回最佳倾角/方位角与年 POA 摘要（页面展示与追溯用）。

## 响应数据结构（统一口径）

所有辐照查询返回：

```ts
type IrradianceResponse = {
  metadata: {
    source: "pvgis" | "cams";
    queryType: "tmy" | "series";
    lat: number;
    lon: number;
    timeRef: "UTC";
    unit: { irradiance?: "W/m2"; irradiation?: "Wh/m2" | "kWh/m2" };
    cached?: boolean;
    requestUrl?: string;
    provider?: string;
    rawInputs?: unknown;
  };
  data: Array<{
    time: string; // ISO8601, UTC
    ghi: number | null;
    dni: number | null;
    dhi: number | null;
    extras: Record<string, number | string | null>;
  }>;
};
```

## 常见问题

### 1) `Server Error: Cannot find module './xxx.js'`（`.next/server/webpack-runtime.js`）

这是 Next.js 开发模式下的构建缓存/热更新产物不一致导致的（常见触发：升级依赖后未清理缓存、`dev` 运行中又执行 `build`、异常中断等）。

```bash
# 先停掉正在运行的 dev server（Ctrl+C）
npm run dev:clean
```

## 开发与构建命令

- `npm run dev`：本地开发
- `npm run dev:clean`：清理 `.next` 缓存后启动（排查 chunk/module 问题）
- `npm run build`：生产构建（Next 内置 typecheck/lint）
- `npm run start`：运行生产服务
- `npm run lint`：ESLint（`next/core-web-vitals`）

## 文档

- 需求与计划（汇总版）：`docs/需求文档与开发计划｜太阳辐照数据查询展示（PVGIS+CAMS）与光伏发电量评估（远期）.md`
- 可验证性与追溯（已实现）：`docs/可验证性与追溯方案（已实现）.md`

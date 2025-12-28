# PVGIS 太阳辐照数据查询（Web / React）

一期 MVP：输入地址/公司名称（后端解析）或经纬度，查询 **PVGIS** 典型年（TMY）或逐时序列（SeriesCalc）辐照数据，并在网页中展示与导出 CSV。

## 本地运行

```bash
npm i
npm run dev
```

打开：`http://localhost:3000`

## 常见问题

### 1) `Server Error: Cannot find module './xxx.js'`（`.next/server/webpack-runtime.js`）

这是 Next.js 开发模式下的构建缓存/热更新产物不一致导致的（常见触发：升级依赖后未清理缓存、`dev` 运行中又执行 `build`、异常中断等）。

按下面步骤修复：

```bash
# 先停掉正在运行的 dev server（Ctrl+C）
npm run dev:clean
```

## 可选环境变量

- `PVGIS_BASE_URL`：默认 `https://re.jrc.ec.europa.eu/api/v5_3`
- `NOMINATIM_BASE_URL`：默认 `https://nominatim.openstreetmap.org/search`
- `GEOCODE_USER_AGENT`：Nominatim 建议设置（例如 `your-app-name/0.1 (contact@email)`）

可放在 `.env.local`：

```bash
GEOCODE_USER_AGENT="pvgis-irradiance-web/0.1 (your@email)"
```

## API（后端代理）

- `POST /api/geocode`：地址 → 候选经纬度
- `POST /api/irradiance/tmy`：PVGIS TMY（8760）
- `POST /api/irradiance/series`：PVGIS SeriesCalc（按年）

# 开发程序概述

基于PVGIS（最实用，有免费API，支持编程获取时间序列数据）和CAMS（在某些区域/分量上接近商用级别，通过SoDa/Copernicus访问），你可以开发一个Python程序来获取指定地址或经纬度的太阳辐照度数据（如GHI、DNI、DHI等）。程序的核心步骤：

1. **输入处理**：接受地址（字符串）或直接经纬度（lat, lon）。如果输入地址，使用免费的Nominatim API（OpenStreetMap）转换为经纬度。
2. **数据来源选择**：允许用户选择PVGIS或CAMS。
3. **API调用**：
   - **PVGIS**：使用HTTP GET请求，直接调用欧盟JRC的免费API。支持小时序列、TMY、月平均等。
   - **CAMS**：使用pvlib-python库的`get_cams`函数（简化SoDa API调用）。需要免费注册SoDa账户（https://www.soda-pro.com/），提供email作为参数。CAMS覆盖全球，时间分辨率灵活（1min到月）。
4. **输出**：返回数据如Pandas DataFrame，并可选保存到CSV。
5. **依赖**：`requests`（内置）、`pvlib`（需pip install pvlib）。无API密钥需求（PVGIS免费；CAMS用email）。
6. **注意事项**：
   - PVGIS：欧洲/非洲最准，全球覆盖；率限30调用/秒。
   - CAMS：接近商用准确度，尤其高纬度/漫射分量；每日限100请求。
   - 错误处理：添加try-except捕获API错误。
   - 扩展：可添加参数如时间范围、组件分量。

## Python程序示例

以下是一个完整的命令行程序示例。运行时：`python solar_data_fetcher.py --address "Beijing, China" --source pvgis --start 2023-01-01 --end 2023-01-31`（或用--lat/--lon）。

```python
import argparse
import requests
import pandas as pd
from datetime import datetime
from pvlib.iotools import get_cams  # 需要 pip install pvlib

def geocode_address(address):
    """使用Nominatim API将地址转换为经纬度"""
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": address,
        "format": "jsonv2",
        "limit": 1
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        data = response.json()
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    raise ValueError(f"无法地理编码地址: {address}. 请检查输入或使用经纬度。")

def fetch_pvgis_data(lat, lon, start, end, components=True):
    """从PVGIS API获取小时辐照序列数据"""
    url = "https://re.jrc.ec.europa.eu/api/v5_3/seriescalc"
    params = {
        "lat": lat,
        "lon": lon,
        "startyear": start.year,
        "endyear": end.year,
        "components": 1 if components else 0,
        "outputformat": "json",
        "browser": 0
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        data = response.json()
        # 提取outputs.hourly部分到DataFrame
        df = pd.DataFrame(data["outputs"]["hourly"])
        df["time"] = pd.to_datetime(df["time"], format="%Y%m%d:%H%M")
        df = df.set_index("time")
        # 列：G(i) - 全球, Gb(i) - 直射, Gd(i) - 漫射 等
        return df
    else:
        raise ValueError(f"PVGIS API错误: {response.status_code} - {response.text}")

def fetch_cams_data(lat, lon, start, end, email, identifier="cams_radiation", time_step="1h"):
    """从CAMS (via pvlib)获取辐照序列数据"""
    data, metadata = get_cams(
        latitude=lat,
        longitude=lon,
        start=start,
        end=end,
        email=email,  # 你的SoDa注册email
        identifier=identifier,  # 'cams_radiation' for all-sky, 'mcclear' for clear-sky
        time_step=time_step,
        time_ref="UT",
        map_variables=True,
        verbose=False
    )
    # data是DataFrame，列如ghi, dhi, dni 等
    return data

def main():
    parser = argparse.ArgumentParser(description="获取指定位置的太阳辐照数据")
    parser.add_argument("--address", type=str, help="地址 (e.g., 'Beijing, China')")
    parser.add_argument("--lat", type=float, help="纬度 (优先于address)")
    parser.add_argument("--lon", type=float, help="经度 (优先于address)")
    parser.add_argument("--source", type=str, choices=["pvgis", "cams"], required=True, help="数据来源: pvgis 或 cams")
    parser.add_argument("--start", type=str, default="2023-01-01", help="开始日期 (YYYY-MM-DD)")
    parser.add_argument("--end", type=str, default="2023-12-31", help="结束日期 (YYYY-MM-DD)")
    parser.add_argument("--email", type=str, help="CAMS/SoDa email (仅cams需要)")
    parser.add_argument("--output", type=str, default="output.csv", help="输出CSV文件")

    args = parser.parse_args()

    # 处理日期
    start = datetime.strptime(args.start, "%Y-%m-%d")
    end = datetime.strptime(args.end, "%Y-%m-%d")

    # 获取经纬度
    if args.lat is not None and args.lon is not None:
        lat, lon = args.lat, args.lon
    elif args.address:
        lat, lon = geocode_address(args.address)
    else:
        raise ValueError("必须提供 --address 或 --lat/--lon")

    print(f"位置: lat={lat}, lon={lon}")

    try:
        if args.source == "pvgis":
            df = fetch_pvgis_data(lat, lon, start, end)
        elif args.source == "cams":
            if not args.email:
                raise ValueError("CAMS需要 --email 参数")
            df = fetch_cams_data(lat, lon, start, end, args.email)
        
        df.to_csv(args.output)
        print(f"数据保存到 {args.output}")
        print(df.head())  # 打印预览
    except Exception as e:
        print(f"错误: {e}")

if __name__ == "__main__":
    main()
```

## 如何运行和扩展

- **安装依赖**：`pip install requests pandas pvlib`
- **注册CAMS/SoDa**：访问 https://www.soda-pro.com/ 注册免费账户，提供email。
- **测试**：用示例命令运行。PVGIS返回JSON解析为DF；CAMS直接返回DF。
- **扩展建议**：
  - 添加更多PVGIS端点（如TMY：改url为/tmy）。
  - 处理CAMS变量选择（pvlib默认返回GHI/DHI/DNI等）。
  - 集成可视化：用matplotlib.plot(df["G(i)"])绘图。
  - 批量位置：循环多个地址。
  - 错误鲁棒：添加重试机制（用requests.adapters.Retry）。

这个程序简单、可扩展，适合初级开发。如果需要GUI，可用Tkinter/Streamlit包装；大型应用可容器化（Docker）。

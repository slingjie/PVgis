export type IrradianceUnit = {
  irradiance?: "W/m2";
  irradiation?: "Wh/m2" | "kWh/m2";
};

export type IrradianceMetadata = {
  source: "pvgis" | "cams";
  queryType: "tmy" | "series";
  lat: number;
  lon: number;
  timeRef: "UTC";
  unit: IrradianceUnit;
  provider?: string;
  rawInputs?: unknown;
  cached?: boolean;
  requestUrl?: string;
};

export type IrradiancePoint = {
  time: string; // ISO8601
  ghi: number | null;
  dni: number | null;
  dhi: number | null;
  extras: Record<string, number | string | null>;
};

export type IrradianceResponse = {
  metadata: IrradianceMetadata;
  data: IrradiancePoint[];
};

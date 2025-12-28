import { z } from "zod";

export const GeocodeRequestSchema = z.object({
  query: z.string().trim().min(2),
  limit: z.number().int().min(1).max(10).optional(),
  countryCodes: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(,[a-z]{2})*$/i, "countryCodes must be like 'cn' or 'cn,us'")
    .optional()
});

export const IrradianceTmyRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180)
});

export const PvgisSeriesRequestSchema = z.object({
  source: z.literal("pvgis"),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  startYear: z.number().int().min(1990).max(2100),
  endYear: z.number().int().min(1990).max(2100)
});

export const CamsSeriesRequestSchema = z.object({
  source: z.literal("cams"),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  start: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeStep: z.enum(["1min", "15min", "1h", "1d", "1M"]).optional(),
  identifier: z.enum(["cams_radiation", "mcclear"]).optional(),
  integrated: z.boolean().optional()
});

export const IrradianceSeriesRequestSchema = z.discriminatedUnion("source", [PvgisSeriesRequestSchema, CamsSeriesRequestSchema]);

export const IrradianceOptimalRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  year: z.number().int().min(1990).max(2100).optional()
});

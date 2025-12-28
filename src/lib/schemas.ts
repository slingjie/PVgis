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

export const IrradianceSeriesRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  startYear: z.number().int().min(1990).max(2100),
  endYear: z.number().int().min(1990).max(2100)
});

export const IrradianceOptimalRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  year: z.number().int().min(1990).max(2100).optional()
});

import { z } from "zod";

export const updateHsnPolicySchema = z
  .object({
    declaredTurnoverBand: z.enum([
      "unspecified",
      "declared_band_1",
      "declared_band_2",
      "declared_band_3",
    ]),
    confirmed: z.literal(true),
  })
  .strict();

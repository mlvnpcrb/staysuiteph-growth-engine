import { z } from "zod";
export const searchGroupsSchema = z.object({
  destination: z.string().trim().min(2).max(100),
  accommodation: z.enum([
    "Condo",
    "Apartment",
    "Hotel",
    "Resort",
    "Vacation rental",
  ]),
  audience: z.enum(["Guests", "Hosts"]),
});
export const groupContextSchema = z.object({
  destination: z
    .string()
    .trim()
    .max(100)
    .refine(
      (value) => value.length === 0 || value.length >= 2,
      "Use at least two characters or leave blank.",
    )
    .default(""),
  accommodation: z
    .enum(["", "Condo", "Apartment", "Hotel", "Resort", "Vacation rental"])
    .default(""),
  audience: z.enum(["", "Guests", "Hosts"]).default(""),
});

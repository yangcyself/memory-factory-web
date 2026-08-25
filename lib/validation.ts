import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .transform((value) => value || null);

export const itemSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    url: optionalText.pipe(z.url("Enter a valid URL").nullable()),
    shortText: optionalText.pipe(z.string().max(5000).nullable()),
  })
  .refine(({ url, shortText }) => url !== null || shortText !== null, {
    message: "Add a URL, short text, or both.",
    path: ["shortText"],
  });

export const relationshipSchema = z
  .object({
    sourceItemId: z.uuid(),
    targetItemId: z.uuid(),
    relationType: z.enum([
      "related",
      "contains",
      "references",
      "applied_in",
      "derived_from",
      "contradicts",
    ]),
    semanticWeight: z.coerce.number().min(0).max(1),
  })
  .refine(({ sourceItemId, targetItemId }) => sourceItemId !== targetItemId, {
    message: "An item cannot be related to itself.",
    path: ["targetItemId"],
  });

export const reviewSchema = z.object({
  itemId: z.uuid(),
  memoryRating: z.coerce.number().int().min(0).max(4),
});

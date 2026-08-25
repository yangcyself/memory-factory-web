import { describe, expect, it } from "vitest";
import { itemSchema, relationshipSchema } from "../lib/validation";

describe("item validation", () => {
  it.each([
    { title: "URL", url: "https://example.com", shortText: "" },
    { title: "Text", url: "", shortText: "A memory cue" },
    { title: "Both", url: "https://example.com/paper", shortText: "My cue" },
  ])("accepts $title content", (value) =>
    expect(itemSchema.safeParse(value).success).toBe(true),
  );
  it("rejects an item without URL or text", () => {
    expect(
      itemSchema.safeParse({ title: "Empty", url: "", shortText: "" }).success,
    ).toBe(false);
  });
});

describe("relationship validation", () => {
  const first = "00000000-0000-4000-8000-000000000001";
  const second = "00000000-0000-4000-8000-000000000002";
  it("rejects self-links", () => {
    expect(
      relationshipSchema.safeParse({
        sourceItemId: first,
        targetItemId: first,
        relationType: "related",
        semanticWeight: 0.5,
      }).success,
    ).toBe(false);
  });
  it.each([-0.1, 1.1])("rejects weight %s", (semanticWeight) => {
    expect(
      relationshipSchema.safeParse({
        sourceItemId: first,
        targetItemId: second,
        relationType: "related",
        semanticWeight,
      }).success,
    ).toBe(false);
  });
});

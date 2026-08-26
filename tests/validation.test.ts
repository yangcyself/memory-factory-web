import { describe, expect, it } from "vitest";
import { itemSchema, relationshipSchema } from "../lib/validation";
import { parseNotionDatabaseId } from "../lib/notion/url";

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

describe("Notion database links", () => {
  it.each([
    "https://app.notion.com/p/3c7bcc457b588016bd28e4be671892d8?v=abc",
    "https://www.notion.so/Reading-list-3c7bcc457b588016bd28e4be671892d8",
    "https://notion.so/3c7bcc45-7b58-8016-bd28-e4be671892d8",
  ])("extracts the database ID from %s", (url) => {
    expect(parseNotionDatabaseId(url)).toBe("3c7bcc457b588016bd28e4be671892d8");
  });

  it.each([
    "https://example.com/3c7bcc457b588016bd28e4be671892d8",
    "http://notion.so/3c7bcc457b588016bd28e4be671892d8",
    "https://notion.so/no-id",
  ])("rejects unsafe or malformed link %s", (url) => {
    expect(() => parseNotionDatabaseId(url)).toThrow();
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

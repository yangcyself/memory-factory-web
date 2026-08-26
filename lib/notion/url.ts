import { z } from "zod";

const notionHosts = new Set([
  "notion.so",
  "www.notion.so",
  "notion.com",
  "www.notion.com",
  "app.notion.com",
]);
const compactId = /^[0-9a-f]{32}$/i;
const dashedId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseNotionDatabaseId(value: string) {
  const url = z.url().parse(value.trim());
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !notionHosts.has(parsed.hostname)) {
    throw new Error("Enter a secure Notion database link.");
  }
  const candidates = [
    ...parsed.pathname.split("/"),
    parsed.searchParams.get("p") ?? "",
  ];
  for (const candidate of candidates.reverse()) {
    const suffix = candidate.match(/([0-9a-f]{32})$/i)?.[1];
    const id = dashedId.test(candidate)
      ? candidate.replaceAll("-", "")
      : compactId.test(candidate)
        ? candidate
        : suffix;
    if (id) return id.toLowerCase();
  }
  throw new Error("The link does not contain a Notion database ID.");
}

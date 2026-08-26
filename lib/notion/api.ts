import "server-only";

export const NOTION_VERSION = "2025-09-03";

export async function notionRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(
      response.status === 404
        ? "That database is not shared with MemoryFactory."
        : (body.message ?? "Notion could not complete the request."),
    );
  }
  return response.json() as Promise<T>;
}

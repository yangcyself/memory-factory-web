import Link from "next/link";
import { Notice } from "@/components/notice";
import { addNotionWatchList } from "@/lib/actions/notion";
import { requireUser } from "@/lib/auth";

export default async function NotionImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const { supabase } = await requireUser();
  const [{ data: connections }, { data: watchLists }] = await Promise.all([
    supabase
      .from("notion_connections")
      .select("id,workspace_name,status")
      .order("created_at"),
    supabase
      .from("notion_watch_lists")
      .select(
        "id,name,status,last_checked_at,notion_connections(workspace_name)",
      )
      .order("created_at", { ascending: false }),
  ]);
  const connected =
    connections?.filter((item) => item.status === "connected") ?? [];
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-leaf">
          Import source
        </p>
        <h1 className="mt-1 text-3xl font-bold">Notion watch lists</h1>
        <p className="mt-2 max-w-2xl text-black/65">
          Connect a workspace, choose a database Notion has shared with
          MemoryFactory, and approve items before they are imported.
        </p>
      </div>
      <Notice error={error} success={success} />
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Workspace access</h2>
          <p className="mt-1 text-sm text-black/60">
            Read-only access to pages you select in Notion. MemoryFactory never
            edits Notion.
          </p>
        </div>
        <Link className="button" href="/integrations/notion/start">
          Connect Notion
        </Link>
      </div>
      {connected.length > 0 && (
        <form action={addNotionWatchList} className="card space-y-4">
          <div>
            <h2 className="text-lg font-bold">Add a database</h2>
            <p className="mt-1 text-sm text-black/60">
              Paste a database link after sharing it with the integration.
            </p>
          </div>
          <label>
            Workspace
            <select className="mt-1" name="connectionId" required>
              {connected.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.workspace_name || "Notion workspace"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notion database link
            <input
              className="mt-1"
              type="url"
              name="databaseUrl"
              placeholder="https://www.notion.so/..."
              required
            />
          </label>
          <button className="button" type="submit">
            Start watching
          </button>
        </form>
      )}
      <div>
        <h2 className="text-xl font-bold">Your watch lists</h2>
        {watchLists?.length ? (
          <div className="mt-3 grid gap-3">
            {watchLists.map((list) => (
              <article className="card" key={list.id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{list.name}</h3>
                    <p className="mt-1 text-sm text-black/55">
                      {list.status === "active"
                        ? "Connected and ready for import checks"
                        : "Needs attention"}
                    </p>
                  </div>
                  <span className="rounded-full bg-mist px-3 py-1 text-xs font-medium capitalize">
                    {list.status.replace("_", " ")}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="card mt-3 text-black/60">
            No databases are being watched yet.
          </p>
        )}
      </div>
    </section>
  );
}

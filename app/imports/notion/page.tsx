import Link from "next/link";
import { headers } from "next/headers";
import { Notice } from "@/components/notice";
import { PendingButton } from "@/components/pending-button";
import { RemoveWatchListButton } from "@/components/remove-watch-list-button";
import {
  addNotionWatchList,
  dismissNotionBatch,
  importNotionBatch,
  refreshNotionWatchListProperties,
  removeNotionWatchList,
  saveNotionIntegrationSettings,
  syncNotionWatchList,
  updateNotionWatchList,
} from "@/lib/actions/notion";
import { requireUser } from "@/lib/auth";

export default async function NotionImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; review?: string }>;
}) {
  const { error, success, review } = await searchParams;
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const callbackUrl = host
    ? `${protocol}://${host}/integrations/notion/callback`
    : "/integrations/notion/callback";
  const { supabase } = await requireUser();
  const [
    { data: settings },
    { data: connections },
    { data: watchLists },
    { data: pendingBatches },
  ] = await Promise.all([
    supabase
      .from("notion_integration_settings")
      .select("id,label,client_id")
      .order("updated_at", { ascending: false }),
    supabase
      .from("notion_connections")
      .select("id,workspace_name,status")
      .order("created_at"),
    supabase
      .from("notion_watch_lists")
      .select(
        "id,name,status,last_checked_at,last_new_count,label_property_id,url_property_id,hint_property_id,property_options,notion_connections(workspace_name)",
      )
      .neq("status", "removed")
      .order("created_at", { ascending: false }),
    supabase
      .from("notion_import_batches")
      .select("id,watch_list_id")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);
  const { data: reviewBatch } = review
    ? await supabase
        .from("notion_import_batches")
        .select(
          "id,status,candidate_count,notion_watch_lists(name),notion_import_entries(id,title,url,short_text)",
        )
        .eq("id", review)
        .eq("status", "pending")
        .maybeSingle()
    : { data: null };
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
      {reviewBatch ? (
        <section className="card space-y-4 border-leaf/30">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-leaf">
              Review import
            </p>
            <h2 className="mt-1 text-xl font-bold">
              {reviewBatch.candidate_count} new item
              {reviewBatch.candidate_count === 1 ? "" : "s"} found
            </h2>
            <p className="mt-1 text-sm text-black/60">
              Select the links you want to add. Nothing is imported until you
              confirm below.
            </p>
          </div>
          {reviewBatch.notion_import_entries.length ? (
            <form action={importNotionBatch} className="space-y-3">
              <input type="hidden" name="batchId" value={reviewBatch.id} />
              {reviewBatch.notion_import_entries.map((entry) => (
                <label
                  className="flex gap-3 rounded-lg border border-black/10 p-3"
                  key={entry.id}
                >
                  <input
                    className="mt-1 size-4 shrink-0"
                    type="checkbox"
                    name="entryId"
                    value={entry.id}
                    defaultChecked
                  />
                  <span className="min-w-0 font-normal">
                    <strong className="block font-semibold">
                      {entry.title}
                    </strong>
                    <span className="block truncate text-xs text-leaf">
                      {entry.url}
                    </span>
                    {entry.short_text ? (
                      <span className="mt-1 block text-sm text-black/60">
                        {entry.short_text}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
              <PendingButton pendingLabel="Importing selected items…">
                Import selected
              </PendingButton>
            </form>
          ) : (
            <p className="rounded-lg bg-mist p-3 text-sm">
              No new items were found. Your existing memory items were left
              unchanged.
            </p>
          )}
          <form action={dismissNotionBatch}>
            <input type="hidden" name="batchId" value={reviewBatch.id} />
            <PendingButton
              className="button-secondary"
              pendingLabel="Dismissing…"
            >
              Dismiss
            </PendingButton>
          </form>
        </section>
      ) : null}
      <details className="card" open={!settings?.length}>
        <summary className="cursor-pointer text-lg font-bold">
          Set up your Notion integration
        </summary>
        <div className="mt-4 space-y-4 text-sm text-black/70">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Open the Notion developer portal and create a public integration.
            </li>
            <li>Enable only the read-content capability.</li>
            <li>
              Add this exact OAuth redirect URI in Notion:
              <code className="mt-1 block break-all rounded bg-mist p-2 text-ink">
                {callbackUrl}
              </code>
            </li>
            <li>
              Copy the OAuth client ID and client secret into the boxes below.
            </li>
          </ol>
          <p>
            The secret is encrypted before storage. It is never shown again or
            sent back to the browser.
          </p>
          <p>
            MemoryFactory automatically creates a fresh encryption nonce for
            every saved secret. The deployment still needs one stable master
            encryption key so credentials remain decryptable after restarts.
          </p>
        </div>
        <form action={saveNotionIntegrationSettings} className="mt-5 space-y-4">
          <label>
            Integration name
            <input
              className="mt-1"
              name="label"
              defaultValue="My Notion integration"
              maxLength={100}
              required
            />
          </label>
          <label>
            OAuth client ID
            <input
              className="mt-1"
              name="clientId"
              autoComplete="off"
              maxLength={200}
              required
            />
          </label>
          <label>
            OAuth client secret
            <input
              className="mt-1"
              type="password"
              name="clientSecret"
              autoComplete="new-password"
              maxLength={500}
              required
            />
          </label>
          <PendingButton
            className="button-secondary"
            pendingLabel="Saving credentials…"
          >
            Save credentials
          </PendingButton>
        </form>
        {settings?.length ? (
          <p className="mt-4 text-sm text-black/55">
            Saved: {settings[0].label} ({settings[0].client_id.slice(0, 8)}…)
          </p>
        ) : null}
      </details>
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Workspace access</h2>
          <p className="mt-1 text-sm text-black/60">
            Read-only access to pages you select in Notion. MemoryFactory never
            edits Notion.
          </p>
        </div>
        <Link
          className={`button ${!settings?.length ? "pointer-events-none opacity-50" : ""}`}
          aria-disabled={!settings?.length}
          href="/integrations/notion/start"
        >
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
          <PendingButton pendingLabel="Adding database…">
            Start watching
          </PendingButton>
        </form>
      )}
      <div>
        <h2 className="text-xl font-bold">Your watch lists</h2>
        {watchLists?.length ? (
          <div className="mt-3 grid gap-3">
            {watchLists.map((list) => (
              <article className="card" key={list.id}>
                {(() => {
                  const options = Array.isArray(list.property_options)
                    ? (list.property_options as Array<{
                        id: string;
                        name: string;
                        type: string;
                      }>)
                    : [];
                  const optionName = (id: string | null) =>
                    options.find((option) => option.id === id)?.name;
                  const connection = Array.isArray(list.notion_connections)
                    ? list.notion_connections[0]
                    : list.notion_connections;
                  const pendingBatch = pendingBatches?.find(
                    (batch) => batch.watch_list_id === list.id,
                  );
                  return (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-bold">{list.name}</h3>
                          <p className="mt-1 text-sm text-black/55">
                            {list.status === "active"
                              ? "Connected and ready for import checks"
                              : "Needs attention"}
                          </p>
                          <p className="mt-1 text-xs text-black/50">
                            {connection?.workspace_name || "Notion workspace"} ·{" "}
                            {list.last_checked_at
                              ? `Last checked ${new Date(list.last_checked_at).toLocaleString()}`
                              : "Never checked"}
                          </p>
                          <p className="mt-1 text-xs text-black/50">
                            Label:{" "}
                            {optionName(list.label_property_id) ??
                              "Not configured"}
                            {list.url_property_id
                              ? ` · URL: ${optionName(list.url_property_id) ?? "Missing property"}`
                              : " · URL: Notion page"}
                            {list.last_new_count
                              ? ` · ${list.last_new_count} awaiting review`
                              : ""}
                          </p>
                        </div>
                        <span className="rounded-full bg-mist px-3 py-1 text-xs font-medium capitalize">
                          {list.status.replace("_", " ")}
                        </span>
                      </div>
                      {list.status === "active" ? (
                        <form action={syncNotionWatchList} className="mt-4">
                          <input
                            type="hidden"
                            name="watchListId"
                            value={list.id}
                          />
                          <PendingButton pendingLabel="Checking Notion…">
                            Check for new items
                          </PendingButton>
                          <p className="mt-2 text-xs text-black/55">
                            Checks for Notion pages that have not been imported
                            before.
                          </p>
                        </form>
                      ) : null}
                      {pendingBatch && list.last_new_count ? (
                        <Link
                          className="button-secondary mt-3"
                          href={`/imports/notion?review=${pendingBatch.id}`}
                        >
                          Review {list.last_new_count} new item
                          {list.last_new_count === 1 ? "" : "s"}
                        </Link>
                      ) : null}
                      <details className="mt-4 border-t border-black/10 pt-4">
                        <summary className="button-secondary cursor-pointer list-none">
                          Edit import settings
                        </summary>
                        <form
                          action={updateNotionWatchList}
                          className="mt-4 grid gap-4"
                        >
                          <input
                            type="hidden"
                            name="watchListId"
                            value={list.id}
                          />
                          <label>
                            Watch-list label
                            <input
                              className="mt-1"
                              name="name"
                              defaultValue={list.name}
                              maxLength={200}
                              required
                            />
                          </label>
                          {options.length ? (
                            <>
                              <label>
                                Label property
                                <select
                                  className="mt-1"
                                  name="labelPropertyId"
                                  defaultValue={list.label_property_id ?? ""}
                                  required
                                >
                                  {options
                                    .filter((item) =>
                                      ["title", "rich_text"].includes(
                                        item.type,
                                      ),
                                    )
                                    .map((item) => (
                                      <option value={item.id} key={item.id}>
                                        {item.name} ({item.type})
                                      </option>
                                    ))}
                                </select>
                                <span className="mt-1 block text-xs font-normal text-black/55">
                                  Notion property used as the memory item label.
                                </span>
                              </label>
                              <label>
                                URL property
                                <select
                                  className="mt-1"
                                  name="urlPropertyId"
                                  defaultValue={list.url_property_id ?? ""}
                                >
                                  <option value="">
                                    Use the Notion page URL
                                  </option>
                                  {options
                                    .filter((item) => item.type === "url")
                                    .map((item) => (
                                      <option value={item.id} key={item.id}>
                                        {item.name}
                                      </option>
                                    ))}
                                </select>
                                <span className="mt-1 block text-xs font-normal text-black/55">
                                  A missing URL falls back to the Notion page
                                  link.
                                </span>
                              </label>
                              <label>
                                Minimal hint
                                <select
                                  className="mt-1"
                                  name="hintPropertyId"
                                  defaultValue={list.hint_property_id ?? ""}
                                >
                                  <option value="">Do not import a hint</option>
                                  {options
                                    .filter((item) => item.type === "rich_text")
                                    .map((item) => (
                                      <option value={item.id} key={item.id}>
                                        {item.name}
                                      </option>
                                    ))}
                                </select>
                              </label>
                              <PendingButton
                                className="button-secondary justify-self-start"
                                pendingLabel="Saving settings…"
                              >
                                Save settings
                              </PendingButton>
                            </>
                          ) : (
                            <p className="text-sm text-black/60">
                              Load the Notion properties before configuring this
                              source.
                            </p>
                          )}
                        </form>
                        <form
                          action={refreshNotionWatchListProperties}
                          className="mt-3"
                        >
                          <input
                            type="hidden"
                            name="watchListId"
                            value={list.id}
                          />
                          <PendingButton
                            className="button-secondary"
                            pendingLabel="Loading properties…"
                          >
                            {options.length
                              ? "Refresh Notion properties"
                              : "Load Notion properties"}
                          </PendingButton>
                        </form>
                        <form
                          action={removeNotionWatchList}
                          className="mt-5 border-t border-red-200 pt-4"
                        >
                          <input
                            type="hidden"
                            name="watchListId"
                            value={list.id}
                          />
                          <p className="mb-2 text-xs text-black/55">
                            Stop watching this database. Memory items already
                            imported from it will be kept.
                          </p>
                          <RemoveWatchListButton name={list.name} />
                        </form>
                      </details>
                    </>
                  );
                })()}
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

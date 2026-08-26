"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { notionRequest } from "@/lib/notion/api";
import { decryptNotionToken, encryptNotionSecret } from "@/lib/notion/crypto";
import { parseNotionDatabaseId } from "@/lib/notion/url";

const databaseSchema = z.object({
  id: z.string().min(1),
  title: z.array(z.object({ plain_text: z.string().optional() })).optional(),
  data_sources: z
    .array(z.object({ id: z.string().min(1), name: z.string().optional() }))
    .optional(),
});

const integrationSettingsSchema = z.object({
  label: z.string().trim().min(1, "Give the integration a name.").max(100),
  clientId: z.string().trim().min(1, "Enter the OAuth client ID.").max(200),
  clientSecret: z
    .string()
    .trim()
    .min(1, "Enter the OAuth client secret.")
    .max(500),
});

const watchListIdSchema = z.string().uuid();
const watchListSettingsSchema = z.object({
  watchListId: z.string().uuid(),
  name: z.string().trim().min(1, "Enter a watch-list label.").max(200),
  labelPropertyId: z.string().trim().min(1).max(200),
  urlPropertyId: z.string().trim().max(200),
  hintPropertyId: z.string().trim().max(200),
});

const propertyOptionSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(50),
});

const dataSourceSchema = z.object({
  properties: z.record(
    z.string(),
    z.object({ id: z.string(), name: z.string().optional(), type: z.string() }),
  ),
});

const notionPageSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  last_edited_time: z.string().datetime(),
  properties: z.record(z.string(), z.unknown()),
});

const notionQuerySchema = z.object({
  results: z.array(notionPageSchema),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
});

type NotionProperty = {
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  url?: string | null;
};

function textFromProperty(property: unknown, key: "title" | "rich_text") {
  const value = property as NotionProperty;
  return value?.[key]
    ?.map((part) => part.plain_text ?? "")
    .join("")
    .trim();
}

function urlFromProperty(property: unknown) {
  const url = (property as NotionProperty)?.url;
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function pageCandidate(
  page: z.infer<typeof notionPageSchema>,
  labelPropertyId: string | null,
  urlPropertyId: string | null,
  hintPropertyId: string | null,
) {
  const properties = Object.values(page.properties);
  const byId = (id: string | null) =>
    id
      ? Object.values(page.properties).find(
          (property) => (property as { id?: string }).id === id,
        )
      : undefined;
  const title =
    (labelPropertyId
      ? textFromProperty(byId(labelPropertyId), "title") ||
        textFromProperty(byId(labelPropertyId), "rich_text")
      : undefined) ??
    properties
      .map((property) => textFromProperty(property, "title"))
      .find(Boolean) ??
    "Untitled Notion page";
  const shortText =
    (hintPropertyId
      ? textFromProperty(byId(hintPropertyId), "rich_text")
      : undefined) ?? "";
  return {
    notion_page_id: page.id.replaceAll("-", ""),
    notion_last_edited_time: page.last_edited_time,
    title: title.slice(0, 200),
    url:
      (urlPropertyId ? urlFromProperty(byId(urlPropertyId)) : undefined) ??
      page.url,
    short_text: shortText.slice(0, 2000),
  };
}

async function getPropertyOptions(token: string, dataSourceId: string) {
  const source = dataSourceSchema.parse(
    await notionRequest<unknown>(token, `/data_sources/${dataSourceId}`),
  );
  return Object.entries(source.properties).map(([key, { id, name, type }]) => ({
    id,
    name: name ?? key,
    type,
  }));
}

export async function saveNotionIntegrationSettings(formData: FormData) {
  const parsed = integrationSettingsSchema.safeParse({
    label: formData.get("label"),
    clientId: formData.get("clientId"),
    clientSecret: formData.get("clientSecret"),
  });
  if (!parsed.success)
    redirect(
      `/imports/notion?error=${encodeURIComponent(parsed.error.issues[0].message)}`,
    );
  const { supabase, user } = await requireUser();
  let encryptedClientSecret: string;
  try {
    encryptedClientSecret = encryptNotionSecret(
      parsed.data.clientSecret,
      `${user.id}:notion-client:${parsed.data.clientId}`,
    );
  } catch {
    redirect(
      "/imports/notion?error=Credential%20encryption%20is%20not%20configured.%20Ask%20the%20deployment%20owner%20to%20set%20the%20encryption%20key.",
    );
  }
  const { error } = await supabase.from("notion_integration_settings").upsert(
    {
      label: parsed.data.label,
      client_id: parsed.data.clientId,
      encrypted_client_secret: encryptedClientSecret,
    },
    { onConflict: "user_id,client_id" },
  );
  if (error)
    redirect(`/imports/notion?error=${encodeURIComponent(error.message)}`);
  redirect(
    "/imports/notion?success=Notion%20integration%20credentials%20saved.",
  );
}

export async function addNotionWatchList(formData: FormData) {
  const connectionId = String(formData.get("connectionId") ?? "");
  let databaseId: string;
  try {
    databaseId = parseNotionDatabaseId(
      String(formData.get("databaseUrl") ?? ""),
    );
  } catch (error) {
    redirect(
      `/imports/notion?error=${encodeURIComponent(error instanceof Error ? error.message : "Invalid Notion link.")}`,
    );
  }
  const { supabase, user } = await requireUser();
  const { data: connection } = await supabase
    .from("notion_connections")
    .select("id,workspace_id,encrypted_access_token")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .eq("status", "connected")
    .maybeSingle();
  if (!connection)
    redirect("/imports/notion?error=Choose%20a%20connected%20workspace.");
  try {
    const token = decryptNotionToken(
      connection.encrypted_access_token,
      `${user.id}:${connection.workspace_id}`,
    );
    const database = databaseSchema.parse(
      await notionRequest<unknown>(token, `/databases/${databaseId}`),
    );
    const dataSource = database.data_sources?.[0];
    if (!dataSource)
      throw new Error("This database has no queryable data source.");
    const name =
      database.title
        ?.map((part) => part.plain_text ?? "")
        .join("")
        .trim() ||
      dataSource.name ||
      "Notion database";
    const propertyOptions = await getPropertyOptions(token, dataSource.id);
    const labelProperty = propertyOptions.find((item) => item.type === "title");
    if (!labelProperty)
      throw new Error("This database has no title property to use as a label.");
    const { data: existing } = await supabase
      .from("notion_watch_lists")
      .select("id,status")
      .eq("connection_id", connection.id)
      .eq("user_id", user.id)
      .eq("data_source_id", dataSource.id)
      .maybeSingle();
    if (existing?.status !== "removed" && existing)
      throw new Error("This database is already watched.");
    const mutation = {
      connection_id: connection.id,
      database_id: database.id.replaceAll("-", ""),
      data_source_id: dataSource.id,
      name,
      property_options: propertyOptions,
      label_property_id: labelProperty.id,
      status: "active",
    };
    const { error } = existing
      ? await supabase
          .from("notion_watch_lists")
          .update(mutation)
          .eq("id", existing.id)
          .eq("user_id", user.id)
      : await supabase.from("notion_watch_lists").insert(mutation);
    if (error)
      throw new Error(
        error.code === "23505"
          ? "This database is already watched."
          : error.message,
      );
  } catch (error) {
    redirect(
      `/imports/notion?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not add the database.")}`,
    );
  }
  redirect("/imports/notion?success=Watch%20list%20added.");
}

export async function updateNotionWatchList(formData: FormData) {
  const parsed = watchListSettingsSchema.safeParse({
    watchListId: formData.get("watchListId"),
    name: formData.get("name"),
    labelPropertyId: formData.get("labelPropertyId"),
    urlPropertyId: formData.get("urlPropertyId"),
    hintPropertyId: formData.get("hintPropertyId"),
  });
  if (!parsed.success)
    redirect(
      `/imports/notion?error=${encodeURIComponent(parsed.error.issues[0].message)}`,
    );

  const { supabase, user } = await requireUser();
  const { data: watchList } = await supabase
    .from("notion_watch_lists")
    .select("property_options")
    .eq("id", parsed.data.watchListId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!watchList) redirect("/imports/notion?error=Watch%20list%20not%20found.");
  const options = z
    .array(propertyOptionSchema)
    .parse(watchList.property_options);
  const option = (id: string) => options.find((item) => item.id === id);
  if (
    !option(parsed.data.labelPropertyId) ||
    !["title", "rich_text"].includes(option(parsed.data.labelPropertyId)!.type)
  )
    redirect("/imports/notion?error=Choose%20a%20valid%20label%20property.");
  if (
    parsed.data.urlPropertyId &&
    option(parsed.data.urlPropertyId)?.type !== "url"
  )
    redirect("/imports/notion?error=Choose%20a%20valid%20URL%20property.");
  if (
    parsed.data.hintPropertyId &&
    option(parsed.data.hintPropertyId)?.type !== "rich_text"
  )
    redirect("/imports/notion?error=Choose%20a%20valid%20hint%20property.");
  const { data, error } = await supabase
    .from("notion_watch_lists")
    .update({
      name: parsed.data.name,
      label_property_id: parsed.data.labelPropertyId,
      url_property_id: parsed.data.urlPropertyId || null,
      hint_property_id: parsed.data.hintPropertyId || null,
    })
    .eq("id", parsed.data.watchListId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error)
    redirect(`/imports/notion?error=${encodeURIComponent(error.message)}`);
  if (!data) redirect("/imports/notion?error=Watch%20list%20not%20found.");
  redirect("/imports/notion?success=Watch%20list%20settings%20saved.");
}

export async function removeNotionWatchList(formData: FormData) {
  const parsedId = watchListIdSchema.safeParse(formData.get("watchListId"));
  if (!parsedId.success)
    redirect("/imports/notion?error=Invalid%20watch%20list.");

  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("notion_watch_lists")
    .update({ status: "removed" })
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error)
    redirect(`/imports/notion?error=${encodeURIComponent(error.message)}`);
  if (!data) redirect("/imports/notion?error=Watch%20list%20not%20found.");
  redirect(
    "/imports/notion?success=Watch%20list%20removed.%20Imported%20memory%20items%20were%20kept.",
  );
}

export async function refreshNotionWatchListProperties(formData: FormData) {
  const parsedId = watchListIdSchema.safeParse(formData.get("watchListId"));
  if (!parsedId.success)
    redirect("/imports/notion?error=Invalid%20watch%20list.");
  const { supabase, user } = await requireUser();
  const { data: watchList } = await supabase
    .from("notion_watch_lists")
    .select(
      "id,data_source_id,notion_connections!inner(workspace_id,encrypted_access_token,status)",
    )
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .neq("status", "removed")
    .maybeSingle();
  if (!watchList) redirect("/imports/notion?error=Watch%20list%20not%20found.");
  const connection = Array.isArray(watchList.notion_connections)
    ? watchList.notion_connections[0]
    : watchList.notion_connections;
  if (!connection || connection.status !== "connected")
    redirect("/imports/notion?error=Reconnect%20the%20Notion%20workspace.");
  try {
    const token = decryptNotionToken(
      connection.encrypted_access_token,
      `${user.id}:${connection.workspace_id}`,
    );
    const options = await getPropertyOptions(token, watchList.data_source_id);
    const { error } = await supabase
      .from("notion_watch_lists")
      .update({ property_options: options })
      .eq("id", watchList.id)
      .eq("user_id", user.id);
    if (error) throw error;
  } catch (error) {
    redirect(
      `/imports/notion?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not load Notion properties.")}`,
    );
  }
  redirect("/imports/notion?success=Notion%20properties%20refreshed.");
}

export async function syncNotionWatchList(formData: FormData) {
  const parsedId = watchListIdSchema.safeParse(formData.get("watchListId"));
  if (!parsedId.success)
    redirect("/imports/notion?error=Invalid%20watch%20list.");

  const { supabase, user } = await requireUser();
  const { data: watchList } = await supabase
    .from("notion_watch_lists")
    .select(
      "id,data_source_id,label_property_id,url_property_id,hint_property_id,notion_connections!inner(workspace_id,encrypted_access_token,status)",
    )
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!watchList)
    redirect("/imports/notion?error=Active%20watch%20list%20not%20found.");

  const connection = Array.isArray(watchList.notion_connections)
    ? watchList.notion_connections[0]
    : watchList.notion_connections;
  if (!connection || connection.status !== "connected")
    redirect("/imports/notion?error=Reconnect%20the%20Notion%20workspace.");

  let batchId: string;
  try {
    const token = decryptNotionToken(
      connection.encrypted_access_token,
      `${user.id}:${connection.workspace_id}`,
    );
    const candidates: ReturnType<typeof pageCandidate>[] = [];
    let cursor: string | null = null;
    do {
      const response = notionQuerySchema.parse(
        await notionRequest<unknown>(
          token,
          `/data_sources/${watchList.data_source_id}/query`,
          {
            method: "POST",
            body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
          },
        ),
      );
      candidates.push(
        ...response.results.map((page) =>
          pageCandidate(
            page,
            watchList.label_property_id,
            watchList.url_property_id,
            watchList.hint_property_id,
          ),
        ),
      );
      cursor = response.has_more ? response.next_cursor : null;
    } while (cursor);

    const { data, error } = await supabase.rpc("stage_notion_import", {
      p_watch_list_id: watchList.id,
      p_pages: candidates,
    });
    if (error) throw error;
    batchId = String(data);
  } catch (error) {
    redirect(
      `/imports/notion?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not sync the watch list.")}`,
    );
  }
  redirect(`/imports/notion?review=${encodeURIComponent(batchId)}`);
}

export async function dismissNotionBatch(formData: FormData) {
  const batchId = watchListIdSchema.safeParse(formData.get("batchId"));
  if (!batchId.success)
    redirect("/imports/notion?error=Invalid%20import%20batch.");
  const { supabase, user } = await requireUser();
  const { data: batch } = await supabase
    .from("notion_import_batches")
    .select("watch_list_id")
    .eq("id", batchId.data)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (!batch)
    redirect("/imports/notion?error=Pending%20import%20batch%20not%20found.");
  const { error } = await supabase
    .from("notion_import_batches")
    .update({ status: "dismissed" })
    .eq("id", batchId.data)
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (error)
    redirect(`/imports/notion?error=${encodeURIComponent(error.message)}`);
  const { error: watchListError } = await supabase
    .from("notion_watch_lists")
    .update({ last_new_count: 0 })
    .eq("id", batch.watch_list_id)
    .eq("user_id", user.id);
  if (watchListError)
    redirect(
      `/imports/notion?error=${encodeURIComponent(watchListError.message)}`,
    );
  redirect(
    "/imports/notion?success=Import%20dismissed.%20No%20items%20were%20added.",
  );
}

export async function importNotionBatch(formData: FormData) {
  const batchId = watchListIdSchema.safeParse(formData.get("batchId"));
  const entryIds = formData.getAll("entryId").map(String);
  const parsedEntries = z
    .array(z.string().uuid())
    .max(10000)
    .safeParse(entryIds);
  if (!batchId.success || !parsedEntries.success || !parsedEntries.data.length)
    redirect(
      "/imports/notion?error=Select%20at%20least%20one%20item%20to%20import.",
    );
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("import_notion_batch", {
    p_batch_id: batchId.data,
    p_entry_ids: parsedEntries.data,
  });
  if (error)
    redirect(`/imports/notion?error=${encodeURIComponent(error.message)}`);
  const count = Number(data ?? 0);
  redirect(
    `/imports/notion?success=${encodeURIComponent(`Imported ${count} new memory item${count === 1 ? "" : "s"}.`)}`,
  );
}

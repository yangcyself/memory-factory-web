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
    const { error } = await supabase.from("notion_watch_lists").insert({
      connection_id: connection.id,
      database_id: database.id.replaceAll("-", ""),
      data_source_id: dataSource.id,
      name,
    });
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

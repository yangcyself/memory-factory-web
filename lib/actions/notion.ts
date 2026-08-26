"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { notionRequest } from "@/lib/notion/api";
import { decryptNotionToken } from "@/lib/notion/crypto";
import { parseNotionDatabaseId } from "@/lib/notion/url";

const databaseSchema = z.object({
  id: z.string().min(1),
  title: z.array(z.object({ plain_text: z.string().optional() })).optional(),
  data_sources: z
    .array(z.object({ id: z.string().min(1), name: z.string().optional() }))
    .optional(),
});

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

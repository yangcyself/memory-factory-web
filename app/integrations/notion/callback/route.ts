import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { decryptNotionSecret, encryptNotionToken } from "@/lib/notion/crypto";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  workspace_id: z.string().min(1),
  workspace_name: z.string().optional(),
  workspace_icon: z.string().nullable().optional(),
  bot_id: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !code || !state)
    return NextResponse.redirect(
      new URL(
        "/imports/notion?error=Notion%20authorization%20was%20not%20completed.",
        url.origin,
      ),
    );
  const hash = createHash("sha256").update(state).digest("hex");
  const { data: consumedStates, error: stateError } = await supabase.rpc(
    "consume_notion_oauth_state",
    { p_state_hash: hash },
  );
  const consumedState = Array.isArray(consumedStates)
    ? consumedStates[0]
    : consumedStates;
  if (stateError || !consumedState?.integration_setting_id)
    return NextResponse.redirect(
      new URL(
        "/imports/notion?error=Authorization%20expired.%20Please%20try%20again.",
        url.origin,
      ),
    );
  const { data: setting } = await supabase
    .from("notion_integration_settings")
    .select("client_id,encrypted_client_secret")
    .eq("id", consumedState.integration_setting_id)
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!setting)
    return NextResponse.redirect(
      new URL(
        "/imports/notion?error=Notion%20integration%20credentials%20were%20not%20found.",
        url.origin,
      ),
    );
  let clientSecret: string;
  try {
    clientSecret = decryptNotionSecret(
      setting.encrypted_client_secret,
      `${data.user.id}:notion-client:${setting.client_id}`,
    );
  } catch {
    return NextResponse.redirect(
      new URL(
        "/imports/notion?error=Could%20not%20decrypt%20the%20Notion%20credentials.",
        url.origin,
      ),
    );
  }
  const redirectUri = new URL("/integrations/notion/callback", url.origin).href;
  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${setting.client_id}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok)
    return NextResponse.redirect(
      new URL(
        "/imports/notion?error=Notion%20did%20not%20authorize%20the%20connection.",
        url.origin,
      ),
    );
  const parsedToken = tokenResponseSchema.safeParse(await response.json());
  if (!parsedToken.success)
    return NextResponse.redirect(
      new URL(
        "/imports/notion?error=Notion%20returned%20an%20invalid%20authorization%20response.",
        url.origin,
      ),
    );
  const token = parsedToken.data;
  const encrypted = encryptNotionToken(
    token.access_token,
    `${data.user.id}:${token.workspace_id}`,
  );
  const { error } = await supabase.from("notion_connections").upsert(
    {
      workspace_id: token.workspace_id,
      workspace_name: token.workspace_name,
      workspace_icon: token.workspace_icon,
      bot_id: token.bot_id,
      encrypted_access_token: encrypted,
      status: "connected",
      last_error_code: null,
    },
    { onConflict: "user_id,workspace_id" },
  );
  if (error)
    return NextResponse.redirect(
      new URL(
        "/imports/notion?error=Could%20not%20save%20the%20connection.",
        url.origin,
      ),
    );
  return NextResponse.redirect(
    new URL(String(consumedState.next_path), url.origin),
  );
}

import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { encryptNotionToken } from "@/lib/notion/crypto";

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
  const { data: nextPath, error: stateError } = await supabase.rpc(
    "consume_notion_oauth_state",
    { p_state_hash: hash },
  );
  if (stateError || !nextPath)
    return NextResponse.redirect(
      new URL(
        "/imports/notion?error=Authorization%20expired.%20Please%20try%20again.",
        url.origin,
      ),
    );
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri)
    return NextResponse.redirect(
      new URL(
        "/imports/notion?error=Notion%20OAuth%20is%20not%20configured.",
        url.origin,
      ),
    );
  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
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
  return NextResponse.redirect(new URL(String(nextPath), url.origin));
}

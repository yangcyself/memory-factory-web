import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login", request.url));
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri)
    return NextResponse.redirect(
      new URL(
        "/imports/notion?error=Notion%20OAuth%20is%20not%20configured.",
        request.url,
      ),
    );
  const state = randomBytes(32).toString("base64url");
  const stateHash = createHash("sha256").update(state).digest("hex");
  const { error } = await supabase
    .from("notion_oauth_states")
    .insert({ state_hash: stateHash });
  if (error)
    return NextResponse.redirect(
      new URL(
        "/imports/notion?error=Could%20not%20start%20Notion%20authorization.",
        request.url,
      ),
    );
  const target = new URL("https://api.notion.com/v1/oauth/authorize");
  target.search = new URLSearchParams({
    owner: "user",
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  }).toString();
  return NextResponse.redirect(target);
}

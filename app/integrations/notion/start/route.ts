import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login", request.url));
  const { data: setting } = await supabase
    .from("notion_integration_settings")
    .select("id,client_id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!setting)
    return NextResponse.redirect(
      new URL(
        "/imports/notion?error=Save%20your%20Notion%20integration%20credentials%20first.",
        request.url,
      ),
    );
  const state = randomBytes(32).toString("base64url");
  const stateHash = createHash("sha256").update(state).digest("hex");
  const { error } = await supabase.from("notion_oauth_states").insert({
    state_hash: stateHash,
    integration_setting_id: setting.id,
  });
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
    client_id: setting.client_id,
    redirect_uri: new URL("/integrations/notion/callback", request.url).href,
    response_type: "code",
    state,
  }).toString();
  return NextResponse.redirect(target);
}

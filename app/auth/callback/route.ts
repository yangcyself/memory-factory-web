import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(
    new URL(
      "/login?message=Could%20not%20confirm%20your%20account.",
      url.origin,
    ),
  );
}

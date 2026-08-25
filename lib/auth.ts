import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { supabase, user: data.user };
}

export function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "/today";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
    ? next
    : "/today";
}

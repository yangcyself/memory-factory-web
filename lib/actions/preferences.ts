"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isValidTimeZone } from "@/lib/date-time";

export async function updateReviewPreferences(formData: FormData) {
  const timeZone = String(formData.get("timeZone") ?? "").trim();
  if (!isValidTimeZone(timeZone))
    redirect("/settings?error=Enter%20a%20valid%20IANA%20time%20zone.");
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("user_review_preferences")
    .upsert(
      { user_id: user.id, time_zone: timeZone },
      { onConflict: "user_id" },
    );
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  redirect("/settings?success=Review%20preferences%20saved.");
}

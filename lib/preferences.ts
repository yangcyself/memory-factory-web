import type { SupabaseClient } from "@supabase/supabase-js";

export async function getReviewTimeZone(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("user_review_preferences")
    .select("time_zone")
    .maybeSingle();
  return data?.time_zone ?? "UTC";
}

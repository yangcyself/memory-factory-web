"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatDateTime, zonedLocalDateTimeToUtc } from "@/lib/date-time";
import { getReviewTimeZone } from "@/lib/preferences";
import {
  importanceSchema,
  itemSchema,
  relationshipSchema,
  reviewSchema,
  scheduleAdjustmentSchema,
} from "@/lib/validation";

function detailUrl(id: string, kind: "error" | "success", message: string) {
  return `/items/${id}?${kind}=${encodeURIComponent(message)}`;
}

export async function adjustReviewSchedule(formData: FormData) {
  const input = {
    itemId: formData.get("itemId"),
    action: formData.get("action"),
    postponeDays: formData.get("postponeDays"),
    scheduledAt: String(formData.get("scheduledAt") ?? "") || undefined,
  };
  const parsed = scheduleAdjustmentSchema.safeParse(input);
  const fallbackId = String(formData.get("itemId") ?? "");
  if (!parsed.success)
    redirect(detailUrl(fallbackId, "error", parsed.error.issues[0].message));
  const { supabase } = await requireUser();
  const timeZone = await getReviewTimeZone(supabase);
  const scheduledAt =
    "scheduledAt" in parsed.data && parsed.data.scheduledAt
      ? zonedLocalDateTimeToUtc(parsed.data.scheduledAt, timeZone).toISOString()
      : null;
  const { error } = await supabase.rpc("adjust_review_schedule", {
    p_item_id: parsed.data.itemId,
    p_action: parsed.data.action,
    p_scheduled_at: scheduledAt,
    p_postpone_days:
      "postponeDays" in parsed.data ? parsed.data.postponeDays : null,
  });
  if (error) redirect(detailUrl(parsed.data.itemId, "error", error.message));
  redirect(
    detailUrl(
      parsed.data.itemId,
      "success",
      "Review schedule updated without recording a review.",
    ),
  );
}

export async function createItem(formData: FormData) {
  const parsed = itemSchema.safeParse({
    title: formData.get("title"),
    url: formData.get("url"),
    shortText: formData.get("shortText"),
    importance: formData.get("importance") ?? "1",
  });
  if (!parsed.success) {
    redirect(
      `/items/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`,
    );
  }
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("items")
    .insert({
      title: parsed.data.title,
      url: parsed.data.url,
      short_text: parsed.data.shortText,
      importance: parsed.data.importance,
    })
    .select("id")
    .single();
  if (error) redirect(`/items/new?error=${encodeURIComponent(error.message)}`);
  redirect(
    detailUrl(
      data.id,
      "success",
      parsed.data.importance === 0
        ? "Item added. Reviews are disabled because its importance is 0."
        : "Item added with its first review scheduled from its importance.",
    ),
  );
}

export async function setItemImportance(formData: FormData) {
  const parsed = importanceSchema.safeParse({
    itemId: formData.get("itemId"),
    importance: formData.get("importance"),
  });
  const fallbackId = String(formData.get("itemId") ?? "");
  if (!parsed.success)
    redirect(
      detailUrl(fallbackId, "error", "Choose an importance from 0 to 5."),
    );
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_item_importance", {
    p_item_id: parsed.data.itemId,
    p_importance: parsed.data.importance,
  });
  if (error) redirect(detailUrl(parsed.data.itemId, "error", error.message));
  const message =
    parsed.data.importance === 0
      ? "Importance updated. Reviews are now disabled for this item."
      : "Importance updated. Its existing review date was preserved.";
  redirect(detailUrl(parsed.data.itemId, "success", message));
}

export async function completeReview(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    itemId: formData.get("itemId"),
    memoryRating: formData.get("memoryRating"),
    importance: formData.get("importance"),
  });
  const fallbackId = String(formData.get("itemId") ?? "");
  if (!parsed.success)
    redirect(detailUrl(fallbackId, "error", "Choose a rating from 0 to 4."));
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("complete_review", {
    p_item_id: parsed.data.itemId,
    p_memory_rating: parsed.data.memoryRating,
    p_importance: parsed.data.importance,
  });
  if (error) redirect(detailUrl(parsed.data.itemId, "error", error.message));
  const next = Array.isArray(data) ? data[0]?.next_review_at : undefined;
  const timeZone = await getReviewTimeZone(supabase);
  const message = next
    ? `Review saved. Next review: ${formatDateTime(next, timeZone)}.`
    : "Review saved and the schedule was updated.";
  redirect(detailUrl(parsed.data.itemId, "success", message));
}

export async function createRelationship(formData: FormData) {
  const parsed = relationshipSchema.safeParse({
    sourceItemId: formData.get("sourceItemId"),
    targetItemId: formData.get("targetItemId"),
    relationType: formData.get("relationType"),
    semanticWeight: formData.get("semanticWeight"),
  });
  const sourceId = String(formData.get("sourceItemId") ?? "");
  if (!parsed.success)
    redirect(detailUrl(sourceId, "error", parsed.error.issues[0].message));
  const { supabase } = await requireUser();
  const { error } = await supabase.from("item_edges").insert({
    source_item_id: parsed.data.sourceItemId,
    target_item_id: parsed.data.targetItemId,
    relation_type: parsed.data.relationType,
    semantic_weight: parsed.data.semanticWeight,
  });
  if (error) {
    const message =
      error.code === "23505"
        ? "That relationship already exists."
        : error.message;
    redirect(detailUrl(sourceId, "error", message));
  }
  redirect(detailUrl(sourceId, "success", "Relationship added."));
}

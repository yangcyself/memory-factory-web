"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { itemSchema, relationshipSchema, reviewSchema } from "@/lib/validation";

function detailUrl(id: string, kind: "error" | "success", message: string) {
  return `/items/${id}?${kind}=${encodeURIComponent(message)}`;
}

export async function createItem(formData: FormData) {
  const parsed = itemSchema.safeParse({
    title: formData.get("title"),
    url: formData.get("url"),
    shortText: formData.get("shortText"),
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
    })
    .select("id")
    .single();
  if (error) redirect(`/items/new?error=${encodeURIComponent(error.message)}`);
  redirect(
    detailUrl(
      data.id,
      "success",
      "Item added. Its first review is due in about one day.",
    ),
  );
}

export async function completeReview(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    itemId: formData.get("itemId"),
    memoryRating: formData.get("memoryRating"),
  });
  const fallbackId = String(formData.get("itemId") ?? "");
  if (!parsed.success)
    redirect(detailUrl(fallbackId, "error", "Choose a rating from 0 to 4."));
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("complete_review", {
    p_item_id: parsed.data.itemId,
    p_memory_rating: parsed.data.memoryRating,
  });
  if (error) redirect(detailUrl(parsed.data.itemId, "error", error.message));
  const next = Array.isArray(data) ? data[0]?.next_review_at : undefined;
  const message = next
    ? `Review saved. Next review: ${new Date(next).toLocaleString()}.`
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

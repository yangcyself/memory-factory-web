import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/notice";
import { completeReview, createRelationship } from "@/lib/actions/items";
import { requireUser } from "@/lib/auth";
import { ratingOptions } from "@/lib/review-schedule";

type Edge = {
  id: string;
  source_item_id: string;
  target_item_id: string;
  relation_type: string;
  semantic_weight: number;
};

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  const notices = await searchParams;
  const { supabase } = await requireUser();
  const [
    { data: item },
    { data: state },
    { data: reviews },
    { data: edges },
    { data: allItems },
  ] = await Promise.all([
    supabase
      .from("items")
      .select("id,title,url,short_text")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("review_state")
      .select("next_review_at")
      .eq("item_id", id)
      .maybeSingle(),
    supabase
      .from("review_events")
      .select("id,reviewed_at,memory_rating")
      .eq("item_id", id)
      .order("reviewed_at", { ascending: false }),
    supabase
      .from("item_edges")
      .select("id,source_item_id,target_item_id,relation_type,semantic_weight")
      .or(`source_item_id.eq.${id},target_item_id.eq.${id}`)
      .order("created_at", { ascending: false }),
    supabase.from("items").select("id,title").neq("id", id).order("title"),
  ]);
  if (!item) notFound();
  const itemMap = new Map(
    (allItems ?? []).map((other) => [other.id, other.title]),
  );
  const edgeRows = (edges ?? []) as Edge[];
  return (
    <section>
      <Notice {...notices} />
      <h1 className="text-3xl font-bold">{item.title}</h1>
      {item.url && (
        <p className="mt-3 break-all">
          <a
            className="text-leaf underline"
            href={item.url}
            target="_blank"
            rel="noreferrer"
          >
            {item.url}
          </a>
        </p>
      )}
      {item.short_text && (
        <p className="mt-4 whitespace-pre-wrap rounded-xl bg-white p-4">
          {item.short_text}
        </p>
      )}
      <p className="mt-4 text-sm font-medium">
        Next review:{" "}
        {state
          ? new Date(state.next_review_at).toLocaleString()
          : "Schedule unavailable"}
      </p>

      <section className="mt-10">
        <h2 className="text-2xl font-bold">Complete a review</h2>
        <form action={completeReview} className="mt-4 grid gap-3">
          <input type="hidden" name="itemId" value={id} />
          {ratingOptions.map((option) => (
            <label
              className="card flex cursor-pointer items-start gap-3"
              key={option.value}
            >
              <input
                className="mt-1 size-4 w-auto"
                type="radio"
                name="memoryRating"
                value={option.value}
                required
              />
              <span>
                <strong>
                  {option.value} — {option.label}
                </strong>
                <span className="block text-sm text-black/60">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
          <button className="button sm:w-fit">Save review</button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-bold">Review history</h2>
        {reviews?.length ? (
          <ul className="mt-4 divide-y divide-black/10 rounded-xl bg-white px-4">
            {reviews.map((review) => (
              <li className="flex justify-between gap-4 py-3" key={review.id}>
                <span>
                  {ratingOptions[review.memory_rating]?.label ??
                    `Rating ${review.memory_rating}`}
                </span>
                <time className="text-sm text-black/55">
                  {new Date(review.reviewed_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-black/60">No reviews yet.</p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-bold">Connections</h2>
        {edgeRows.length ? (
          <ul className="mt-4 space-y-3">
            {edgeRows.map((edge) => {
              const outgoing = edge.source_item_id === id;
              const otherId = outgoing
                ? edge.target_item_id
                : edge.source_item_id;
              const direction =
                edge.relation_type === "related"
                  ? "Undirected"
                  : outgoing
                    ? "Outgoing"
                    : "Incoming";
              return (
                <li className="card" key={edge.id}>
                  <span className="text-sm text-black/55">
                    {direction} · {edge.relation_type.replaceAll("_", " ")} ·
                    weight {edge.semantic_weight}
                  </span>
                  <Link
                    className="mt-1 block font-semibold text-leaf hover:underline"
                    href={`/items/${otherId}`}
                  >
                    {itemMap.get(otherId) ?? "Related item"}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-black/60">No connections yet.</p>
        )}
        {allItems?.length ? (
          <form
            action={createRelationship}
            className="card mt-6 grid gap-4 sm:grid-cols-3"
          >
            <input type="hidden" name="sourceItemId" value={id} />
            <label>
              Related item
              <select className="mt-1" name="targetItemId" required>
                <option value="">Choose an item</option>
                {allItems.map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select
                className="mt-1"
                name="relationType"
                defaultValue="related"
              >
                {[
                  "related",
                  "contains",
                  "references",
                  "applied_in",
                  "derived_from",
                  "contradicts",
                ].map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Strength
              <select className="mt-1" name="semanticWeight" defaultValue="0.5">
                <option value="0.25">Weak</option>
                <option value="0.5">Medium</option>
                <option value="0.9">Strong</option>
              </select>
            </label>
            <button className="button sm:col-span-3 sm:w-fit">
              Add relationship
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm">
            Add another item before creating a relationship.
          </p>
        )}
      </section>
    </section>
  );
}

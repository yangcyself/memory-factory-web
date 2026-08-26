import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/notice";
import {
  completeReview,
  createRelationship,
  setItemImportance,
  adjustReviewSchedule,
} from "@/lib/actions/items";
import { requireUser } from "@/lib/auth";
import { importanceOptions, ratingOptions } from "@/lib/review-schedule";
import { formatDateTime } from "@/lib/date-time";
import { getReviewTimeZone } from "@/lib/preferences";

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
    { data: importanceEvents },
    { data: scheduleEvents },
    { data: edges },
    { data: allItems },
  ] = await Promise.all([
    supabase
      .from("items")
      .select("id,title,url,short_text,importance")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("review_state")
      .select(
        "next_review_at,suspended,difficulty,stability_days,repetitions,lapses",
      )
      .eq("item_id", id)
      .maybeSingle(),
    supabase
      .from("review_events")
      .select("id,reviewed_at,memory_rating")
      .eq("item_id", id)
      .order("reviewed_at", { ascending: false }),
    supabase
      .from("item_importance_events")
      .select("id,changed_at,previous_importance,new_importance")
      .eq("item_id", id)
      .order("changed_at", { ascending: false }),
    supabase
      .from("schedule_adjustment_events")
      .select("id,adjustment_type,previous_review_at,new_review_at,created_at")
      .eq("item_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("item_edges")
      .select("id,source_item_id,target_item_id,relation_type,semantic_weight")
      .or(`source_item_id.eq.${id},target_item_id.eq.${id}`)
      .order("created_at", { ascending: false }),
    supabase.from("items").select("id,title").neq("id", id).order("title"),
  ]);
  if (!item) notFound();
  const timeZone = await getReviewTimeZone(supabase);
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
        {item.importance === 0
          ? "Not scheduled (importance 0)"
          : state?.suspended
            ? "Suspended"
            : state?.next_review_at
              ? formatDateTime(state.next_review_at, timeZone)
              : "Schedule unavailable"}
      </p>

      <form
        action={setItemImportance}
        className="card mt-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <input type="hidden" name="itemId" value={id} />
        <label>
          Importance
          <select
            className="mt-1"
            name="importance"
            defaultValue={item.importance}
          >
            {importanceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value} — {option.label}: {option.description}
              </option>
            ))}
          </select>
        </label>
        <button className="button-secondary">Update importance</button>
        <p className="text-sm text-black/55 sm:col-span-2">
          Changing levels 1–5 preserves the current review date; the new cadence
          begins after your next review. Level 0 disables reviews.
        </p>
      </form>

      {item.importance > 0 && (
        <section className="card mt-6">
          <h2 className="text-lg font-semibold">Schedule controls</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {state?.suspended ? (
              <form action={adjustReviewSchedule}>
                <input type="hidden" name="itemId" value={id} />
                <input type="hidden" name="action" value="resumed" />
                <button className="button-secondary">Resume now</button>
              </form>
            ) : (
              <>
                <form action={adjustReviewSchedule} className="flex gap-2">
                  <input type="hidden" name="itemId" value={id} />
                  <input type="hidden" name="action" value="postponed" />
                  <select
                    aria-label="Postpone duration"
                    name="postponeDays"
                    defaultValue="1"
                  >
                    <option value="1">1 day</option>
                    <option value="7">1 week</option>
                    <option value="30">30 days</option>
                  </select>
                  <button className="button-secondary">Postpone</button>
                </form>
                <form action={adjustReviewSchedule}>
                  <input type="hidden" name="itemId" value={id} />
                  <input type="hidden" name="action" value="suspended" />
                  <button className="button-secondary">Suspend</button>
                </form>
              </>
            )}
          </div>
          <form
            action={adjustReviewSchedule}
            className="mt-4 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="itemId" value={id} />
            <input type="hidden" name="action" value="rescheduled" />
            <label>
              Set date and time
              <input
                className="mt-1"
                type="datetime-local"
                name="scheduledAt"
                required
              />
            </label>
            <button className="button-secondary">Reschedule</button>
          </form>
          <p className="mt-3 text-xs text-black/55">
            Manual controls do not record a completed review. Entered and
            displayed times use {timeZone}.
          </p>
        </section>
      )}

      {state && item.importance > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <p className="card">
            <strong className="block">Difficulty</strong>
            {Number(state.difficulty).toFixed(1)} / 10
          </p>
          <p className="card">
            <strong className="block">Stability</strong>
            {Math.round(Number(state.stability_days))} days
          </p>
          <p className="card">
            <strong className="block">Successful</strong>
            {state.repetitions}
          </p>
          <p className="card">
            <strong className="block">Lapses</strong>
            {state.lapses}
          </p>
        </div>
      )}

      {item.importance > 0 && !state?.suspended && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold">Complete a review</h2>
          <form action={completeReview} className="mt-4 grid gap-3">
            <input type="hidden" name="itemId" value={id} />
            <label className="card">
              Importance after this review
              <select
                className="mt-1"
                name="importance"
                defaultValue={item.importance || 1}
              >
                {importanceOptions
                  .filter((option) => option.value > 0)
                  .map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value} — {option.label}
                    </option>
                  ))}
              </select>
              <span className="mt-1 block text-sm font-normal text-black/55">
                Choose the long-term cadence while this item is fresh in mind.
              </span>
            </label>
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
      )}

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
                  {formatDateTime(review.reviewed_at, timeZone)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-black/60">No reviews yet.</p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-bold">Importance history</h2>
        {importanceEvents?.length ? (
          <ul className="mt-4 divide-y divide-black/10 rounded-xl bg-white px-4">
            {importanceEvents.map((event) => (
              <li
                className="flex flex-wrap justify-between gap-2 py-3"
                key={event.id}
              >
                <span>
                  Importance {event.previous_importance} →{" "}
                  {event.new_importance}
                </span>
                <time
                  className="text-sm text-black/55"
                  dateTime={event.changed_at}
                >
                  {formatDateTime(event.changed_at, timeZone)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-black/60">Importance has not changed.</p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-bold">Schedule history</h2>
        {scheduleEvents?.length ? (
          <ul className="mt-4 divide-y divide-black/10 rounded-xl bg-white px-4">
            {scheduleEvents.map((event) => (
              <li className="py-3" key={event.id}>
                <strong className="capitalize">{event.adjustment_type}</strong>
                <span className="ml-2 text-sm text-black/55">
                  {formatDateTime(event.created_at, timeZone)}
                </span>
                <p className="text-sm text-black/65">
                  {event.new_review_at
                    ? `Next review: ${formatDateTime(event.new_review_at, timeZone)}`
                    : "No review date"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-black/60">No manual schedule changes.</p>
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

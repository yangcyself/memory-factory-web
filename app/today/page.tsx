import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ItemCard } from "@/components/item-card";
import { getReviewTimeZone } from "@/lib/preferences";
import { zonedDayBoundaries } from "@/lib/date-time";

type DueRow = {
  next_review_at: string;
  items: {
    id: string;
    title: string;
    url: string | null;
    short_text: string | null;
  } | null;
};

export default async function TodayPage() {
  const { supabase } = await requireUser();
  const timeZone = await getReviewTimeZone(supabase);
  const currentDate = new Date();
  const now = currentDate.toISOString();
  const boundaries = zonedDayBoundaries(currentDate, timeZone);
  const [
    dueResult,
    upcomingResult,
    overdueCount,
    todayCount,
    weekCount,
    unscheduledCount,
  ] = await Promise.all([
    supabase
      .from("review_state")
      .select("next_review_at, items(id,title,url,short_text)")
      .lte("next_review_at", now)
      .eq("suspended", false)
      .order("next_review_at", { ascending: true }),
    supabase
      .from("review_state")
      .select("next_review_at, items(id,title,url,short_text)")
      .gt("next_review_at", now)
      .eq("suspended", false)
      .order("next_review_at", { ascending: true })
      .limit(3),
    supabase
      .from("review_state")
      .select("item_id", { count: "exact", head: true })
      .eq("suspended", false)
      .lt("next_review_at", boundaries.start.toISOString()),
    supabase
      .from("review_state")
      .select("item_id", { count: "exact", head: true })
      .eq("suspended", false)
      .gte("next_review_at", boundaries.start.toISOString())
      .lt("next_review_at", boundaries.tomorrow.toISOString()),
    supabase
      .from("review_state")
      .select("item_id", { count: "exact", head: true })
      .eq("suspended", false)
      .gte("next_review_at", boundaries.tomorrow.toISOString())
      .lt("next_review_at", boundaries.week.toISOString()),
    supabase
      .from("review_state")
      .select("item_id", { count: "exact", head: true })
      .is("next_review_at", null),
  ]);
  const dueRows = (dueResult.data ?? []) as unknown as DueRow[];
  const upcomingRows = (upcomingResult.data ?? []) as unknown as DueRow[];
  const error =
    dueResult.error ??
    upcomingResult.error ??
    overdueCount.error ??
    todayCount.error ??
    weekCount.error ??
    unscheduledCount.error;
  const hasScheduledItems = dueRows.length > 0 || upcomingRows.length > 0;

  return (
    <section>
      <h1 className="text-3xl font-bold">Review</h1>
      <p className="mt-2 text-black/65">
        Strengthen a memory, then rate what you could recall to set its next
        review.
      </p>
      <section className="mt-6" aria-labelledby="queue-overview">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold" id="queue-overview">
            Queue overview
          </h2>
          <p className="text-xs text-black/55">Day boundaries use {timeZone}</p>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card">
            <dt className="text-sm text-black/60">Overdue</dt>
            <dd className="text-2xl font-bold">{overdueCount.count ?? 0}</dd>
          </div>
          <div className="card">
            <dt className="text-sm text-black/60">Due today</dt>
            <dd className="text-2xl font-bold">{todayCount.count ?? 0}</dd>
          </div>
          <div className="card">
            <dt className="text-sm text-black/60">Next 7 days</dt>
            <dd className="text-2xl font-bold">{weekCount.count ?? 0}</dd>
          </div>
          <div className="card">
            <dt className="text-sm text-black/60">Unscheduled</dt>
            <dd className="text-2xl font-bold">
              {unscheduledCount.count ?? 0}
            </dd>
          </div>
        </dl>
      </section>
      {error && (
        <p className="mt-6 rounded-lg bg-red-100 p-3 text-red-900">
          {error.message}
        </p>
      )}
      {!error && dueRows.length === 0 && (
        <div className="card mt-6">
          <h2 className="text-lg font-semibold">You are caught up</h2>
          <p className="mt-1 text-black/65">
            Nothing is due right now. Every new item—including an imported
            item—is automatically scheduled for its first review about one day
            after it is created.
          </p>
        </div>
      )}

      {!error && dueRows.length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xl font-bold">Due now</h2>
          <p className="mt-1 text-sm text-black/60">
            Start with the oldest scheduled item.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {dueRows.map(
              (row) =>
                row.items && (
                  <ItemCard
                    key={row.items.id}
                    item={row.items}
                    dueAt={row.next_review_at}
                    actionLabel="Review now"
                    timeZone={timeZone}
                  />
                ),
            )}
          </div>
        </section>
      )}

      {!error && dueRows.length === 0 && upcomingRows.length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xl font-bold">Keep your momentum</h2>
          <p className="mt-1 text-black/65">
            Want an extra practice round? Review one of the next items early.
            This will reschedule it based on your recall rating.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {upcomingRows.map(
              (row) =>
                row.items && (
                  <ItemCard
                    key={row.items.id}
                    item={row.items}
                    dueAt={row.next_review_at}
                    actionLabel="Review early"
                    timeZone={timeZone}
                  />
                ),
            )}
          </div>
        </section>
      )}

      {!error && !hasScheduledItems && (
        <div className="mt-6 text-center">
          <p className="text-black/65">
            Add an item to start your review queue.
          </p>
          <Link className="button mt-4" href="/items/new">
            Add an item
          </Link>
        </div>
      )}

      <aside className="mt-10 rounded-xl bg-mist p-4 text-sm text-black/70">
        <strong className="text-ink">How scheduling works:</strong> importance
        controls how often an item returns, while your 0–4 recall rating adjusts
        its next interval. Importance 0 disables reviews; importance 1 targets
        roughly once every one to two years; importance 5 keeps must-memorize
        material frequent. You can always review an item early.
      </aside>
    </section>
  );
}

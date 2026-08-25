import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ItemCard } from "@/components/item-card";

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
  const { data, error } = await supabase
    .from("review_state")
    .select("next_review_at, items(id,title,url,short_text)")
    .lte("next_review_at", new Date().toISOString())
    .order("next_review_at", { ascending: true });
  const rows = (data ?? []) as unknown as DueRow[];
  return (
    <section>
      <h1 className="text-3xl font-bold">Today</h1>
      <p className="mt-2 text-black/65">
        Items ready for a quick memory check.
      </p>
      {error && (
        <p className="mt-6 rounded-lg bg-red-100 p-3 text-red-900">
          {error.message}
        </p>
      )}
      {!error && rows.length === 0 ? (
        <div className="card mt-6 text-center">
          <p>Nothing is due right now.</p>
          <Link className="button mt-4" href="/items/new">
            Add an item
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {rows.map(
            (row) =>
              row.items && (
                <ItemCard
                  key={row.items.id}
                  item={row.items}
                  dueAt={row.next_review_at}
                />
              ),
          )}
        </div>
      )}
    </section>
  );
}

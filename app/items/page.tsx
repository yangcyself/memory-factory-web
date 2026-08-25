import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ItemCard } from "@/components/item-card";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const { supabase } = await requireUser();
  let query = supabase
    .from("items")
    .select("id,title,url,short_text")
    .order("updated_at", { ascending: false });
  if (q.trim())
    query = query.ilike(
      "title",
      `%${q.trim().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
    );
  const { data, error } = await query;
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">All items</h1>
        <Link className="button" href="/items/new">
          Add item
        </Link>
      </div>
      <form className="mt-6 flex gap-2" action="/items">
        <label className="sr-only" htmlFor="q">
          Search titles
        </label>
        <input id="q" name="q" defaultValue={q} placeholder="Search titles" />
        <button className="button-secondary">Search</button>
      </form>
      {error && (
        <p className="mt-6 rounded-lg bg-red-100 p-3">{error.message}</p>
      )}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {data?.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>
      {!error && data?.length === 0 && (
        <p className="card mt-6">No matching items.</p>
      )}
    </section>
  );
}

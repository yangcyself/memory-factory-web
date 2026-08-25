import { createItem } from "@/lib/actions/items";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/notice";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { error } = await searchParams;
  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold">Add item</h1>
      <p className="mt-2 text-black/65">
        Capture a link, a memory cue, or both.
      </p>
      <form action={createItem} className="card mt-6 space-y-4">
        <Notice error={error} />
        <label>
          Title
          <input className="mt-1" name="title" maxLength={200} required />
        </label>
        <label>
          URL <span className="font-normal text-black/55">(optional)</span>
          <input
            className="mt-1"
            name="url"
            type="url"
            placeholder="https://example.com"
          />
        </label>
        <label>
          Short text{" "}
          <span className="font-normal text-black/55">(optional)</span>
          <textarea
            className="mt-1 min-h-36"
            name="shortText"
            maxLength={5000}
          />
        </label>
        <p className="text-sm text-black/55">
          At least one of URL or short text is required.
        </p>
        <button className="button" type="submit">
          Create item
        </button>
      </form>
    </section>
  );
}

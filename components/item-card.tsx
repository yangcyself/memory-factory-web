import Link from "next/link";

type ItemCardProps = {
  item: {
    id: string;
    title: string;
    url: string | null;
    short_text: string | null;
  };
  dueAt?: string;
};

export function ItemCard({ item, dueAt }: ItemCardProps) {
  let summary = item.short_text?.slice(0, 140);
  if (item.url) {
    try {
      summary = new URL(item.url).hostname;
    } catch {
      summary = item.url;
    }
  }
  return (
    <article className="card">
      <h2 className="text-lg font-semibold">
        <Link className="hover:underline" href={`/items/${item.id}`}>
          {item.title}
        </Link>
      </h2>
      {summary && (
        <p className="mt-1 line-clamp-2 text-sm text-black/65">{summary}</p>
      )}
      {dueAt && (
        <p className="mt-3 text-xs font-medium text-leaf">
          Due {new Date(dueAt).toLocaleString()}
        </p>
      )}
    </article>
  );
}

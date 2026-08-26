import Link from "next/link";
import { formatDateTime } from "@/lib/date-time";

type ItemCardProps = {
  item: {
    id: string;
    title: string;
    url: string | null;
    short_text: string | null;
  };
  dueAt?: string;
  actionLabel?: string;
  timeZone?: string;
};

export function ItemCard({
  item,
  dueAt,
  actionLabel,
  timeZone = "UTC",
}: ItemCardProps) {
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
          Scheduled for{" "}
          <time dateTime={dueAt}>{formatDateTime(dueAt, timeZone)}</time>
        </p>
      )}
      {actionLabel && (
        <Link
          className="button-secondary mt-4 w-full sm:w-fit"
          href={`/items/${item.id}`}
        >
          {actionLabel}
        </Link>
      )}
    </article>
  );
}

import Link from "next/link";
export default function NotFound() {
  return (
    <section className="text-center">
      <h1 className="text-3xl font-bold">Item not found</h1>
      <p className="mt-3">It may not exist, or you may not have access.</p>
      <Link className="button mt-5" href="/items">
        Back to items
      </Link>
    </section>
  );
}

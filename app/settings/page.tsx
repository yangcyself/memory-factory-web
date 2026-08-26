import { Notice } from "@/components/notice";
import { updateReviewPreferences } from "@/lib/actions/preferences";
import { requireUser } from "@/lib/auth";
import { getReviewTimeZone } from "@/lib/preferences";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const notices = await searchParams;
  const { supabase } = await requireUser();
  const timeZone = await getReviewTimeZone(supabase);
  return (
    <section className="mx-auto max-w-2xl">
      <Notice {...notices} />
      <h1 className="text-3xl font-bold">Review settings</h1>
      <form action={updateReviewPreferences} className="card mt-6 space-y-4">
        <label>
          Time zone
          <input
            className="mt-1"
            name="timeZone"
            defaultValue={timeZone}
            placeholder="America/New_York"
            required
          />
        </label>
        <p className="text-sm text-black/60">
          Use an IANA time zone such as Europe/London or Asia/Tokyo. Queue
          boundaries and displayed dates use this setting.
        </p>
        <button className="button">Save settings</button>
      </form>
      <div className="card mt-6">
        <h2 className="text-lg font-semibold">Advanced scheduling</h2>
        <p className="mt-2 text-sm text-black/65">
          The adaptive scheduler uses recall history, difficulty, elapsed time,
          stability, and lapses. Arbitrary user-written code is intentionally
          not executed on the server because it could access data or exhaust
          resources. A future safe formula language can build on the stored
          scheduler state without weakening account isolation.
        </p>
      </div>
    </section>
  );
}

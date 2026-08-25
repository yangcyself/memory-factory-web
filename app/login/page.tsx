import { redirect } from "next/navigation";
import { signIn, signUp } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; next?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/today");
  return (
    <section className="mx-auto max-w-md">
      <h1 className="text-3xl font-bold">Welcome to MemoryFactory</h1>
      <p className="mt-2 text-black/65">
        Review what matters and follow the connections.
      </p>
      {query.message && (
        <p className="mt-5 rounded-lg bg-mist p-3" role="status">
          {query.message}
        </p>
      )}
      <form className="card mt-6 space-y-4">
        <input type="hidden" name="next" value={query.next ?? "/today"} />
        <label>
          Email
          <input
            className="mt-1"
            type="email"
            name="email"
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            className="mt-1"
            type="password"
            name="password"
            autoComplete="current-password"
            minLength={6}
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button className="button" formAction={signIn}>
            Sign in
          </button>
          <button className="button-secondary" formAction={signUp}>
            Create account
          </button>
        </div>
      </form>
    </section>
  );
}

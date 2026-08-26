import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";

export const metadata: Metadata = {
  title: "MemoryFactory",
  description: "A calm review layer for connected knowledge.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {data.user && (
          <header className="border-b border-black/10 bg-white">
            <nav
              className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm"
              aria-label="Main navigation"
            >
              <Link className="mr-auto text-lg font-bold" href="/today">
                MemoryFactory
              </Link>
              <Link href="/today">Today</Link>
              <Link href="/items">All items</Link>
              <Link href="/items/new">Add item</Link>
              <Link href="/imports/notion">Import</Link>
              <Link href="/settings">Settings</Link>
              <form action={signOut}>
                <button className="font-medium" type="submit">
                  Sign out
                </button>
              </form>
            </nav>
          </header>
        )}
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}

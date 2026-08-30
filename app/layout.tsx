import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { PendingButton } from "@/components/pending-button";

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
          <header className="site-header border-b border-black/10 bg-white">
            <nav
              className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm"
              aria-label="Main navigation"
            >
              <Link className="brand mr-auto text-lg font-bold" href="/today">
                <span className="brand-mark" aria-hidden="true">
                  记
                </span>
                MemoryFactory
              </Link>
              <Link href="/today">Today</Link>
              <Link href="/items">All items</Link>
              <Link href="/items/new">Add item</Link>
              <Link href="/imports/notion">Import</Link>
              <Link href="/settings">Settings</Link>
              <form action={signOut}>
                <PendingButton
                  className="nav-button"
                  pendingLabel="Signing out…"
                >
                  Sign out
                </PendingButton>
              </form>
            </nav>
          </header>
        )}
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}

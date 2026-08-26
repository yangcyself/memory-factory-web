# MemoryFactory Web

MemoryFactory is a mobile-friendly review layer for loosely structured knowledge. Every course, paper, project, experiment, decision, or experience is an item. Reviews create a simple spaced schedule, while typed weighted edges make the collection navigable as a graph.

## Architecture

The application uses Next.js App Router, strict TypeScript, Tailwind CSS, and Server Components/Actions. Supabase provides email/password authentication and PostgreSQL. Normalized `items`, append-only `review_events`, cached `review_state`, and `item_edges` tables are protected by row-level security. Review completion calls one transactional PostgreSQL function; no service-role key is used.

## Prerequisites

- Node.js 20 or newer and npm
- A [Supabase](https://supabase.com/) account
- Supabase CLI (for linking and applying migrations)
- Optional: Docker, for the Supabase local stack

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

### Create and configure Supabase

1. Create a project in the Supabase dashboard and save its database password.
2. In the project, open **Connect** to find the project reference. Authenticate and link the CLI:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

3. In **Project Settings → API**, copy the Project URL and publishable key (the legacy anon key also works as a publishable client key). Create `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   ```

4. In **Authentication → URL Configuration**, set the local Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` as a redirect URL. Email/password auth is enabled by default; choose whether email confirmation is required in the email provider settings.

The migration in `supabase/migrations` creates the complete schema, trigger-created initial schedules, transactional review RPC, indexes, constraints, and RLS policies. With Docker running, `npx supabase start` followed by `npx supabase db reset` verifies it locally. The SQL schedule parity assertions can then be run against the local database with `psql "$DATABASE_URL" -f supabase/tests/rating_v1.sql`.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
```

CI runs install, lint, type-check, unit tests, and a production build using harmless placeholder public values.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, choose **Add New → Project**, import the GitHub repository, and accept the detected Next.js settings.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` under **Settings → Environment Variables** for Production, Preview, and Development as appropriate. Do not add a service-role key.
4. Deploy. Vercel automatically supplies a production URL such as `your-project.vercel.app`; no custom domain is required.
5. In Supabase **Authentication → URL Configuration**, change the Site URL to `https://your-project.vercel.app` and add `https://your-project.vercel.app/auth/callback` to Redirect URLs. Add preview callback patterns only if you intend to test authentication on preview deployments.
6. Open the Vercel URL, create an account, confirm email if enabled, and exercise the item/review/relationship flow.

Source code changes are not needed between local, preview, and production
environments. Configure the two public Supabase values and the server-only
Notion encryption key separately for each deployment.

## Deferred work

Future releases may add OAuth, AI-assisted ingestion, embeddings, external synchronization, reminders, a graph canvas, sharing, native clients, legacy migration, analytics, and billing. This MVP intentionally contains no placeholder services for them.

The proposed product flow, permission model, security boundaries, and delivery
sequence for the first external source are documented in the
[Notion watch-list import plan](docs/notion-import-plan.md).

### Notion credential setup

Each user creates a public integration in Notion and saves its OAuth client ID
and secret from **Import → Set up your Notion integration**. The client secret
is encrypted before it is stored and is never rendered back to the browser.

The deployment still needs one stable server-side encryption key:

```bash
openssl rand -base64 32
```

Save the output as `NOTION_TOKEN_ENCRYPTION_KEY`. It cannot be safely generated
anew on each application start: losing or changing it makes every stored Notion
credential undecryptable. Keep it out of source control and use the same value
across all instances of a deployment.

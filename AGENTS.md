# Repository guide

- Install: `npm install`
- Develop: `npm run dev`
- Lint: `npm run lint`
- Type-check: `npm run typecheck`
- Test: `npm test`
- Build: `npm run build`
- Format/check: `npm run format` / `npm run format:check`

All writes must use the signed-in Supabase client. Never add a service-role key, trust a submitted `user_id`, weaken RLS, or expose another user's rows. Validate mutations server-side and keep review completion atomic through `complete_review`.

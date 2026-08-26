# Notion watch lists: product and integration plan

Status: proposed  
Last reviewed against the Notion developer documentation: 2026-08-26

## Decision in brief

Treat a Notion database as a **source (or meta item)**, not as an item that is
silently mirrored. A user connects one Notion workspace, explicitly grants the
integration access to databases, adds selected databases to a watch list, and
reviews a diff before importing pages as MemoryFactory items.

MemoryFactory imports durable pointers, connections, and only a minimal hint;
the document remains authoritative at its external URL and is expected to
change there. Checks therefore discover previously unseen source rows but do
not mirror later content edits or overwrite an existing MemoryFactory item.

For the first release, run the once-per-local-day check when the signed-in user
opens MemoryFactory. This keeps every database mutation behind the user's
authenticated Supabase session and avoids introducing a privileged background
writer. A later scheduled checker may discover changes and send a notification,
but it should not import items without the user approving the batch.

## Why permission is the central design constraint

Notion OAuth authorizes an **integration in a workspace**. It does not grant
access to every page in that workspace. During authorization, Notion's page
picker lets the workspace owner choose pages/databases to share. A page is only
queryable while it remains shared with the integration; users can revoke that
access in Notion at any time.

Consequences for the product:

- A copied Notion URL is an identifier, not proof of access. The two example
  links therefore cannot be imported until their owner connects Notion and
  shares those databases with the integration.
- “Connect Notion” and “Add watch list” are separate actions. OAuth establishes
  a workspace connection; adding a watch list selects one accessible database.
- A database relation or rollup may refer to another database that was not
  shared. Missing related content must be displayed as unavailable, never
  treated as an empty value.
- A `403` means the integration lacks permission and a `404` can also mean that
  the object is not shared. Both should lead to a “Reconnect or share in
  Notion” repair flow rather than deletion of imported items.

The integration should request only **read content** capability. It does not
need insert/update content or user-information capabilities for this workflow.

## Recommended user workflow

### 1. Empty state

On **Items → Import → Notion**, explain the boundary before asking for access:

> MemoryFactory can read only the Notion pages you select. It never edits your
> Notion workspace. You approve every import batch.

The primary action is **Connect Notion**. A secondary action, **How access
works**, explains how to add or remove pages later in Notion.

### 2. Connect a workspace

1. The server creates a short-lived, one-time OAuth `state` value bound to the
   signed-in MemoryFactory user and return path.
2. The browser goes to Notion's authorization URL. Include `client_id`,
   `response_type=code`, the exact registered `redirect_uri`, and `state`.
3. Notion authenticates the workspace owner and presents its page picker.
4. The callback verifies and consumes `state` **before** exchanging the code.
5. The server exchanges the code at Notion's token endpoint using the
   integration client credentials. The browser must never receive either the
   Notion access token or the integration client secret.
6. Store the returned workspace and bot identifiers plus an encrypted token.
   If the response includes expiry/refresh fields for the configured OAuth
   application, store those too and refresh server-side. Do not assume a token
   is permanent; use the fields returned by the current token endpoint.

Use a public OAuth integration for a multi-user hosted product. An internal
integration token is suitable only for a single controlled workspace and must
not be requested from users or pasted into this application.

### 3. Add a watch list

Offer two paths:

- **Browse shared databases (preferred):** search objects visible to the
  integration and let the user select one.
- **Paste a Notion database link:** parse the UUID server-side, then retrieve it
  with Notion before saving. Reject arbitrary hosts, malformed IDs, inaccessible
  objects, and objects that are not databases/data sources.

Notion API version `2025-09-03` split a database container from its data
sources. Retrieve the database, show its title, and let the user select a data
source if it contains more than one. Persist both `database_id` and
`data_source_id`; query pages through `POST /v1/data_sources/{id}/query`. Pin the
`Notion-Version` header rather than relying on an implicit version.

Then show a small configuration step:

- Source name (defaults to the Notion title)
- Import rule: review new pages before import (default) or manual checks only
- Property mapping: title, URL, and short text/summary
- Optional filter (for example, Status = Ready)
- Prompt frequency: daily (default) or manual

Always show a sample of three mapped rows before enabling **Start watching**.
If a title property cannot be found, require the user to fix the mapping.

### 4. Daily check

On the user's first authenticated app load for their local calendar day:

1. Claim a check for each due watch list with one conditional database update,
   so concurrent tabs do not run it twice.
2. Query the selected Notion data source, following pagination.
3. Respect `Retry-After` on `429` responses and use bounded retries for
   transient failures. Keep a resumable cursor for large lists.
4. Compare each stable Notion page ID with imported source records and stage
   only previously unseen pages. Retain `last_edited_time` as provenance, not as
   an instruction to mirror later edits.
5. Save only an import-candidate snapshot needed for the preview. Do not create
   MemoryFactory items yet.
6. Mark the check complete only after all pages have been evaluated. A failed
   check remains retryable and shows a useful status.

The global notice should say, for example, **“Reading queue has 7 new pages —
review import”**. “No changes” should be quiet and visible only on
the source detail screen.

Use the user's saved IANA time zone to calculate the daily boundary. Store
timestamps in UTC. Changing time zones may move the next due check, but must not
cause duplicate imports.

### 5. Review and import

The batch screen is the important trust boundary:

- Group rows into **New**, **Already imported**, **Skipped by filter**, and
  **Needs attention**.
- Default-select clean new rows.
- Show the mapped title, URL, excerpt, source, Notion edit time, and any mapping
  warning for every candidate.
- Let the user edit a candidate locally, exclude it, or select all clean rows.
- **Import selected** performs one server-side validated, atomic operation. It
  creates/updates items, source links, and the batch result together.

An imported item keeps its own review schedule and remains available if Notion
access is later revoked. Provenance should link it to its source and original
page. Changes at the external URL are normal and do not trigger a local
overwrite.

## Proposed data model

All user-owned tables use `user_id default auth.uid()`, composite ownership
foreign keys where applicable, RLS `user_id = auth.uid()`, and no client-supplied
owner identity.

### `notion_connections`

- `id`, `user_id`
- `workspace_id`, `workspace_name`, `workspace_icon`, `bot_id`
- `encrypted_access_token`, optional `encrypted_refresh_token`, `expires_at`
- `token_key_version`, `status`, `last_error_code`
- timestamps; unique `(user_id, workspace_id)`

Token ciphertext is never selected into a Client Component. Encryption and
decryption happen only in server-only code using a deployment secret, with
authenticated user identity included as additional authenticated data. Logs
must redact authorization codes, tokens, and Notion response headers.

### `notion_watch_lists`

- `id`, `user_id`, `connection_id`
- `database_id`, `data_source_id`, `name`
- `mapping jsonb`, `filter jsonb`, `sync_mode`, `time_zone`
- `status`, `last_started_at`, `last_checked_at`, `next_check_on`
- resumable cursor and sanitized error metadata
- unique `(user_id, connection_id, data_source_id)`

Validate `mapping` and `filter` against a strict server-side schema. Never turn
stored JSON directly into unrestricted Notion API filters.

### `notion_source_records`

- `id`, `user_id`, `watch_list_id`, `notion_page_id`
- `notion_last_edited_time`, normalized candidate snapshot, content hash
- `item_id` (nullable), `imported_hash`, `observed_at`
- unique `(user_id, watch_list_id, notion_page_id)`

### `notion_import_batches` and `notion_import_entries`

These make preview/approval auditable and idempotent. A batch has
`pending | importing | completed | failed | dismissed`; entries record the
proposed action and final item. A database RPC should lock a pending batch,
verify ownership and candidate hashes, upsert selected items and source records,
and finish the batch in one transaction. Replaying the request returns the
original result rather than creating duplicates.

Do not model the source solely as a normal `items` row: sources have credentials,
check state, mappings, and import history that do not belong in `items`. If the
graph should display sources, add a nullable `meta_item_id` owned by the same
user and create a `derived_from` edge for imported items.

## Security and permission rules

- Use the signed-in Supabase server client for every application database write.
  Never use a service-role key and never accept `user_id` from a form or API
  body.
- Store each user's Notion OAuth client secret as encrypted, user-owned data;
  accept it only in the authenticated setup form and never return it to the
  browser. Keep the shared token-encryption key in a server-only environment
  variable. Only server actions, the OAuth callback, and the server-side Notion
  client may access decrypted credentials.
- OAuth state is random, single use, expires quickly, and is bound to the current
  user and exact redirect target. Register exact HTTPS callback URLs and do not
  accept an arbitrary post-login redirect.
- A connection lookup always includes the authenticated user. RLS is defense in
  depth; server actions still validate ownership and mutation payloads.
- Treat Notion rich text and URLs as untrusted input. Normalize sizes, allow only
  `https:`/`http:` item links, render text as text, and never render imported
  HTML.
- Disconnecting deletes/revokes the stored credential and disables its watch
  lists, but asks separately whether to retain imported MemoryFactory items.
- Revocation, `401`, permission loss, schema changes, and deleted/archived pages
  are explicit states. None should silently delete local items.

## Checker deployment decision

### Phase 1: opportunistic, authenticated checks

Run the checker after a signed-in user loads the app, at most once per local
day. This is feasible under the repository's no-service-role rule and naturally
uses the user's Supabase session. It is “automatic while the user uses the
app,” not a guaranteed midnight background job; the UI should say so plainly.

### Phase 2: scheduled discovery, only if truly needed

A hosted cron cannot act as an absent user's signed-in Supabase client. Do not
work around this with a service-role key or a forgeable `user_id`. Before adding
background checks, choose and document a dedicated architecture—for example, a
server-side job system with narrowly scoped database functions and verifiable
job identity—and update the repository security policy. The scheduled process
should discover candidates and notify; actual import remains an authenticated
user action.

Notion webhooks can reduce polling latency but do not replace the permission
model, initial scan, periodic reconciliation, or user approval. Add them only
after the OAuth and idempotent import path is stable, verify webhook signatures,
deduplicate deliveries, and fetch current objects rather than trusting an event
as a complete snapshot.

## Failure and repair UX

| State                         | User-facing action                                              |
| ----------------------------- | --------------------------------------------------------------- |
| OAuth cancelled               | Return to import with “Nothing was connected.”                  |
| State invalid/expired         | Restart connection; do not exchange the code.                   |
| Token invalid/revoked         | “Reconnect Notion.” Keep local items.                           |
| Database unshared/not found   | “Open Notion sharing settings,” then retry.                     |
| Data source/schema changed    | Re-map fields; preserve the previous mapping.                   |
| Rate limited                  | Show “Will retry” and the next attempt time.                    |
| Partial scan/network failure  | Resume from cursor; do not show an incomplete batch.            |
| Page archived/deleted         | Mark source unavailable; never delete local item automatically. |
| Duplicate page/import request | Reuse the existing source record/item.                          |

## Delivery sequence

1. **Foundation:** register a Notion public integration, pin the API version,
   add connection/watch-list tables with RLS, and implement encrypted token
   storage plus OAuth state handling.
2. **Source setup:** accessible-database search, paste-link validation,
   database/data-source selection, mapping, filtering, and sample preview.
3. **Safe importer:** scan, source records, batch diff UI, and an idempotent
   transactional import RPC using the authenticated Supabase client.
4. **Daily prompt:** local-time due calculation, concurrency claim, retry/rate
   limit behavior, and in-app notices.
5. **Hardening:** revoke/disconnect flows, token lifecycle, audit-safe logs,
   pagination tests, permission-loss tests, and schema-change tests.
6. **Optional automation:** notifications/webhooks or scheduled discovery only
   after an explicit security design for non-user execution is approved.

## Acceptance criteria for the first release

- Connecting workspace A never exposes workspace B's connection or candidates.
- Pasting a valid but unshared database URL cannot create a watch list.
- OAuth callback fails closed for missing, expired, reused, or wrong-user state.
- Notion credentials never reach browser bundles, rendered props, logs, or error
  messages.
- Two tabs starting the daily check produce one complete candidate set.
- Pagination, `429`, permission loss, archived pages, mapping changes, and retry
  after interruption have automated coverage.
- Importing the same batch twice creates no duplicate item or review state.
- Imported items survive watch-list removal, Notion revocation, and source page
  deletion.

## Primary Notion references

- [Authorization](https://developers.notion.com/docs/authorization)
- [Create a token / OAuth token endpoint](https://developers.notion.com/reference/post-oauth-token)
- [Search](https://developers.notion.com/reference/post-search)
- [Retrieve a database](https://developers.notion.com/reference/retrieve-a-database)
- [Query a data source](https://developers.notion.com/reference/query-a-data-source)
- [API upgrade guide for 2025-09-03](https://developers.notion.com/docs/upgrade-guide-2025-09-03)
- [Request limits](https://developers.notion.com/reference/request-limits)
- [Integration capabilities](https://developers.notion.com/reference/capabilities)
- [Webhooks](https://developers.notion.com/reference/webhooks)

Before implementation, re-check the registered integration's current OAuth
token response and webhook signature documentation. Notion may evolve token
lifetime and versioned database/data-source behavior independently of this plan.

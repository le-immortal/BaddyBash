# Baddy Bash Portal - Getting Started

This guide gets a developer running the current portal locally. The app lives in `portal/` and uses Next.js, Auth.js/NextAuth, and Azure Cosmos DB.

## Key Areas

- **`app/page.tsx`** - landing page
- **`app/dashboard/page.tsx`** - player registration and match dashboard
- **`app/admin/page.tsx`** - admin season, seeding, bracket, import/export flows
- **`app/bracket/page.tsx`** - public bracket view with season selection
- **`app/api/`** - REST routes for users, registrations, matches, settings, setup, and admin tools
- **`app/lib/`** - Cosmos helpers, models, settings cache, tournament data routing
- **`cli/`** - backup, restore, seeding, and migration scripts

## Local Setup

1. Open a terminal and move into the app:
   ```bash
   cd portal
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `portal/.env.local`:
   ```env
   COSMOS_ENDPOINT=https://your-cosmos-account.documents.azure.com:443/
   COSMOS_KEY=your_primary_key
   COSMOS_DATABASE=baddybashdb

   AUTH_SECRET=your_generated_secret
   AUTH_URL=http://localhost:3000

   AUTH_MICROSOFT_ENTRA_ID_ID=your_client_id
   AUTH_MICROSOFT_ENTRA_ID_SECRET=your_client_secret
   AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=your_tenant_id
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:3000`.

## Cosmos DB Layout

The app now defaults to the v2 multi-season tournament layout:

- `users` - partition key `/id`
- `settings` - partition key `/id`; stores `SEASON_CONFIG`
- `registrations_v2` - partition key `/seasonCategory`
- `matches_v2` - partition key `/seasonCategory`

Legacy containers are still kept for rollback/source data:

- `registrations` - partition key `/userId`
- `matches` - partition key `/category`

`seasonCategory` is `${seasonId}#${category}` (for example, `2027#MS`).

If you need to temporarily route tournament reads/writes through the legacy containers, set:

```bash
COSMOS_TOURNAMENT_CONTAINER_VERSION=legacy
```

## Useful Commands

Run from `portal/`:

```bash
# Start the app
npm run dev

# Lint and tests
npm run lint --quiet
npm run test

# Seed sample data
npx tsx cli/seed.ts
npx tsx cli/seed-bulk.ts

# Backup / restore
npx tsx cli/export-data.ts
npx tsx cli/import-data.ts

# Multi-season migration
npx tsx cli/migrate-seasons.ts --dry-run
npx tsx cli/migrate-seasons.ts
npx tsx cli/migrate-tournament-v2.ts --dry-run
npx tsx cli/migrate-tournament-v2.ts --execute
```

## Notes for New Developers

- `/api/settings?full=1` returns the public multi-season config used by the UI.
- Player-facing registration flows use the active season from `SEASON_CONFIG`.
- Archived seasons are read-only.
- `npx tsc --noEmit` is currently not a reliable green check in this repo because of known pre-existing failures; use lint and tests for routine local verification.

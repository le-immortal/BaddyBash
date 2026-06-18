# Baddy Bash Portal 🏸

The official internal badminton tournament portal for Microsoft employees. Register, track your matches, and follow the live bracket — all in one place.

Built with Next.js 16, Azure Cosmos DB, and Tailwind CSS.

> **Status note (2026-06-18):** the portal now defaults to the multi-season v2 Cosmos layout. Verified local checks are `npm run lint --quiet` and `npm run test`. `npx tsc --noEmit` still has pre-existing failures in this repo, so do not treat it as a passing gate.

---

## How It Works

### Getting Started (Players)

1. **Sign in** with your Microsoft account (Entra ID SSO — no new account needed).
2. **Set up your profile** — enter your name, Microsoft alias, phone number, and T-shirt size.
3. **Register for categories** — pick up to **2 categories** from Men's Singles, Women's Singles, Men's Doubles, Women's Doubles, and Mixed Doubles.
4. **For doubles**, enter your partner's Microsoft alias and name. The system automatically creates their account and links your registration as a team.
5. **Confirm** your selections — you're in!

### During the Tournament

- **Your Matches** appear on the Player Dashboard once brackets are published — see upcoming matches, scheduled times, and completed results.
- **Live Bracket** page shows the full tournament draw with real-time progression. Search for any player by name and navigate between multiple results.
- **Match History** shows your W/L record with round labels (QF, Semi, Final).

### Withdrawing

While registration is open, you can withdraw from any category. For doubles, withdrawing automatically unlinks your partner from that category.

---

## Features

### For Players
- **Microsoft SSO** — one-click sign-in, no separate credentials
- **Smart Registration** — max 2 categories enforced, gender-based conflict detection (can't register for both Men's and Women's events)
- **Partner Linking** — enter your doubles partner's alias; the system auto-creates their profile and links registrations
- **Profile Management** — update name, phone, and T-shirt size at any time (while registration is open)
- **Live Bracket View** — interactive tournament tree with round navigation, search with prev/next cycling, and schedule times
- **Match Dashboard** — upcoming matches sorted by status (live → scheduled → completed), with round labels and W/L badges
- **Withdrawals** — one-click withdrawal with automatic partner unlinking

### For Admins
- **Registration Control** — open/close registration with one click
- **Bracket Publishing** — toggle bracket visibility (hide during setup, publish when ready)
- **Multi-Season Management** — create a new season, archive prior seasons, and view historical registrations/brackets
- **Player Seeding** — assign seed numbers to players/teams, with duplicate detection and batch save
- **Visual Seeding** — drag-and-drop seeding interface showing real-time matchup previews
- **Bracket Generation** — single-elimination knockout brackets with proper seed placement (1 vs N, 2 vs N-1) and automatic byes
- **Match Management** — update winners, schedule times; winners auto-advance through the bracket
- **Import/Export** — import brackets from Excel (.xlsx), export player lists and bracket data
- **Category Filtering** — switch between all 5 categories with one click

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org/) (App Router, React 19) |
| Database | [Azure Cosmos DB](https://azure.microsoft.com/en-us/services/cosmos-db/) (NoSQL API, Serverless) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) |
| Auth | [Auth.js (NextAuth v5)](https://authjs.dev/) with Microsoft Entra ID |
| Icons | [Lucide React](https://lucide.dev/) |
| Deployment | Azure App Service (Linux / Node.js) |

## Project Structure

```
portal/
├── app/
│   ├── api/            # REST API routes
│   │   ├── admin/      #   Admin endpoints (players, export)
│   │   ├── auth/       #   NextAuth handlers
│   │   ├── matches/    #   Match CRUD + bracket generation
│   │   ├── registrations/ # Registration CRUD
│   │   ├── settings/   #   Season config (active season, reg open, brackets visible)
│   │   ├── setup/      #   Database initialization
│   │   └── users/      #   User profile CRUD
│   ├── admin/          # Admin dashboard (seeding, matches, import/export)
│   ├── bracket/        # Public bracket visualization + search
│   ├── dashboard/      # Player dashboard (registrations, matches)
│   ├── auth/           # Auth error page
│   ├── components/     # Shared UI (Navbar, MatchCard, SeedingVisualizer, etc.)
│   └── lib/            # Utilities (Cosmos client, models, bracket math, settings cache)
├── cli/                # Data maintenance scripts (seed, backup, import, migration)
├── public/             # Static assets
└── types/              # TypeScript declaration files
```

## Data Model

| Container | Partition Key | Role |
|-----------|--------------|------|
| `users` | `/id` | Player profiles and admin flags |
| `settings` | `/id` | `SEASON_CONFIG` and season-level portal settings |
| `registrations_v2` | `/seasonCategory` | Default runtime registration data for season/category-scoped reads and writes |
| `matches_v2` | `/seasonCategory` | Default runtime bracket and match data for season/category-scoped reads and writes |
| `registrations` | `/userId` | Legacy registration container retained for rollback/source data |
| `matches` | `/category` | Legacy match container retained for rollback/source data |

### Multi-Season Rules for Future Agents

- `SEASON_CONFIG` lives in the `settings` container with `id = "SEASON_CONFIG"`.
- `SeasonConfig.activeSeason` drives normal player registration and public bracket views.
- Admin selected-season actions must pass the selected season to APIs; do not silently default admin writes to active season.
- Archived seasons are read-only. Server routes must reject writes when `SeasonEntry.archived === true`.
- Runtime tournament reads/writes default to `registrations_v2` and `matches_v2`; set `COSMOS_TOURNAMENT_CONTAINER_VERSION=legacy` only when intentionally rolling back to legacy containers.
- `seasonCategory` is `${seasonId}#${category}` and is the v2 partition key for tournament containers.
- Always query matches by season and category; category alone can mix seasons in legacy data.
- Always create registration IDs with `makeRegistrationId(userId, category, seasonId)`.

---

## Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/le-immortal/BaddyBash.git
   cd BaddyBash/portal
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables** — create `.env.local` in `portal/`:
   ```env
   # Azure Cosmos DB
   COSMOS_ENDPOINT=https://your-cosmos-account.documents.azure.com:443/
   COSMOS_KEY=your_primary_key
   COSMOS_DATABASE=baddybashdb

   # NextAuth.js
   AUTH_SECRET=your_generated_secret
   AUTH_URL=http://localhost:3000

   # Microsoft Entra ID
   AUTH_MICROSOFT_ENTRA_ID_ID=your_client_id
   AUTH_MICROSOFT_ENTRA_ID_SECRET=your_client_secret
   AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=your_tenant_id
   ```

4. **Run the dev server**
   ```bash
   npm run dev
   ```

5. **Open** [http://localhost:3000](http://localhost:3000)

### Database Seeding

```bash
# Small dataset (9 users)
npx tsx cli/seed.ts

# Bulk dataset (1500+ users for stress testing)
npx tsx cli/seed-bulk.ts
```

> **Warning**: Seeding scripts wipe existing data in the target database.

### Backup and Multi-Season Migration

```bash
# Export current data before migration
npx tsx cli/export-data.ts

# Preview migration changes
npx tsx cli/migrate-seasons.ts --dry-run

# Apply migration
npx tsx cli/migrate-seasons.ts

# Restore from backup if needed
npx tsx cli/import-data.ts
```

Migration backfills `seasonId` on legacy tournament data, re-IDs registrations to include season, copies `SEASON_CONFIG` into `settings`, and preserves legacy `CONFIG_GLOBAL` registration/bracket visibility values through the active-season compatibility shim.

---

## License

This project is internal to Microsoft.
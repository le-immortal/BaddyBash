# Baddy Bash Portal 🏸

The official internal badminton tournament portal for Microsoft employees. Built with Next.js 16, Azure Cosmos DB, and Tailwind CSS.

## 🚀 Key Features

### for Players
- **Seamless Registration**: Sign in with your Microsoft account using Entra ID. Register for up to 2 categories (Singles/Doubles).
- **Find Your Partner**: For doubles, simply enter your partner's alias. The system automatically links your registration.
- **Manage Profile**: Update your T-shirt size and contact details.
- **Tournament Status**: View your confirmed matches and withdraw if necessary (while registration is open).
- **Withdrawals**: Easily withdraw from categories if your plans change. Doubles partners are automatically unlinked.
- **Bracket View**: See the live tournament draw and follow your path to victory (when published by admins).

### for Admins
- **Interactive Dashboard**: View all player registrations and stats in real-time.
- **Registration Control**: Open/Close tournament registration with a single click.
- **Bracket Management**:
  - Automatically generate single-elimination brackets based on seeds (1 vs N, 2 vs N-1).
  - Publish brackets to the public or keep them hidden during setup.
  - Handle byes and player seeding.
- **Live Scoring**: Update match scores in real-time as the tournament progresses.
- **Export Data**: Download player lists and brackets to Excel.

## 🛠 Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Database**: [Azure Cosmos DB](https://azure.microsoft.com/en-us/services/cosmos-db/) (NoSQL API)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Auth**: [Auth.js (NextAuth v5)](https://authjs.dev/) with Microsoft Entra ID
- **Icons**: [Lucide React](https://lucide.dev/)
- **Deployment**: Azure App Service (Linux/Node.js)

## 📦 Project Structure

```
portal/
├── app/
│   ├── api/            # API Routes (Users, Registrations, Matches, Settings)
│   ├── admin/          # Admin Dashboard (Protected Route)
│   ├── bracket/        # Public Bracket Visualization
│   ├── dashboard/      # Player Dashboard
│   ├── lib/            # Shared Utilities (Cosmos Client, Models, Auth)
│   └── components/     # Reusable UI Components
├── public/             # Static Assets
└── types/              # TypeScript Definitions
```

## 🔧 Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/le-immortal/BaddyBash.git
   cd BaddyBash/portal
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env.local` file in the `portal` directory:
   ```env
   # Database
   COSMOS_ENDPOINT=https://your-cosmos-account.documents.azure.com:443/
   COSMOS_KEY=your_primary_key
   COSMOS_DATABASE=baddybashdb

   # Authentication (NextAuth.js)
   AUTH_SECRET=your_generated_secret
   AUTH_URL=http://localhost:3000

   # Microsoft Entra ID (Auth Provider)
   AUTH_MICROSOFT_ENTRA_ID_ID=your_client_id
   AUTH_MICROSOFT_ENTRA_ID_SECRET=your_client_secret
   AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=your_tenant_id
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open the app**
   Navigate to [http://localhost:3000](http://localhost:3000).

## 🧪 Database Seeding

To populate the database with test data (Players, Registrations, Matches):

```bash
# Seed small dataset (9 users)
npx tsx app/lib/seed.ts

# Seed bulk dataset (1500+ users for stress testing)
npx tsx app/lib/seed-bulk.ts
```

> **Warning**: Seeding scripts will wipe existing data in the target database.

## 📝 License

This project is internal to Microsoft.
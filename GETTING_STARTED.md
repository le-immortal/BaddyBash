# Baddy Bash Portal - First Draft

This is the first draft of the Baddy Bash Portal, built with Next.js, Tailwind CSS, and TypeScript.

## Project Structure
The code is located in the `portal` directory.

- **`app/page.tsx`**: Landing page with event info.
- **`app/dashboard/page.tsx`**: Player dashboard for registration (implements "Max-2" rule).
- **`app/admin/page.tsx`**: Admin view to see players and seeds.
- **`app/bracket/page.tsx`**: Visual placeholder for tournament fixtures.
- **`app/lib/mockData.ts`**: Contains the dummy user and player data used in this draft.

## How to Run
1. Open the integrated terminal.
2. Navigate to the portal directory:
   ```bash
   cd portal
   ```
3. Install dependencies (if not already done):
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open your browser to `http://localhost:3000`.

## Features Implemented (Mocked)
- **SSO Simulation**: You are logged in as "Abhishek Sharma" by default.
- **Registration**: You can toggle registrations for 5 categories.
- **Validation**: Trying to register for a 3rd category shows an error/warning (Max-2 Rule).
- **Partner Logic**: Doubles categories prompt for a partner alias.

## Tech Stack
- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Language**: TypeScript

import { Calendar, MapPin, Shield } from 'lucide-react';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { SignInButton, LoginLink } from './components/SignInButton';
import Image from 'next/image';
import { getSeasonSettings } from '@/app/lib/settings';
import { getSeasonLabel } from '@/app/lib/seasonLabels';
import { CATEGORIES } from '@/app/lib/models';

export default async function Home() {
  const [session, activeSeason] = await Promise.all([auth(), getSeasonSettings()]);

  // If already signed in, go straight to dashboard
  if (session?.user) {
    redirect('/dashboard');
  }

  const seasonTitle = getSeasonLabel(activeSeason);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/5">
        <div className="container mx-auto px-4 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="notch flex h-9 w-9 items-center justify-center bg-volt-400 font-display text-lg text-court-950">
              BB
            </span>
            <div className="leading-tight">
              <p className="font-display text-xl tracking-wide text-court-100">{seasonTitle}</p>
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-court-400">
                <Image src="/microsoft-logo.svg" alt="Microsoft" width={11} height={11} />
                Microsoft Internal
              </p>
            </div>
          </div>
          <LoginLink />
        </div>
      </header>

      <main className="flex-grow">
        <div className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 flex flex-col lg:flex-row lg:items-center gap-14">
          {/* Hero copy */}
          <div className="lg:w-3/5">
            <p className="kicker mb-6">Badminton Championship · {activeSeason.id}</p>
            <h1 className="font-display leading-[0.9] tracking-wide">
              <span className="block text-7xl md:text-9xl text-court-100">Rally.</span>
              <span className="text-outline block text-7xl md:text-9xl">Smash.</span>
              <span className="block text-7xl md:text-9xl text-volt-400">Conquer.</span>
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-court-300">
              The official internal badminton tournament for Microsoft employees.
              Register now to compete for glory across 5 categories.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <SignInButton />
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-court-400">
                1000+ players · 5 categories
              </span>
            </div>
          </div>

          {/* Matchday ticket */}
          <div className="lg:w-2/5 flex justify-center">
            <div className="notch-lg w-full max-w-sm bg-court-850 border border-white/10 shadow-2xl shadow-black/50">
              <div className="bg-volt-400 px-6 py-3 flex items-center justify-between">
                <span className="font-display text-lg tracking-widest text-court-950">Matchday Pass</span>
                <span className="font-mono text-[10px] font-semibold text-court-950/70">№ {activeSeason.id}-BB</span>
              </div>

              <div className="px-6 py-6 space-y-5">
                <div className="flex items-center gap-2 pb-4">
                  <Image src="/microsoft-logo.svg" alt="Microsoft" width={16} height={16} />
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-court-300">A Microsoft Employee Event</span>
                </div>

                <div className="flex items-start gap-4">
                  <Calendar className="mt-0.5 h-5 w-5 text-volt-400" />
                  <div>
                    <p className="font-semibold text-court-100">{activeSeason.id} season</p>
                    <p className="text-sm text-court-400">Tournament schedule shared by organizers</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <MapPin className="mt-0.5 h-5 w-5 text-volt-400" />
                  <div>
                    <p className="font-semibold text-court-100">Pullela Gopichand Badminton Academy</p>
                    <p className="text-sm text-court-400">Hyderabad</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Shield className="mt-0.5 h-5 w-5 text-volt-400" />
                  <div>
                    <p className="font-semibold text-court-100">Eligibility</p>
                    <p className="text-sm text-court-400">FTEs Only</p>
                  </div>
                </div>

                <div className="net-divider" />

                {/* Ticket "barcode" */}
                <div className="flex items-end justify-between">
                  <div className="flex h-8 items-end gap-[3px]" aria-hidden="true">
                    {[5, 8, 3, 8, 5, 3, 8, 4, 6, 8, 3, 5, 8, 4, 8, 3, 6, 8, 5, 3, 8, 6, 4, 8].map((h, i) => (
                      <span key={i} className="w-[2px] bg-court-300/60" style={{ height: `${h * 4}px` }} />
                    ))}
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-court-500">Admit One</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Category strip — scoreboard chips */}
        <div className="border-t border-white/5">
          <div className="container mx-auto px-4 py-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {CATEGORIES.map((category, index) => (
                <div key={category.id} className="panel px-4 py-3 flex items-center gap-3">
                  <span className="font-display text-2xl text-volt-400/80">{String(index + 1).padStart(2, '0')}</span>
                  <div className="leading-tight">
                    <p className="text-sm font-semibold text-court-100">{category.name}</p>
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-court-400">{category.type}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/5 py-8 text-center text-sm text-court-500">
        © {activeSeason.id} Baddy Bash Organizing Committee. Internal Use Only.
      </footer>
    </div>
  );
}

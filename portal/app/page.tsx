import { Calendar, MapPin, Shield } from 'lucide-react';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { SignInButton, LoginLink } from './components/SignInButton';
import Image from 'next/image';

export default async function Home() {
  const session = await auth();

  // If already signed in, go straight to dashboard
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900 text-white">
        <div className="container mx-auto px-4 py-6 flex justify-between items-center">
          <div className="font-bold text-2xl flex items-center gap-2">
            🏆 Baddy Bash 2026
          </div>
          <div className="flex items-center gap-4">
            <Image src="/microsoft-logo.svg" alt="Microsoft" width={24} height={24} />
            <LoginLink />
          </div>
        </div>
      </header>

      <main className="flex-grow bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-20 md:py-32 flex flex-col md:flex-row items-center">
          <div className="md:w-1/2 mb-10 md:mb-0">
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-tight">
              Compete. Smash.<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                Conquer.
              </span>
            </h1>
            <p className="text-xl text-slate-300 mb-8 max-w-lg">
              The official internal badminton tournament for Microsoft employees. 
              Register now to compete for glory across 5 categories.
            </p>
            <div className="flex gap-4">
              <SignInButton />
            </div>
          </div>
          
          <div className="md:w-1/2 flex justify-center">
            <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 max-w-sm w-full shadow-2xl">
              <h3 className="text-xl font-bold mb-6 text-blue-400 uppercase tracking-widest text-sm">Event Details</h3>
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-700">
                <Image src="/microsoft-logo.svg" alt="Microsoft" width={20} height={20} />
                <span className="text-sm text-slate-300 font-medium">A Microsoft Employee Event</span>
              </div>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <Calendar className="w-6 h-6 text-slate-400" />
                  <div>
                    <p className="font-semibold">March 21-22, 2026</p>
                    <p className="text-sm text-slate-400">9:00 AM - 6:00 PM</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <MapPin className="w-6 h-6 text-slate-400" />
                  <div>
                    <p className="font-semibold">Pullela Gopichand Badminton Academy</p>
                    <p className="text-sm text-slate-400">Hyderabad</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Shield className="w-6 h-6 text-slate-400" />
                  <div>
                    <p className="font-semibold">Eligibility</p>
                    <p className="text-sm text-slate-400">FTEs Only</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-slate-950 text-slate-500 py-8 text-center text-sm">
        © 2026 Baddy Bash Organizing Committee. Internal Use Only.
      </footer>
    </div>
  );
}

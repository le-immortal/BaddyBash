'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import Navbar from '../../components/Navbar';

export function BracketShell({ children, seasonLabel }: { children: ReactNode; seasonLabel?: string }) {
  return (
    <div className="min-h-screen relative text-court-100">
      <Navbar seasonLabel={seasonLabel} />
      {children}
    </div>
  );
}

export function BracketPageFallback() {
  return (
    <BracketShell>
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-volt-400" />
      </div>
    </BracketShell>
  );
}

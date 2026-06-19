'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import Navbar from '../../components/Navbar';

export function BracketShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen relative text-slate-100">
      <div className="fixed inset-0 -z-10">
        <Image src="/badminton-1.jpg" alt="" fill className="object-cover" priority />
        <div className="absolute inset-0 bg-slate-900/85" />
      </div>
      <Navbar />
      {children}
    </div>
  );
}

export function BracketPageFallback() {
  return (
    <BracketShell>
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    </BracketShell>
  );
}

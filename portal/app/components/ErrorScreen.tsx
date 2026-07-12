'use client';

import Navbar from './Navbar';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorScreenProps {
  title?: string;
  message?: string;
  /** Hide Navbar (e.g. when rendered inside a page that already has one) */
  bare?: boolean;
}

export default function ErrorScreen({
  title = 'Something went wrong',
  message = 'We could not load the page because a service is unavailable. Please try again in a moment.',
  bare = false,
}: ErrorScreenProps) {
  return (
    <div className="min-h-screen">
      {!bare && <Navbar />}
      <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
        <div className="bg-red-400/10 p-5 rounded-full mb-6 ring-4 ring-red-400/20">
          <AlertTriangle className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="font-display text-3xl tracking-wide text-court-100 mb-2">{title}</h1>
        <p className="text-court-400 max-w-md text-sm leading-relaxed mb-6">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="notch flex items-center gap-2 px-5 py-2.5 bg-volt-400 text-court-950 text-sm font-bold hover:bg-volt-300 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    </div>
  );
}

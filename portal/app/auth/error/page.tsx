'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { SeasonConfig } from '@/app/lib/models';
import { getSeasonPortalLabelFromConfig } from '@/app/lib/seasonLabels';

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const [portalTitle, setPortalTitle] = useState('Baddy Bash Portal');

  useEffect(() => {
    fetch('/api/settings?full=1')
      .then((response) => (response.ok ? response.json() : null))
      .then((config: SeasonConfig | null) => {
        if (!config?.seasons) return;
        setPortalTitle(getSeasonPortalLabelFromConfig(config));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center text-court-100">
      <div className="text-center max-w-md px-6">
        <ShieldAlert className="w-16 h-16 text-red-400 mx-auto mb-6" />
        <h1 className="font-display text-4xl tracking-wide mb-4">Access Denied</h1>
        {error === 'AccessDenied' ? (
          <p className="text-court-300 mb-8">
            Only users with a <strong>@microsoft.com</strong> email on their GitHub account can access {portalTitle}.
            Please make sure your Microsoft email is set as your primary (or public) email on GitHub.
          </p>
        ) : (
          <p className="text-court-300 mb-8">
            An error occurred during sign in. Please try again.
          </p>
        )}
        <Link
          href="/"
          className="notch inline-block bg-volt-400 hover:bg-volt-300 px-6 py-3 font-bold text-court-950 transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}

export default function AuthError() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center text-court-100">
        <p>Loading...</p>
      </div>
    }>
      <ErrorContent />
    </Suspense>
  );
}

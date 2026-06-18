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
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <div className="text-center max-w-md px-6">
        <ShieldAlert className="w-16 h-16 text-red-400 mx-auto mb-6" />
        <h1 className="text-3xl font-bold mb-4">Access Denied</h1>
        {error === 'AccessDenied' ? (
          <p className="text-slate-300 mb-8">
            Only users with a <strong>@microsoft.com</strong> email on their GitHub account can access {portalTitle}.
            Please make sure your Microsoft email is set as your primary (or public) email on GitHub.
          </p>
        ) : (
          <p className="text-slate-300 mb-8">
            An error occurred during sign in. Please try again.
          </p>
        )}
        <Link
          href="/"
          className="inline-block bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg font-semibold transition"
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
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <p>Loading...</p>
      </div>
    }>
      <ErrorContent />
    </Suspense>
  );
}

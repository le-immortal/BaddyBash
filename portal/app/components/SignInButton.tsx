'use client';

import { signIn } from 'next-auth/react';
import { ArrowRight } from 'lucide-react';

export function SignInButton() {
  return (
    <button
      onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
      className="notch group inline-flex items-center gap-2 bg-volt-400 px-8 py-4 font-display text-xl tracking-widest text-court-950 transition-colors hover:bg-volt-300"
    >
      Register Now
      <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
    </button>
  );
}

export function LoginLink() {
  return (
    <button
      onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
      className="text-xs font-semibold uppercase tracking-[0.18em] text-court-300 transition-colors hover:text-volt-400"
    >
      Already registered? Login
    </button>
  );
}

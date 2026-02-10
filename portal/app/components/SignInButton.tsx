'use client';

import { signIn } from 'next-auth/react';
import { ArrowRight } from 'lucide-react';

export function SignInButton() {
  return (
    <button
      onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
      className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-full font-bold text-lg transition-all flex items-center gap-2 text-white"
    >
      Register Now <ArrowRight className="w-5 h-5" />
    </button>
  );
}

export function LoginLink() {
  return (
    <button
      onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
      className="text-sm font-medium hover:underline text-white"
    >
      Already Registered? Login
    </button>
  );
}

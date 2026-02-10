'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Trophy, User } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { signInAction, signOutAction } from '@/app/lib/actions';

export default function Navbar() {
  const { data: session } = useSession();

  return (
    <nav className="bg-slate-900 text-white p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="flex items-center space-x-2 text-xl font-bold hover:text-blue-400 transition">
          <Trophy className="w-6 h-6 text-yellow-500" />
          <span>Baddy Bash Portal</span>
        </Link>
        <div className="flex items-center space-x-6">
          <Link href="/dashboard" className="hover:text-gray-300">Dashboard</Link>
          <Link href="/bracket" className="hover:text-gray-300">Brackets</Link>
          <Link href="/admin" className="hover:text-gray-300 text-sm bg-slate-800 px-3 py-1 rounded">Admin</Link>
          
          {session?.user ? (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1 rounded-full">
                {session.user.image ? (
                  <Image src={session.user.image} alt={session.user.name || "User"} width={16} height={16} className="w-4 h-4 rounded-full" />
                ) : (
                  <User className="w-4 h-4" />
                )}
                <span className="text-sm">{session.user.name || session.user.email}</span>
              </div>
              <form action={signOutAction}>
                <button type="submit" className="text-xs text-gray-400 hover:text-white transition">Sign Out</button>
              </form>
            </div>
          ) : (
            <form action={signInAction}>
              <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm font-semibold transition">
                Sign In
              </button>
            </form>
          )}
        </div>
      </div>
    </nav>
  );
}

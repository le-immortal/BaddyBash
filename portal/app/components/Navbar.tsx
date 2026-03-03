'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Trophy, User, Menu, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { signInAction, signOutAction } from '@/app/lib/actions';

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const isAdmin = session?.user?.isAdmin === true;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="bg-slate-900 text-white shadow-md sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center space-x-2 text-xl font-bold hover:text-blue-400 transition">
            <Trophy className="w-6 h-6 text-yellow-500" />
            <span>Baddy Bash 2026</span>
          </Link>
          {!pathname?.startsWith('/dashboard') && (
            <Image src="/microsoft-logo.svg" alt="Microsoft" width={20} height={20} className="hidden md:block" />
          )}

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden p-1 text-slate-400 hover:text-white focus:outline-none"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            {session?.user && (
              <Link href="/dashboard" className="hover:text-gray-300">Dashboard</Link>
            )}
            {session?.user && (
              <Link href="/bracket" className="hover:text-gray-300">Fixtures</Link>
            )}
            {isAdmin && (
              <Link href="/admin" className="hover:text-gray-300 text-sm bg-slate-800 px-3 py-1 rounded">Admin</Link>
            )}
            
            {session?.user ? (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1 rounded-full">
                  {session.user.image ? (
                    <Image src={session.user.image} alt={session.user.name || "User"} width={20} height={20} className="w-5 h-5 rounded-full" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                  <span className="text-sm max-w-[150px] truncate">{session.user.name || session.user.email}</span>
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

        {/* Mobile Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-slate-800 flex flex-col space-y-4 animate-in slide-in-from-top-2 duration-200">
            {session?.user && (
              <Link 
                href="/dashboard" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-2 px-4 rounded hover:bg-slate-800 transition"
              >
                Dashboard
              </Link>
            )}
            {session?.user && (
              <Link 
                href="/bracket" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-2 px-4 rounded hover:bg-slate-800 transition"
              >
                Fixtures
              </Link>
            )}
            {isAdmin && (
              <Link 
                href="/admin" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-2 px-4 rounded bg-slate-800/50 text-blue-300 hover:bg-slate-800 transition"
              >
                Admin Panel
              </Link>
            )}

            <div className="pt-2 border-t border-slate-800">
              {session?.user ? (
                <div className="space-y-4 px-4 py-2">
                  <div className="flex items-center space-x-3">
                    {session.user.image ? (
                      <Image src={session.user.image} alt="User" width={32} height={32} className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5" />
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{session.user.name}</span>
                      <span className="text-xs text-slate-400">{session.user.email}</span>
                    </div>
                  </div>
                  <form action={signOutAction} className="w-full">
                    <button type="submit" className="w-full text-left text-red-400 hover:text-red-300 text-sm py-2">
                      Sign Out
                    </button>
                  </form>
                </div>
              ) : (
                <div className="px-4 py-2">
                  <form action={signInAction}>
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-semibold text-center">
                      Sign In
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

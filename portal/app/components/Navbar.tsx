'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { User, Menu, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { signInAction, signOutAction } from '@/app/lib/actions';
import type { SeasonConfig } from '@/app/lib/models';
import { getSeasonLabelFromConfig } from '@/app/lib/seasonLabels';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/fixtures', label: 'Fixtures' },
  { href: '/partner-board', label: 'Teammate Finder' },
];

export default function Navbar({ seasonLabel: externalLabel }: { seasonLabel?: string } = {}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const isAdmin = session?.user?.isAdmin === true;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [fetchedLabel, setFetchedLabel] = useState('Baddy Bash');

  useEffect(() => {
    if (externalLabel) return; // skip fetch when parent provides label
    fetch('/api/settings?full=1')
      .then(r => r.ok ? r.json() : null)
      .then((config: SeasonConfig | null) => {
        if (!config?.seasons) return;
        setFetchedLabel(getSeasonLabelFromConfig(config));
      })
      .catch(() => {});
  }, [externalLabel]);

  const seasonLabel = externalLabel || fetchedLabel;
  const isActive = (href: string) => pathname === href || (href === '/fixtures' && pathname === '/bracket');

  return (
    <nav className="sticky top-0 z-50 border-b border-white/5 bg-court-950/85 text-court-100 backdrop-blur-md">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <Link
            href="/dashboard"
            onClick={() => setIsMobileMenuOpen(false)}
            className="group flex items-center gap-2.5"
          >
            <span className="notch flex h-8 w-8 items-center justify-center bg-volt-400 font-display text-base text-court-950 transition-colors group-hover:bg-volt-300">
              BB
            </span>
            <span className="font-display text-xl tracking-wide">{seasonLabel}</span>
            <Image src="/microsoft-logo.svg" alt="Microsoft" width={14} height={14} className="opacity-70" />
          </Link>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-1 text-court-400 hover:text-court-100 focus:outline-none"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {session?.user && NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  'relative py-1 text-sm font-medium transition-colors',
                  isActive(link.href) ? 'text-volt-400' : 'text-court-300 hover:text-court-100',
                )}
              >
                {link.label}
                <span
                  className={clsx(
                    'absolute -bottom-[17px] left-0 right-0 h-0.5 bg-volt-400 transition-opacity',
                    isActive(link.href) ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden="true"
                />
              </Link>
            ))}
            {isAdmin && (
              <Link
                href="/admin"
                className={clsx(
                  'rounded border px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors',
                  isActive('/admin')
                    ? 'border-volt-400/50 bg-volt-400/10 text-volt-300'
                    : 'border-white/10 bg-white/5 text-court-300 hover:border-volt-400/40 hover:text-volt-300',
                )}
              >
                Admin
              </Link>
            )}

            {session?.user ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  {session.user.image ? (
                    <Image src={session.user.image} alt={session.user.name || "User"} width={20} height={20} className="w-5 h-5 rounded-full" />
                  ) : (
                    <User className="w-4 h-4 text-court-300" />
                  )}
                  <span className="text-sm max-w-[150px] truncate">{session.user.name || session.user.email}</span>
                </div>
                <form action={signOutAction}>
                  <button type="submit" className="text-xs font-medium uppercase tracking-wider text-court-400 transition hover:text-court-100">
                    Sign Out
                  </button>
                </form>
              </div>
            ) : (
              <form action={signInAction}>
                <button type="submit" className="notch bg-volt-400 px-4 py-2 text-sm font-bold text-court-950 transition-colors hover:bg-volt-300">
                  Sign In
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Mobile Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-white/10 flex flex-col space-y-1 animate-in slide-in-from-top-2 duration-200">
            {session?.user && NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={clsx(
                  'block rounded-lg px-4 py-2.5 text-sm font-medium transition',
                  isActive(link.href)
                    ? 'bg-volt-400/10 text-volt-300'
                    : 'text-court-200 hover:bg-white/5 hover:text-court-100',
                )}
              >
                {link.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-lg px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-court-300 hover:bg-white/5 hover:text-volt-300 transition"
              >
                Admin Panel
              </Link>
            )}

            <div className="pt-2 border-t border-white/10">
              {session?.user ? (
                <div className="space-y-4 px-4 py-2">
                  <div className="flex items-center space-x-3">
                    {session.user.image ? (
                      <Image src={session.user.image} alt="User" width={32} height={32} className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                        <User className="w-5 h-5 text-court-300" />
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{session.user.name}</span>
                      <span className="text-xs text-court-400">{session.user.email}</span>
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
                    <button type="submit" className="notch w-full bg-volt-400 py-3 text-center font-bold text-court-950 transition-colors hover:bg-volt-300">
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

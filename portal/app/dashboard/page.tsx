'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import Navbar from '../components/Navbar';
import RegistrationCard from '../components/RegistrationCard';
import ScheduleMatchCard from '../components/ScheduleMatchCard';
import { Category, MatchDocument, SeasonConfig, SeasonEntry } from '../lib/models';
import { AlertCircle, Loader2, Lock, Edit2, CalendarDays, History, ChevronDown } from 'lucide-react';
import ErrorScreen from '../components/ErrorScreen';
import Image from 'next/image';
import { getSeasonLabel, getSeasonLabelFromConfig } from '../lib/seasonLabels';

function DashboardShell({
  children,
  className = 'min-h-screen bg-slate-50',
  background,
}: {
  children: ReactNode;
  className?: string;
  background?: ReactNode;
}) {
  return (
    <div className={className}>
      {background}
      <Navbar />
      {children}
    </div>
  );
}

const CATEGORIES: { id: Category; name: string }[] = [
  { id: 'MS', name: "Men's Singles" },
  { id: 'WS', name: "Women's Singles" },
  { id: 'MD', name: "Men's Doubles" },
  { id: 'WD', name: "Women's Doubles" },
  { id: 'XD', name: "Mixed Doubles" },
];

const dashboardFetchTimeoutMs = 8000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dashboardFetchTimeoutMs);

  // If the caller supplied a signal, forward its abort to our controller
  if (init?.signal) {
    init.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

interface Registration {
  id: string;
  userId: string;
  userName: string;
  category: Category;
  status: string;
  seasonId?: string;
  partnerId?: string;
  partnerName?: string;
  partnerPhone?: string;
}

interface HistoricalSeasonData {
  season: SeasonEntry;
  registrations: Registration[];
  matches: MatchDocument[];
  totalRoundsMap: Record<string, number>;
  resultsAvailable: boolean;
}

export default function Dashboard() {
  const { data: session, status: sessionStatus } = useSession();
  const [playerName, setPlayerName] = useState('');
  const [alias, setAlias] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [tShirtSize, setTShirtSize] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [savedAlias, setSavedAlias] = useState<string | null>(null);
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [savedTShirtSize, setSavedTShirtSize] = useState<string | null>(null);
  const [partners, setPartners] = useState<Record<string, { name: string, alias: string, phone: string, tShirtSize: string }>>({}); 
  const [committedCategories, setCommittedCategories] = useState<Category[]>([]);
  const [committedRegistrations, setCommittedRegistrations] = useState<Registration[]>([]);
  const [selection, setSelection] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkingAlias, setLinkingAlias] = useState(false);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [userMatches, setUserMatches] = useState<MatchDocument[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [bracketsVisible, setBracketsVisible] = useState<boolean | null>(null); // null = unknown yet
  const isAdmin = session?.user?.isAdmin === true;
  const [totalRoundsMap, setTotalRoundsMap] = useState<Record<string, number>>({});
  const [apiError, setApiError] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [aliasWarning, setAliasWarning] = useState(false);
  const [aliasGuideOpen, setAliasGuideOpen] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(true);
  const [seasonLabel, setSeasonLabel] = useState('Baddy Bash');
  const [seasonConfig, setSeasonConfig] = useState<SeasonConfig | null>(null);
  const [pastSeasonsOpen, setPastSeasonsOpen] = useState(false);
  const [historicalSeasons, setHistoricalSeasons] = useState<HistoricalSeasonData[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Check global settings (registration open + brackets visible)
  useEffect(() => {
    fetchWithTimeout('/api/settings?full=1').then(res => {
      if (!res.ok) { setApiError(true); return null; }
      return res.json();
    }).then(data => {
      if (!data) return;
      if (data.seasons) {
        const config = data as SeasonConfig;
        const activeSeason = config.seasons.find((season) => season.id === config.activeSeason);
        setSeasonConfig(config);
        setSeasonLabel(getSeasonLabelFromConfig(config));
        setRegistrationOpen(activeSeason?.registrationOpen !== false);
        setBracketsVisible(activeSeason?.bracketsVisible !== false);
        return;
      }

      setSeasonConfig(null);
      setRegistrationOpen(data.registrationOpen !== false);
      setBracketsVisible(data.bracketsVisible !== false);
    }).catch(() => setApiError(true)).finally(() => setSettingsLoaded(true));
  }, []);

  // Determine if profile is fully set up.
  // The user is considered registered if they have an alias associated with their account.
  // Email is used for login/lookup, but the alias is the core identity.
  const profileSaved = !!savedAlias;

  // sessionEmail is used only for lookup — the actual Cosmos user ID is always the alias
  const sessionEmail = session?.user?.email || '';
  const userId = resolvedUserId || '';
  const userName = savedName || session?.user?.name || 'Player';

  // Fetch existing registrations from API
  const fetchRegistrations = useCallback(async (uid?: string) => {
    const targetId = uid || userId;
    if (!targetId) return;
    try {
      setLoading(true);
      const res = await fetchWithTimeout(`/api/registrations?userId=${encodeURIComponent(targetId)}`);
      if (res.ok) {
        const regs: Registration[] = await res.json();
        const active = regs.filter(r => r.status !== 'cancelled');
        setCommittedCategories(active.map(r => r.category));
        setCommittedRegistrations(active);
      }
    } catch (err) {
      console.error('Failed to fetch registrations:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // On login: look up existing user by email — NO doc creation here
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !session?.user) return;
    const controller = new AbortController();
    const initUser = async () => {
      try {
        // Look up by email to see if this user has already set up their profile
        const res = await fetchWithTimeout(`/api/users?email=${encodeURIComponent(sessionEmail)}`, { signal: controller.signal });
        if (res.ok) {
          const user = await res.json();
          // Check if we got a valid user object with required fields
          if (user && user.alias) {
            setSavedName(user.name);
            setSavedAlias(user.alias);
            setSavedPhone(user.phoneNumber);
            setSavedTShirtSize(user.tShirtSize || null);
            setPlayerName(user.name);
            setAlias(user.alias);
            setPhoneNumber(user.phoneNumber || '');
            setTShirtSize(user.tShirtSize || '');
            setResolvedUserId(user.id); // id = alias
          }
        } else if (res.status !== 404) {
          // 500/403/401 — service is down or auth broken
          console.error('Users API error:', res.status);
          setApiError(true);
        }
        // If 404, user hasn't set up profile yet — that's fine, show the setup form
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Failed to init user:', err);
        setApiError(true);
      } finally {
        setLoading(false);
      }
    };
    initUser();
    return () => controller.abort();
  }, [sessionStatus, session, sessionEmail]);

  useEffect(() => {
    if (sessionStatus === 'authenticated' && profileSaved) {
      fetchRegistrations();
    }
  }, [sessionStatus, profileSaved, fetchRegistrations]);

  // Fetch matches for all categories the user is registered in
  const fetchUserMatches = useCallback(async () => {
    if (!userId || committedCategories.length === 0 || (bracketsVisible === false && !isAdmin)) return;
    setMatchesLoading(true);
    try {
      const results = await Promise.all(
        committedCategories.map(cat =>
          fetch(`/api/matches?category=${cat}`, { cache: 'no-store' })
            .then(res => res.ok ? res.json() as Promise<MatchDocument[]> : [])
            .catch(() => [] as MatchDocument[])
        )
      );

      // Compute total rounds per category for round labels
      const roundsMap: Record<string, number> = {};
      const allUserMatches: MatchDocument[] = [];

      results.forEach((matches, idx) => {
        const cat = committedCategories[idx];
        const maxRound = matches.reduce((max, m) => Math.max(max, m.round), 0);
        roundsMap[cat] = maxRound;

        const userMs = matches.filter(
          m => m.status !== 'bye' && (
            m.player1Id === userId || m.player2Id === userId ||
            m.player1Id?.split('|').includes(userId) || m.player2Id?.split('|').includes(userId)
          )
        );
        allUserMatches.push(...userMs);
      });

      // Sort: live first, then scheduled, then completed
      const statusOrder: Record<string, number> = { in_progress: 0, scheduled: 1, completed: 2 };
      allUserMatches.sort((a, b) => {
        const sa = statusOrder[a.status] ?? 1;
        const sb = statusOrder[b.status] ?? 1;
        if (sa !== sb) return sa - sb;
        return (a.matchNumber ?? 0) - (b.matchNumber ?? 0);
      });

      setTotalRoundsMap(roundsMap);
      setUserMatches(allUserMatches);
    } catch (err) {
      console.error('Failed to fetch user matches:', err);
    } finally {
      setMatchesLoading(false);
    }
  }, [userId, committedCategories, bracketsVisible, isAdmin]);

  useEffect(() => {
    if (profileSaved && committedCategories.length > 0 && bracketsVisible !== null) {
      fetchUserMatches();
    }
  }, [profileSaved, committedCategories, bracketsVisible, fetchUserMatches]);

  useEffect(() => {
    if (!profileSaved || !userId || !seasonConfig) {
      setHistoricalSeasons([]);
      return;
    }

    const archivedSeasons = seasonConfig.seasons
      .filter((season) => season.archived)
      .sort((a, b) => b.id.localeCompare(a.id));

    if (archivedSeasons.length === 0) {
      setHistoricalSeasons([]);
      return;
    }

    let cancelled = false;

    const loadHistoricalSeasons = async () => {
      setHistoryLoading(true);
      try {
        const seasonHistory: Array<HistoricalSeasonData | null> = await Promise.all(
          archivedSeasons.map(async (season) => {
            const regsResponse = await fetchWithTimeout(
              `/api/registrations?userId=${encodeURIComponent(userId)}&season=${encodeURIComponent(season.id)}`
            );

            if (!regsResponse.ok) {
              return null;
            }

            const registrations = (await regsResponse.json() as Registration[]).filter((registration) => registration.status !== 'cancelled');
            const categories = Array.from(new Set(registrations.map((registration) => registration.category)));

            if (categories.length === 0) {
              return {
                season,
                registrations,
                matches: [],
                totalRoundsMap: {},
                resultsAvailable: season.bracketsVisible !== false,
              } satisfies HistoricalSeasonData;
            }

            const shouldLoadResults = season.bracketsVisible !== false || isAdmin;
            if (!shouldLoadResults) {
              return {
                season,
                registrations,
                matches: [],
                totalRoundsMap: {},
                resultsAvailable: false,
              } satisfies HistoricalSeasonData;
            }

            const matchResponses = await Promise.all(
              categories.map((category) =>
                fetch(`/api/matches?category=${category}&season=${encodeURIComponent(season.id)}`, { cache: 'no-store' })
                  .then((response) => response.ok ? response.json() as Promise<MatchDocument[]> : [] as MatchDocument[])
                  .catch(() => [] as MatchDocument[])
              )
            );

            const totalRoundsMapForSeason: Record<string, number> = {};
            const allMatches: MatchDocument[] = [];

            matchResponses.forEach((matches, index) => {
              const category = categories[index];
              totalRoundsMapForSeason[category] = matches.reduce((max, match) => Math.max(max, match.round), 0);

              allMatches.push(
                ...matches.filter(
                  (match) => match.status !== 'bye' && (
                    match.player1Id === userId ||
                    match.player2Id === userId ||
                    (match.player1Id?.split('|').includes(userId) ?? false) ||
                    (match.player2Id?.split('|').includes(userId) ?? false)
                  )
                )
              );
            });

            allMatches.sort((a, b) => (a.matchNumber ?? 0) - (b.matchNumber ?? 0));

            return {
              season,
              registrations,
              matches: allMatches,
              totalRoundsMap: totalRoundsMapForSeason,
              resultsAvailable: true,
            } satisfies HistoricalSeasonData;
          })
        );

        if (!cancelled) {
          setHistoricalSeasons(
            seasonHistory
              .filter((season): season is HistoricalSeasonData => Boolean(season))
              .filter((season) => season.registrations.length > 0 || season.matches.length > 0)
          );
        }
      } catch (err) {
        console.error('Failed to load past seasons:', err);
        if (!cancelled) {
          setHistoricalSeasons([]);
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    };

    loadHistoricalSeasons();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, profileSaved, seasonConfig, userId]);

  // Derived match lists — avoids re-filtering on every render
  const upcomingMatches = useMemo(() => userMatches.filter(m => m.status !== 'completed' && m.status !== 'bye'), [userMatches]);
  const completedMatches = useMemo(() => userMatches.filter(m => m.status === 'completed' || m.status === 'bye'), [userMatches]);
  const hasArchivedSeasons = seasonConfig?.seasons.some((season) => season.archived) ?? false;

  const maxSelections = 2;
  const totalCount = committedCategories.length + selection.length;
  const isMaxReached = totalCount >= maxSelections;

  // Gender Logic
  const allActive = [...committedCategories, ...selection];
  const hasMenSelection = allActive.some(c => c === 'MS' || c === 'MD');
  const hasWomenSelection = allActive.some(c => c === 'WS' || c === 'WD');

  const handleSelect = (catId: Category) => {
    if (!registrationOpen) return;
    if (isMaxReached) return;
    if (committedCategories.includes(catId)) return;
    if ((catId === 'MS' || catId === 'MD') && hasWomenSelection) return;
    if ((catId === 'WS' || catId === 'WD') && hasMenSelection) return;
    if (!selection.includes(catId)) {
      setSelection([...selection, catId]);
    }
  };

  const handleDeselect = (catId: Category) => {
    setSelection(selection.filter(id => id !== catId));
  };

  const handlePartnerChange = (catId: string, field: 'name' | 'alias' | 'phone' | 'tShirtSize', value: string) => {
    setPartners(prev => ({
      ...prev,
      [catId]: { ...prev[catId], [field]: value },
    }));
  };
  
  const handleWithdraw = async (catId: Category) => {
    if (!registrationOpen) return;
    if (!confirm(`Are you sure you want to withdraw from ${CATEGORIES.find(c => c.id === catId)?.name}?`)) return;

    try {
      setLoading(true);
      const res = await fetch(`/api/registrations?userId=${encodeURIComponent(userId)}&category=${catId}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to withdraw');
      }

      // Success
      await fetchRegistrations();
    } catch (err: unknown) {
      console.error('Withdraw failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to withdraw. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isDoubles = (c: Category) => c === 'MD' || c === 'WD' || c === 'XD';

  const isSelectionValid = selection.every(catId => {
    if (!isDoubles(catId)) return true;
    const p = partners[catId];
    return p && p.name?.trim().length > 0 && p.alias?.trim().length > 0;
  });

  const handleSaveProfile = async () => {
    if (!playerName.trim()) {
      alert('Please enter your name.');
      return;
    }
    if (!alias.trim()) {
      alert('Please enter your Microsoft alias.');
      return;
    }
    /* Phone number is optional
    if (!phoneNumber.trim()) {
      alert('Please enter your phone number.');
      return;
    }
    */

    setLinkingAlias(true);
    try {
      // Trim, lowercase, and strip @domain suffix from alias for consistency
      const cleanAlias = alias.trim().toLowerCase().replace(/@.*$/, '');
      
      // Check if a user with this alias already exists (pre-created by a partner)
      const aliasRes = await fetch(`/api/users?alias=${encodeURIComponent(cleanAlias)}`);

      if (aliasRes.ok) {
        const existingUser = await aliasRes.json();
        // Found a pre-created user (partner registered them) — link email/avatar to it
        const linkRes = await fetch('/api/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: existingUser.id,
            name: playerName.trim(),
            email: session?.user?.email || '',
            avatar: session?.user?.image || undefined,
            phoneNumber: phoneNumber.trim(),
            tShirtSize: tShirtSize.trim(),
          }),
        });
        
        if (!linkRes.ok) {
          const errData = await linkRes.json();
          throw new Error(errData.error || 'Failed to update profile.');
        }

        setResolvedUserId(existingUser.id);
        setSavedName(playerName.trim());
        setSavedAlias(cleanAlias);
        setSavedPhone(phoneNumber.trim());
        setSavedTShirtSize(tShirtSize.trim());
        setIsEditingProfile(false);
        await fetchRegistrations(existingUser.id);
      } else {
        // No pre-existing user — create a new user with id = alias (lowercase)
        const createRes = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: cleanAlias,
            name: playerName.trim(),
            email: session?.user?.email || '',
            alias: cleanAlias,
            phoneNumber: phoneNumber.trim(),
            tShirtSize: tShirtSize.trim(),
            avatar: session?.user?.image || undefined,
          }),
        });

        if (!createRes.ok) {
           const errData = await createRes.json();
           throw new Error(errData.error || 'Failed to create profile.');
        }

        setResolvedUserId(cleanAlias);
        setSavedName(playerName.trim());
        setSavedAlias(cleanAlias);
        setSavedPhone(phoneNumber.trim());
        setSavedTShirtSize(tShirtSize.trim());
        setIsEditingProfile(false);
        await fetchRegistrations(cleanAlias);
      }
    } catch (err: unknown) {
      console.error('Profile save failed:', err);
      // Better error handling
      const msg = err instanceof Error ? err.message : 'Failed to save profile. Please check if the alias is already in use by another email.';
      alert(msg);
    } finally {
      setLinkingAlias(false);
    }
  };

  const handleSave = async () => {
    if (!isSelectionValid) return;

    if (!confirm('Are you sure you want to confirm these registrations?')) return;

    setSaving(true);
    try {
      // POST each selected category
      for (const catId of selection) {
        const body: Record<string, string> = {
          userId,
          userName,
          category: catId,
        };
        if (isDoubles(catId)) {
          // Trim and lowercase partner alias
          body.partnerId = partners[catId]?.alias?.trim().toLowerCase() || '';
          body.partnerName = partners[catId]?.name?.trim() || '';
          body.partnerPhone = partners[catId]?.phone?.trim() || '';
          body.partnerTShirtSize = partners[catId]?.tShirtSize?.trim() || '';
          body.userPhone = savedPhone || phoneNumber || '';
        }
        const res = await fetch('/api/registrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(`Failed to register for ${catId}: ${err.error}`);
          break;
        }
      }

      // Refresh registrations
      setSelection([]);
      setPartners({});
      await fetchRegistrations();
    } catch (err) {
      console.error('Save failed:', err);
      alert('An error occurred while saving. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (sessionStatus === 'unauthenticated') {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-32 text-slate-600">
          Please sign in to access your dashboard.
        </div>
      </DashboardShell>
    );
  }

  if (sessionStatus === 'loading' || loading || !settingsLoaded) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-slate-600">Loading dashboard...</span>
        </div>
      </DashboardShell>
    );
  }

  if (apiError) {
    return (
      <DashboardShell>
        <ErrorScreen bare title="Service Unavailable" message="We could not reach our servers. This could be a temporary issue, please try again in a moment." />
      </DashboardShell>
    );
  }

  // Subtle badminton SVG background
  // Profile-first gate: if alias/name/phone not saved, show setup form
  if (!profileSaved || isEditingProfile) {
    return (
      <DashboardShell
        className="min-h-screen relative"
        background={(
          <div className="fixed inset-0 -z-10">
            <Image src="/badminton-1.jpg" alt="" fill className="object-cover" priority />
            <div className="absolute inset-0 bg-black/40" />
          </div>
        )}
      >
        <main className="container mx-auto py-16 px-4 max-w-md">
          <div className="bg-white/85 backdrop-blur-md rounded-xl shadow-lg border border-white/50 p-8">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">{isEditingProfile ? 'Edit Profile' : `Welcome to ${seasonLabel}!`}</h1>
            <p className="text-slate-600 text-sm mb-6">
              {isEditingProfile 
                ? 'Update your details below. Note that your Microsoft Alias cannot be changed.' 
                : 'Please fill in your details to get started. If your partner has already registered you, enter the same alias they used and we\'ll link your account.'}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g., Jane Doe"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-900 bg-white placeholder-slate-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Microsoft Alias <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g., janedoe (from your Teams profile)"
                  value={alias}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // Only allow lowercase alphanumeric
                    const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (raw !== cleaned) {
                      setAliasWarning(true);
                      setTimeout(() => setAliasWarning(false), 4000);
                    }
                    setAlias(cleaned);
                  }}
                  disabled={isEditingProfile} 
                  className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none sm:text-sm text-slate-900 placeholder-slate-400 ${
                    isEditingProfile ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-300' : aliasWarning ? 'bg-white border-red-400 focus:ring-red-500 focus:border-red-500' : 'bg-white border-slate-300 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                />
                {!isEditingProfile && aliasWarning && (
                  <p className="mt-1 text-xs text-red-500 font-medium">Only letters and numbers allowed. Use the short alias from your Teams profile (e.g., janedoe).</p>
                )}
                {!isEditingProfile && !aliasWarning && (
                  <p className="mt-1 text-xs text-slate-400">Please use your correct alias, it will be used to link your doubles registrations as well. Use the short alias from your Teams profile, not your full email prefix. No @microsoft.com needed (e.g., <span className="font-medium text-slate-500">janedoe</span> not <span className="text-slate-400">janedoe@microsoft.com or jane.doe</span>).</p>
                )}
                {!isEditingProfile && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setAliasGuideOpen(prev => !prev)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                    >
                      <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${aliasGuideOpen ? 'rotate-180' : ''}`} />
                      {aliasGuideOpen ? 'Hide guide' : 'Not sure which alias to use?'}
                    </button>

                    {aliasGuideOpen && (
                      <div className="mt-2 p-3 bg-slate-800 rounded-lg text-white text-xs space-y-3">
                        <p className="text-slate-300 text-[11px]">Open <span className="font-semibold text-white">Microsoft Teams</span> &rarr; Click any person&rsquo;s profile &rarr; Go to <span className="font-semibold text-white">Contact</span> tab &rarr; Look for &ldquo;Alias&rdquo;</p>

                        {/* Mini Teams Contact Mockup */}
                        <div className="bg-slate-900 rounded-md p-3 border border-slate-700">
                          <div className="flex items-center gap-2.5 mb-2.5">
                            <div className="w-9 h-9 rounded-full bg-pink-500 flex items-center justify-center text-white text-xs font-bold shrink-0">JD</div>
                            <div>
                              <p className="font-semibold text-sm text-white">Jane Doe</p>
                              <p className="text-[10px] text-slate-400">Software Engineer II &bull; ENGINEERING</p>
                            </div>
                          </div>
                          <div className="border-t border-slate-700 pt-2">
                            <p className="text-[10px] text-slate-400 mb-1.5 font-semibold">Contact information</p>
                            <div className="grid grid-cols-3 gap-2 text-[10px]">
                              <div className="min-w-0">
                                <p className="text-slate-500">Email</p>
                                <p className="text-blue-400 break-all">Jane.Doe@microsoft.com</p>
                              </div>
                              <div className="min-w-0">
                                <p className="text-slate-500">Chat</p>
                                <p className="text-blue-400 break-all">janedoe@microsoft.com</p>
                              </div>
                              <div>
                                <p className="text-slate-500">Work location</p>
                                <p className="text-slate-300">HYD - Campus</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[10px] mt-2">
                              <div>
                                <p className="text-slate-500">Company</p>
                                <p className="text-slate-300">MIRPL-HYD</p>
                              </div>
                              <div>
                                <p className="text-slate-500">Job title</p>
                                <p className="text-slate-300">Software Engineer II</p>
                              </div>
                              <div>
                                <p className="text-slate-500">Department</p>
                                <p className="text-slate-300">ENGINEERING...</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[10px] mt-2">
                              <div>
                                <p className="text-slate-500">Business address</p>
                                <p className="text-slate-300">Hyderabad</p>
                              </div>
                              <div className="bg-amber-500/20 border border-amber-500/50 rounded px-1.5 py-1">
                                <p className="text-slate-500">Alias</p>
                                <p className="text-amber-300 font-bold">janedoe</p>
                              </div>
                              <div>
                                <p className="text-slate-500">Cost center</p>
                                <p className="text-slate-300">XXXXXXX</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-blue-900/40 border border-blue-500/30 rounded p-2 text-[11px] text-blue-200">
                          <span className="font-semibold">Tip:</span> Your email might be <span className="text-blue-300">Jane.Doe@microsoft.com</span> but your alias could be <span className="text-amber-300 font-bold">janedoe</span>. Always use the alias shown in the Contact tab.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Phone Number <span className="text-gray-400 font-normal pl-1">(Optional)</span></label>
                <input
                  type="tel"
                  placeholder="e.g., 9876543210"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                  maxLength={10}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-900 bg-white placeholder-slate-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">T-Shirt Size <span className="text-gray-400 font-normal pl-1">(Optional)</span></label>
                <select
                  value={tShirtSize}
                  onChange={(e) => setTShirtSize(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-900 bg-white"
                >
                  <option value="">Select Size</option>
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleSaveProfile}
                  disabled={linkingAlias || !playerName.trim() || !alias.trim()}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {linkingAlias ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : (
                    isEditingProfile ? 'Update Profile' : 'Continue to Dashboard'
                  )}
                </button>
                
                {isEditingProfile && (
                  <button
                    onClick={() => {
                       // Reset form to saved values and exit edit mode
                       setPlayerName(savedName || '');
                       setAlias(savedAlias || '');
                       setPhoneNumber(savedPhone || '');
                       setTShirtSize(savedTShirtSize || '');
                       setIsEditingProfile(false);
                    }}
                    className="w-full bg-white text-slate-600 border border-slate-300 py-2.5 rounded-lg font-semibold hover:bg-slate-50 flex items-center justify-center"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      className="min-h-screen relative"
      background={(
        <div className="fixed inset-0 -z-10">
          <Image src="/badminton-1.jpg" alt="" fill className="object-cover" priority />
          <div className="absolute inset-0 bg-slate-50/75" />
        </div>
      )}
    >
      <main className="container mx-auto py-8 px-4">
        <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Player Dashboard</h1>
            <p className="text-slate-600 mt-2">Manage your tournament entries. Max {maxSelections} categories allowed.</p>

            <div className="mt-3 flex flex-wrap items-center gap-2 md:gap-4 text-sm text-slate-600">
              <span className="font-medium text-slate-800">{savedName}</span>
              <span className="hidden md:inline text-slate-300">·</span>
              <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500" /> {savedAlias}
              </span>
              <span className="hidden md:inline text-slate-300">·</span>
              <span className="text-slate-600">{savedPhone}</span>
              <span className="hidden md:inline text-slate-300">·</span>
              <span className="text-slate-600">Size: {savedTShirtSize || '-'}</span>
              {registrationOpen && (
                <button
                  onClick={() => {
                    setPlayerName(savedName || '');
                    setAlias(savedAlias || '');
                    setPhoneNumber(savedPhone || '');
                    setTShirtSize(savedTShirtSize || '');
                    setIsEditingProfile(true);
                  }}
                  className="ml-2 text-slate-400 hover:text-blue-600 transition-colors"
                  title="Edit Profile"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Your Matches Section — shown when brackets are published, or always for admins */}
        {true && (
          <>
            {/* Instructions to Players — collapsible */}
            <div className="mb-6 px-4 py-3 bg-amber-50/70 border-l-4 border-amber-400 rounded-r-lg">
              <button
                onClick={() => setNotesExpanded(prev => !prev)}
                className="w-full flex items-center gap-2 text-left group"
              >
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-sm font-semibold text-amber-800">Instructions to Players</span>
                <span className="text-xs text-amber-600 hidden sm:inline">— Please read before your match</span>
                <span className={`text-xs text-amber-600 ml-auto mr-1 ${notesExpanded ? 'hidden' : ''}`}>View details</span>
                <ChevronDown className={`w-4 h-4 text-amber-500 transition-transform duration-200 ${notesExpanded ? 'rotate-180' : ''}`} />
              </button>

              {notesExpanded && (
                <div className="mt-3 pl-6">
                  <ul className="space-y-1.5 text-sm text-slate-700 leading-relaxed">
                    <li className="flex gap-2">
                      <span className="text-amber-500 font-bold shrink-0">•</span>
                      <span>Your scheduled matches and reporting times are listed below. You can also visit the{' '}
                        <a href="/bracket" className="text-blue-600 hover:underline font-medium">Fixtures page</a>{' '}
                        to view the full tournament draw across all rounds.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500 font-bold shrink-0">•</span>
                      <span><span className="font-semibold">Format:</span> Knockout. Singles of 30 points (no deuce) until pre-quarters. From Quarters onwards, best of 3 games of 21 points (deuce until 30).</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500 font-bold shrink-0">•</span>
                      <span>Every player must participate in initial rounds on <span className="font-semibold">21st/22nd March as per their schedule.</span></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500 font-bold shrink-0">•</span>
                      <span>Please <span className="font-semibold">report as per your assigned time slot.</span> A walkover will be given to the opponent if you fail to report on time.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500 font-bold shrink-0">•</span>
                      <span>We&apos;re coordinating <span className="font-semibold">1000+ players</span> — please stick strictly to your timelines and assigned slots.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500 font-bold shrink-0">•</span>
                      <span>Report on time → Complete registration → Collect your T-Shirt → Be ready for your game.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500 font-bold shrink-0">•</span>
                      <span><span className="font-semibold">Please bring:</span> your own racquets, non-marking sports shoes (bare foot is allowed), and your ID card.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500 font-bold shrink-0">•</span>
                      <span>Snacks &amp; refreshments will be provided at the venue.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500 font-bold shrink-0">•</span>
                      <span>Please <span className="font-semibold">do not arrive too early or linger after your games.</span> The Academy has strict instructions to limit crowd size at any given time.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500 font-bold shrink-0">•</span>
                      <span><span className="font-semibold">Parking:</span> The Academy has limited parking. Please use MS Campus parking — do not park on roads or at the Academy.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500 font-bold shrink-0">•</span>
                      <span>T-Shirts are only for <span className="font-semibold">participating players</span>, not for registration companions.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500 font-bold shrink-0">•</span>
                      <span><span className="font-semibold">Umpire&apos;s decision is final.</span> Please do not argue — the umpiring team are your colleagues volunteering their time.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500 font-bold shrink-0">•</span>
                      <span>Please do not use outside spaces or empty courts for practice.</span>
                    </li>
                  </ul>
                  <div className="mt-3 pt-3 border-t border-amber-200/60 text-xs text-slate-500">
                    <p>For any queries or discrepancies, reach out to <a href="mailto:baddybash@microsoft.com" className="text-blue-600 hover:underline font-medium">baddybash@microsoft.com</a></p>
                  </div>
                </div>
              )}
            </div>

            {/* Upcoming / Live Matches */}
            <section className="mb-8">
              <div className="relative p-6 rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: "url('/badminton-2.jpg')" }} />
                <div className="absolute inset-0 bg-white/60" />
                <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarDays className="w-5 h-5 text-blue-600" />
                  <h2 className="text-xl font-semibold text-slate-800">Your Matches</h2>
                  {upcomingMatches.length > 0 && (
                    <span className="ml-auto text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      {upcomingMatches.length} upcoming
                    </span>
                  )}
                </div>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
                  <span className="font-semibold">📋 Notice:</span> Times displayed are your <span className="font-semibold">scheduled reporting times</span> — please arrive at the court on your listed time. Matches will get started 15 mins after the reporting time.
                </p>

                {matchesLoading ? (
                  <div className="flex items-center justify-center py-8 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading matches...
                  </div>
                ) : upcomingMatches.length === 0 ? (
                  <p className="text-center text-slate-500 py-6">
                    {userMatches.length === 0
                      ? 'No matches found yet. The draw may not have been generated.'
                      : 'All your matches are completed! Check your history below.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {upcomingMatches.map(match => (
                      <ScheduleMatchCard
                        key={match.id}
                        match={match}
                        userId={userId}
                        totalRounds={totalRoundsMap[match.category] || match.round}
                      />
                    ))}
                  </div>
                )}
                </div>
              </div>
            </section>

            {/* Match History */}
            {!matchesLoading && (
              <section className="mb-8">
                <div className="relative p-6 rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: "url('/badminton-2.jpg')" }} />
                  <div className="absolute inset-0 bg-white/60" />
                  <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <History className="w-5 h-5 text-slate-500" />
                    <h2 className="text-xl font-semibold text-slate-800">Match History</h2>
                    {completedMatches.length > 0 && (
                      <span className="ml-auto text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {completedMatches.length} played
                      </span>
                    )}
                  </div>
                  {completedMatches.length === 0 ? (
                    <p className="text-center text-slate-400 py-6">No completed matches yet. Your results will appear here.</p>
                  ) : (
                    <div className="divide-y divide-slate-100/60">
                      {completedMatches.map(match => {
                        const isP1 = match.player1Id === userId || (match.player1Id?.split('|').includes(userId) ?? false);
                        const opponent = isP1 ? match.player2Name : match.player1Name;
                        const opponentAlias = isP1 ? match.player2Id : match.player1Id;
                        const won = match.winnerId === userId || (match.winnerId?.split('|').includes(userId) ?? false);
                        const totalR = totalRoundsMap[match.category] || match.round;
                        const roundLabel = match.round === totalR ? 'Final' : match.round === totalR - 1 ? 'Semi' : match.round === totalR - 2 ? 'QF' : `R${match.round}`;

                        return (
                          <div key={match.id} className="flex items-center gap-3 py-2.5 px-1 text-sm">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                              { MS: 'bg-blue-100 text-blue-700', WS: 'bg-pink-100 text-pink-700', MD: 'bg-indigo-100 text-indigo-700', WD: 'bg-purple-100 text-purple-700', XD: 'bg-teal-100 text-teal-700' }[match.category] || 'bg-slate-100 text-slate-700'
                            }`}>
                              {match.category}
                            </span>
                            <span className="text-slate-600 text-xs font-semibold w-10 shrink-0">{roundLabel}</span>
                            <span className="text-slate-700 truncate flex-1">
                              vs <span className="font-medium">{opponent || 'TBD'}</span>
                              {opponentAlias && <span className="text-xs text-slate-400 ml-1">({opponentAlias.includes('|') ? opponentAlias.split('|').map(a => `@${a}`).join(' & ') : `@${opponentAlias}`})</span>}
                            </span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${won ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {won ? 'W' : 'L'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* Tournament Info — ambient banner, collapsible */}
        <div className="mb-6 px-4 py-3 bg-amber-50/70 border-l-4 border-amber-400 rounded-r-lg">
            <button
              onClick={() => setNotesExpanded(prev => !prev)}
              className="w-full flex items-center gap-2 text-left group"
            >
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-sm font-semibold text-amber-800">Note to Players</span>
              <span className="text-xs text-amber-600 hidden sm:inline">— Dates, venue, rules & more</span>
              <span className={`text-xs text-amber-600 ml-auto mr-1 ${notesExpanded ? 'hidden' : ''}`}>View details</span>
              <ChevronDown className={`w-4 h-4 text-amber-500 transition-transform duration-200 ${notesExpanded ? 'rotate-180' : ''}`} />
            </button>

            {notesExpanded && (
              <div className="mt-3 pl-6">
                <ul className="space-y-1.5 text-sm text-slate-700 leading-relaxed">
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-bold shrink-0">•</span>
                    <span><span className="font-semibold">Start Dates:</span> <span className="bg-amber-200/80 text-amber-900 font-semibold px-1 rounded">Mar 21st–22nd (initial rounds for all categories)</span>. Dates for remaining rounds will be communicated later.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-bold shrink-0">•</span>
                    <span><span className="font-semibold">Venue:</span> Gopichand Badminton Academy (Kotak Courts)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-bold shrink-0">•</span>
                    <span><span className="font-semibold">FTEs Only</span></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-bold shrink-0">•</span>
                    <span>Max <span className="font-semibold">2 categories</span> per player.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-bold shrink-0">•</span>
                    <span><span className="font-semibold">Registration closes on 12th March, 2026.</span></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-bold shrink-0">•</span>
                    <span><span className="font-semibold">Doubles:</span> It&apos;s the player&apos;s responsibility to find their partner. The organizing team cannot accommodate requests to find a partner.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-bold shrink-0">•</span>
                    <span><span className="font-semibold">Non-marking shoes</span> are mandatory.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-bold shrink-0">•</span>
                    <span>Only game shuttles will be provided. Racquets, shoes, etc. are the player&apos;s responsibility.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-500 font-bold shrink-0">•</span>
                    <span>Snacks will be provided at the venue.</span>
                  </li>
                </ul>
                <div className="mt-3 pt-3 border-t border-amber-200/60 text-xs text-slate-500">
                  <p>For any queries, please reach out to the Baddy Bash organizing team — <a href="mailto:baddybash@microsoft.com" className="text-blue-600 hover:underline font-medium">baddybash@microsoft.com</a></p>
                  <p className="mt-0.5">If anyone is interested to join the Baddy Bash organizing team, please reach us at the above mentioned alias.</p>
                </div>
              </div>
            )}
          </div>

        <section className="mb-8">
          <div className="relative overflow-hidden p-6 rounded-xl shadow-sm border border-slate-200">
            <Image src="/badminton-bg.jpg" alt="" fill className="object-cover" />
            <div className="absolute inset-0 bg-white/50" />
            <div className="relative z-10">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-slate-800">My Registrations</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${isMaxReached ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                  {totalCount} / {maxSelections} Slots Used
                </span>
              </div>
              {selection.length > 0 && (
                <button
                  onClick={handleSave}
                  disabled={!isSelectionValid || saving || !registrationOpen}
                  className={`font-bold py-2 px-5 rounded-lg shadow-sm transition-all text-sm ${
                    isSelectionValid && !saving && registrationOpen
                      ? 'bg-blue-600 hover:bg-blue-700 text-white animate-pulse'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {saving ? (
                    <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Saving...</span>
                  ) : (
                    `Save Changes (${selection.length})`
                  )}
                </button>
              )}
            </div>

            {isMaxReached && (
              <div className="flex items-center p-3 mb-6 bg-orange-50 text-orange-800 rounded-lg text-sm border border-orange-200">
                <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
                You have reached the maximum number of registrations per player.
              </div>
            )}

            {!registrationOpen && (
              <div className="flex items-center p-3 mb-6 bg-red-50 text-red-800 rounded-lg text-sm border border-red-200">
                <Lock className="w-5 h-5 mr-3 flex-shrink-0" />
                <div>
                  <span className="font-bold">Registrations are closed.</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {CATEGORIES.map(category => {
                const isCommitted = committedCategories.includes(category.id);
                const committedReg = committedRegistrations.find(r => r.category === category.id);
                const isSelected = selection.includes(category.id);
                let status: 'committed' | 'selected' | 'available' = 'available';
                if (isCommitted) status = 'committed';
                else if (isSelected) status = 'selected';

                let isDisabled = status === 'available' && isMaxReached;
                if (!registrationOpen && status === 'available') isDisabled = true;
                if (status === 'available') {
                  if ((category.id === 'MS' || category.id === 'MD') && hasWomenSelection) isDisabled = true;
                  if ((category.id === 'WS' || category.id === 'WD') && hasMenSelection) isDisabled = true;
                }

                return (
                  <RegistrationCard
                    key={category.id}
                    category={category}
                    status={status}
                    partnerName={isCommitted ? committedReg?.partnerName || '' : partners[category.id]?.name || ''}
                    partnerAlias={isCommitted ? committedReg?.partnerId || '' : partners[category.id]?.alias || ''}
                    partnerPhone={isCommitted ? committedReg?.partnerPhone || '' : partners[category.id]?.phone || ''}
                    partnerTShirtSize={isCommitted ? '' : partners[category.id]?.tShirtSize || ''}
                    onNameChange={(val) => handlePartnerChange(category.id, 'name', val)}
                    onAliasChange={(val) => handlePartnerChange(category.id, 'alias', val)}
                    onPhoneChange={(val) => handlePartnerChange(category.id, 'phone', val)}
                    onTShirtSizeChange={(val) => handlePartnerChange(category.id, 'tShirtSize', val)}
                    disabled={isDisabled}
                    onSelect={handleSelect}
                    onDeselect={handleDeselect}
                    canWithdraw={registrationOpen}
                    onWithdraw={handleWithdraw}
                  />
                );
              })}
            </div>
            </div>
          </div>
        </section>

        {hasArchivedSeasons && (
          <section className="mb-10">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setPastSeasonsOpen((previous) => !previous)}
                className="flex w-full items-center gap-3 px-6 py-4 text-left hover:bg-slate-50"
                aria-expanded={pastSeasonsOpen}
                aria-controls="past-seasons-panel"
              >
                <History className="w-5 h-5 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-slate-800">Past Seasons</h2>
                  <p className="text-sm text-slate-500">Archived registrations and results are available in read-only mode.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {historyLoading ? 'Loading…' : `${historicalSeasons.length} season${historicalSeasons.length === 1 ? '' : 's'}`}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${pastSeasonsOpen ? 'rotate-180' : ''}`} />
              </button>

              {pastSeasonsOpen && (
                <div id="past-seasons-panel" className="border-t border-slate-100 bg-slate-50/60 px-6 py-5">
                  {historyLoading ? (
                    <div className="flex items-center justify-center py-8 text-slate-500">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Loading archived seasons...
                    </div>
                  ) : historicalSeasons.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-500">No archived registrations found for your account yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {historicalSeasons.map((history) => {
                        const completedHistoryMatches = history.matches.filter((match) => match.status === 'completed' || match.status === 'bye');

                        return (
                          <article key={history.season.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-lg font-semibold text-slate-800">{getSeasonLabel(history.season)}</h3>
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Read only</span>
                                </div>
                                <p className="mt-1 text-sm text-slate-500">
                                  {history.registrations.length} registration{history.registrations.length === 1 ? '' : 's'} saved for this archived season.
                                </p>
                              </div>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                                {completedHistoryMatches.length} result{completedHistoryMatches.length === 1 ? '' : 's'}
                              </span>
                            </div>

                            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
                              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                                <h4 className="text-sm font-semibold text-slate-700">Registrations</h4>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {history.registrations.map((registration) => {
                                    const categoryName = CATEGORIES.find((category) => category.id === registration.category)?.name || registration.category;
                                    const partnerText = registration.partnerName ? ` · ${registration.partnerName}` : '';

                                    return (
                                      <span key={registration.id} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                                        {categoryName}{partnerText}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="rounded-lg border border-slate-200 bg-white p-4">
                                <h4 className="text-sm font-semibold text-slate-700">Match Results</h4>
                                {!history.resultsAvailable ? (
                                  <p className="mt-3 text-sm text-slate-500">Results are not published for this archived season.</p>
                                ) : completedHistoryMatches.length === 0 ? (
                                  <p className="mt-3 text-sm text-slate-500">No completed archived matches were found for your account.</p>
                                ) : (
                                  <div className="mt-3 divide-y divide-slate-100">
                                    {completedHistoryMatches.map((match) => {
                                      const isPlayer1 = match.player1Id === userId || (match.player1Id?.split('|').includes(userId) ?? false);
                                      const opponent = isPlayer1 ? match.player2Name : match.player1Name;
                                      const opponentAlias = isPlayer1 ? match.player2Id : match.player1Id;
                                      const won = match.winnerId === userId || (match.winnerId?.split('|').includes(userId) ?? false);
                                      const totalRounds = history.totalRoundsMap[match.category] || match.round;
                                      const roundLabel = match.round === totalRounds ? 'Final' : match.round === totalRounds - 1 ? 'Semi' : match.round === totalRounds - 2 ? 'QF' : `R${match.round}`;

                                      return (
                                        <div key={match.id} className="flex items-center gap-3 py-2.5 text-sm">
                                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                            { MS: 'bg-blue-100 text-blue-700', WS: 'bg-pink-100 text-pink-700', MD: 'bg-indigo-100 text-indigo-700', WD: 'bg-purple-100 text-purple-700', XD: 'bg-teal-100 text-teal-700' }[match.category] || 'bg-slate-100 text-slate-700'
                                          }`}>
                                            {match.category}
                                          </span>
                                          <span className="w-10 shrink-0 text-xs font-semibold text-slate-500">{roundLabel}</span>
                                          <span className="min-w-0 flex-1 truncate text-slate-700">
                                            vs <span className="font-medium">{opponent || 'TBD'}</span>
                                            {opponentAlias && (
                                              <span className="ml-1 text-xs text-slate-400">
                                                ({opponentAlias.includes('|') ? opponentAlias.split('|').map((alias) => `@${alias}`).join(' & ') : `@${opponentAlias}`})
                                              </span>
                                            )}
                                          </span>
                                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${won ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {won ? 'W' : 'L'}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </DashboardShell>
  );
}

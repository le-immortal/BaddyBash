'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import Navbar from '../components/Navbar';
import RegistrationCard from '../components/RegistrationCard';
import ScheduleMatchCard from '../components/ScheduleMatchCard';
import { Category, MatchDocument, SeasonConfig, SeasonEntry, CATEGORIES } from '../lib/models';
import { AlertCircle, Loader2, Lock, Edit2, CalendarDays, History, ChevronDown, Trophy, CheckCircle } from 'lucide-react';
import ErrorScreen from '../components/ErrorScreen';
import { useToasts, ToastStack } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import { getSeasonLabel, getSeasonLabelFromConfig } from '../lib/seasonLabels';

function DashboardShell({
  children,
  className = 'min-h-screen',
  background,
  seasonLabel,
}: {
  children: ReactNode;
  className?: string;
  background?: ReactNode;
  seasonLabel?: string;
}) {
  return (
    <div className={className}>
      {background}
      <Navbar seasonLabel={seasonLabel} />
      {children}
    </div>
  );
}

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

type UserLookupState = 'pending' | 'found' | 'missing';

export default function Dashboard() {
  const { data: session, status: sessionStatus } = useSession();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [tShirtSize, setTShirtSize] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [savedAlias, setSavedAlias] = useState<string | null>(null);
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [savedTShirtSize, setSavedTShirtSize] = useState<string | null>(null);
  const [partners, setPartners] = useState<Record<string, { name: string, alias: string, phone: string, tShirtSize: string, selected?: boolean, manual?: boolean }>>({});
  const [partnerErrors, setPartnerErrors] = useState<Record<string, string>>({});
  const [committedCategories, setCommittedCategories] = useState<Category[]>([]);
  const [committedRegistrations, setCommittedRegistrations] = useState<Registration[]>([]);
  const [selection, setSelection] = useState<Category[]>([]);
  // Only show the registration form after the profile lookup explicitly confirms
  // that no profile exists for the authenticated user.
  const [userLookupState, setUserLookupState] = useState<UserLookupState>('pending');
  const [saving, setSaving] = useState(false);
  const [linkingAlias, setLinkingAlias] = useState(false);
  const { toasts, showToast, dismissToast } = useToasts();
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    lines: string[];
    confirmLabel: string;
    tone: 'primary' | 'danger';
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const runConfirm = async () => {
    if (!confirmDialog) return;
    const action = confirmDialog.onConfirm;
    setConfirmBusy(true);
    try {
      await action();
    } finally {
      setConfirmBusy(false);
      setConfirmDialog(null);
    }
  };
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
  // Email is used only for lookup — the actual Cosmos user ID is always the alias.
  const profileSaved = userLookupState === 'found' && !!savedAlias && !!resolvedUserId;

  // The user has completed the one-time onboarding prompt once they have a
  // t-shirt size on record. A t-shirt size is a required tournament field, so
  // its presence cleanly signals "onboarded" — no separate flag needed.
  const isOnboarded = !!savedTShirtSize;
 
  // sessionEmail is used only for lookup — the actual Cosmos user ID is always the alias
  const sessionEmail = session?.user?.email || '';
  const userId = resolvedUserId || '';
  const userName = savedName || session?.user?.name || 'Player';

  // Fetch existing registrations from API
  const fetchRegistrations = useCallback(async (uid?: string) => {
    const targetId = uid || userId;
    if (!targetId) return;
    try {
      const res = await fetchWithTimeout(`/api/registrations?userId=${encodeURIComponent(targetId)}`);
      if (res.ok) {
        const regs: Registration[] = await res.json();
        const active = regs.filter(r => r.status !== 'cancelled');
        setCommittedCategories(active.map(r => r.category));
        setCommittedRegistrations(active);
      }
    } catch (err) {
      console.error('Failed to fetch registrations:', err);
    }
  }, [userId]);

  // On login: look up existing user by email — NO doc creation here
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    if (!sessionEmail) {
      setUserLookupState('pending');
      return;
    }

    const controller = new AbortController();
    let active = true;

    setUserLookupState('pending');

    const initUser = async () => {
      try {
        // Look up by email to see if this user has already set up their profile
        const res = await fetchWithTimeout(`/api/users?email=${encodeURIComponent(sessionEmail)}`, { signal: controller.signal });
        if (res.ok) {
          const user = await res.json();
          // Check if we got a valid user object with required fields
          if (user && user.alias) {
            if (!active) return;
            setSavedName(user.name);
            setSavedAlias(user.alias);
            setSavedPhone(user.phoneNumber);
            setSavedTShirtSize(user.tShirtSize || null);
            setPhoneNumber(user.phoneNumber || '');
            setTShirtSize(user.tShirtSize || '');
            setResolvedUserId(user.id); // id = alias
            setUserLookupState('found');
            return;
          }
          if (!active) return;
          setUserLookupState('missing');
        } else if (res.status !== 404) {
          // 500/403/401 — service is down or auth broken
          console.error('Users API error:', res.status);
          if (active) setApiError(true);
        } else if (active) {
          // 404 means the user has not created a profile yet.
          setUserLookupState('missing');
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Failed to init user:', err);
        if (active) setApiError(true);
      }
    };
    initUser();
    return () => {
      active = false;
      controller.abort();
    };
  }, [sessionStatus, sessionEmail]);

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
    setPartnerErrors(prev => (prev[catId] ? { ...prev, [catId]: '' } : prev));
  };

  // Picker selected a verified, real member. `selected` gates submission.
  const handlePartnerSelect = (catId: string, partner: { alias: string; name: string }) => {
    setPartners(prev => ({
      ...prev,
      [catId]: {
        name: partner.name,
        alias: partner.alias,
        phone: '',
        tShirtSize: '',
        selected: true,
        manual: false,
      },
    }));
    setPartnerErrors(prev => (prev[catId] ? { ...prev, [catId]: '' } : prev));
  };

  const handlePartnerClear = (catId: string) => {
    setPartners(prev => ({
      ...prev,
      [catId]: { name: '', alias: '', phone: '', tShirtSize: '', selected: false, manual: false },
    }));
    setPartnerErrors(prev => (prev[catId] ? { ...prev, [catId]: '' } : prev));
  };

  // Admin-only manual override of the picker (unverified partner).
  const handleAdminManualMode = (catId: string, manual: boolean) => {
    setPartners(prev => ({
      ...prev,
      [catId]: { ...(prev[catId] || { name: '', alias: '', phone: '', tShirtSize: '' }), manual, selected: false },
    }));
    setPartnerErrors(prev => (prev[catId] ? { ...prev, [catId]: '' } : prev));
  };
  
  const handleWithdraw = (catId: Category) => {
    if (!registrationOpen) return;
    const categoryName = CATEGORIES.find(c => c.id === catId)?.name;
    setConfirmDialog({
      title: 'Withdraw registration',
      lines: [`Are you sure you want to withdraw from ${categoryName}?`],
      confirmLabel: 'Withdraw',
      tone: 'danger',
      onConfirm: () => performWithdraw(catId),
    });
  };

  const performWithdraw = async (catId: Category) => {
    try {
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
      showToast(err instanceof Error ? err.message : 'Failed to withdraw. Please try again.', 'error');
    }
  };

  const isDoubles = (c: Category) => c === 'MD' || c === 'WD' || c === 'XD';

  const isSelectionValid = selection.every(catId => {
    if (!isDoubles(catId)) return true;
    const p = partners[catId];
    if (!p) return false;
    // Admin manual override: legacy free-text requires name + alias.
    if (p.manual) return p.name?.trim().length > 0 && p.alias?.trim().length > 0;
    // Normal path: a real partner must have been SELECTED from the picker.
    return p.selected === true && p.alias?.trim().length > 0;
  });

  const handleSaveProfile = async () => {
    // T-shirt size is required — it doubles as the onboarding-complete signal.
    if (!tShirtSize.trim()) {
      showToast('Please select your t-shirt size.', 'error');
      return;
    }
    setLinkingAlias(true);
    // The user's own id/alias is always derived from their login — never the form.
    const cleanAlias = resolvedUserId || String(session?.user?.email || '').trim().toLowerCase().replace(/@.*$/, '');
    try {
      // PATCH updates only phone/t-shirt; name/email/alias are owned
      // by login/provisioning and must never be sent from the form.
      const patchRes = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cleanAlias,
          phoneNumber: phoneNumber.trim(),
          tShirtSize: tShirtSize.trim(),
        }),
      });

      if (patchRes.ok) {
        const result = await patchRes.json();
        setResolvedUserId(result.id || cleanAlias);
        setSavedPhone(phoneNumber.trim());
        setSavedTShirtSize(tShirtSize.trim());
        setSavedName(result.name || savedName || session?.user?.name || '');
        setSavedAlias(result.alias || cleanAlias);
        setIsEditingProfile(false);
        setUserLookupState('found');
        await fetchRegistrations(cleanAlias);
      } else if (patchRes.status === 404) {
        // Record missing — provisioning somehow didn't run. Create it from the
        // SESSION (never from form inputs) as a fallback.
        const createRes = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: cleanAlias,
            name: session?.user?.name || cleanAlias,
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

        const result = await createRes.json();
        setResolvedUserId(result.id || cleanAlias);
        setSavedPhone(phoneNumber.trim());
        setSavedTShirtSize(tShirtSize.trim());
        setSavedName(result.name || session?.user?.name || cleanAlias);
        setSavedAlias(result.alias || cleanAlias);
        setIsEditingProfile(false);
        setUserLookupState('found');
        await fetchRegistrations(cleanAlias);
      } else {
        const errData = await patchRes.json();
        throw new Error(errData.error || 'Failed to update profile.');
      }
    } catch (err: unknown) {
      console.error('Profile save failed:', err);
      const msg = err instanceof Error ? err.message : 'Failed to save profile. Please try again.';
      showToast(msg, 'error');
    } finally {
      setLinkingAlias(false);
    }
  };

  const handleSave = () => {
    if (!isSelectionValid) return;

    // Name each partner being locked so users confirm the right person.
    const doublesLines = selection
      .filter(isDoubles)
      .map(catId => {
        const p = partners[catId];
        const label = p?.name?.trim() || p?.alias || '';
        return `${catId} → ${label} (@${p?.alias || ''})`;
      });
    const lines = doublesLines.length
      ? ["You're locking in these partners:", ...doublesLines, 'Partners are matched by their account — make sure each is correct.']
      : ['Are you sure you want to confirm these registrations?'];
    setConfirmDialog({
      title: 'Confirm registration',
      lines,
      confirmLabel: 'Confirm',
      tone: 'primary',
      onConfirm: () => performSave(),
    });
  };

  const performSave = async () => {
    setSaving(true);
    try {
      // POST each selected category, tracking which ones actually succeeded so a
      // failure doesn't wipe the user's inline error or their remaining input.
      const succeeded = new Set<string>();
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
          // Surface an unsigned-partner rejection inline on the card.
          if (err.error === 'PARTNER_NOT_FOUND') {
            setPartnerErrors(prev => ({
              ...prev,
              [catId]: err.message || 'This partner needs to sign in to BaddyBash before you can register them.',
            }));
          } else {
            showToast(`Failed to register for ${catId}: ${err.error}`, 'error');
          }
          break;
        }
        succeeded.add(catId);
      }

      // Only clear the categories that actually registered — keep the failed one
      // (with its inline error) and any not-yet-attempted ones so the user can fix
      // and retry without re-entering everything. Refresh to reflect partial saves.
      if (succeeded.size > 0) {
        setSelection(prev => prev.filter(catId => !succeeded.has(catId)));
        setPartners(prev => {
          const next = { ...prev };
          succeeded.forEach(catId => delete next[catId]);
          return next;
        });
        setPartnerErrors(prev => {
          const next = { ...prev };
          succeeded.forEach(catId => delete next[catId]);
          return next;
        });
        await fetchRegistrations();
      }
    } catch (err) {
      console.error('Save failed:', err);
      showToast('An error occurred while saving. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (sessionStatus === 'unauthenticated') {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-32 text-court-300">
          Please sign in to access your dashboard.
        </div>
      </DashboardShell>
    );
  }

  const waitingForUserLookup = sessionStatus === 'authenticated' && userLookupState === 'pending';
  const hydratingResolvedProfile = sessionStatus === 'authenticated' && userLookupState === 'found' && !profileSaved;

  if (sessionStatus === 'loading' || waitingForUserLookup || hydratingResolvedProfile || !settingsLoaded) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-volt-400" />
          <span className="ml-3 text-court-300">Loading dashboard...</span>
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

  // Profile-first gate: if alias/name/phone not saved, show setup form
  // Only show form AFTER we've explicitly confirmed the lookup result is "missing"
  if (userLookupState === 'missing' || (userLookupState === 'found' && !isOnboarded) || isEditingProfile) {
    return (
      <DashboardShell className="min-h-screen relative">
        <main className="container mx-auto py-16 px-4 max-w-md">
          <div className="panel p-8">
            <p className="kicker mb-3">Player Profile</p>
            <h1 className="font-display text-3xl tracking-wide text-court-100 mb-2">{isEditingProfile ? 'Edit Profile' : 'Complete your profile'}</h1>
            <p className="text-court-300 text-sm mb-6">
              {isEditingProfile
                ? 'Your name, alias, and email come from your Microsoft account and can\u2019t be changed here. Update your phone number and t-shirt size below.'
                : 'Your name and alias are set from your Microsoft account. Just add a phone number and t-shirt size to get started.'}
            </p>

            <div className="space-y-4">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Lock className="w-3.5 h-3.5 text-court-400" />
                  <span className="text-xs font-medium text-court-400">From your Microsoft account</span>
                </div>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-court-400">Name</dt>
                    <dd className="text-court-200 font-medium text-right break-all">{savedName || session?.user?.name || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-court-400">Alias</dt>
                    <dd className="text-court-200 font-medium text-right break-all">{savedAlias || String(session?.user?.email || '').trim().toLowerCase().replace(/@.*$/, '') || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-court-400">Email</dt>
                    <dd className="text-court-200 font-medium text-right break-all">{session?.user?.email || '—'}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <label className="block text-sm font-medium text-court-200">Phone Number <span className="text-court-500 font-normal pl-1">(Optional)</span></label>
                <input
                  type="tel"
                  placeholder="e.g., 9876543210"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                  maxLength={10}
                  className="mt-1 block w-full rounded-lg border border-white/10 bg-court-900 px-3 py-2 text-sm text-court-100 placeholder-court-500 focus:border-volt-400 focus:outline-none focus:ring-1 focus:ring-volt-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-court-200">T-Shirt Size <span className="text-red-400 pl-1">*</span></label>
                <select
                  value={tShirtSize}
                  onChange={(e) => setTShirtSize(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-white/10 bg-court-900 px-3 py-2 text-sm text-court-100 focus:border-volt-400 focus:outline-none focus:ring-1 focus:ring-volt-400"
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
                  disabled={linkingAlias || !tShirtSize.trim()}
                  className="notch w-full bg-volt-400 text-court-950 py-2.5 font-bold hover:bg-volt-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
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
                       // Reset editable fields to saved values and exit edit mode
                       setPhoneNumber(savedPhone || '');
                       setTShirtSize(savedTShirtSize || '');
                       setIsEditingProfile(false);
                    }}
                    className="w-full rounded-lg border border-white/15 bg-transparent text-court-200 py-2.5 font-semibold hover:bg-white/5 flex items-center justify-center transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <ConfirmModal
          open={!!confirmDialog}
          title={confirmDialog?.title || ''}
          lines={confirmDialog?.lines || []}
          confirmLabel={confirmDialog?.confirmLabel || 'Confirm'}
          tone={confirmDialog?.tone || 'primary'}
          loading={confirmBusy}
          onConfirm={runConfirm}
          onClose={() => setConfirmDialog(null)}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell seasonLabel={seasonLabel} className="min-h-screen relative">
      <main className="container mx-auto py-8 px-4">
        <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <p className="kicker mb-2">Player Dashboard</p>
            <h1 className="font-display text-5xl tracking-wide text-court-100">{savedName}</h1>
            <p className="text-court-300 mt-2">Manage your tournament entries. Max {maxSelections} categories allowed.</p>

            <div className="mt-3 flex flex-wrap items-center gap-2 md:gap-4 text-sm text-court-300">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-volt-400/30 bg-volt-400/10 px-3 py-1 font-medium text-volt-300">
                <span className="w-2 h-2 rounded-full bg-volt-400" /> {savedAlias}
              </span>
              <span className="hidden md:inline text-court-600">·</span>
              <span>{savedPhone}</span>
              <span className="hidden md:inline text-court-600">·</span>
              <span>Size: {savedTShirtSize || '-'}</span>
              {registrationOpen && (
                <button
                  onClick={() => {
                    setPhoneNumber(savedPhone || '');
                    setTShirtSize(savedTShirtSize || '');
                    setIsEditingProfile(true);
                  }}
                  className="ml-2 text-court-400 hover:text-volt-400 transition-colors"
                  title="Edit Profile"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Your Matches Section — shown when fixtures are published, or always for admins */}
        {(bracketsVisible || isAdmin) && (
          <>
            {/* Instructions to Players — collapsible */}
            <div className="mb-6 px-4 py-3 bg-amber-400/10 border-l-4 border-amber-400/60 rounded-r-lg">
              <button
                onClick={() => setNotesExpanded(prev => !prev)}
                className="w-full flex items-center gap-2 text-left group"
              >
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-sm font-semibold text-amber-200">Instructions to Players</span>
                <span className="text-xs text-amber-400 hidden sm:inline">— Please read before your match</span>
                <span className={`text-xs text-amber-400 ml-auto mr-1 ${notesExpanded ? 'hidden' : ''}`}>View details</span>
                <ChevronDown className={`w-4 h-4 text-amber-400 transition-transform duration-200 ${notesExpanded ? 'rotate-180' : ''}`} />
              </button>

              {notesExpanded && (
                <div className="mt-3 pl-6">
                  <ul className="space-y-1.5 text-sm text-court-200 leading-relaxed">
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span>Your scheduled matches and reporting times are listed below. You can also visit the{' '}
                        <a href="/fixtures" className="text-volt-400 hover:underline font-medium">Fixtures page</a>{' '}
                        to view the full tournament draw across all rounds.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span><span className="font-semibold">Format:</span> Knockout. Singles of 30 points (no deuce) until pre-quarters. From Quarters onwards, best of 3 games of 21 points (deuce until 30).</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span>Every player must participate in initial rounds on <span className="font-semibold">21st/22nd March as per their schedule.</span></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span>Please <span className="font-semibold">report as per your assigned time slot.</span> A walkover will be given to the opponent if you fail to report on time.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span>We&apos;re coordinating <span className="font-semibold">1000+ players</span> — please stick strictly to your timelines and assigned slots.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span>Report on time → Complete registration → Collect your T-Shirt → Be ready for your game.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span><span className="font-semibold">Please bring:</span> your own racquets, non-marking sports shoes (bare foot is allowed), and your ID card.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span>Snacks &amp; refreshments will be provided at the venue.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span>Please <span className="font-semibold">do not arrive too early or linger after your games.</span> The Academy has strict instructions to limit crowd size at any given time.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span><span className="font-semibold">Parking:</span> The Academy has limited parking. Please use MS Campus parking — do not park on roads or at the Academy.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span>T-Shirts are only for <span className="font-semibold">participating players</span>, not for registration companions.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span><span className="font-semibold">Umpire&apos;s decision is final.</span> Please do not argue — the umpiring team are your colleagues volunteering their time.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span>Please do not use outside spaces or empty courts for practice.</span>
                    </li>
                  </ul>
                  <div className="mt-3 pt-3 border-t border-amber-400/20 text-xs text-court-400">
                    <p>For any queries or discrepancies, reach out to <a href="mailto:baddybash@microsoft.com" className="text-volt-400 hover:underline font-medium">baddybash@microsoft.com</a></p>
                  </div>
                </div>
              )}
            </div>

            {/* Upcoming / Live Matches */}
            <section className="mb-8">
              <div className="panel relative p-6 overflow-hidden">
                <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarDays className="w-5 h-5 text-volt-400" />
                  <h2 className="font-display text-2xl tracking-wide text-court-100">Your Matches</h2>
                  {upcomingMatches.length > 0 && (
                    <span className="ml-auto text-xs font-medium text-volt-300 bg-volt-400/10 px-2 py-0.5 rounded-full">
                      {upcomingMatches.length} upcoming
                    </span>
                  )}
                </div>
                <p className="text-xs text-amber-200 bg-amber-400/10 border border-amber-400/25 rounded-md px-3 py-2 mb-3">
                  <span className="font-semibold">📋 Notice:</span> Times displayed are your <span className="font-semibold">scheduled reporting times</span> — please arrive at the court on your listed time. Matches will get started 15 mins after the reporting time.
                </p>

                {matchesLoading ? (
                  <div className="flex items-center justify-center py-8 text-court-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading matches...
                  </div>
                ) : upcomingMatches.length === 0 ? (
                  <p className="text-center text-court-400 py-6">
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
                <div className="panel relative p-6 overflow-hidden">
                  <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <History className="w-5 h-5 text-court-400" />
                    <h2 className="font-display text-2xl tracking-wide text-court-100">Match History</h2>
                    {completedMatches.length > 0 && (
                      <span className="ml-auto text-xs font-medium text-court-300 bg-white/5 px-2 py-0.5 rounded-full">
                        {completedMatches.length} played
                      </span>
                    )}
                  </div>
                  {completedMatches.length === 0 ? (
                    <p className="text-center text-court-400 py-6">No completed matches yet. Your results will appear here.</p>
                  ) : (
                    <div className="divide-y divide-white/5">
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
                              { MS: 'bg-sky-400/15 text-sky-300', WS: 'bg-pink-400/15 text-pink-300', MD: 'bg-indigo-400/15 text-indigo-300', WD: 'bg-purple-400/15 text-purple-300', XD: 'bg-teal-400/15 text-teal-300' }[match.category] || 'bg-white/10 text-court-200'
                            }`}>
                              {match.category}
                            </span>
                            <span className="text-court-300 text-xs font-semibold w-10 shrink-0">{roundLabel}</span>
                            <span className="text-court-200 truncate flex-1">
                              vs <span className="font-medium">{opponent || 'TBD'}</span>
                              {opponentAlias && <span className="text-xs text-court-500 ml-1">({opponentAlias.includes('|') ? opponentAlias.split('|').map(a => `@${a}`).join(' & ') : `@${opponentAlias}`})</span>}
                            </span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${won ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>
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
        <div className="mb-6 px-4 py-3 bg-amber-400/10 border-l-4 border-amber-400/60 rounded-r-lg">
            <button
              onClick={() => setNotesExpanded(prev => !prev)}
              className="w-full flex items-center gap-2 text-left group"
            >
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm font-semibold text-amber-200">Note to Players</span>
              <span className="text-xs text-amber-400 hidden sm:inline">— Dates, venue, rules & more</span>
              <span className={`text-xs text-amber-400 ml-auto mr-1 ${notesExpanded ? 'hidden' : ''}`}>View details</span>
              <ChevronDown className={`w-4 h-4 text-amber-400 transition-transform duration-200 ${notesExpanded ? 'rotate-180' : ''}`} />
            </button>

            {notesExpanded && (
              <div className="mt-3 pl-6">
                <ul className="space-y-1.5 text-sm text-court-200 leading-relaxed">
                  <li className="flex gap-2">
                    <span className="text-amber-400 font-bold shrink-0">•</span>
                    <span><span className="font-semibold">Start Dates:</span> <span className="bg-amber-400/20 text-amber-200 font-semibold px-1 rounded">Mar 21st–22nd (initial rounds for all categories)</span>. Dates for remaining rounds will be communicated later.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400 font-bold shrink-0">•</span>
                    <span><span className="font-semibold">Venue:</span> Gopichand Badminton Academy (Kotak Courts)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400 font-bold shrink-0">•</span>
                    <span><span className="font-semibold">FTEs Only</span></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400 font-bold shrink-0">•</span>
                    <span>Max <span className="font-semibold">2 categories</span> per player.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400 font-bold shrink-0">•</span>
                    <span><span className="font-semibold">Registration closes on 12th March, 2026.</span></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400 font-bold shrink-0">•</span>
                    <span><span className="font-semibold">Doubles:</span> It&apos;s the player&apos;s responsibility to find their partner. The organizing team cannot accommodate requests to find a partner.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400 font-bold shrink-0">•</span>
                    <span><span className="font-semibold">Non-marking shoes</span> are mandatory.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400 font-bold shrink-0">•</span>
                    <span>Only game shuttles will be provided. Racquets, shoes, etc. are the player&apos;s responsibility.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400 font-bold shrink-0">•</span>
                    <span>Snacks will be provided at the venue.</span>
                  </li>
                </ul>
                <div className="mt-3 pt-3 border-t border-amber-400/20 text-xs text-court-400">
                  <p>For any queries, please reach out to the Baddy Bash organizing team — <a href="mailto:baddybash@microsoft.com" className="text-volt-400 hover:underline font-medium">baddybash@microsoft.com</a></p>
                  <p className="mt-0.5">If anyone is interested to join the Baddy Bash organizing team, please reach us at the above mentioned alias.</p>
                </div>
              </div>
            )}
          </div>

        <section className="mb-8">
          <div className="panel relative overflow-hidden p-6">
            <div className="relative z-10">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-volt-400/10 text-volt-400 ring-1 ring-volt-400/30">
                  <Trophy className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-display text-2xl leading-tight tracking-wide text-court-100">My Registrations</h2>
                  <p className="text-xs font-medium text-court-400">Pick your categories and lock in your spots</p>
                </div>
                <span className={`ml-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${isMaxReached ? 'bg-orange-400/15 text-orange-300' : 'bg-volt-400/10 text-volt-300'}`}>
                  <span className={`h-2 w-2 rounded-full ${isMaxReached ? 'bg-orange-400' : 'bg-volt-400'}`} aria-hidden="true" />
                  {totalCount} / {maxSelections} Slots Used
                </span>
              </div>
              {selection.length > 0 && (
                <button
                  onClick={handleSave}
                  disabled={!isSelectionValid || saving || !registrationOpen}
                  className={`notch inline-flex items-center gap-2 px-5 py-2 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-300 ${
                    isSelectionValid && !saving && registrationOpen
                      ? 'bg-volt-400 text-court-950 hover:bg-volt-300'
                      : 'cursor-not-allowed bg-white/10 text-court-500'
                  }`}
                >
                  {saving ? (
                    <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Saving...</span>
                  ) : (
                    <><CheckCircle className="h-4 w-4" /> Save Changes ({selection.length})</>
                  )}
                </button>
              )}
            </div>

            {isMaxReached && (
              <div className="flex items-center p-3 mb-6 bg-orange-400/10 text-orange-200 rounded-lg text-sm border border-orange-400/25">
                <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
                You have reached the maximum number of registrations per player.
              </div>
            )}

            {!registrationOpen && (
              <div className="flex items-center p-3 mb-6 bg-red-400/10 text-red-200 rounded-lg text-sm border border-red-400/25">
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
                    partnerSelected={partners[category.id]?.selected || false}
                    partnerError={partnerErrors[category.id]}
                    isAdmin={isAdmin}
                    onNameChange={(val) => handlePartnerChange(category.id, 'name', val)}
                    onAliasChange={(val) => handlePartnerChange(category.id, 'alias', val)}
                    onPhoneChange={(val) => handlePartnerChange(category.id, 'phone', val)}
                    onTShirtSizeChange={(val) => handlePartnerChange(category.id, 'tShirtSize', val)}
                    onPartnerSelect={(p) => handlePartnerSelect(category.id, p)}
                    onPartnerClear={() => handlePartnerClear(category.id)}
                    onAdminManualModeChange={(manual) => handleAdminManualMode(category.id, manual)}
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
            <div className="panel overflow-hidden">
              <button
                type="button"
                onClick={() => setPastSeasonsOpen((previous) => !previous)}
                className="flex w-full items-center gap-3 px-6 py-4 text-left hover:bg-white/5"
                aria-expanded={pastSeasonsOpen}
                aria-controls="past-seasons-panel"
              >
                <History className="w-5 h-5 text-court-400" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl tracking-wide text-court-100">Past Seasons</h2>
                  <p className="text-sm text-court-400">Archived registrations and results are available in read-only mode.</p>
                </div>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-court-300">
                  {historyLoading ? 'Loading…' : `${historicalSeasons.length} season${historicalSeasons.length === 1 ? '' : 's'}`}
                </span>
                <ChevronDown className={`w-4 h-4 text-court-400 transition-transform ${pastSeasonsOpen ? 'rotate-180' : ''}`} />
              </button>

              {pastSeasonsOpen && (
                <div id="past-seasons-panel" className="border-t border-white/5 bg-court-950/40 px-6 py-5">
                  {historyLoading ? (
                    <div className="flex items-center justify-center py-8 text-court-400">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Loading archived seasons...
                    </div>
                  ) : historicalSeasons.length === 0 ? (
                    <p className="py-6 text-center text-sm text-court-400">No archived registrations found for your account yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {historicalSeasons.map((history) => {
                        const completedHistoryMatches = history.matches.filter((match) => match.status === 'completed' || match.status === 'bye');

                        return (
                          <article key={history.season.id} className="rounded-xl border border-white/10 bg-court-900/60 p-5">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-display text-xl tracking-wide text-court-100">{getSeasonLabel(history.season)}</h3>
                                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-court-300">Read only</span>
                                </div>
                                <p className="mt-1 text-sm text-court-400">
                                  {history.registrations.length} registration{history.registrations.length === 1 ? '' : 's'} saved for this archived season.
                                </p>
                              </div>
                              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-court-300">
                                {completedHistoryMatches.length} result{completedHistoryMatches.length === 1 ? '' : 's'}
                              </span>
                            </div>

                            <div className="mt-4 space-y-4">
                              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                  <h4 className="text-sm font-semibold text-court-200">Registrations</h4>
                                  {history.registrations.map((registration) => {
                                    const categoryName = CATEGORIES.find((category) => category.id === registration.category)?.name || registration.category;
                                    const partnerText = registration.partnerName ? ` · ${registration.partnerName}` : '';

                                    return (
                                      <span key={registration.id} className="rounded-full border border-volt-400/25 bg-volt-400/10 px-3 py-1 text-xs font-medium text-volt-300">
                                        {categoryName}{partnerText}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="rounded-lg border border-white/10 bg-court-900/40 p-4">
                                <h4 className="text-sm font-semibold text-court-200">Match Results</h4>
                                {!history.resultsAvailable ? (
                                  <p className="mt-3 text-sm text-court-400">Results are not published for this archived season.</p>
                                ) : completedHistoryMatches.length === 0 ? (
                                  <p className="mt-3 text-sm text-court-400">No completed archived matches were found for your account.</p>
                                ) : (
                                  <div className="mt-3 divide-y divide-white/5">
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
                                            { MS: 'bg-sky-400/15 text-sky-300', WS: 'bg-pink-400/15 text-pink-300', MD: 'bg-indigo-400/15 text-indigo-300', WD: 'bg-purple-400/15 text-purple-300', XD: 'bg-teal-400/15 text-teal-300' }[match.category] || 'bg-white/10 text-court-200'
                                          }`}>
                                            {match.category}
                                          </span>
                                          <span className="w-10 shrink-0 text-xs font-semibold text-court-400">{roundLabel}</span>
                                          <span className="min-w-0 flex-1 truncate text-court-200">
                                            vs <span className="font-medium">{opponent || 'TBD'}</span>
                                            {opponentAlias && (
                                              <span className="ml-1 text-xs text-court-500">
                                                ({opponentAlias.includes('|') ? opponentAlias.split('|').map((alias) => `@${alias}`).join(' & ') : `@${opponentAlias}`})
                                              </span>
                                            )}
                                          </span>
                                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${won ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>
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
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <ConfirmModal
        open={!!confirmDialog}
        title={confirmDialog?.title || ''}
        lines={confirmDialog?.lines || []}
        confirmLabel={confirmDialog?.confirmLabel || 'Confirm'}
        tone={confirmDialog?.tone || 'primary'}
        loading={confirmBusy}
        onConfirm={runConfirm}
        onClose={() => setConfirmDialog(null)}
      />
    </DashboardShell>
  );
}

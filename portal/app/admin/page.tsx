'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { Trophy, Loader2, RefreshCw, Search, Download, ChevronDown, ShieldAlert, Swords, Lock, Unlock, ArrowRight, Upload, CalendarPlus, Archive, CheckCircle2, CircleAlert, X } from 'lucide-react';
import { Category, MatchDocument, MatchStatus, SeasonEntry } from '../lib/models';
import EditMatchModal from '../components/EditMatchModal';
import SeedingVisualizer from '../components/SeedingVisualizer';
import ErrorScreen from '../components/ErrorScreen';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { exportVisualBracket } from '../lib/bracketExcelExport';

const getCurrentSeasonFallback = () => String(new Date().getFullYear());

function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      {children}
    </div>
  );
}

interface AdminRegistration {
  id: string;
  userId: string;
  userName: string;
  category: Category;
  status: string;
  seed?: number;
  partnerId?: string;
  partnerName?: string;
  partnerPhone?: string;
}

interface AdminPlayer {
  id: string;
  name: string;
  email: string;
  alias?: string;
  phoneNumber?: string;
  registrations: AdminRegistration[];
}

type ExportActionType = 'players-category' | 'players-csv' | 'bracket' | 'visual-bracket';

type PendingAdminAction =
  | { type: 'export'; exportType: ExportActionType }
  | { type: 'save-seeds'; source: 'visualizer' | 'list' }
  | { type: 'generate-fixtures' }
  | { type: 'toggle-registration'; nextState: boolean }
  | { type: 'toggle-brackets'; nextState: boolean }
  | { type: 'create-season'; seasonId: string; label: string }
  | { type: 'import' };

type ImportErrorDetail = {
  id?: string;
  error: string;
};

type ImportFeedback = {
  tone: 'success' | 'warning' | 'error';
  title: string;
  message: string;
  errors: ImportErrorDetail[];
};

type AdminToast = {
  id: string;
  message: string;
  tone: 'success' | 'error';
};

type NewSeasonFormState = {
  seasonId: string;
  label: string;
  error: string | null;
};

const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function ImportFeedbackPanel({ feedback }: { feedback: ImportFeedback }) {
  const toneClasses = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    error: 'border-red-200 bg-red-50 text-red-800',
  } satisfies Record<ImportFeedback['tone'], string>;

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClasses[feedback.tone]}`}>
      <p className="text-sm font-semibold">{feedback.title}</p>
      <p className="mt-1 text-sm">{feedback.message}</p>
      {feedback.errors.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {feedback.errors.map((error, index) => (
            <li key={`${error.id || 'row'}-${index}`}>
              <span className="font-medium">{error.id || `Row ${index + 1}`}</span>: {error.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminModal({
  open,
  onClose,
  titleId,
  initialFocusRef,
  panelClassName = 'max-w-lg',
  children,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  panelClassName?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget = () => {
      const nextFocus =
        initialFocusRef?.current ||
        panelRef.current?.querySelector<HTMLElement>(MODAL_FOCUSABLE_SELECTOR) ||
        panelRef.current;
      nextFocus?.focus();
    };

    const frame = window.requestAnimationFrame(focusTarget);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR);
      if (!focusable || focusable.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [initialFocusRef, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm transition-opacity duration-200"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${panelClassName} rounded-2xl border border-slate-700/80 bg-slate-900 text-slate-100 shadow-2xl transition-all duration-200`}
      >
        {children}
      </div>
    </div>
  );
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: AdminToast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => {
        const toneClasses = toast.tone === 'success'
          ? 'border-emerald-500/40 bg-emerald-950/95 text-emerald-50'
          : 'border-red-500/40 bg-red-950/95 text-red-50';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl transition-all duration-200 ${toneClasses}`}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
          >
            {toast.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            ) : (
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
            )}
            <p className="flex-1 text-sm leading-6">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-full p-1 text-current/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminDashboard() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.isAdmin === true;

  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [matches, setMatches] = useState<MatchDocument[]>([]);
  const [activeTab, setActiveTab] = useState<'registrations' | 'matches'>('registrations');
  const [editingMatch, setEditingMatch] = useState<MatchDocument | null>(null);

  const [loading, setLoading] = useState(true);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [seedValues, setSeedValues] = useState<Record<string, string>>({});
  const [seedingMode, setSeedingMode] = useState(false);
  const [savingSeeds, setSavingSeeds] = useState(false);
  const [currentSeeds, setCurrentSeeds] = useState<{ id: string, name: string, currentSeed: number }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category>('MS');
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
type ImportPreviewItem = {
    id: string; // matchId
    matchNum: string;
    changes: { field: string; oldVal: string; newVal: string }[];
    originalMatch: MatchDocument;
    updated: MatchDocument; // The full proposed new state
};

// ... inside component ...
const [importPreview, setImportPreview] = useState<ImportPreviewItem[] | null>(null);
  const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAdminAction | null>(null);
  const [toasts, setToasts] = useState<AdminToast[]>([]);
  const [isNewSeasonModalOpen, setIsNewSeasonModalOpen] = useState(false);
  const [newSeasonForm, setNewSeasonForm] = useState<NewSeasonFormState>({
    seasonId: '',
    label: '',
    error: null,
  });

  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [bracketsVisible, setBracketsVisible] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newSeasonIdInputRef = useRef<HTMLInputElement>(null);
  const toastTimeoutsRef = useRef<Record<string, number>>({});

  // Season state
  const [activeSeason, setActiveSeason] = useState<string>(getCurrentSeasonFallback);
  const [seasons, setSeasons] = useState<SeasonEntry[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const selectedSeasonEntry = seasons.find(s => s.id === selectedSeason);
  const isSelectedSeasonArchived = selectedSeasonEntry?.archived === true;
  const selectedSeasonLabel = selectedSeasonEntry?.label || `Season ${selectedSeason || activeSeason}`;

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    fetch('/api/settings?full=1').then(res => {
      if (!res.ok) { setApiError(true); return null; }
      return res.json();
    }).then(data => {
      if (!data) return;
      // Full SeasonConfig
      if (data.seasons) {
        setSeasons(data.seasons);
        const resolvedSeason = data.activeSeason || data.seasons[0]?.id || getCurrentSeasonFallback();
        setActiveSeason(resolvedSeason);
        setSelectedSeason(resolvedSeason);
        const active = data.seasons.find((s: SeasonEntry) => s.id === resolvedSeason);
        if (active) {
          setRegistrationOpen(active.registrationOpen !== false);
          setBracketsVisible(active.bracketsVisible === true);
        }
      } else {
        // Backward compat fallback
        const resolvedSeason = getCurrentSeasonFallback();
        setActiveSeason(resolvedSeason);
        setSelectedSeason(resolvedSeason);
        setRegistrationOpen(data.registrationOpen !== false);
        setBracketsVisible(data.bracketsVisible === true);
      }
    }).catch(() => setApiError(true)).finally(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    if (!selectedSeasonEntry) return;
    setRegistrationOpen(selectedSeasonEntry.registrationOpen !== false);
    setBracketsVisible(selectedSeasonEntry.bracketsVisible === true);
    setSeedingMode(false);
    setEditingMatch(null);
    setImportPreview(null);
    setImportFeedback(null);
    setImporting(false);
    setPendingAction(null);
    setShowExportMenu(false);
  }, [selectedSeasonEntry]);

  const dismissToast = useCallback((id: string) => {
    const timeoutId = toastTimeoutsRef.current[id];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete toastTimeoutsRef.current[id];
    }

    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, tone: AdminToast['tone']) => {
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setToasts((currentToasts) => [...currentToasts, { id, message, tone }]);

    if (tone === 'success') {
      toastTimeoutsRef.current[id] = window.setTimeout(() => {
        dismissToast(id);
      }, 4000);
    }
  }, [dismissToast]);

  useEffect(() => (
    () => {
      Object.values(toastTimeoutsRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId));
      toastTimeoutsRef.current = {};
    }
  ), []);

  const closeNewSeasonModal = useCallback(() => {
    setIsNewSeasonModalOpen(false);
    setNewSeasonForm({ seasonId: '', label: '', error: null });
  }, []);

  const openNewSeasonModal = useCallback(() => {
    setNewSeasonForm({ seasonId: '', label: '', error: null });
    setIsNewSeasonModalOpen(true);
  }, []);

  const updateNewSeasonId = useCallback((seasonId: string) => {
    setNewSeasonForm((currentForm) => {
      const trimmedPreviousSeasonId = currentForm.seasonId.trim();
      const previousAutoLabel = trimmedPreviousSeasonId ? `Baddy Bash ${trimmedPreviousSeasonId}` : '';
      const shouldSyncLabel = currentForm.label.trim() === '' || currentForm.label === previousAutoLabel;

      return {
        seasonId,
        label: shouldSyncLabel && seasonId.trim() ? `Baddy Bash ${seasonId.trim()}` : currentForm.label,
        error: null,
      };
    });
  }, []);

  const requestCreateSeason = useCallback(() => {
    const seasonId = newSeasonForm.seasonId.trim();
    const label = newSeasonForm.label.trim();

    if (!seasonId || !label) {
      setNewSeasonForm((currentForm) => ({
        ...currentForm,
        error: 'Season ID and label are required.',
      }));
      return;
    }

    setIsNewSeasonModalOpen(false);
    setPendingAction({ type: 'create-season', seasonId, label });
  }, [newSeasonForm.label, newSeasonForm.seasonId]);

  const updateSelectedSeasonSettings = async (updates: Partial<Pick<SeasonEntry, 'registrationOpen' | 'bracketsVisible'>>) => {
    if (!selectedSeason) throw new Error('No season selected');
    const updatedSeasons = seasons.map(season =>
      season.id === selectedSeason
        ? { ...season, ...updates }
        : season
    );

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateSeason',
        config: {
          id: 'SEASON_CONFIG',
          activeSeason,
          seasons: updatedSeasons,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update settings');
    }

    const config = await res.json();
    setSeasons(config.seasons);
    setActiveSeason(config.activeSeason);
  };

  const applyRegistrationToggle = async (newState: boolean) => {
    setRegistrationOpen(newState);
    try {
      await updateSelectedSeasonSettings({ registrationOpen: newState });
    } catch (err) {
      console.error(err);
      setRegistrationOpen(!newState);
      showToast('Failed to update settings', 'error');
    }
  };

  const toggleRegistration = () => {
    if (isSelectedSeasonArchived) return;
    setPendingAction({ type: 'toggle-registration', nextState: !registrationOpen });
  };

  const applyBracketsToggle = async (newState: boolean) => {
    setBracketsVisible(newState);
    try {
      await updateSelectedSeasonSettings({ bracketsVisible: newState });
    } catch (err) {
      console.error(err);
      setBracketsVisible(!newState);
      showToast('Failed to update settings', 'error');
    }
  };

  const toggleBrackets = () => {
    if (isSelectedSeasonArchived) return;
    setPendingAction({ type: 'toggle-brackets', nextState: !bracketsVisible });
  };


  const fetchPlayers = useCallback(async () => {
    try {
      setLoading(true);
      const seasonQ = selectedSeason ? `&season=${selectedSeason}` : '';
      const res = await fetch(`/api/admin/players?category=${selectedCategory}${seasonQ}`);
      if (res.ok) {
        const data: AdminPlayer[] = await res.json();
        setPlayers(data);        
        // Prepare initial seeds for the visualizer
        const flattened = data.flatMap(p => 
          p.registrations.map(r => ({
            id: r.id, // Registration ID
            name: r.category.includes('D') ? (r.userName + (r.partnerName ? ' & ' + r.partnerName : '')) : r.userName,
            currentSeed: r.seed || 999
          }))
        );
        setCurrentSeeds(flattened);
        // Initialize seed values from existing data
        const seeds: Record<string, string> = {};
        data.forEach(p => {
          p.registrations.forEach(r => {
            if (r.seed) seeds[r.id] = String(r.seed);
          });
        });
        setSeedValues(seeds);
      } else if (res.status === 401 || res.status === 403 || res.status === 500) {
        setApiError(true);
      }
    } catch (err) {
      console.error('Failed to fetch players:', err);
      setApiError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedSeason]);

  const fetchMatches = useCallback(async () => {
    try {
      setMatchesLoading(true);
      const seasonQ = selectedSeason ? `&season=${selectedSeason}` : '';
      const res = await fetch(`/api/matches?category=${selectedCategory}${seasonQ}`);
      if (res.ok) {
        const data: MatchDocument[] = await res.json();
        setMatches(data);
      } else {
        setMatches([]);
      }
    } catch (err) {
      console.error('Failed to fetch matches:', err);
      setMatches([]);
    } finally {
      setMatchesLoading(false);
    }
  }, [selectedCategory, selectedSeason]);

  useEffect(() => {
    if (activeTab === 'registrations') {
      fetchPlayers();
    } else {
      fetchMatches();
    }
  }, [selectedCategory, activeTab, fetchPlayers, fetchMatches]);

  const handleSeedChange = async (registrationId: string, userId: string, value: string) => {
    if (isSelectedSeasonArchived) return;

    // Find the original seed from the players data (server state)
    const player = players.find(p => p.registrations.some(r => r.id === registrationId));
    const reg = player?.registrations.find(r => r.id === registrationId);
    const serverSeed = reg?.seed ? String(reg.seed) : '';

    // Only update if the value has actually changed from what's on the server
    if (value === serverSeed) return; 

    // Optimistic update: the UI state (seedValues) is already updated by onChange.
    // We just need to persist it.

    try {
      const res = await fetch('/api/admin/players', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId,
          userId,
          seed: value ? Number(value) : null,
          season: selectedSeason,
        }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'Failed to update seed', 'error');
        // Revert to server value on error
        setSeedValues(p => ({ ...p, [registrationId]: serverSeed }));
      } else {
        // Update the local players state to reflect the new saved seed
        // This ensures the next comparison is correct without requiring a refetch
        setPlayers(prevPlayers => prevPlayers.map(p => ({
            ...p,
            registrations: p.registrations.map(r => 
                r.id === registrationId 
                ? { ...r, seed: value ? Number(value) : undefined }
                : r
            )
        })));
      }
    } catch (err) {
      console.error('Failed to update seed:', err);
      // Revert to server value on error
      setSeedValues(p => ({ ...p, [registrationId]: serverSeed }));
    }
  };

  const handleSaveSeeds = async (source: 'visualizer' | 'list' = 'visualizer') => {
    if (isSelectedSeasonArchived) {
      showToast('Archived seasons are read-only.', 'error');
      return;
    }

    // Build a single seed map: registrationId -> seed number
    let seedMap: Record<string, number | null>;

    if (source === 'visualizer') {
      seedMap = {};
      currentSeeds.forEach(s => { seedMap[s.id] = s.currentSeed; });
    } else {
      // From list view seedValues
      seedMap = {};
      Object.entries(seedValues).forEach(([regId, val]) => {
        seedMap[regId] = val ? Number(val) : null;
      });
    }

    if (Object.keys(seedMap).length === 0) return;

    setSavingSeeds(true);
    try {
      const res = await fetch('/api/admin/players', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedCategory,
          seeds: seedMap,
          season: selectedSeason,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'Failed to save seeds.', 'error');
      } else {
        const result = await res.json();
        if (result.failed > 0) {
          showToast(`${result.failed} of ${result.total} seed(s) failed to save.`, 'error');
        }
      }

      // Refresh players to get fresh data from DB
      await fetchPlayers();
    } catch (err) {
      console.error('Failed to save seeds:', err);
      showToast('Failed to save seeds.', 'error');
    } finally {
      setSavingSeeds(false);
    }
  };

  const requestSaveSeeds = (source: 'visualizer' | 'list' = 'visualizer') => {
    if (isSelectedSeasonArchived) {
      showToast('Archived seasons are read-only.', 'error');
      return;
    }

    setPendingAction({ type: 'save-seeds', source });
  };

  const handleGenerateFixtures = async () => {
    if (isSelectedSeasonArchived) {
      showToast('Archived seasons are read-only.', 'error');
      return;
    }
     
    // Build seed map from visualizer state if active
    // For doubles, key by pairKey (deterministic sorted "userId|partnerId")
    // so the API can look up seeds regardless of which partner's registration it encounters first
    const seedMap: Record<string, number> = {};
    const isDoublesCategory = ['MD', 'WD', 'XD'].includes(selectedCategory);
    if (seedingMode) {
       if (isDoublesCategory) {
         // Map registration IDs back to pairKeys
         const flatRegs = players.flatMap(p => p.registrations);
         const regToPairKey = new Map<string, string>();
         for (const r of flatRegs) {
           const pk = [r.userId, r.partnerId || ''].sort().join('|');
           regToPairKey.set(r.id, pk);
         }
         currentSeeds.forEach(s => {
           if (!seedValues[s.id]) return; // only include players admin explicitly seeded
           const pk = regToPairKey.get(s.id);
           if (pk) seedMap[pk] = s.currentSeed;
           seedMap[s.id] = s.currentSeed; // Also send reg.id as fallback
         });
       } else {
         currentSeeds.forEach(s => {
           if (seedValues[s.id]) seedMap[s.id] = s.currentSeed; // only include players admin explicitly seeded
         });
       }
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          category: selectedCategory,
          seasonId: selectedSeason,
          seeds: seedingMode ? seedMap : undefined
        }),
      });
      if (res.ok) {
        await res.json();
        await fetchMatches();
        setSeedingMode(false);
        setActiveTab('matches');
      } else {
        const err = await res.json();
        showToast(`Error: ${err.error}`, 'error');
      }
    } catch (err) {
      console.error('Failed to generate fixtures:', err);
      showToast('Failed to generate fixtures.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const requestGenerateFixtures = () => {
    if (isSelectedSeasonArchived) {
      showToast('Archived seasons are read-only.', 'error');
      return;
    }

    setPendingAction({ type: 'generate-fixtures' });
  };

  const startSeeding = () => {
    if (isSelectedSeasonArchived) {
      showToast('Archived seasons are read-only.', 'error');
       return;
    }

    const flatRegs = players.flatMap(p => p.registrations);
    if (flatRegs.length < 2) {
      showToast('Not enough players/teams to seed.', 'error');
       return;
    }

    const isDoubles = ['MD', 'WD', 'XD'].includes(selectedCategory);

    // For doubles, deduplicate by pair key so each team appears once
    let entries: typeof flatRegs;
    if (isDoubles) {
      const seen = new Set<string>();
      entries = [];
      for (const r of flatRegs) {
        const pairKey = [r.userId, r.partnerId || ''].sort().join('|');
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        entries.push(r);
      }
    } else {
      entries = flatRegs;
    }

    // Map to Seed format — use seedValues (input state) as primary source since
    // the DB save from onBlur may still be in-flight when user clicks "Seed & Generate"
    const mapped = entries.map((r) => {
      const inputSeed = seedValues[r.id] ? Number(seedValues[r.id]) : undefined;
      return {
        id: r.id,
        name: isDoubles ? (r.userName + (r.partnerName ? ' & ' + r.partnerName : '')) : r.userName,
        currentSeed: inputSeed || r.seed || 999,
      };
    });
    
    setCurrentSeeds(mapped);
    setSeedingMode(true);
  };

  const CATEGORIES: { id: Category; name: string }[] = [
    { id: 'MS', name: "Men's Singles" },
    { id: 'WS', name: "Women's Singles" },
    { id: 'MD', name: "Men's Doubles" },
    { id: 'WD', name: "Women's Doubles" },
    { id: 'XD', name: "Mixed Doubles" },
  ];

  const handleExport = async () => {
    setShowExportMenu(false);
    
    // Determine rows
    const isDoubles = ['MD', 'WD', 'XD'].includes(selectedCategory);
    const catName = CATEGORIES.find(c => c.id === selectedCategory)?.name || selectedCategory;

    const filtered = players
      .map(p => ({
        ...p,
        registrations: p.registrations.filter(r => r.category === selectedCategory),
      }))
      .filter(p => p.registrations.length > 0);

    let rows: AdminPlayer[] = [];
    if (isDoubles) {
      const pairMap = new Map<string, AdminPlayer>();
      for (const player of filtered) {
        const reg = player.registrations[0];
        const partnerId = reg.partnerId || '';
        if (!partnerId) continue; // Skip if no partner yet? Or export as impartial
        
        // Key logic: sort IDs to dedup pair
        const pairKey = [player.id, partnerId].sort().join('|||');
        
        if (!pairMap.has(pairKey)) {
             pairMap.set(pairKey, player);
        } else {
             // Prefer the one with seed info if available (though they should be synced)
             const existing = pairMap.get(pairKey)!;
             if (!existing.registrations[0]?.seed && reg.seed) {
                 pairMap.set(pairKey, player);
             }
        }
      }
      rows = Array.from(pairMap.values());
    } else {
      rows = filtered;
    }

    // Sort
    rows.sort((a, b) => {
      const sA = a.registrations[0]?.seed;
      const sB = b.registrations[0]?.seed;
      if (sA && sB) return sA - sB;
      if (sA) return -1;
      if (sB) return 1;
      return a.name.localeCompare(b.name);
    });

    // Lookup
    const playerMap = new Map(players.map(p => [p.id, p]));

    // ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(catName);

    if (isDoubles) {
        worksheet.columns = [
            { header: '#', key: 'pos', width: 5 },
            { header: 'Seed', key: 'seed', width: 8 },
            { header: 'Team / Player 1', key: 'p1', width: 25 },
            { header: 'Alias 1', key: 'a1', width: 15 },
            { header: 'Phone 1', key: 'ph1', width: 15 },
            { header: 'Player 2', key: 'p2', width: 25 },
            { header: 'Alias 2', key: 'a2', width: 15 },
            { header: 'Phone 2', key: 'ph2', width: 15 },
            { header: 'Category', key: 'cat', width: 10 },
        ];
        
        rows.forEach((p, i) => {
            const reg = p.registrations[0];
            const partner = reg.partnerId ? (playerMap.get(reg.partnerId) || null) : null;
            worksheet.addRow({
                pos: i + 1,
                seed: reg.seed || '',
                p1: p.name,
                a1: p.alias || '',
                ph1: p.phoneNumber || '',
                p2: reg.partnerName || 'TBD',
                a2: partner?.alias || '',
                ph2: partner?.phoneNumber || '', // If user not found, fallback to reg data? user doc is better
                cat: selectedCategory
            });
        });

    } else {
        worksheet.columns = [
            { header: '#', key: 'pos', width: 5 },
            { header: 'Seed', key: 'seed', width: 8 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Alias', key: 'alias', width: 15 },
            { header: 'Phone', key: 'phone', width: 15 },
            { header: 'Category', key: 'cat', width: 10 },
        ];

        rows.forEach((p, i) => {
            const reg = p.registrations[0];
            worksheet.addRow({
                pos: i + 1,
                seed: reg.seed || '',
                name: p.name,
                alias: p.alias || '',
                phone: p.phoneNumber || '',
                cat: selectedCategory
            });
        });
    }
    
    // Style header
    worksheet.getRow(1).font = { bold: true };
    
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `BaddyBash_${selectedSeason || activeSeason}_Players_${selectedCategory}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isSelectedSeasonArchived) {
      showToast('Archived seasons are read-only.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportPreview(null); // Clear previous
    setImportFeedback(null);

    try {
      // 1. Fetch current matches to compare against
      const seasonQ = selectedSeason ? `&season=${selectedSeason}` : '';
      const res = await fetch(`/api/matches?category=${selectedCategory}${seasonQ}`);
      if (!res.ok) throw new Error("Failed to fetch current matches");
      const currentMatches: MatchDocument[] = await res.json();
      const matchMap = new Map(currentMatches.map(m => [m.id, m]));

      // 2. Parse Excel
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const worksheet = workbook.getWorksheet(1); // Assume sheet 1

      if (!worksheet) throw new Error("No worksheet found in file");

      const pendingChanges: ImportPreviewItem[] = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        // Columns based on Export function indices (1-based):
        // 1: ID, 2: Cat, 3: Num, 4: Round, 5: Pos, 
        // 6: P1 Name, 7: P1 ID, 8: S1
        // 9: P2 Name, 10: P2 ID, 11: S2
        // 12: Status, 13: Winner, 14: Time

        const matchId = row.getCell(1).text; 
        if (!matchId || !matchMap.has(matchId)) return; // Skip invalid rows
        
        const originalMatch = matchMap.get(matchId)!;
        const updatedMatch = { ...originalMatch }; // Clone for updates
        
        // Extract values
        const importedStatusRaw = row.getCell(12).text?.trim() || "";
        const importedWinnerName = row.getCell(13).text?.trim() || "";
        const importedTime = row.getCell(14).text?.trim() || "";
        
        // Potential ID overrides (if user moved players manually)
        const importedP1Id = row.getCell(7).text?.trim();
        const importedP2Id = row.getCell(10).text?.trim();
        
        const changes: { field: string; oldVal: string; newVal: string }[] = [];

        // 1. Time
        const oldTime = originalMatch.scheduledTime || "";
        if (importedTime !== oldTime) {
             changes.push({ field: "Scheduled Time", oldVal: oldTime, newVal: importedTime });
             updatedMatch.scheduledTime = importedTime;
        }

        // 2. Status
        // Normalize: "In Progress" -> "in_progress"
        const statusMap: Record<string, string> = {
            'scheduled': 'scheduled',
            'in progress': 'in_progress',
            'completed': 'completed',
            'bye': 'bye'
        };
        const normStatusKey = importedStatusRaw.toLowerCase().replace('_', ' '); // standardize input
        const normStatus = Object.entries(statusMap).find(([k]) => k === normStatusKey)?.[1] || originalMatch.status;

        if (normStatus !== originalMatch.status) {
             if (Object.values(statusMap).includes(normStatus)) {
                 changes.push({ field: "Status", oldVal: originalMatch.status, newVal: normStatus });
                 updatedMatch.status = normStatus as MatchStatus;
             }
        }

        // 3. Players (Advanced: if IDs changed in hidden columns, update match)
        // This allows fixing incorrect advancement manually
        if (importedP1Id && importedP1Id !== originalMatch.player1Id) {
            changes.push({ field: "Player 1", oldVal: originalMatch.player1Name || 'TBD', newVal: row.getCell(6).text || 'Unknown' });
            updatedMatch.player1Id = importedP1Id;
            updatedMatch.player1Name = row.getCell(6).text;
            updatedMatch.player1Seed = parseInt(row.getCell(8).text) || undefined;
        }
        if (importedP2Id && importedP2Id !== originalMatch.player2Id) {
            changes.push({ field: "Player 2", oldVal: originalMatch.player2Name || 'TBD', newVal: row.getCell(9).text || 'Unknown' });
            updatedMatch.player2Id = importedP2Id;
            updatedMatch.player2Name = row.getCell(9).text;
            updatedMatch.player2Seed = parseInt(row.getCell(11).text) || undefined; // Corrected index for S2
        }

        // 4. Winner Resolution
        // Logic: 
        // - If status is completed, verify winner matches P1 or P2.
        // - Priority: 
        //   A. Exact ID Match (not in basic export, but if we had it)
        //   B. Name Match (P1 or P2)
        //   C. "1" or "2" (explicit slot winner)
        
        const oldWinnerName = originalMatch.winnerName || "";
        
        if (normStatus === 'completed') {
            let newWinnerId = updatedMatch.winnerId;
            let newWinnerName = updatedMatch.winnerName;

            // If winner name changed or status just became completed
            if (importedWinnerName !== oldWinnerName || originalMatch.status !== 'completed') {
                if (importedWinnerName === '1' || importedWinnerName === updatedMatch.player1Name) {
                    newWinnerId = updatedMatch.player1Id!;
                    newWinnerName = updatedMatch.player1Name!;
                } else if (importedWinnerName === '2' || importedWinnerName === updatedMatch.player2Name) {
                    newWinnerId = updatedMatch.player2Id!;
                    newWinnerName = updatedMatch.player2Name!;
                } else {
                     // Try to match partial names? For now strict exact match to avoid errors.
                     // Or check if importedWinnerName is actually an ID (if valid UUID/format)
                     // Fallback: don't update winner if ambiguous.
                }

                if (newWinnerId !== originalMatch.winnerId) {
                    changes.push({ field: "Winner", oldVal: oldWinnerName, newVal: newWinnerName || importedWinnerName });
                    updatedMatch.winnerId = newWinnerId;
                    updatedMatch.winnerName = newWinnerName;
                }
            }
        } 
        else if (normStatus !== 'completed' && originalMatch.status === 'completed') {
             // Reverting from completed -> scheduled
             changes.push({ field: "Winner", oldVal: oldWinnerName, newVal: "(Cleared)" });
             updatedMatch.winnerId = undefined;
             updatedMatch.winnerName = undefined;
        }

        if (changes.length > 0) {
            pendingChanges.push({
                id: matchId,
                matchNum: originalMatch.matchNumber ? `M${originalMatch.matchNumber}` : '??',
                changes,
                originalMatch: originalMatch,
                updated: updatedMatch
            });
        }
      });

      setImportPreview(pendingChanges);
      if (pendingChanges.length === 0) {
        showToast('No changes detected in the file.', 'error');
        setImporting(false);
      }

    } catch (err) {
      console.error(err);
      showToast(`Failed to parse file: ${(err as Error).message}`, 'error');
      setImporting(false);
    } finally {
        if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
    }
  };

  const executeImport = async () => {
      if (isSelectedSeasonArchived) {
        showToast('Archived seasons are read-only.', 'error');
        return;
      }
      if (!importPreview || importPreview.length === 0) return;
      
      try {
        const updates = importPreview.map(item => {
           // Create a clean update object with all relevant fields from the 'updated' version
           const u = item.updated;
           return {
             id: u.id,
             category: u.category,
             status: u.status,
             winnerId: u.winnerId,
             winnerName: u.winnerName,
             // sets: u.sets, // Scores not currently supported in import
             scheduledTime: u.scheduledTime,
             // Include player details in case of swaps/overrides
             player1Id: u.player1Id, 
             player1Name: u.player1Name,
             player1Seed: u.player1Seed,
             player2Id: u.player2Id,
             player2Name: u.player2Name,
             player2Seed: u.player2Seed,
             seasonId: u.seasonId,
           };
        });

        const res = await fetch('/api/admin/import/bracket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates, season: selectedSeason }),
        });

        const result = await res.json();
        const errors = Array.isArray(result.errors) ? result.errors as ImportErrorDetail[] : [];
        const updated = typeof result.updated === 'number' ? result.updated : 0;
        const failed = typeof result.failed === 'number' ? result.failed : errors.length;

        if (res.status === 200) {
          const message = `Successfully updated ${updated} match${updated === 1 ? '' : 'es'}.`;
          setImportFeedback({
            tone: 'success',
            title: 'Fixtures import completed',
            message,
            errors: [],
          });
          showToast(message, 'success');
          setImportPreview(null);
          setImporting(false);
          fetchMatches();
          return;
        }

        if (res.status === 207) {
          const message = `Updated ${updated} match${updated === 1 ? '' : 'es'}, but ${failed} row${failed === 1 ? '' : 's'} failed.`;
          setImportFeedback({
            tone: 'warning',
            title: 'Fixtures import partially completed',
            message,
            errors,
          });
          showToast(message, 'error');
          setImportPreview(null);
          setImporting(false);
          fetchMatches();
          return;
        }

        if (res.status === 400) {
          const failureCount = errors.length;
          const message = failureCount > 0
            ? `No matches were updated. ${failureCount} row${failureCount === 1 ? '' : 's'} failed validation or update.`
            : 'No matches were updated.';
          setImportFeedback({
            tone: 'error',
            title: 'Fixtures import failed',
            message,
            errors,
          });
          setImporting(false);
          showToast(`Import failed for ${failureCount} row${failureCount === 1 ? '' : 's'}. Review the error list for details.`, 'error');
          return;
        }

        const fallbackMessage = result.error || 'Unknown error';
        setImportFeedback({
          tone: 'error',
          title: 'Fixtures import failed',
          message: fallbackMessage,
          errors,
        });
        setImporting(false);
        showToast(`Import failed: ${fallbackMessage}`, 'error');

      } catch (error) {
        console.error(error);
        setImporting(false);
        showToast('Failed to execute import.', 'error');
      }
  };

  const handleExportBracket = async () => {
    setShowExportMenu(false);
    setExporting(true);
    try {
      const seasonQ = selectedSeason ? `&season=${selectedSeason}` : '';
      const res = await fetch(`/api/matches?category=${selectedCategory}${seasonQ}`);
      if (!res.ok) { showToast('No fixtures found for this category.', 'error'); return; }
      const matches: MatchDocument[] = await res.json();
      if (matches.length === 0) { showToast('No fixtures generated yet for this category.', 'error'); return; }

      const isDoubles = ['MD', 'WD', 'XD'].includes(selectedCategory);
      const totalRounds = Math.max(...matches.map(m => m.round));

      const getRoundName = (round: number) => {
        const r = totalRounds - round;
        if (r === 0) return 'Final';
        if (r === 1) return 'Semis';
        if (r === 2) return 'Quarters';
        return `Round ${round}`;
      };

      // Sort by round, then position
      matches.sort((a, b) => a.round - b.round || a.position - b.position);

      const catName = CATEGORIES.find(c => c.id === selectedCategory)?.name || selectedCategory;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(catName);

      worksheet.columns = [
          { header: 'Match ID', key: 'id', width: 0, hidden: true }, // Hidden ID for re-import
          { header: 'Category', key: 'category', width: 10 },
          { header: 'Match #', key: 'matchNum', width: 10 },
          { header: 'Round', key: 'round', width: 15 },
          { header: 'Position', key: 'pos', width: 10 },
          { header: isDoubles ? 'Team 1' : 'Player 1', key: 'p1', width: 25 },
          { header: 'Player 1 ID', key: 'p1Id', width: 0, hidden: true }, // Hidden ID
          { header: 'Seed 1', key: 's1', width: 8 },
          { header: isDoubles ? 'Team 2' : 'Player 2', key: 'p2', width: 25 },
          { header: 'Player 2 ID', key: 'p2Id', width: 0, hidden: true }, // Hidden ID
          { header: 'Seed 2', key: 's2', width: 8 },
          { header: 'Status', key: 'status', width: 15 },
          { header: 'Winner', key: 'winner', width: 25 },
          { header: 'Scheduled Time', key: 'time', width: 20 },
      ];

      matches.forEach(m => {
          worksheet.addRow({
              id: m.id,
              category: m.category,
              matchNum: m.matchNumber ? `M${m.matchNumber}` : '',
              round: getRoundName(m.round),
              pos: m.position + 1,
              p1: m.player1Name || '',
              p1Id: m.player1Id || '',
              s1: m.player1Seed || '',
              p2: m.player2Name || '',
              p2Id: m.player2Id || '',
              s2: m.player2Seed || '',
              status: m.status.charAt(0).toUpperCase() + m.status.slice(1).replace('_', ' '),
              winner: m.winnerName || '',
              time: m.scheduledTime || '',
          });
      });

      // Style header
      worksheet.getRow(1).font = { bold: true };
      
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `BaddyBash_${selectedSeason || activeSeason}_Bracket_${selectedCategory}_${new Date().toISOString().slice(0, 10)}.xlsx`);

    } catch (err) {
      console.error('Failed to export bracket:', err);
      showToast('Failed to export fixtures.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportVisualBracket = async () => {
    setShowExportMenu(false);
    setExporting(true);
    try {
      const seasonQ = selectedSeason ? `&season=${selectedSeason}` : '';
      const res = await fetch(`/api/matches?category=${selectedCategory}${seasonQ}`);
      if (!res.ok) { showToast('No fixtures found for this category.', 'error'); return; }
      const data: MatchDocument[] = await res.json();
      if (data.length === 0) { showToast('No fixtures generated yet for this category.', 'error'); return; }

      const buffer = await exportVisualBracket(data, selectedCategory);
      saveAs(
        new Blob([buffer]),
        `BaddyBash_${selectedSeason || activeSeason}_VisualBracket_${selectedCategory}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (err) {
      console.error('Failed to export visual bracket:', err);
      showToast('Failed to export visual fixtures.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const requestExport = (exportType: ExportActionType) => {
    setShowExportMenu(false);
    setPendingAction({ type: 'export', exportType });
  };

  const requestImportCommit = () => {
    if (!importPreview || importPreview.length === 0) return;
    setPendingAction({ type: 'import' });
  };

  const executePendingAction = async () => {
    if (!pendingAction) return;

    const action = pendingAction;
    setPendingAction(null);

    if (action.type === 'toggle-registration') {
      await applyRegistrationToggle(action.nextState);
      return;
    }

    if (action.type === 'toggle-brackets') {
      await applyBracketsToggle(action.nextState);
      return;
    }

    if (action.type === 'save-seeds') {
      await handleSaveSeeds(action.source);
      return;
    }

    if (action.type === 'generate-fixtures') {
      await handleGenerateFixtures();
      return;
    }

    if (action.type === 'import') {
      await executeImport();
      return;
    }

    if (action.type === 'create-season') {
      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'createSeason', seasonId: action.seasonId, label: action.label }),
        });
        if (!res.ok) {
          const err = await res.json();
          showToast(err.error || 'Failed to create season', 'error');
          return;
        }
        const config = await res.json();
        setSeasons(config.seasons);
        setActiveSeason(config.activeSeason);
        setSelectedSeason(config.activeSeason);
        showToast(`Season "${action.label}" created! Previous season has been archived.`, 'success');
        fetchPlayers();
      } catch {
        showToast('Failed to create season', 'error');
      }
      return;
    }

    switch (action.exportType) {
      case 'players-category':
        await handleExport();
        break;
      case 'players-csv':
        window.location.href = `/api/admin/export?season=${encodeURIComponent(selectedSeason || activeSeason)}`;
        break;
      case 'bracket':
        await handleExportBracket();
        break;
      case 'visual-bracket':
        await handleExportVisualBracket();
        break;
    }
  };

  const pendingActionDetails = pendingAction ? (() => {
    switch (pendingAction.type) {
      case 'toggle-registration':
        return {
          title: pendingAction.nextState
            ? `Re-open registrations for ${selectedSeasonLabel}?`
            : `Close registrations for ${selectedSeasonLabel}?`,
          description: pendingAction.nextState
            ? `Players will be able to sign up again for ${selectedSeasonLabel}.`
            : `Players will no longer be able to sign up for ${selectedSeasonLabel}.`,
          confirmLabel: pendingAction.nextState ? 'Open Registration' : 'Close Registration',
          confirmClassName: pendingAction.nextState ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700',
        };
      case 'toggle-brackets':
        return {
          title: pendingAction.nextState
            ? `Publish fixtures for ${selectedSeasonLabel}?`
            : `Hide fixtures for ${selectedSeasonLabel}?`,
          description: pendingAction.nextState
            ? `All users will be able to view the ${selectedCategory} fixtures for ${selectedSeasonLabel}.`
            : `Fixtures for ${selectedSeasonLabel} will only be visible to admins.`,
          confirmLabel: pendingAction.nextState ? 'Publish Fixtures' : 'Hide Fixtures',
          confirmClassName: pendingAction.nextState ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-800',
        };
      case 'save-seeds':
        return {
          title: `Save seeds for ${selectedSeasonLabel}?`,
          description: `This will persist the current seed order for ${CATEGORIES.find((category) => category.id === selectedCategory)?.name || selectedCategory} in ${selectedSeasonLabel}.`,
          confirmLabel: 'Save Seeds',
          confirmClassName: 'bg-blue-600 hover:bg-blue-700',
        };
      case 'generate-fixtures':
        return {
          title: `Generate fixtures for ${selectedSeasonLabel}?`,
          description: `This will ${seedingMode ? 'generate' : 'replace'} the ${selectedCategory} bracket for ${selectedSeasonLabel}.`,
          confirmLabel: 'Generate Fixtures',
          confirmClassName: 'bg-green-600 hover:bg-green-700',
        };
      case 'import':
        return {
          title: `Import fixture changes for ${selectedSeasonLabel}?`,
          description: `This will apply ${importPreview?.length || 0} queued match updates to ${selectedSeasonLabel}.`,
          confirmLabel: 'Commit Import',
          confirmClassName: 'bg-emerald-600 hover:bg-emerald-700',
        };
      case 'create-season':
        return {
          title: `Create "${pendingAction.label}"?`,
          description: `This will create season ID ${pendingAction.seasonId} as "${pendingAction.label}" and archive the current active season.`,
          confirmLabel: 'Create Season',
          confirmClassName: 'bg-indigo-600 hover:bg-indigo-700',
        };
      case 'export': {
        const exportLabels: Record<ExportActionType, string> = {
          'players-category': `${selectedCategory} player list`,
          'players-csv': 'all-player CSV export',
          bracket: `${selectedCategory} fixtures export`,
          'visual-bracket': `${selectedCategory} visual fixtures export`,
        };

        return {
          title: `Export ${selectedSeasonLabel}?`,
          description: `You are exporting the ${exportLabels[pendingAction.exportType]} for ${selectedSeasonLabel}.`,
          confirmLabel: 'Export',
          confirmClassName: 'bg-blue-600 hover:bg-blue-700',
        };
      }
    }
  })() : null;

  // Auth loading or settings not yet loaded
  if (sessionStatus === 'loading' || !settingsLoaded) {
    return (
      <AdminShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-slate-600">Checking access...</span>
        </div>
      </AdminShell>
    );
  }

  if (apiError) {
    return (
      <AdminShell>
        <ErrorScreen bare title="Service Unavailable" message="We could not reach our servers. This could be a temporary issue, please try again in a moment." />
      </AdminShell>
    );
  }

  // Non-admin gate
  if (!isAdmin) {
    return (
      <AdminShell>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <ShieldAlert className="w-16 h-16 text-red-400" />
          <h1 className="text-2xl font-bold text-slate-800">Access Denied</h1>
          <p className="text-slate-500">You don&apos;t have admin privileges to view this page.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <main className="container mx-auto py-8 px-4">
        <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Tournament Administration</h1>
            <p className="text-slate-600 mt-1 md:mt-2 text-sm md:text-base">Manage players, seeds, and fixtures.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {/* Season Switcher */}
            {seasons.length > 1 && (
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                className="border border-indigo-300 rounded-lg px-3 py-2 text-sm text-indigo-800 bg-indigo-50 font-medium min-h-[44px]"
              >
                {seasons.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label}{s.archived ? ' (Archived)' : s.id === activeSeason ? ' ★' : ''}
                  </option>
                ))}
              </select>
            )}
            {/* New Season button */}
            <button
              onClick={openNewSeasonModal}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 min-h-[44px]"
              title="Create New Season"
            >
              <CalendarPlus size={16} />
              <span className="hidden sm:inline">New Season</span>
            </button>
            {/* Archived indicator */}
            {isSelectedSeasonArchived && (
              <span className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 border border-slate-200">
                <Archive size={14} /> 📦 Archived Season — Read Only
              </span>
            )}
            <button
              onClick={toggleBrackets}
              disabled={isSelectedSeasonArchived}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium border min-h-[44px] ${
                bracketsVisible 
                  ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100' 
                  : 'border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={isSelectedSeasonArchived ? 'Archived seasons are read-only' : bracketsVisible ? 'Hide Fixtures' : 'Publish Fixtures'}
            >
              {bracketsVisible ? <Trophy size={16} /> : <Lock size={16} />}
              <span className="hidden sm:inline">{bracketsVisible ? 'Fixtures Live' : 'Fixtures Hidden'}</span>
            </button>
            <button
              onClick={toggleRegistration}
              disabled={isSelectedSeasonArchived}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium border min-h-[44px] ${
                registrationOpen 
                  ? 'border-red-200 text-red-700 bg-red-50 hover:bg-red-100' 
                  : 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={isSelectedSeasonArchived ? 'Archived seasons are read-only' : registrationOpen ? 'Close Registrations' : 'Re-open Registrations'}
            >
              {registrationOpen ? <Lock size={16} /> : <Unlock size={16} />}
              <span className="hidden sm:inline">{registrationOpen ? 'Close Reg' : 'Open Reg'}</span>
            </button>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as Category)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white min-h-[44px]"
            >
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div ref={exportRef} className="relative">
              <button
                onClick={() => setShowExportMenu(v => !v)}
                disabled={exporting}
                className="bg-blue-600 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                  <button
                    onClick={() => requestExport('players-category')}
                    disabled={loading || players.length === 0}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    📋 Players (Category)
                  </button>
                  <button
                    onClick={() => requestExport('players-csv')}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 border-t border-slate-100"
                  >
                    🌍 All Players (CSV)
                  </button>
                  <button
                    onClick={() => requestExport('bracket')}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 border-t border-slate-100"
                  >
                    🏆 Fixtures / Draw
                  </button>
                  <button
                    onClick={() => requestExport('visual-bracket')}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 border-t border-slate-100"
                  >
                    🎯 Visual Fixtures
                  </button>
                </div>
              )}
            </div>

            {/* Import Button & Hidden Input */}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".xlsx"
              onChange={handleImportFile}
              disabled={importing}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing || isSelectedSeasonArchived}
              className="bg-slate-100 text-slate-700 px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-slate-200 border border-slate-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 min-h-[44px]"
              title={isSelectedSeasonArchived ? 'Archived seasons are read-only' : 'Import Bracket Data'}
            >
              <Upload size={16} />
              <span className="hidden sm:inline">Import</span>
            </button>
          </div>
        </header>

        {isSelectedSeasonArchived && (
          <div className="mb-6 rounded-xl border border-slate-300 bg-gradient-to-r from-slate-100 to-slate-50 px-5 py-4 text-slate-800 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">📦</span>
                <div>
                  <p className="font-semibold">Archived Season — Read Only</p>
                  <p className="text-sm text-slate-600">
                    You are viewing <span className="font-medium">{selectedSeasonLabel}</span>. Editing, seeding, imports, and fixture generation are disabled, but exports remain available.
                  </p>
                </div>
              </div>
              <span className="self-start rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                Season context: {selectedSeason}
              </span>
            </div>
          </div>
        )}

        <AdminModal
          open={!!pendingAction && !!pendingActionDetails}
          onClose={() => setPendingAction(null)}
          titleId="admin-season-action-title"
        >
          <div className="border-b border-slate-800 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Season Operation</p>
            <h2 id="admin-season-action-title" className="mt-2 text-xl font-bold text-white">
              {pendingActionDetails?.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">{pendingActionDetails?.description}</p>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4">
            <button
              type="button"
              onClick={() => setPendingAction(null)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executePendingAction}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition ${pendingActionDetails?.confirmClassName || 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {pendingActionDetails?.confirmLabel}
            </button>
          </div>
        </AdminModal>
        
        <AdminModal
          open={isNewSeasonModalOpen}
          onClose={closeNewSeasonModal}
          titleId="new-season-modal-title"
          initialFocusRef={newSeasonIdInputRef}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              requestCreateSeason();
            }}
          >
            <div className="border-b border-slate-800 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-300/80">Season Setup</p>
              <h2 id="new-season-modal-title" className="mt-2 text-xl font-bold text-white">
                Create New Season
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Add a new active season and archive the current one once you confirm the next step.
              </p>
            </div>
            <div className="space-y-5 px-6 py-5">
              <div>
                <label htmlFor="new-season-id" className="text-sm font-medium text-slate-200">
                  Season ID
                </label>
                <input
                  id="new-season-id"
                  ref={newSeasonIdInputRef}
                  type="text"
                  value={newSeasonForm.seasonId}
                  onChange={(event) => updateNewSeasonId(event.target.value)}
                  placeholder="2027"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
              <div>
                <label htmlFor="new-season-label" className="text-sm font-medium text-slate-200">
                  Season label
                </label>
                <input
                  id="new-season-label"
                  type="text"
                  value={newSeasonForm.label}
                  onChange={(event) => setNewSeasonForm((currentForm) => ({
                    ...currentForm,
                    label: event.target.value,
                    error: null,
                  }))}
                  placeholder="Baddy Bash 2027"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
              {newSeasonForm.error && (
                <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                  {newSeasonForm.error}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-800 px-6 py-4">
              <button
                type="button"
                onClick={closeNewSeasonModal}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                Continue
              </button>
            </div>
          </form>
        </AdminModal>

        {/* Import Preview Modal */}
        {importPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    Review Changes
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Importing updates into <span className="font-medium text-slate-700">{selectedSeasonLabel}</span>
                  </p>
                </div>
                <div className="text-sm text-slate-500">
                  {importPreview.length} matches to update
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {importFeedback && (
                  <div className="mb-4">
                    <ImportFeedbackPanel feedback={importFeedback} />
                  </div>
                )}
                {importPreview.length === 0 ? (
                  <p className="text-center text-slate-500">No changes detected.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Match</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Field</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Old Value</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">New Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importPreview.map((item, idx) => (
                        <React.Fragment key={item.id + idx}>
                          {item.changes.map((change, cIdx) => (
                            <tr key={`${item.id}-${cIdx}`} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-mono text-slate-600 align-top">
                                {cIdx === 0 ? item.matchNum : ''}
                              </td>
                              <td className="px-3 py-2 font-medium text-slate-700">
                                {change.field}
                              </td>
                              <td className="px-3 py-2 text-red-500 line-through decoration-red-300">
                                {change.oldVal || <span className="text-slate-300 italic">Empty</span>}
                              </td>
                              <td className="px-3 py-2 text-green-600 font-medium">
                                {change.newVal || <span className="text-slate-300 italic">Empty</span>}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
                <button
                  onClick={() => { setImportPreview(null); setImporting(false); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={requestImportCommit}
                  className="px-6 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 shadow-sm"
                >
                  Commit {importPreview.length} Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
           <div className="flex justify-center items-center py-12">
             <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
             <span className="ml-3 text-slate-500">Loading data...</span>
           </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-slate-200 mb-6">
              <button
                onClick={() => setActiveTab('registrations')}
                className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
                  activeTab === 'registrations'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Registrations & Seeds
              </button>
              <button
                onClick={() => setActiveTab('matches')}
                className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
                  activeTab === 'matches'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Matches
              </button>
            </div>

            {activeTab === 'registrations' ? (
              <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {isSelectedSeasonArchived && (
                  <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-700 flex items-center gap-2">
                    <Archive size={16} />
                    Archived seasons are read-only. Seed changes and bracket generation are disabled.
                  </div>
                )}
                {seedingMode ? (
                    <div className="p-6">
                       <div className="flex justify-between items-center mb-6">
                         <div>
                           <h2 className="text-lg font-bold text-slate-800">Seeding Matchups</h2>
                           <p className="text-sm text-slate-500">Drag players to adjust seeds and set first-round matchups.</p>
                         </div>
                         <div className="flex gap-3">
                           <button 
                             onClick={() => setSeedingMode(false)}
                             className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                           >
                             Cancel
                           </button>
                           <button 
                             onClick={() => requestSaveSeeds('visualizer')}
                             disabled={savingSeeds || isSelectedSeasonArchived}
                             className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-2 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                           >
                             {savingSeeds ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                             Save Seeds
                           </button>
                           <button 
                             onClick={requestGenerateFixtures}
                             disabled={generating || isSelectedSeasonArchived}
                             className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center gap-2 disabled:bg-slate-200 disabled:text-slate-500"
                           >
                             {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                             Generate Bracket
                           </button>
                         </div>
                       </div>
                       
                       <SeedingVisualizer 
                         participants={currentSeeds} 
                         onSeedsChange={setCurrentSeeds}
                       />
                    </div>
                ) : (
                <>
                <div className="p-6 border-b border-slate-100 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-slate-800">
                      Registered Players — <span className="text-blue-600">{CATEGORIES.find(c => c.id === selectedCategory)?.name}</span>
                    </h2>
                    <div className="flex items-center gap-2">
                        <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold">
                        {(() => {
                            const isD = ['MD', 'WD', 'XD'].includes(selectedCategory);
                            if (!isD) return `${players.length} Players`;
                            const seen = new Set<string>();
                            for (const p of players) {
                            const reg = p.registrations[0];
                            const pairKey = [p.id, reg?.partnerId || ''].sort().join('|||');
                            seen.add(pairKey);
                            }
                            return `${seen.size} Teams`;
                        })()}
                        </span>
                        <button 
                          onClick={() => requestSaveSeeds('list')}
                          disabled={savingSeeds || isSelectedSeasonArchived || Object.keys(seedValues).length === 0}
                          className="px-3 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1 ml-4 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                        >
                          {savingSeeds ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                          Save Seeds
                        </button>
                        <button 
                          onClick={startSeeding}
                          disabled={isSelectedSeasonArchived}
                          className="px-3 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                        >
                          <ArrowRight className="w-3 h-3" />
                          Seed & Generate
                        </button>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                    />
                  </div>
                </div>

                {players.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    No players have registered yet.
                  </div>
                ) : (() => {
                  const isDoubles = ['MD', 'WD', 'XD'].includes(selectedCategory);
                  const filtered = players
                    .map(p => ({
                      ...p,
                      registrations: p.registrations.filter(r => r.category === selectedCategory),
                    }))
                    .filter(p => p.registrations.length > 0);

                  // For doubles, deduplicate pairs — keep the partner who carries the seed
                  let displayRows = filtered;
                  if (isDoubles) {
                    const pairMap = new Map<string, typeof filtered[number]>();
                    for (const player of filtered) {
                      const reg = player.registrations[0];
                      const partnerId = reg.partnerId || '';
                      const pairKey = [player.id, partnerId].sort().join('|||');
                      const existing = pairMap.get(pairKey);
                      if (!existing) {
                        pairMap.set(pairKey, player);
                      } else {
                        // Prefer the partner with a seed
                        const existingSeed = existing.registrations[0]?.seed;
                        const thisSeed = reg.seed;
                        if (!existingSeed && thisSeed) {
                          pairMap.set(pairKey, player);
                        }
                      }
                    }
                    displayRows = Array.from(pairMap.values());
                  }

                  // Sort: seeded first (ascending seed), then unseeded
                  displayRows.sort((a, b) => {
                    const sA = a.registrations[0]?.seed;
                    const sB = b.registrations[0]?.seed;
                    if (sA && sB) return sA - sB;
                    if (sA) return -1;
                    if (sB) return 1;
                    return a.name.localeCompare(b.name);
                  });

                  // Filter by search query
                  if (searchQuery.trim()) {
                    const q = searchQuery.trim().toLowerCase();
                    displayRows = displayRows.filter(p => {
                      const reg = p.registrations[0];
                      const partnerName = reg?.partnerName || '';
                      return p.name.toLowerCase().includes(q) || partnerName.toLowerCase().includes(q);
                    });
                  }

                  if (displayRows.length === 0) {
                    return (
                      <div className="p-12 text-center text-slate-500">
                        No players registered for {CATEGORIES.find(c => c.id === selectedCategory)?.name || selectedCategory}.
                      </div>
                    );
                  }

                  return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                      <thead className="bg-slate-50 text-slate-500 uppercase font-medium">
                        <tr>
                          <th className="p-4">{isDoubles ? 'Team' : 'Name / ID'}</th>
                          <th className="p-4">Seed Rank</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayRows.map(player => {
                          const reg = player.registrations[0];
                          return (
                          <tr key={player.id} className="hover:bg-slate-50">
                            <td className="p-4">
                              {isDoubles ? (
                                <div className="flex items-center gap-3">
                                  <div className="flex -space-x-2">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold border-2 border-white z-10">
                                      {player.name[0]}
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold border-2 border-white">
                                      {reg.partnerName?.[0] || '?'}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-slate-900">{player.name} <span className="text-slate-400 font-normal">&</span> {reg.partnerName || 'TBD'}</p>
                                    <p className="text-xs text-slate-400">{player.alias || player.email}</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                                    {player.name[0]}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-slate-900">{player.name}</p>
                                    <p className="text-xs text-slate-400">{player.alias || player.email}</p>
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="p-4">
                              {(() => {
                                const val = seedValues[reg.id] || '';
                                // Check if this seed value is duplicated by another registration in the same category
                                const isDuplicate = val !== '' && Object.entries(seedValues).some(([otherId, otherVal]) => {
                                  if (otherId === reg.id || otherVal !== val) return false;
                                  // Only flag if the other registration is in the same category
                                  const otherPlayer = displayRows.find(p => p.registrations.some(r => r.id === otherId));
                                  return !!otherPlayer;
                                });
                                return (
                                  <div className="relative">
                                    <input
                                      type="number"
                                      className={`w-20 border rounded px-2 py-1 text-center text-sm ${isDuplicate ? 'border-red-500 bg-red-50 text-red-700' : ''}`}
                                      placeholder="-"
                                      value={val}
                                      disabled={isSelectedSeasonArchived}
                                      onChange={(e) => setSeedValues(p => ({ ...p, [reg.id]: e.target.value }))}
                                      onBlur={() => handleSeedChange(reg.id, reg.userId, val)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    />
                                    {isDuplicate && (
                                      <p className="absolute text-[10px] text-red-500 font-medium whitespace-nowrap mt-0.5">Duplicate</p>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  );
                })()}
                </>
                )}
              </section>
            ) : (
                /* MATCHES SECTION */
                <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {isSelectedSeasonArchived && (
                        <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-700 flex items-center gap-2">
                            <Archive size={16} />
                            Archived seasons are read-only. Bracket generation and match updates are disabled.
                        </div>
                    )}
                    {importFeedback && (
                        <div className="border-b border-slate-100 px-6 py-4">
                            <ImportFeedbackPanel feedback={importFeedback} />
                        </div>
                    )}
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                            <Swords className="w-5 h-5 text-blue-600" />
                            Match List — <span className="text-blue-600">{CATEGORIES.find(c => c.id === selectedCategory)?.name}</span>
                        </h2>
                        <div className="flex gap-2">
                            {matches.length > 0 && (
                                <button
                                    onClick={requestGenerateFixtures}
                                    disabled={generating || isSelectedSeasonArchived}
                                    className="text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 disabled:bg-slate-100 disabled:text-slate-400"
                                    title={isSelectedSeasonArchived ? 'Archived seasons are read-only' : 'Regenerate Bracket'}
                                >
                                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                                </button>
                            )}
                            <button onClick={fetchMatches} className="text-slate-500 hover:text-blue-600 p-2 rounded hover:bg-slate-100" title="Refresh Matches">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    
                    {matchesLoading ? (
                        <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
                             <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                             <p>Loading matches...</p>
                        </div>
                    ) : matches.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-4">
                             <Trophy className="w-12 h-12 text-slate-300" />
                             <p>No matches found for this category.</p>
                             <button 
                                onClick={requestGenerateFixtures}
                                disabled={generating || isSelectedSeasonArchived}
                                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 flex items-center gap-2 font-medium"
                             >
                                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                                Generate Bracket
                             </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-slate-600">
                                <thead className="bg-slate-50 text-slate-500 uppercase font-medium">
                                    <tr>
                                        <th className="p-4">#</th>
                                        <th className="p-4">Round</th>
                                        <th className="p-4 text-right">Player 1</th>
                                        <th className="p-4 text-center text-xs text-slate-300">vs</th>
                                        <th className="p-4 text-left">Player 2</th>
                                        <th className="p-4 text-center">Status</th>
                                        <th className="p-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {[...matches]
                                        .sort((a,b) => a.round - b.round || a.position - b.position)
                                        .map(m => (
                                        <tr key={m.id} className="hover:bg-slate-50">
                                            <td className="p-4 text-slate-400 font-mono text-xs">M{m.matchNumber}</td>
                                            <td className="p-4 font-medium">
                                                {(() => {
                                                    const maxR = Math.max(...matches.map(x => x.round));
                                                    const r = maxR - m.round;
                                                    if (r === 0) return 'Final';
                                                    if (r === 1) return 'Semis';
                                                    if (r === 2) return 'Quarters';
                                                    return `R${m.round}`;
                                                })()}
                                            </td>
                                            <td className={`p-4 text-right font-semibold ${m.winnerId === m.player1Id ? 'text-green-600' : 'text-slate-700'}`}>
                                                {m.player1Name || 'TBD'}
                                                {m.winnerId === m.player1Id && <span className="ml-2 text-xs text-green-500">🏆</span>}
                                            </td>
                                            <td className="p-4 text-center text-slate-300 text-xs">-</td>
                                            <td className={`p-4 text-left font-semibold ${m.winnerId === m.player2Id ? 'text-green-600' : 'text-slate-700'}`}>
                                                {m.player2Name || 'TBD'}
                                                {m.winnerId === m.player2Id && <span className="ml-2 text-xs text-green-500">🏆</span>}
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide 
                                                    ${m.status === 'completed' ? 'bg-green-100 text-green-700' : 
                                                      m.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 
                                                      m.status === 'bye' ? 'bg-slate-100 text-slate-500' : 
                                                      'bg-blue-50 text-blue-600'}
                                                `}>
                                                    {m.status.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                {m.status !== 'bye' && (
                                                    <button 
                                                        onClick={() => setEditingMatch(m)}
                                                        disabled={isSelectedSeasonArchived}
                                                        className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        Update
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}
            
            {editingMatch && (
                <EditMatchModal 
                    match={editingMatch}
                    onClose={() => setEditingMatch(null)}
                    onUpdate={fetchMatches}
                />
            )}
          </>
        )}
      </main>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </AdminShell>
  );
}

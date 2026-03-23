'use client';

import { useState, useEffect, useCallback, useMemo, Fragment, useRef } from 'react';
import Navbar from '../components/Navbar';
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, Lock, Search, X, Swords, Save, Undo2, Pencil, ArrowLeftRight } from 'lucide-react';
import ErrorScreen from '../components/ErrorScreen';
import Image from 'next/image';
import { Category, MatchDocument, CATEGORIES } from '../lib/models';
import { useSession } from 'next-auth/react';

/* ── Layout constants ──────────────────────────────────────────────── */
const SLOT_H = 110;         // Every match slot is this tall
const CONN_W = 28;         // Width of SVG connector column between rounds
const CARD_W = 256;        // w-64 = 256px
const VISIBLE_ROUNDS = 4;

/** Block height for a match slot at a given visible-column index. */
function blockH(colIdx: number) { return SLOT_H * Math.pow(2, colIdx); }

function getRoundName(round: number, totalRounds: number): string {
  const r = totalRounds - round;
  if (r === 0) return 'Final';
  if (r === 1) return 'Semis';
  if (r === 2) return 'Quarters';
  return `R${round}`;
}

/* ── Match card ────────────────────────────────────────────────────── */
interface MatchCardProps {
  match: MatchDocument;
  highlighted?: boolean;
  advanceMode?: boolean;
  pendingWinnerId?: string;
  onSelectWinner?: (matchId: string, playerId: string, playerName: string) => void;
  onEdit?: (match: MatchDocument) => void;
  isAdmin?: boolean;
}

function MatchCard({ match, highlighted, advanceMode, pendingWinnerId, onSelectWinner, onEdit, isAdmin: isAdminProp }: MatchCardProps) {
  const isBye = match.status === 'bye';
  const fmtAlias = (id: string) => id.includes('|') ? id.split('|').map(a => `@${a}`).join(' & ') : `@${id}`;
  const isLive = match.status === 'in_progress';
  const isComplete = match.status === 'completed';
  const p1Win = match.winnerId && match.winnerId === match.player1Id;
  const p2Win = match.winnerId && match.winnerId === match.player2Id;

  // Advance mode: show pending selection
  const p1Pending = advanceMode && pendingWinnerId === match.player1Id;
  const p2Pending = advanceMode && pendingWinnerId === match.player2Id;
  const canAdvance = advanceMode && !isBye && !isComplete && match.player1Id && match.player2Id;

  const handlePlayerClick = (playerId: string | undefined, playerName: string | undefined, e: React.MouseEvent) => {
    if (!canAdvance || !playerId || !playerName || !onSelectWinner) return;
    e.stopPropagation();
    onSelectWinner(match.id, playerId, playerName);
  };

  return (
    <div
      className={`w-64 rounded border text-xs leading-tight shrink-0 transition-all duration-200 ${
        highlighted
          ? 'bg-blue-900/50 border-blue-400 ring-2 ring-blue-400/40 shadow-lg shadow-blue-500/10'
          : isBye
            ? 'bg-slate-800/30 border-slate-700/40'
            : isLive
              ? 'bg-slate-800 border-amber-600/50 ring-1 ring-amber-500/20'
              : isComplete
                ? 'bg-slate-800 border-slate-600'
                : 'bg-slate-800 border-slate-700'
      }`}
    >
      {/* Header: match number + badge */}
      <div className="flex items-center justify-between px-1.5 pt-0.5">
        <div className="flex items-center gap-1">
          {match.matchNumber ? (
            <span className="text-[9px] font-mono text-slate-500">M{match.matchNumber}</span>
          ) : <span />}
          {isAdminProp && !advanceMode && !isBye && onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(match); }}
              className="text-slate-600 hover:text-blue-400 transition-colors p-0.5"
              title="Edit players"
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
        <span className={`text-[8px] font-bold uppercase tracking-wider px-1 rounded ${
          isBye ? 'bg-slate-700/50 text-slate-500'
          : isLive ? 'bg-amber-900/60 text-amber-400'
          : isComplete ? 'bg-green-900/60 text-green-400'
          : 'bg-slate-700 text-slate-400'
        }`}>
          {isBye ? 'BYE' : isLive ? 'Live' : isComplete ? 'Winner' : 'Upcoming'}
        </span>
      </div>

      {/* Schedule Info */}
      {(match.scheduledTime) && !isBye && (
        <div className="px-2 py-0.5 mt-0.5 mb-0.5 text-[10px] bg-slate-700/30 border-y border-slate-700/30 flex items-center justify-between text-amber-200/90 font-mono">
           <span className="truncate">{match.scheduledTime || 'TBD'}</span>
        </div>
      )}

      {/* Player 1 */}
      <div
        onClick={(e) => handlePlayerClick(match.player1Id, match.player1Name, e)}
        className={`flex items-center justify-between px-2 py-0.5 border-b border-slate-700/40 transition-all ${
          p1Pending
            ? 'bg-green-900/50 text-green-300 font-semibold'
            : p1Win ? 'text-green-400 font-semibold' : 'text-slate-300'
        } ${canAdvance ? 'cursor-pointer hover:bg-slate-700/50' : ''}`}
      >
        <div className="flex-1 min-w-0 flex items-center gap-1">
          {match.player1Seed && (
            <span className="text-[9px] font-bold text-amber-500/80 shrink-0">[{match.player1Seed}]</span>
          )}
          {match.player1Name ? (
            <div className="min-w-0">
              <span className="truncate block">{match.player1Name}</span>
              {match.player1Id && <span className="text-[8px] text-slate-500 font-normal truncate block">{fmtAlias(match.player1Id)}</span>}
            </div>
          ) : <span className="text-slate-600 italic text-[10px]">TBD</span>}
        </div>
        {p1Pending && <span className="text-green-400 ml-1 shrink-0 text-[10px] font-bold">W</span>}
        {!p1Pending && isComplete && p1Win && <span className="text-green-500 ml-1 shrink-0 text-[10px]">W</span>}
      </div>

      {/* Player 2 */}
      <div
        onClick={(e) => handlePlayerClick(match.player2Id, match.player2Name, e)}
        className={`flex items-center justify-between px-2 py-0.5 transition-all ${
          p2Pending
            ? 'bg-green-900/50 text-green-300 font-semibold'
            : p2Win ? 'text-green-400 font-semibold' : 'text-slate-300'
        } ${canAdvance ? 'cursor-pointer hover:bg-slate-700/50' : ''}`}
      >
        <div className="flex-1 min-w-0 flex items-center gap-1">
          {match.player2Seed && (
            <span className="text-[9px] font-bold text-amber-500/80 shrink-0">[{match.player2Seed}]</span>
          )}
          {match.player2Name ? (
            <div className="min-w-0">
              <span className="truncate block">{match.player2Name}</span>
              {match.player2Id && <span className="text-[8px] text-slate-500 font-normal truncate block">{fmtAlias(match.player2Id)}</span>}
            </div>
          ) : (
            <span className="text-slate-600 italic text-[10px]">{isBye ? '— bye —' : 'TBD'}</span>
          )}
        </div>
        {p2Pending && <span className="text-green-400 ml-1 shrink-0 text-[10px] font-bold">W</span>}
        {!p2Pending && isComplete && p2Win && <span className="text-green-500 ml-1 shrink-0 text-[10px]">W</span>}
      </div>

    </div>
  );
}

/* ── Edit Players Modal ────────────────────────────────────────────── */
interface UserOption {
  id: string;
  name: string;
  alias?: string;
}

interface EditPlayersModalProps {
  match: MatchDocument;
  category: Category;
  onClose: () => void;
  onSaved: (updated: MatchDocument) => void;
}

function EditPlayersModal({ match, category, onClose, onSaved }: EditPlayersModalProps) {
  const [p1Id, setP1Id] = useState(match.player1Id || '');
  const [p1Name, setP1Name] = useState(match.player1Name || '');
  const [p2Id, setP2Id] = useState(match.player2Id || '');
  const [p2Name, setP2Name] = useState(match.player2Name || '');
  const [saving, setSaving] = useState(false);

  // User search
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [activeSlot, setActiveSlot] = useState<1 | 2 | null>(null);
  const [slotSearch, setSlotSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.ok ? r.json() : [])
      .then((users: UserOption[]) => { setAllUsers(users); setUsersLoaded(true); })
      .catch(() => setUsersLoaded(true));
  }, []);

  const filteredUsers = useMemo(() => {
    const q = slotSearch.trim().toLowerCase();
    if (!q) return allUsers.slice(0, 20);
    return allUsers.filter(u =>
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.alias && u.alias.toLowerCase().includes(q)) ||
      (u.id && u.id.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [slotSearch, allUsers]);

  useEffect(() => {
    if (activeSlot && searchRef.current) searchRef.current.focus();
  }, [activeSlot]);

  const selectUser = (user: UserOption, slot: 1 | 2) => {
    if (slot === 1) { setP1Id(user.id); setP1Name(user.name); }
    else { setP2Id(user.id); setP2Name(user.name); }
    setActiveSlot(null);
    setSlotSearch('');
  };

  const handleSwap = () => {
    setP1Id(prev => { const old2 = p2Id; setP2Id(prev); return old2; });
    setP1Name(prev => { const old2 = p2Name; setP2Name(prev); return old2; });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/matches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: match.id,
          category,
          player1Id: p1Id || '',
          player1Name: p1Name || '',
          player2Id: p2Id || '',
          player2Name: p2Name || '',
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to update');
        return;
      }
      const data = await res.json();
      onSaved(data.match);
      onClose();
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = p1Id !== (match.player1Id || '') || p1Name !== (match.player1Name || '') ||
                     p2Id !== (match.player2Id || '') || p2Name !== (match.player2Name || '');

  const renderSlot = (slot: 1 | 2) => {
    const id = slot === 1 ? p1Id : p2Id;
    const name = slot === 1 ? p1Name : p2Name;
    const isSearching = activeSlot === slot;

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase text-slate-400 font-medium">Player {slot}</span>
          <button
            onClick={() => { setActiveSlot(isSearching ? null : slot); setSlotSearch(''); }}
            className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
          >
            <Search className="w-2.5 h-2.5" />
            {isSearching ? 'Cancel' : 'Search'}
          </button>
        </div>

        {isSearching ? (
          <div className="relative">
            <input
              ref={searchRef}
              type="text"
              value={slotSearch}
              onChange={(e) => setSlotSearch(e.target.value)}
              placeholder="Type name or alias..."
              className="w-full bg-slate-700 border border-slate-600 rounded px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            {usersLoaded && (
              <div className="absolute left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-40 overflow-y-auto z-10">
                {filteredUsers.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-500">No users found</div>
                ) : filteredUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => selectUser(u, slot)}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-700 transition-colors flex items-center justify-between"
                  >
                    <span className="text-sm text-white truncate">{u.name}</span>
                    <span className="text-[10px] text-slate-500 shrink-0 ml-2">@{u.alias || u.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => slot === 1 ? setP1Name(e.target.value) : setP2Name(e.target.value)}
              placeholder="Name"
              className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              value={id}
              onChange={(e) => slot === 1 ? setP1Id(e.target.value) : setP2Id(e.target.value)}
              placeholder="alias"
              className="w-24 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-400 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono text-[11px]"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b border-slate-800">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Pencil className="w-3.5 h-3.5 text-blue-400" />
            Edit Match M{match.matchNumber}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {renderSlot(1)}

          <div className="flex justify-center">
            <button
              onClick={handleSwap}
              className="flex items-center gap-1.5 px-3 py-1 text-xs text-slate-400 hover:text-blue-400 border border-slate-700 hover:border-blue-500/50 rounded-full transition-colors"
            >
              <ArrowLeftRight className="w-3 h-3" />
              Swap
            </button>
          </div>

          {renderSlot(2)}
        </div>

        <div className="p-3 border-t border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── SVG bracket connectors between adjacent round columns ─────────── */
function Connectors({ colIdx, matchCount }: { colIdx: number; matchCount: number }) {
  const bh = blockH(colIdx);
  const totalH = matchCount * bh;
  const pairs = Math.floor(matchCount / 2);

  return (
    <svg width={CONN_W} height={totalH} className="block shrink-0" style={{ minHeight: totalH }}>
      {Array.from({ length: pairs }).map((_, i) => {
        const topY  = (2 * i + 0.5) * bh;       // center of top match
        const botY  = (2 * i + 1.5) * bh;       // center of bottom match
        const midY  = (2 * i + 1)   * bh;       // merge point = next match center
        const midX  = CONN_W / 2;
        return (
          <g key={i} strokeWidth={1.5} fill="none" stroke="#475569">
            <line x1={0}    y1={topY}  x2={midX}  y2={topY}  />
            <line x1={0}    y1={botY}  x2={midX}  y2={botY}  />
            <line x1={midX} y1={topY}  x2={midX}  y2={botY}  />
            <line x1={midX} y1={midY}  x2={CONN_W} y2={midY} />
          </g>
        );
      })}
    </svg>
  );
}

/* ── Main page ─────────────────────────────────────────────────────── */
export default function BracketPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin === true;

  const [selectedCategory, setSelectedCategory] = useState<Category>('MS');
  const [matches, setMatches] = useState<MatchDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [roundOffset, setRoundOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const bracketRef = useRef<HTMLDivElement>(null);
  const matchRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [bracketsVisible, setBracketsVisible] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [apiError, setApiError] = useState(false);

  // Advance mode state (admin only)
  const [advanceMode, setAdvanceMode] = useState(false);
  const [pendingAdvances, setPendingAdvances] = useState<Map<string, { winnerId: string; winnerName: string }>>(new Map());
  const [saving, setSaving] = useState(false);

  // Edit players modal state (admin only)
  const [editingMatch, setEditingMatch] = useState<MatchDocument | null>(null);

  const handleMatchEdited = useCallback((updatedMatch: MatchDocument) => {
    setMatches(prev => prev.map(m => m.id === updatedMatch.id ? updatedMatch : m));
  }, []);

  const handleSelectWinner = useCallback((matchId: string, playerId: string, playerName: string) => {
    setPendingAdvances(prev => {
      const next = new Map(prev);
      // Toggle: if same player already selected, deselect
      const existing = next.get(matchId);
      if (existing?.winnerId === playerId) {
        next.delete(matchId);
      } else {
        next.set(matchId, { winnerId: playerId, winnerName: playerName });
      }
      return next;
    });
  }, []);

  const handleCancelAdvance = useCallback(() => {
    setPendingAdvances(new Map());
    setAdvanceMode(false);
  }, []);

  const handleSaveAdvances = useCallback(async () => {
    if (pendingAdvances.size === 0) return;
    setSaving(true);
    try {
      const advances = Array.from(pendingAdvances.entries()).map(([matchId, { winnerId, winnerName }]) => ({
        matchId,
        winnerId,
        winnerName,
      }));

      const res = await fetch('/api/matches/advance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: selectedCategory, advances }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to save advancements');
        return;
      }

      const data = await res.json();
      setMatches(data.matches);
      setPendingAdvances(new Map());
      setAdvanceMode(false);
    } catch {
      alert('Failed to save advancements');
    } finally {
      setSaving(false);
    }
  }, [pendingAdvances, selectedCategory]);

  // Check brackets visibility
  useEffect(() => {
    fetch('/api/settings').then(res => {
      if (!res.ok) { setApiError(true); return null; }
      return res.json();
    }).then(data => {
      if (!data) return;
      setBracketsVisible(data.bracketsVisible === true);
    }).catch(() => setApiError(true)).finally(() => setCheckingAccess(false));
  }, []);

  const fetchMatches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/matches?category=${selectedCategory}`);
      if (res.ok) { setMatches(await res.json()); }
      else if (res.status >= 500) { setApiError(true); }
      else { setMatches([]); }
    } catch { setApiError(true); }
    finally { setLoading(false); }
  }, [selectedCategory]);

  useEffect(() => { fetchMatches(); setRoundOffset(0); setPendingAdvances(new Map()); setAdvanceMode(false); }, [fetchMatches]);

  // Project matches with pending advances applied locally (cascading preview)
  const projectedMatches = useMemo(() => {
    if (!advanceMode || pendingAdvances.size === 0) return matches;

    // Deep-clone matches to avoid mutating state
    const cloned: MatchDocument[] = matches.map(m => ({ ...m }));
    const matchMap = new Map<string, MatchDocument>();
    for (const m of cloned) matchMap.set(m.id, m);

    // Sort pending by round order so cascading works
    const pending = Array.from(pendingAdvances.entries())
      .map(([id, val]) => ({ id, ...val, round: matchMap.get(id)?.round ?? 0 }))
      .sort((a, b) => a.round - b.round);

    for (const { id, winnerId, winnerName } of pending) {
      const m = matchMap.get(id);
      if (!m || !m.nextMatchId) continue;

      // Determine seed of the winner
      let winnerSeed: number | undefined;
      if (winnerId === m.player1Id) winnerSeed = m.player1Seed;
      else if (winnerId === m.player2Id) winnerSeed = m.player2Seed;

      // Fill the winner into the next match slot
      const next = matchMap.get(m.nextMatchId);
      if (!next) continue;

      if (m.nextMatchSlot === 1) {
        next.player1Id = winnerId;
        next.player1Name = winnerName;
        next.player1Seed = winnerSeed;
      } else {
        next.player2Id = winnerId;
        next.player2Name = winnerName;
        next.player2Seed = winnerSeed;
      }
    }

    return cloned;
  }, [matches, advanceMode, pendingAdvances]);

  // Group matches by round (use projected matches for display)
  const { sortedRounds, totalRounds, stats } = useMemo(() => {
    const rMap = new Map<number, MatchDocument[]>();
    projectedMatches.forEach(m => { const l = rMap.get(m.round) || []; l.push(m); rMap.set(m.round, l); });
    rMap.forEach(l => l.sort((a, b) => a.position - b.position));
    const sorted = Array.from(rMap.entries()).sort(([a], [b]) => a - b);
    const byes = projectedMatches.filter(m => m.status === 'bye').length;
    return { sortedRounds: sorted, totalRounds: rMap.size, stats: { total: projectedMatches.length, real: projectedMatches.length - byes, byes } };
  }, [projectedMatches]);

  // Search: find matches where player name contains the query
  const { highlightedIds, searchResultList, searchResultCount } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { highlightedIds: new Set<string>(), searchResultList: [] as string[], searchResultCount: 0 };
    const ids = new Set<string>();
    const list: string[] = [];
    projectedMatches.forEach(m => {
      if (
        (m.player1Name && m.player1Name.toLowerCase().includes(q)) ||
        (m.player2Name && m.player2Name.toLowerCase().includes(q)) ||
        (m.player1Id && m.player1Id.toLowerCase().includes(q)) ||
        (m.player2Id && m.player2Id.toLowerCase().includes(q))
      ) {
        ids.add(m.id);
        list.push(m.id);
      }
    });
    return { highlightedIds: ids, searchResultList: list, searchResultCount: ids.size };
  }, [searchQuery, projectedMatches]);

  // Reset search index when query changes
  useEffect(() => { setSearchIndex(0); }, [searchQuery]);

  // Navigate to the current search result (by searchIndex)
  const scrollToResult = useCallback((idx: number) => {
    if (searchResultList.length === 0) return;
    const targetId = searchResultList[idx];
    const targetMatch = projectedMatches.find(m => m.id === targetId);
    if (!targetMatch) return;
    const roundIdx = sortedRounds.findIndex(([r]) => r === targetMatch.round);
    if (roundIdx >= 0 && (roundIdx < roundOffset || roundIdx >= roundOffset + VISIBLE_ROUNDS)) {
      setRoundOffset(Math.min(roundIdx, Math.max(0, sortedRounds.length - VISIBLE_ROUNDS)));
    }
    setTimeout(() => {
      const el = matchRefs.current.get(targetId);
      if (el && bracketRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }, 100);
  }, [searchResultList, projectedMatches, sortedRounds, roundOffset]);

  // Auto-scroll when search results change or index changes
  useEffect(() => {
    if (searchResultList.length > 0) scrollToResult(searchIndex);
  }, [searchIndex, searchResultList, scrollToResult]);

  const visibleRounds = sortedRounds.slice(roundOffset, roundOffset + VISIBLE_ROUNDS);
  const canLeft = roundOffset > 0;
  const canRight = roundOffset + VISIBLE_ROUNDS < sortedRounds.length;

  // If check pending, show loader (or just wait)
  if (checkingAccess) {
    return (
      <div className="min-h-screen relative text-slate-100">
        <div className="fixed inset-0 -z-10">
          <Image src="/badminton-1.jpg" alt="" fill className="object-cover" priority />
          <div className="absolute inset-0 bg-slate-900/85" />
        </div>
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  if (apiError) {
    return <ErrorScreen title="Service Unavailable" message="We could not reach our servers. This could be a temporary issue, please try again in a moment." />;
  }

  // Gate mechanism
  if (!bracketsVisible && !isAdmin) {
    return (
        <div className="min-h-screen relative text-slate-100">
          <div className="fixed inset-0 -z-10">
            <Image src="/badminton-1.jpg" alt="" fill className="object-cover" priority />
            <div className="absolute inset-0 bg-slate-900/85" />
          </div>
          <Navbar />
          <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
              <div className="bg-slate-800 p-6 rounded-full mb-6 ring-4 ring-slate-800/50">
                  <Lock className="w-12 h-12 text-blue-500" />
              </div>
              <h1 className="text-3xl font-bold mb-3 text-white">Fixtures Coming Soon</h1>
              <p className="text-slate-400 max-w-md text-lg leading-relaxed">
                  The tournament fixtures are currently being finalized by the organizers. 
                  Please check back later for the official schedule.
              </p>
          </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen relative text-slate-100">
      <div className="fixed inset-0 -z-10">
        <Image src="/badminton-1.jpg" alt="" fill className="object-cover" priority />
        <div className="absolute inset-0 bg-slate-900/85" />
      </div>
      <Navbar />
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Tournament Fixtures</h1>
          <div className="flex items-center gap-2">
            {isAdmin && matches.length > 0 && (
              <button
                onClick={() => { if (advanceMode) { handleCancelAdvance(); } else { setAdvanceMode(true); } }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  advanceMode
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
                title={advanceMode ? 'Exit Advance Mode' : 'Enter Advance Mode'}
              >
                <Swords className="w-4 h-4" />
                {advanceMode ? 'Exit Advance' : 'Advance Mode'}
              </button>
            )}
            <button onClick={fetchMatches} className="text-slate-400 hover:text-white p-2" title="Refresh">
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Advance mode banner */}
        {advanceMode && (
          <div className="mb-4 bg-amber-900/30 border border-amber-700/50 rounded-lg px-4 py-2.5 flex items-center gap-3 text-sm">
            <Swords className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-amber-200">Click on a player name to mark them as the winner. Select multiple matches, then save all at once.</span>
          </div>
        )}

        {/* Sticky tabs + search bar */}
        <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-slate-900/95 backdrop-blur-sm">
          {/* Category tabs */}
          <div className="flex flex-wrap gap-1 bg-slate-800 p-1 rounded-lg mb-3 w-fit">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                  selectedCategory === cat.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Search bar */}
          {matches.length > 0 && !loading && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search player name or alias..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchResultCount > 0) {
                    e.preventDefault();
                    if (e.shiftKey) {
                      setSearchIndex(i => (i - 1 + searchResultCount) % searchResultCount);
                    } else {
                      setSearchIndex(i => (i + 1) % searchResultCount);
                    }
                  }
                }}
                className="w-full pl-9 pr-9 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              {searchQuery.trim() && searchResultCount > 0 && (
                <div className="absolute right-10 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {searchResultCount > 1 && (
                    <>
                      <button
                        onClick={() => setSearchIndex(i => (i - 1 + searchResultCount) % searchResultCount)}
                        className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700"
                        title="Previous result"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs text-slate-500 tabular-nums min-w-[3ch] text-center">
                        {searchIndex + 1}/{searchResultCount}
                      </span>
                      <button
                        onClick={() => setSearchIndex(i => (i + 1) % searchResultCount)}
                        className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700"
                        title="Next result"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {searchResultCount <= 1 && (
                    <span className="text-xs text-slate-500">{searchResultCount} match</span>
                  )}
                </div>
              )}
              {searchQuery.trim() && searchResultCount === 0 && (
                <div className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-red-400">No results</div>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="ml-3 text-slate-400">Loading bracket...</span>
          </div>
        ) : matches.length === 0 ? (
          <div className="bg-slate-800/50 p-10 rounded-xl border border-slate-700 text-center">
            <p className="text-slate-400 text-lg">No bracket generated yet.</p>
            <p className="text-slate-500 text-sm mt-2">Generate fixtures from the Admin Dashboard.</p>
          </div>
        ) : (
          <>
            {/* Stats + navigation */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-slate-400 flex flex-wrap items-center gap-3">
                <span>{stats.real} matches</span>
                {stats.byes > 0 && <span className="text-slate-500">({stats.byes} byes)</span>}
                <span className="text-slate-600">•</span>
                <span>{totalRounds} rounds</span>
                <span className="text-slate-600">•</span>
                <span className="text-amber-400/80 text-xs">📋 Times displayed are <span className="font-semibold">reporting times</span></span>
              </div>
              {sortedRounds.length > VISIBLE_ROUNDS && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setRoundOffset(o => Math.max(0, o - 1))} disabled={!canLeft}
                    className="p-1.5 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-500">
                    {roundOffset + 1}–{Math.min(roundOffset + VISIBLE_ROUNDS, sortedRounds.length)} of {sortedRounds.length}
                  </span>
                  <button onClick={() => setRoundOffset(o => Math.min(sortedRounds.length - VISIBLE_ROUNDS, o + 1))} disabled={!canRight}
                    className="p-1.5 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => setRoundOffset(Math.max(0, sortedRounds.length - VISIBLE_ROUNDS))}
                    className="text-xs text-slate-500 hover:text-blue-400 ml-1">Final →</button>
                </div>
              )}
            </div>

            {/* Bracket tree */}
            <div ref={bracketRef} className="bg-slate-800/30 rounded-xl border border-slate-700 overflow-auto"
                 style={{ maxHeight: 'calc(100vh - 100px)' }}>

              {/* Round headers — sticky at top of scroll container */}
              <div className="flex sticky top-0 z-10 border-b border-slate-700/50 bg-slate-900/95 backdrop-blur-sm">
                {visibleRounds.map(([roundNum, roundMatches], colIdx) => {
                  const isLast = colIdx === visibleRounds.length - 1;
                  const byesR = roundMatches.filter(m => m.status === 'bye').length;
                  const realR = roundMatches.length - byesR;
                  return (
                    <Fragment key={roundNum}>
                      <div style={{ width: CARD_W }} className="shrink-0 py-2 text-center">
                        <div className="text-xs font-bold text-slate-300 uppercase">{getRoundName(roundNum, totalRounds)}</div>
                        <div className="text-[10px] text-slate-500">
                          {realR} match{realR !== 1 ? 'es' : ''}
                          {byesR > 0 && <span> · {byesR} bye{byesR !== 1 ? 's' : ''}</span>}
                        </div>
                      </div>
                      {!isLast && <div style={{ width: CONN_W }} className="shrink-0" />}
                    </Fragment>
                  );
                })}
              </div>

              {/* Bracket body */}
              <div className="p-4">
                <div className="flex items-start">
                  {visibleRounds.map(([roundNum, roundMatches], colIdx) => {
                    const bh = blockH(colIdx);
                    const isLast = colIdx === visibleRounds.length - 1;
                    return (
                      <Fragment key={roundNum}>
                        {/* Round column */}
                        <div className="flex flex-col shrink-0">
                          {roundMatches.map(match => (
                            <div
                              key={match.id}
                              ref={el => { if (el) matchRefs.current.set(match.id, el); }}
                              style={{ height: bh }}
                              className="flex items-center"
                            >
                              <MatchCard
                                match={match}
                                highlighted={highlightedIds.has(match.id)}
                                advanceMode={advanceMode}
                                pendingWinnerId={pendingAdvances.get(match.id)?.winnerId}
                                onSelectWinner={handleSelectWinner}
                                onEdit={setEditingMatch}
                                isAdmin={isAdmin}
                              />
                            </div>
                          ))}
                        </div>
                        {/* Connectors to next round */}
                        {!isLast && <Connectors colIdx={colIdx} matchCount={roundMatches.length} />}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Floating save bar for advance mode */}
        {advanceMode && pendingAdvances.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 border border-slate-600 rounded-xl px-5 py-3 shadow-2xl shadow-black/50">
            <span className="text-sm text-slate-300">
              <span className="text-white font-bold">{pendingAdvances.size}</span> change{pendingAdvances.size !== 1 ? 's' : ''} pending
            </span>
            <button
              onClick={handleCancelAdvance}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Discard
            </button>
            <button
              onClick={handleSaveAdvances}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save All'}
            </button>
          </div>
        )}

        {/* Edit Players Modal */}
        {editingMatch && (
          <EditPlayersModal
            match={editingMatch}
            category={selectedCategory}
            onClose={() => setEditingMatch(null)}
            onSaved={handleMatchEdited}
          />
        )}
      </div>
    </div>
  );
}

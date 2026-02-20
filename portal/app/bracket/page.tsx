'use client';

import { useState, useEffect, useCallback, useMemo, Fragment, useRef } from 'react';
import Navbar from '../components/Navbar';
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, Lock, Search, X } from 'lucide-react';
import { Category, MatchDocument, CATEGORIES } from '../lib/models';
import { useSession } from 'next-auth/react';

/* ── Layout constants ──────────────────────────────────────────────── */
const SLOT_H = 64;         // Every match slot is this tall (uniform for tree alignment)
const CONN_W = 28;         // Width of SVG connector column between rounds
const CARD_W = 224;        // w-56 = 224px
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
function MatchCard({ match, highlighted }: { match: MatchDocument; highlighted?: boolean }) {
  const isBye = match.status === 'bye';
  const isLive = match.status === 'in_progress';
  const isComplete = match.status === 'completed';
  const p1Win = match.winnerId && match.winnerId === match.player1Id;
  const p2Win = match.winnerId && match.winnerId === match.player2Id;

  return (
    <div
      className={`w-56 rounded border text-xs leading-tight shrink-0 transition-all duration-200 ${
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
        {match.matchNumber ? (
          <span className="text-[9px] font-mono text-slate-500">M{match.matchNumber}</span>
        ) : <span />}
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
      {(match.scheduledTime || match.court) && !isBye && (
        <div className="px-2 py-0.5 mt-0.5 mb-0.5 text-[10px] bg-slate-700/30 border-y border-slate-700/30 flex items-center justify-between text-amber-200/90 font-mono">
           <span className="truncate">{match.scheduledTime || 'TBD'}</span>
           <span className="truncate ml-2 text-slate-400 font-bold">{match.court || ''}</span>
        </div>
      )}

      {/* Player 1 */}
      <div className={`flex items-center justify-between px-2 py-0.5 border-b border-slate-700/40 ${p1Win ? 'text-green-400 font-semibold' : 'text-slate-300'}`}>
        <span className="truncate flex-1 flex items-center gap-1">
          {match.player1Name || <span className="text-slate-600 italic text-[10px]">TBD</span>}
        </span>
        {isComplete && p1Win && <span className="text-green-500 ml-1 shrink-0 text-[10px]">W</span>}
      </div>

      {/* Player 2 */}
      <div className={`flex items-center justify-between px-2 py-0.5 ${p2Win ? 'text-green-400 font-semibold' : 'text-slate-300'}`}>
        <span className="truncate flex-1 flex items-center gap-1">
          {match.player2Name || (
            <span className="text-slate-600 italic text-[10px]">{isBye ? '— bye —' : 'TBD'}</span>
          )}
        </span>
        {isComplete && p2Win && <span className="text-green-500 ml-1 shrink-0 text-[10px]">W</span>}
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
  const bracketRef = useRef<HTMLDivElement>(null);
  const matchRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [bracketsVisible, setBracketsVisible] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  // Check brackets visibility
  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(data => {
      setBracketsVisible(data.bracketsVisible === true);
    }).catch(console.error).finally(() => setCheckingAccess(false));
  }, []);

  const fetchMatches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/matches?category=${selectedCategory}`);
      if (res.ok) setMatches(await res.json());
      else setMatches([]);
    } catch { setMatches([]); }
    finally { setLoading(false); }
  }, [selectedCategory]);

  useEffect(() => { fetchMatches(); setRoundOffset(0); }, [fetchMatches]);

  // Group matches by round
  const { sortedRounds, totalRounds, stats } = useMemo(() => {
    const rMap = new Map<number, MatchDocument[]>();
    matches.forEach(m => { const l = rMap.get(m.round) || []; l.push(m); rMap.set(m.round, l); });
    rMap.forEach(l => l.sort((a, b) => a.position - b.position));
    const sorted = Array.from(rMap.entries()).sort(([a], [b]) => a - b);
    const byes = matches.filter(m => m.status === 'bye').length;
    return { sortedRounds: sorted, totalRounds: rMap.size, stats: { total: matches.length, real: matches.length - byes, byes } };
  }, [matches]);

  // Search: find matches where player name contains the query
  const { highlightedIds, searchResultCount } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { highlightedIds: new Set<string>(), searchResultCount: 0 };
    const ids = new Set<string>();
    matches.forEach(m => {
      if (
        (m.player1Name && m.player1Name.toLowerCase().includes(q)) ||
        (m.player2Name && m.player2Name.toLowerCase().includes(q))
      ) {
        ids.add(m.id);
      }
    });
    return { highlightedIds: ids, searchResultCount: ids.size };
  }, [searchQuery, matches]);

  // Auto-navigate to the round containing the first highlighted match
  useEffect(() => {
    if (highlightedIds.size === 0) return;
    const firstMatch = matches.find(m => highlightedIds.has(m.id));
    if (!firstMatch) return;
    // Find what sortedRounds index this round is at
    const roundIdx = sortedRounds.findIndex(([r]) => r === firstMatch.round);
    if (roundIdx >= 0 && (roundIdx < roundOffset || roundIdx >= roundOffset + VISIBLE_ROUNDS)) {
      setRoundOffset(Math.min(roundIdx, Math.max(0, sortedRounds.length - VISIBLE_ROUNDS)));
    }
    // Scroll to the match card after a short delay for render
    setTimeout(() => {
      const el = matchRefs.current.get(firstMatch.id);
      if (el && bracketRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }, 100);
  }, [highlightedIds, sortedRounds, matches, roundOffset]);

  const visibleRounds = sortedRounds.slice(roundOffset, roundOffset + VISIBLE_ROUNDS);
  const canLeft = roundOffset > 0;
  const canRight = roundOffset + VISIBLE_ROUNDS < sortedRounds.length;

  // If check pending, show loader (or just wait)
  if (checkingAccess) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  // Gate mechanism
  if (!bracketsVisible && !isAdmin) {
    return (
        <div className="min-h-screen bg-slate-900 text-slate-100">
          <Navbar />
          <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
              <div className="bg-slate-800 p-6 rounded-full mb-6 ring-4 ring-slate-800/50">
                  <Lock className="w-12 h-12 text-blue-500" />
              </div>
              <h1 className="text-3xl font-bold mb-3 text-white">Brackets Coming Soon</h1>
              <p className="text-slate-400 max-w-md text-lg leading-relaxed">
                  The tournament fixtures are currently being finalized by the organizers. 
                  Please check back later for the official schedule.
              </p>
          </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <Navbar />
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Tournament Brackets</h1>
          <button onClick={fetchMatches} className="text-slate-400 hover:text-white p-2" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1 bg-slate-800 p-1 rounded-lg mb-6 w-fit">
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
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search player name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
            {searchQuery.trim() && (
              <div className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                {searchResultCount} match{searchResultCount !== 1 ? 'es' : ''}
              </div>
            )}
          </div>
        )}

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
              <div className="text-sm text-slate-400 flex gap-3">
                <span>{stats.real} matches</span>
                {stats.byes > 0 && <span className="text-slate-500">({stats.byes} byes)</span>}
                <span className="text-slate-600">•</span>
                <span>{totalRounds} rounds</span>
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
                 style={{ maxHeight: 'calc(100vh - 320px)' }}>

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
                              <MatchCard match={match} highlighted={highlightedIds.has(match.id)} />
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
      </div>
    </div>
  );
}

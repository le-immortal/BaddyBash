'use client';

import { useState, useEffect, useCallback } from 'react';
import Navbar from '../components/Navbar';
import { Loader2, RefreshCw } from 'lucide-react';
import { Category, MatchDocument, MatchStatus, formatSetScores, CATEGORIES } from '../lib/models';

function getRoundName(round: number, totalRounds: number): string {
  const remaining = totalRounds - round;
  if (remaining === 0) return 'Final';
  if (remaining === 1) return 'Semi-Finals';
  if (remaining === 2) return 'Quarter-Finals';
  return `Round ${round}`;
}

/** Small status badge shown on each match card. */
function StatusBadge({ status }: { status: MatchStatus }) {
  const styles: Record<MatchStatus, string> = {
    scheduled: 'bg-slate-700 text-slate-400',
    in_progress: 'bg-amber-900/60 text-amber-400',
    completed: 'bg-green-900/60 text-green-400',
    bye: 'bg-slate-700/50 text-slate-500',
  };
  const labels: Record<MatchStatus, string> = {
    scheduled: 'Upcoming',
    in_progress: 'Live',
    completed: 'Final',
    bye: 'BYE',
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function BracketPage() {
  const [selectedCategory, setSelectedCategory] = useState<Category>('MS');
  const [matches, setMatches] = useState<MatchDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMatches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/matches?category=${selectedCategory}`);
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
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // Group matches by round
  const rounds = new Map<number, MatchDocument[]>();
  matches.forEach(m => {
    const list = rounds.get(m.round) || [];
    list.push(m);
    rounds.set(m.round, list);
  });
  // Sort each round by position
  rounds.forEach(list => list.sort((a, b) => a.position - b.position));

  const totalRounds = rounds.size;
  const sortedRounds = Array.from(rounds.entries()).sort(([a], [b]) => a - b);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <Navbar />
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Tournament Brackets</h1>
          <button
            onClick={fetchMatches}
            className="text-slate-400 hover:text-white p-2"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1 bg-slate-800 p-1 rounded-lg mb-8 w-fit">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Bracket */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="ml-3 text-slate-400">Loading bracket...</span>
          </div>
        ) : matches.length === 0 ? (
          <div className="bg-slate-800/50 p-10 rounded-xl border border-slate-700 text-center">
            <p className="text-slate-400 text-lg">No bracket generated for {CATEGORIES.find(c => c.id === selectedCategory)?.name} yet.</p>
            <p className="text-slate-500 text-sm mt-2">An admin needs to generate fixtures from the Admin Dashboard.</p>
          </div>
        ) : (
          <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 overflow-x-auto">
            <div className="flex gap-8 items-start min-w-max">
              {sortedRounds.map(([roundNum, roundMatches]) => (
                <div key={roundNum} className="flex flex-col">
                  {/* Round header */}
                  <h3 className="text-center text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
                    {getRoundName(roundNum, totalRounds)}
                  </h3>

                  {/* Matches in this round — vertically spaced to align with bracket */}
                  <div
                    className="flex flex-col justify-around"
                    style={{
                      gap: `${Math.pow(2, roundNum - 1) * 2 - 1}rem`,
                      paddingTop: `${(Math.pow(2, roundNum - 1) - 1)}rem`,
                    }}
                  >
                    {roundMatches.map(match => {
                      const isBye = match.status === 'bye';
                      const isLive = match.status === 'in_progress';
                      const isComplete = match.status === 'completed';
                      const scoreStr = formatSetScores(match.sets ?? []);

                      return (
                        <div
                          key={match.id}
                          className={`w-56 rounded border transition-all ${
                            isLive
                              ? 'bg-slate-800 border-amber-600/50 ring-1 ring-amber-500/20'
                              : isComplete
                                ? 'bg-slate-800 border-slate-600'
                                : 'bg-slate-800 border-slate-700'
                          } ${isBye ? 'opacity-60' : ''}`}
                        >
                          {/* Status badge */}
                          <div className="flex justify-end px-2 pt-1.5 pb-0">
                            <StatusBadge status={match.status} />
                          </div>

                          {/* Player 1 */}
                          <div
                            className={`flex justify-between items-center text-sm px-3 py-1.5 border-b border-slate-700 ${
                              match.winnerId && match.winnerId === match.player1Id
                                ? 'text-green-400 font-semibold'
                                : 'text-slate-300'
                            }`}
                          >
                            <span className="truncate max-w-[140px]">
                              {match.player1Name || (
                                <span className="text-slate-600 italic">TBD</span>
                              )}
                            </span>
                            {isComplete && match.winnerId === match.player1Id && (
                              <span className="font-mono text-xs text-green-500 ml-2">W</span>
                            )}
                          </div>

                          {/* Player 2 */}
                          <div
                            className={`flex justify-between items-center text-sm px-3 py-1.5 ${
                              match.winnerId && match.winnerId === match.player2Id
                                ? 'text-green-400 font-semibold'
                                : 'text-slate-300'
                            }`}
                          >
                            <span className="truncate max-w-[140px]">
                              {match.player2Name || (
                                <span className="text-slate-600 italic">
                                  {isBye ? '—' : 'TBD'}
                                </span>
                              )}
                            </span>
                            {isComplete && match.winnerId === match.player2Id && (
                              <span className="font-mono text-xs text-green-500 ml-2">W</span>
                            )}
                          </div>

                          {/* Set scores */}
                          {scoreStr && (
                            <div className="border-t border-slate-700 px-3 py-1.5 text-center">
                              <span className="text-xs font-mono text-blue-400">
                                {scoreStr}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

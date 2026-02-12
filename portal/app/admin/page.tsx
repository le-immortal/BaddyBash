'use client';

import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { Settings, Trophy, Loader2, RefreshCw, Search } from 'lucide-react';
import { Category } from '../lib/models';

interface AdminRegistration {
  id: string;
  userId: string;
  userName: string;
  category: Category;
  status: string;
  seed?: number;
  partnerId?: string;
  partnerName?: string;
}

interface AdminPlayer {
  id: string;
  name: string;
  email: string;
  alias?: string;
  phoneNumber?: string;
  registrations: AdminRegistration[];
}

export default function AdminDashboard() {
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [seedValues, setSeedValues] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState<Category>('MS');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/players?category=${selectedCategory}`);
      if (res.ok) {
        const data: AdminPlayer[] = await res.json();
        setPlayers(data);
        // Initialize seed values from existing data
        const seeds: Record<string, string> = {};
        data.forEach(p => {
          p.registrations.forEach(r => {
            if (r.seed) seeds[r.id] = String(r.seed);
          });
        });
        setSeedValues(seeds);
      }
    } catch (err) {
      console.error('Failed to fetch players:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  }, [selectedCategory]);

  const handleSeedChange = async (registrationId: string, userId: string, value: string) => {
    const prev = seedValues[registrationId] || '';
    if (value === prev) return; // no change — skip API call

    setSeedValues(p => ({ ...p, [registrationId]: value }));

    try {
      const res = await fetch('/api/admin/players', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId,
          userId,
          seed: value ? Number(value) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to update seed');
        // Revert to previous value
        setSeedValues(p => ({ ...p, [registrationId]: prev }));
      }
    } catch (err) {
      console.error('Failed to update seed:', err);
      setSeedValues(p => ({ ...p, [registrationId]: prev }));
    }
  };

  const handleGenerateFixtures = async () => {
    if (!confirm(`Generate bracket for ${selectedCategory}? This will replace any existing bracket.`)) return;
    
    setGenerating(true);
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: selectedCategory }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Bracket generated! ${data.totalMatches} matches created for ${selectedCategory} (${data.participants} participants, ${data.totalRounds} rounds).`);
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch (err) {
      console.error('Failed to generate fixtures:', err);
      alert('Failed to generate fixtures.');
    } finally {
      setGenerating(false);
    }
  };

  const CATEGORIES: { id: Category; name: string }[] = [
    { id: 'MS', name: "Men's Singles" },
    { id: 'WS', name: "Women's Singles" },
    { id: 'MD', name: "Men's Doubles" },
    { id: 'WD', name: "Women's Doubles" },
    { id: 'XD', name: "Mixed Doubles" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="container mx-auto py-8 px-4">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Tournament Administration</h1>
            <p className="text-slate-600 mt-2">Manage players, seeds, and fixtures.</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as Category)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={handleGenerateFixtures}
              disabled={generating}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
              Generate Fixtures
            </button>
            <button
              onClick={fetchPlayers}
              className="text-slate-500 hover:text-slate-700 p-2"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-3 text-slate-600">Loading players...</span>
          </div>
        ) : (
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-slate-800">
                  Registered Players — <span className="text-blue-600">{CATEGORIES.find(c => c.id === selectedCategory)?.name}</span>
                </h2>
                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold">
                  {(() => {
                    const isD = ['MD', 'WD', 'XD'].includes(selectedCategory);
                    if (!isD) return `${players.length} Players`;
                    // Deduplicate pairs
                    const seen = new Set<string>();
                    for (const p of players) {
                      const reg = p.registrations[0];
                      const pairKey = [p.id, reg?.partnerId || ''].sort().join('|||');
                      seen.add(pairKey);
                    }
                    return `${seen.size} Teams`;
                  })()}
                </span>
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
                      <th className="p-4 text-right">Actions</th>
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
                        <td className="p-4 text-right">
                          <button className="text-slate-400 hover:text-blue-600">
                            <Settings className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              );
            })()}
          </section>
        )}
      </main>
    </div>
  );
}

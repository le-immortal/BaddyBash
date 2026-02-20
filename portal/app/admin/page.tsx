'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { Trophy, Loader2, RefreshCw, Search, Download, ChevronDown, ShieldAlert, Swords, Lock, Unlock, ArrowRight } from 'lucide-react';
import { Category, MatchDocument } from '../lib/models';
import EditMatchModal from '../components/EditMatchModal';
import SeedingVisualizer from '../components/SeedingVisualizer';
import * as XLSX from 'xlsx';

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
  const [currentSeeds, setCurrentSeeds] = useState<{ id: string, name: string, currentSeed: number }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category>('MS');
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [bracketsVisible, setBracketsVisible] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(data => {
      setRegistrationOpen(data.registrationOpen !== false);
      setBracketsVisible(data.bracketsVisible === true);
    }).catch(console.error);
  }, []);

  const toggleRegistration = async () => {
    const newState = !registrationOpen;
    if (!confirm(newState ? 'Re-open registrations?' : 'Close registrations? Users won\'t be able to sign up.')) return;
    
    setRegistrationOpen(newState);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationOpen: newState }),
      });
    } catch (err) {
      console.error(err);
      setRegistrationOpen(!newState);
      alert('Failed to update settings');
    }
  };

  const toggleBrackets = async () => {
    const newState = !bracketsVisible;
    if (!confirm(newState ? 'Publish brackets? All users will be able to see them.' : 'Hide brackets? They will only be visible to admins.')) return;
    
    setBracketsVisible(newState);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bracketsVisible: newState }),
      });
    } catch (err) {
      console.error(err);
      setBracketsVisible(!newState);
      alert('Failed to update settings');
    }
  };


  const fetchPlayers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/players?category=${selectedCategory}`);
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
      }
    } catch (err) {
      console.error('Failed to fetch players:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  const fetchMatches = useCallback(async () => {
    try {
      setMatchesLoading(true);
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
      setMatchesLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    if (activeTab === 'registrations') {
      fetchPlayers();
    } else {
      fetchMatches();
    }
  }, [selectedCategory, activeTab, fetchPlayers, fetchMatches]);

  const handleSeedChange = async (registrationId: string, userId: string, value: string) => {
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
        }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to update seed');
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

  const handleGenerateFixtures = async () => {
    if (!seedingMode && !confirm(`Generate bracket for ${selectedCategory}? This will replace any existing bracket.`)) return;
    
    // Build seed map from visualizer state if active
    const seedMap: Record<string, number> = {};
    if (seedingMode) {
       currentSeeds.forEach(s => seedMap[s.id] = s.currentSeed);
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          category: selectedCategory,
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
        alert(`Error: ${err.error}`);
      }
    } catch (err) {
      console.error('Failed to generate fixtures:', err);
      alert('Failed to generate fixtures.');
    } finally {
      setGenerating(false);
    }
  };

  const startSeeding = () => {
    const flatRegs = players.flatMap(p => p.registrations);
    if (flatRegs.length < 2) {
       alert('Not enough players/teams to seed.');
       return;
    }

    // Map to Seed format
    const mapped = flatRegs.map((r, index) => ({
      id: r.id,
      name: r.category.includes('D') ? (r.userName + (r.partnerName ? ' & ' + r.partnerName : '')) : r.userName,
      currentSeed: r.seed || (index + 1)
    }));
    
    // Try to preserve existing seeds if they form a sequence, otherwise default to index 
    // Actually simpler to just take existing seeds if present, else index
    
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

  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    const isDoubles = ['MD', 'WD', 'XD'].includes(selectedCategory);
    const filtered = players
      .map(p => ({
        ...p,
        registrations: p.registrations.filter(r => r.category === selectedCategory),
      }))
      .filter(p => p.registrations.length > 0);

    let rows = filtered;
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
          const existingSeed = existing.registrations[0]?.seed;
          const thisSeed = reg.seed;
          if (!existingSeed && thisSeed) pairMap.set(pairKey, player);
        }
      }
      rows = Array.from(pairMap.values());
    }

    rows.sort((a, b) => {
      const sA = a.registrations[0]?.seed;
      const sB = b.registrations[0]?.seed;
      if (sA && sB) return sA - sB;
      if (sA) return -1;
      if (sB) return 1;
      return a.name.localeCompare(b.name);
    });

    const catName = CATEGORIES.find(c => c.id === selectedCategory)?.name || selectedCategory;

    // Build a lookup map for partner alias by userId
    const playerMap = new Map(filtered.map(p => [p.id, p]));

    const sheetData = isDoubles
      ? rows.map((p, i) => {
          const reg = p.registrations[0];
          const partner = reg.partnerId ? playerMap.get(reg.partnerId) : undefined;
          return {
            '#': i + 1,
            'Seed': reg.seed || '',
            'Player 1': p.name,
            'Alias 1': p.alias || '',
            'Phone 1': p.phoneNumber || '',
            'Player 2': reg.partnerName || 'TBD',
            'Alias 2': partner?.alias || '',
            'Phone 2': reg.partnerPhone || partner?.phoneNumber || '',
            'Category': selectedCategory,
          };
        })
      : rows.map((p, i) => {
          const reg = p.registrations[0];
          return {
            '#': i + 1,
            'Seed': reg.seed || '',
            'Name': p.name,
            'Alias': p.alias || '',
            'Phone': p.phoneNumber || '',
            'Category': selectedCategory,
          };
        });

    const ws = XLSX.utils.json_to_sheet(sheetData);

    // Auto-size columns
    const colWidths = Object.keys(sheetData[0] || {}).map(key => {
      const maxLen = Math.max(
        key.length,
        ...sheetData.map(row => String((row as Record<string, unknown>)[key] || '').length)
      );
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, catName);
    XLSX.writeFile(wb, `BaddyBash_Players_${selectedCategory}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportBracket = async () => {
    setShowExportMenu(false);
    setExporting(true);
    try {
      const res = await fetch(`/api/matches?category=${selectedCategory}`);
      if (!res.ok) { alert('No bracket found for this category.'); return; }
      const matches: MatchDocument[] = await res.json();
      if (matches.length === 0) { alert('No bracket generated yet for this category.'); return; }

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

      const wb = XLSX.utils.book_new();
      const catName = CATEGORIES.find(c => c.id === selectedCategory)?.name || selectedCategory;

      const sheetData = matches.map(m => ({
        'Match #': m.matchNumber ? `M${m.matchNumber}` : '',
        'Round': getRoundName(m.round),
        'Position': m.position + 1,
        [isDoubles ? 'Team 1' : 'Player 1']: m.player1Name || '',
        'Seed 1': m.player1Seed || '',
        [isDoubles ? 'Team 2' : 'Player 2']: m.player2Name || '',
        'Seed 2': m.player2Seed || '',
        'Status': m.status.charAt(0).toUpperCase() + m.status.slice(1).replace('_', ' '),
        'Winner': m.winnerName || '',
      }));

      const ws = XLSX.utils.json_to_sheet(sheetData);
      const colWidths = Object.keys(sheetData[0] || {}).map(key => {
        const maxLen = Math.max(
          key.length,
          ...sheetData.map(row => String((row as Record<string, unknown>)[key] || '').length)
        );
        return { wch: Math.min(maxLen + 2, 40) };
      });
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, catName);
      XLSX.writeFile(wb, `BaddyBash_Bracket_${selectedCategory}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Failed to export bracket:', err);
      alert('Failed to export bracket.');
    } finally {
      setExporting(false);
    }
  };

  // Auth loading
  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-slate-600">Checking access...</span>
        </div>
      </div>
    );
  }

  // Non-admin gate
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
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
      </div>
    );
  }

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
            <button
              onClick={toggleBrackets}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border ${
                bracketsVisible 
                  ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100' 
                  : 'border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100'
              }`}
              title={bracketsVisible ? 'Hide Brackets' : 'Publish Brackets'}
            >
              {bracketsVisible ? <Trophy size={16} /> : <Lock size={16} />}
              {bracketsVisible ? 'Brackets Live' : 'Brackets Hidden'}
            </button>
            <button
              onClick={toggleRegistration}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border ${
                registrationOpen 
                  ? 'border-red-200 text-red-700 bg-red-50 hover:bg-red-100' 
                  : 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
              }`}
              title={registrationOpen ? 'Close Registrations' : 'Re-open Registrations'}
            >
              {registrationOpen ? <Lock size={16} /> : <Unlock size={16} />}
              {registrationOpen ? 'Close Reg' : 'Open Reg'}
            </button>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as Category)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div ref={exportRef} className="relative">
              <button
                onClick={() => setShowExportMenu(v => !v)}
                disabled={exporting}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Export
                <ChevronDown className="w-3 h-3" />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                  <button
                    onClick={() => { setShowExportMenu(false); handleExport(); }}
                    disabled={loading || players.length === 0}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    📋 Players (Category)
                  </button>
                  <button
                    onClick={() => { setShowExportMenu(false); window.location.href = '/api/admin/export'; }}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 border-t border-slate-100"
                  >
                    🌍 All Players (CSV)
                  </button>
                  <button
                    onClick={handleExportBracket}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 border-t border-slate-100"
                  >
                    🏆 Bracket / Draw
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

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
                             onClick={handleGenerateFixtures}
                             disabled={generating}
                             className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center gap-2"
                           >
                             {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                             Generate Bracket
                           </button>
                         </div>
                       </div>
                       
                       <SeedingVisualizer 
                         participants={currentSeeds} 
                         categoryName={CATEGORIES.find(c => c.id === selectedCategory)?.name || selectedCategory}
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
                          onClick={startSeeding}
                          className="px-3 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1 ml-4"
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
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                            <Swords className="w-5 h-5 text-blue-600" />
                            Match List — <span className="text-blue-600">{CATEGORIES.find(c => c.id === selectedCategory)?.name}</span>
                        </h2>
                        <div className="flex gap-2">
                            {matches.length > 0 && (
                                <button
                                    onClick={handleGenerateFixtures}
                                    disabled={generating}
                                    className="text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50"
                                    title="Regenerate Bracket"
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
                                onClick={handleGenerateFixtures}
                                disabled={generating}
                                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium"
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
                                                        className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded text-xs font-semibold transition-colors"
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
    </div>
  );
}

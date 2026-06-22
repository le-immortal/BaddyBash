'use client';

import { Lock, RefreshCw, Swords } from 'lucide-react';
import type { SeasonEntry } from '@/app/lib/models';

interface BracketPageHeaderProps {
  activeSeason: string;
  selectedSeason: string;
  selectedSeasonEntry?: SeasonEntry;
  showSeasonSelector: boolean;
  seasonOptions: SeasonEntry[];
  onSeasonChange: (seasonId: string) => void;
  isAdmin: boolean;
  matchesLength: number;
  isSelectedSeasonArchived: boolean;
  advanceMode: boolean;
  onToggleAdvance: () => void;
  onRefresh: () => void;
}

export function BracketPageHeader({
  activeSeason,
  selectedSeason,
  selectedSeasonEntry,
  showSeasonSelector,
  seasonOptions,
  onSeasonChange,
  isAdmin,
  matchesLength,
  isSelectedSeasonArchived,
  advanceMode,
  onToggleAdvance,
  onRefresh,
}: BracketPageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-3xl font-bold">Tournament Fixtures</h1>
        {selectedSeasonEntry && (
          <p className="text-sm text-slate-400 mt-1 flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${selectedSeason === activeSeason ? 'bg-green-400' : 'bg-slate-500'}`} />
            {selectedSeasonEntry.label}
            {selectedSeason === activeSeason ? ' — Live' : ''}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {showSeasonSelector && (
          <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-200">
            <span className="text-slate-400">Season</span>
            <select
              value={selectedSeason}
              onChange={(e) => onSeasonChange(e.target.value)}
              className="bg-transparent text-slate-100 font-medium outline-none"
              title="Select season"
              aria-label="Select season"
            >
              {seasonOptions.map((season) => (
                <option key={season.id} value={season.id} className="bg-slate-900">
                  {season.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {isAdmin && matchesLength > 0 && !isSelectedSeasonArchived && (
          <button
            onClick={onToggleAdvance}
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
        <button onClick={onRefresh} className="text-slate-400 hover:text-white p-2" title="Refresh">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export function ArchivedSeasonBanner() {
  return (
    <div className="mb-4 bg-amber-900/30 border border-amber-700/50 rounded-lg px-4 py-2.5 flex items-center gap-3 text-sm">
      <Lock className="w-4 h-4 text-amber-400 shrink-0" />
      <span className="text-amber-200">This season is archived. Fixtures are read-only.</span>
    </div>
  );
}

export function AdvanceModeBanner() {
  return (
    <div className="mb-4 bg-amber-900/30 border border-amber-700/50 rounded-lg px-4 py-2.5 flex items-center gap-3 text-sm">
      <Swords className="w-4 h-4 text-amber-400 shrink-0" />
      <span className="text-amber-200">Click on a player name to mark them as the winner. Select multiple matches, then save all at once.</span>
    </div>
  );
}

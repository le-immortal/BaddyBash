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
        <p className="kicker mb-1.5">Tournament Draw</p>
        <h1 className="font-display text-5xl tracking-wide text-court-100">Fixtures</h1>
        {selectedSeasonEntry && (
          <p className="text-sm text-court-400 mt-1 flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${selectedSeason === activeSeason ? 'bg-volt-400' : 'bg-court-500'}`} />
            {selectedSeasonEntry.label}
            {selectedSeason === activeSeason ? ' — Live' : ''}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {showSeasonSelector && (
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-court-200">
            <span className="text-court-400">Season</span>
            <select
              value={selectedSeason}
              onChange={(e) => onSeasonChange(e.target.value)}
              className="bg-transparent text-court-100 font-medium outline-none"
              title="Select season"
              aria-label="Select season"
            >
              {seasonOptions.map((season) => (
                <option key={season.id} value={season.id} className="bg-court-900">
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
                ? 'bg-amber-500 text-court-950 hover:bg-amber-400'
                : 'bg-white/5 border border-white/10 text-court-300 hover:bg-white/10 hover:text-court-100'
            }`}
            title={advanceMode ? 'Exit Advance Mode' : 'Enter Advance Mode'}
          >
            <Swords className="w-4 h-4" />
            {advanceMode ? 'Exit Advance' : 'Advance Mode'}
          </button>
        )}
        <button onClick={onRefresh} className="text-court-400 hover:text-court-100 p-2" title="Refresh">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export function ArchivedSeasonBanner() {
  return (
    <div className="mb-4 bg-amber-400/10 border border-amber-400/25 rounded-lg px-4 py-2.5 flex items-center gap-3 text-sm">
      <Lock className="w-4 h-4 text-amber-300 shrink-0" />
      <span className="text-amber-200">This season is archived. Fixtures are read-only.</span>
    </div>
  );
}

export function AdvanceModeBanner() {
  return (
    <div className="mb-4 bg-amber-400/10 border border-amber-400/25 rounded-lg px-4 py-2.5 flex items-center gap-3 text-sm">
      <Swords className="w-4 h-4 text-amber-300 shrink-0" />
      <span className="text-amber-200">Click on a player name to mark them as the winner. Select multiple matches, then save all at once.</span>
    </div>
  );
}

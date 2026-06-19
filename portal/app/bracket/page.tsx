'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { Loader2, Lock, Save, Undo2 } from 'lucide-react';
import ErrorScreen from '../components/ErrorScreen';
import { useSession } from 'next-auth/react';
import type { Category, MatchDocument } from '@/app/lib/models';
import { BracketPageFallback, BracketShell } from './components/BracketShell';
import { BracketGrid } from './components/BracketGrid';
import { BracketPageHeader, AdvanceModeBanner, ArchivedSeasonBanner } from './components/BracketPageHeader';
import { BracketToolbar } from './components/BracketToolbar';
import { EditPlayersModal } from './components/EditPlayersModal';
import { useAdvanceMode } from './hooks/useAdvanceMode';
import { useBracketData } from './hooks/useBracketData';
import { useBracketSearch } from './hooks/useBracketSearch';
import { VISIBLE_ROUNDS } from './lib/bracketLayout';

export default function BracketPage() {
  return (
    <Suspense fallback={<BracketPageFallback />}>
      <BracketPageContent />
    </Suspense>
  );
}

function BracketPageContent() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin === true;

  const [selectedCategory, setSelectedCategory] = useState<Category>('MS');
  const [editingMatch, setEditingMatch] = useState<MatchDocument | null>(null);

  const {
    activeSeason,
    apiError,
    bracketsVisible,
    checkingAccess,
    fetchMatches,
    isSelectedSeasonArchived,
    loading,
    matches,
    roundOffset,
    seasonOptions,
    selectedSeason,
    selectedSeasonEntry,
    setMatches,
    setRoundOffset,
    setSelectedSeason,
    showSeasonSelector,
  } = useBracketData({ selectedCategory, isAdmin });

  const {
    advanceMode,
    handleCancelAdvance,
    handleSaveAdvances,
    handleSelectWinner,
    pendingAdvances,
    projectedMatches,
    saving,
    setAdvanceMode,
  } = useAdvanceMode({
    matches,
    selectedCategory,
    selectedSeason,
    isSelectedSeasonArchived,
    setMatches,
  });

  const handleMatchEdited = useCallback((updatedMatch: MatchDocument) => {
    setMatches(prev => prev.map(m => m.id === updatedMatch.id ? updatedMatch : m));
  }, [setMatches]);

  const handleSeasonChange = useCallback((seasonId: string) => {
    handleCancelAdvance();
    setEditingMatch(null);
    setSelectedSeason(seasonId);
  }, [handleCancelAdvance, setSelectedSeason]);

  const handleCategoryChange = useCallback((category: Category) => {
    handleCancelAdvance();
    setEditingMatch(null);
    setSelectedCategory(category);
  }, [handleCancelAdvance]);

  const { sortedRounds, totalRounds, stats } = useMemo(() => {
    const rMap = new Map<number, MatchDocument[]>();
    projectedMatches.forEach(m => { const l = rMap.get(m.round) || []; l.push(m); rMap.set(m.round, l); });
    rMap.forEach(l => l.sort((a, b) => a.position - b.position));
    const sorted = Array.from(rMap.entries()).sort(([a], [b]) => a - b);
    const byes = projectedMatches.filter(m => m.status === 'bye').length;
    return { sortedRounds: sorted, totalRounds: rMap.size, stats: { total: projectedMatches.length, real: projectedMatches.length - byes, byes } };
  }, [projectedMatches]);

  const visibleRounds = sortedRounds.slice(roundOffset, roundOffset + VISIBLE_ROUNDS);
  const canLeft = roundOffset > 0;
  const canRight = roundOffset + VISIBLE_ROUNDS < sortedRounds.length;

  const {
    bracketRef,
    handleSearchChange,
    handleSearchStep,
    highlightedIds,
    matchRefs,
    searchIndex,
    searchQuery,
    searchResultCount,
  } = useBracketSearch({
    projectedMatches,
    sortedRounds,
    roundOffset,
    setRoundOffset,
  });

  if (checkingAccess) {
    return (
      <BracketShell>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </BracketShell>
    );
  }

  if (apiError) {
    return (
      <BracketShell>
        <ErrorScreen bare title="Service Unavailable" message="We could not reach our servers. This could be a temporary issue, please try again in a moment." />
      </BracketShell>
    );
  }

  return (
    <BracketShell>
      <div className="container mx-auto py-8 px-4">
        <BracketPageHeader
          activeSeason={activeSeason}
          selectedSeason={selectedSeason}
          selectedSeasonEntry={selectedSeasonEntry}
          showSeasonSelector={showSeasonSelector}
          seasonOptions={seasonOptions}
          onSeasonChange={handleSeasonChange}
          isAdmin={isAdmin}
          matchesLength={matches.length}
          isSelectedSeasonArchived={isSelectedSeasonArchived}
          advanceMode={advanceMode}
          onToggleAdvance={() => { if (advanceMode) { handleCancelAdvance(); } else { setAdvanceMode(true); } }}
          onRefresh={fetchMatches}
        />

        {isSelectedSeasonArchived && <ArchivedSeasonBanner />}
        {advanceMode && <AdvanceModeBanner />}

        {!bracketsVisible && !isAdmin ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/60 py-24 px-6 text-center">
            <div className="bg-slate-800 p-6 rounded-full mb-6 ring-4 ring-slate-800/50">
              <Lock className="w-12 h-12 text-blue-500" />
            </div>
            <h2 className="text-3xl font-bold mb-3 text-white">Fixtures Coming Soon</h2>
            <p className="text-slate-400 max-w-2xl text-lg leading-relaxed">
              The tournament fixtures for {selectedSeasonEntry?.label || `Season ${selectedSeason}`} are still being finalized.
              {showSeasonSelector ? ' You can switch seasons above to browse published historical draws.' : ' Please check back later for the official schedule.'}
            </p>
          </div>
        ) : (
          <>
            <BracketToolbar
              selectedCategory={selectedCategory}
              onCategoryChange={handleCategoryChange}
              matchesLength={matches.length}
              loading={loading}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              onSearchStep={handleSearchStep}
              searchResultCount={searchResultCount}
              searchIndex={searchIndex}
            />

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
              <BracketGrid
                stats={stats}
                totalRounds={totalRounds}
                sortedRounds={sortedRounds}
                roundOffset={roundOffset}
                onRoundOffsetChange={setRoundOffset}
                visibleRounds={visibleRounds}
                canLeft={canLeft}
                canRight={canRight}
                highlightedIds={highlightedIds}
                advanceMode={advanceMode}
                pendingAdvances={pendingAdvances}
                onSelectWinner={handleSelectWinner}
                onEditMatch={setEditingMatch}
                isAdmin={isAdmin}
                readOnly={isSelectedSeasonArchived}
                bracketRef={bracketRef}
                matchRefs={matchRefs}
              />
            )}
          </>
        )}

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

        {editingMatch && (
          <EditPlayersModal
            match={editingMatch}
            category={selectedCategory}
            onClose={() => setEditingMatch(null)}
            onSaved={handleMatchEdited}
          />
        )}
      </div>
    </BracketShell>
  );
}

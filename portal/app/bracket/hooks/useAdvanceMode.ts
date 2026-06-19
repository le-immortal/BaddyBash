'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Category, MatchDocument } from '@/app/lib/models';

export function useAdvanceMode({
  matches,
  selectedCategory,
  selectedSeason,
  isSelectedSeasonArchived,
  setMatches,
}: {
  matches: MatchDocument[];
  selectedCategory: Category;
  selectedSeason: string;
  isSelectedSeasonArchived: boolean;
  setMatches: Dispatch<SetStateAction<MatchDocument[]>>;
}) {
  const [advanceMode, setAdvanceMode] = useState(false);
  const [pendingAdvances, setPendingAdvances] = useState<Map<string, { winnerId: string; winnerName: string }>>(new Map());
  const [saving, setSaving] = useState(false);

  const handleSelectWinner = useCallback((matchId: string, playerId: string, playerName: string) => {
    if (isSelectedSeasonArchived) return;
    setPendingAdvances(prev => {
      const next = new Map(prev);
      const existing = next.get(matchId);
      if (existing?.winnerId === playerId) {
        next.delete(matchId);
      } else {
        next.set(matchId, { winnerId: playerId, winnerName: playerName });
      }
      return next;
    });
  }, [isSelectedSeasonArchived]);

  const handleCancelAdvance = useCallback(() => {
    setPendingAdvances(new Map());
    setAdvanceMode(false);
  }, []);

  const handleSaveAdvances = useCallback(async () => {
    if (isSelectedSeasonArchived) {
      alert('Archived seasons are read-only.');
      return;
    }
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
        body: JSON.stringify({ category: selectedCategory, advances, seasonId: selectedSeason }),
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
  }, [pendingAdvances, selectedCategory, selectedSeason, isSelectedSeasonArchived, setMatches]);

  const projectedMatches = useMemo(() => {
    if (!advanceMode || pendingAdvances.size === 0) return matches;

    const cloned: MatchDocument[] = matches.map(m => ({ ...m }));
    const matchMap = new Map<string, MatchDocument>();
    for (const m of cloned) matchMap.set(m.id, m);

    const pending = Array.from(pendingAdvances.entries())
      .map(([id, val]) => ({ id, ...val, round: matchMap.get(id)?.round ?? 0 }))
      .sort((a, b) => a.round - b.round);

    for (const { id, winnerId, winnerName } of pending) {
      const m = matchMap.get(id);
      if (!m || !m.nextMatchId) continue;

      let winnerSeed: number | undefined;
      if (winnerId === m.player1Id) winnerSeed = m.player1Seed;
      else if (winnerId === m.player2Id) winnerSeed = m.player2Seed;

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

  return {
    advanceMode,
    handleCancelAdvance,
    handleSaveAdvances,
    handleSelectWinner,
    pendingAdvances,
    projectedMatches,
    saving,
    setAdvanceMode,
  };
}

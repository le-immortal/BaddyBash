'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Category, MatchDocument, SeasonEntry } from '@/app/lib/models';
import { VISIBLE_ROUNDS, getCurrentSeasonFallback } from '../lib/bracketLayout';
import { getSeasonLabel } from '@/app/lib/seasonLabels';

export function useBracketData({ selectedCategory, isAdmin }: { selectedCategory: Category; isAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSeason = searchParams.get('season');

  const [matches, setMatches] = useState<MatchDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [roundOffset, setRoundOffset] = useState(0);
  const initialUrlSeasonRef = useRef(urlSeason);
  const suppressUrlSync = useRef(false);
  const [bracketsVisible, setBracketsVisible] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [activeSeason, setActiveSeason] = useState(getCurrentSeasonFallback);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [seasons, setSeasons] = useState<SeasonEntry[]>([]);
  const selectedSeasonEntry = seasons.find((season) => season.id === selectedSeason);
  const isSelectedSeasonArchived = selectedSeasonEntry?.archived === true;
  const activeSeasonEntry = seasons.find((s) => s.id === activeSeason);
  const seasonLabel = activeSeasonEntry ? getSeasonLabel(activeSeasonEntry) : undefined;
  const publicSeasonOptions = useMemo(
    () => seasons.filter((season) => season.id === activeSeason || season.bracketsVisible),
    [seasons, activeSeason],
  );
  const seasonOptions = isAdmin ? seasons : publicSeasonOptions;
  const showSeasonSelector = seasonOptions.length > 1;

  useEffect(() => {
    fetch('/api/settings?full=1').then(res => {
      if (!res.ok) { setApiError(true); return null; }
      return res.json();
    }).then(data => {
      if (!data) return;
      if (data.seasons) {
        const loadedSeasons = data.seasons as SeasonEntry[];
        const nextActiveSeason = data.activeSeason || loadedSeasons[0]?.id || getCurrentSeasonFallback();
        setSeasons(loadedSeasons);
        setActiveSeason(nextActiveSeason);
        const active = loadedSeasons.find((season) => season.id === nextActiveSeason);
        setBracketsVisible(active?.bracketsVisible === true);

        const urlParam = initialUrlSeasonRef.current;
        const validUrl = loadedSeasons.some((s) => s.id === urlParam);
        const initial = validUrl ? urlParam! : nextActiveSeason;
        setSelectedSeason(initial);
        suppressUrlSync.current = true;
      } else {
        const fallbackSeason = getCurrentSeasonFallback();
        setActiveSeason(fallbackSeason);
        setSelectedSeason(initialUrlSeasonRef.current || fallbackSeason);
        setBracketsVisible(data.bracketsVisible === true);
        suppressUrlSync.current = true;
      }
    }).catch(() => setApiError(true)).finally(() => setCheckingAccess(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedSeason) return;
    if (suppressUrlSync.current) {
      suppressUrlSync.current = false;
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (params.get('season') === selectedSeason) return;
    params.set('season', selectedSeason);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason]);

  useEffect(() => {
    if (!selectedSeasonEntry) return;
    setBracketsVisible(selectedSeasonEntry.bracketsVisible === true);
  }, [selectedSeasonEntry]);

  const fetchMatches = useCallback(async () => {
    if (!selectedSeason) return;
    if (!isAdmin && selectedSeasonEntry?.bracketsVisible === false) {
      setMatches([]);
      setRoundOffset(0);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`/api/matches?category=${selectedCategory}&season=${encodeURIComponent(selectedSeason)}`);
      if (res.ok) {
        const data = await res.json();
        setMatches(data);
        const numRounds = new Set(data.map((m: MatchDocument) => m.round)).size;
        setRoundOffset(Math.max(0, numRounds - VISIBLE_ROUNDS));
      }
      else if (res.status >= 500) { setApiError(true); }
      else { setMatches([]); setRoundOffset(0); }
    } catch { setApiError(true); }
    finally { setLoading(false); }
  }, [isAdmin, selectedCategory, selectedSeason, selectedSeasonEntry]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  return {
    activeSeason,
    apiError,
    bracketsVisible,
    checkingAccess,
    fetchMatches,
    isSelectedSeasonArchived,
    loading,
    matches,
    roundOffset,
    seasonLabel,
    seasonOptions,
    selectedSeason,
    selectedSeasonEntry,
    setMatches,
    setRoundOffset,
    setSelectedSeason,
    showSeasonSelector,
  };
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { MatchDocument } from '@/app/lib/models';
import { VISIBLE_ROUNDS } from '../lib/bracketLayout';

export function useBracketSearch({
  projectedMatches,
  sortedRounds,
  roundOffset,
  setRoundOffset,
}: {
  projectedMatches: MatchDocument[];
  sortedRounds: [number, MatchDocument[]][];
  roundOffset: number;
  setRoundOffset: Dispatch<SetStateAction<number>>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const bracketRef = useRef<HTMLDivElement>(null);
  const matchRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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
  }, [projectedMatches, searchQuery]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchIndex(0);
    setSearchQuery(value);
  }, []);

  const handleSearchStep = useCallback((direction: 'prev' | 'next') => {
    if (searchResultCount === 0) return;
    setSearchIndex(i => direction === 'prev'
      ? (i - 1 + searchResultCount) % searchResultCount
      : (i + 1) % searchResultCount);
  }, [searchResultCount]);

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
  }, [projectedMatches, roundOffset, searchResultList, setRoundOffset, sortedRounds]);

  useEffect(() => {
    if (searchResultList.length > 0) scrollToResult(searchIndex);
  }, [scrollToResult, searchIndex, searchResultList]);

  return {
    bracketRef: bracketRef as MutableRefObject<HTMLDivElement | null>,
    handleSearchChange,
    handleSearchStep,
    highlightedIds,
    matchRefs: matchRefs as MutableRefObject<Map<string, HTMLDivElement>>,
    searchIndex,
    searchQuery,
    searchResultCount,
  };
}

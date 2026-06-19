'use client';

import { Fragment, type MutableRefObject } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MatchDocument } from '@/app/lib/models';
import { MatchCard } from './MatchCard';
import { Connectors } from './Connectors';
import { CARD_W, CONN_W, VISIBLE_ROUNDS, blockH, getRoundName } from '../lib/bracketLayout';

interface BracketGridProps {
  stats: { real: number; byes: number };
  totalRounds: number;
  sortedRounds: [number, MatchDocument[]][];
  roundOffset: number;
  onRoundOffsetChange: (value: number | ((current: number) => number)) => void;
  visibleRounds: [number, MatchDocument[]][];
  canLeft: boolean;
  canRight: boolean;
  highlightedIds: Set<string>;
  advanceMode: boolean;
  pendingAdvances: Map<string, { winnerId: string; winnerName: string }>;
  onSelectWinner: (matchId: string, playerId: string, playerName: string) => void;
  onEditMatch: (match: MatchDocument) => void;
  isAdmin: boolean;
  readOnly: boolean;
  bracketRef: MutableRefObject<HTMLDivElement | null>;
  matchRefs: MutableRefObject<Map<string, HTMLDivElement>>;
}

export function BracketGrid({
  stats,
  totalRounds,
  sortedRounds,
  roundOffset,
  onRoundOffsetChange,
  visibleRounds,
  canLeft,
  canRight,
  highlightedIds,
  advanceMode,
  pendingAdvances,
  onSelectWinner,
  onEditMatch,
  isAdmin,
  readOnly,
  bracketRef,
  matchRefs,
}: BracketGridProps) {
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-slate-400 flex flex-wrap items-center gap-3">
          <span>{stats.real} matches</span>
          {stats.byes > 0 && <span className="text-slate-500">({stats.byes} byes)</span>}
          <span className="text-slate-600">•</span>
          <span>{totalRounds} rounds</span>
          <span className="text-slate-600">•</span>
          <span className="text-amber-400/80 text-xs">📋 Times displayed are <span className="font-semibold">reporting times</span></span>
        </div>
        {sortedRounds.length > VISIBLE_ROUNDS && (
          <div className="flex items-center gap-2">
            <button onClick={() => onRoundOffsetChange(o => Math.max(0, o - 1))} disabled={!canLeft}
              className="p-1.5 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-500">
              {roundOffset + 1}–{Math.min(roundOffset + VISIBLE_ROUNDS, sortedRounds.length)} of {sortedRounds.length}
            </span>
            <button onClick={() => onRoundOffsetChange(o => Math.min(sortedRounds.length - VISIBLE_ROUNDS, o + 1))} disabled={!canRight}
              className="p-1.5 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => onRoundOffsetChange(Math.max(0, sortedRounds.length - VISIBLE_ROUNDS))}
              className="text-xs text-slate-500 hover:text-blue-400 ml-1">Final →</button>
          </div>
        )}
      </div>

      <div ref={bracketRef} className="bg-slate-800/30 rounded-xl border border-slate-700 overflow-auto"
           style={{ maxHeight: 'calc(100vh - 100px)' }}>
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

        <div className="p-4">
          <div className="flex items-start">
            {visibleRounds.map(([roundNum, roundMatches], colIdx) => {
              const bh = blockH(colIdx);
              const isLast = colIdx === visibleRounds.length - 1;
              return (
                <Fragment key={roundNum}>
                  <div className="flex flex-col shrink-0">
                    {roundMatches.map(match => (
                      <div
                        key={match.id}
                        ref={el => { if (el) matchRefs.current.set(match.id, el); }}
                        style={{ height: bh }}
                        className="flex items-center"
                      >
                        <MatchCard
                          match={match}
                          highlighted={highlightedIds.has(match.id)}
                          advanceMode={advanceMode}
                          pendingWinnerId={pendingAdvances.get(match.id)?.winnerId}
                          onSelectWinner={onSelectWinner}
                          onEdit={onEditMatch}
                          isAdmin={isAdmin}
                          readOnly={readOnly}
                        />
                      </div>
                    ))}
                  </div>
                  {!isLast && <Connectors colIdx={colIdx} matchCount={roundMatches.length} />}
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

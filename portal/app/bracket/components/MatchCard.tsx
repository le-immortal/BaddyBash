'use client';

import type { MouseEvent } from 'react';
import { Pencil } from 'lucide-react';
import type { MatchDocument } from '@/app/lib/models';

export interface MatchCardProps {
  match: MatchDocument;
  highlighted?: boolean;
  advanceMode?: boolean;
  pendingWinnerId?: string;
  onSelectWinner?: (matchId: string, playerId: string, playerName: string) => void;
  onEdit?: (match: MatchDocument) => void;
  isAdmin?: boolean;
  readOnly?: boolean;
}

export function MatchCard({ match, highlighted, advanceMode, pendingWinnerId, onSelectWinner, onEdit, isAdmin: isAdminProp, readOnly }: MatchCardProps) {
  const isBye = match.status === 'bye';
  const fmtAlias = (id: string) => id.includes('|') ? id.split('|').map(a => `@${a}`).join(' & ') : `@${id}`;
  const isLive = match.status === 'in_progress';
  const isComplete = match.status === 'completed';
  const p1Win = match.winnerId && match.winnerId === match.player1Id;
  const p2Win = match.winnerId && match.winnerId === match.player2Id;

  const p1Pending = advanceMode && pendingWinnerId === match.player1Id;
  const p2Pending = advanceMode && pendingWinnerId === match.player2Id;
  const canAdvance = advanceMode && !isBye && !isComplete && match.player1Id && match.player2Id;

  const handlePlayerClick = (playerId: string | undefined, playerName: string | undefined, e: MouseEvent) => {
    if (!canAdvance || !playerId || !playerName || !onSelectWinner) return;
    e.stopPropagation();
    onSelectWinner(match.id, playerId, playerName);
  };

  return (
    <div
      className={`w-64 rounded border text-xs leading-tight shrink-0 transition-all duration-200 ${
        highlighted
          ? 'bg-blue-900/50 border-blue-400 ring-2 ring-blue-400/40 shadow-lg shadow-blue-500/10'
          : isBye
            ? 'bg-slate-800/30 border-slate-700/40'
            : isLive
              ? 'bg-slate-800 border-amber-600/50 ring-1 ring-amber-500/20'
              : isComplete
                ? 'bg-slate-800 border-slate-600'
                : 'bg-slate-800 border-slate-700'
      }`}
    >
      <div className="flex items-center justify-between px-1.5 pt-0.5">
        <div className="flex items-center gap-1">
          {match.matchNumber ? (
            <span className="text-[9px] font-mono text-slate-500">M{match.matchNumber}</span>
          ) : <span />}
          {isAdminProp && !readOnly && !advanceMode && !isBye && onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(match); }}
              className="text-slate-600 hover:text-blue-400 transition-colors p-0.5"
              title="Edit players"
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
        <span className={`text-[8px] font-bold uppercase tracking-wider px-1 rounded ${
          isBye ? 'bg-slate-700/50 text-slate-500'
          : isLive ? 'bg-amber-900/60 text-amber-400'
          : isComplete ? 'bg-green-900/60 text-green-400'
          : 'bg-slate-700 text-slate-400'
        }`}>
          {isBye ? 'BYE' : isLive ? 'Live' : isComplete ? 'Winner' : 'Upcoming'}
        </span>
      </div>

      {(match.scheduledTime) && !isBye && (
        <div className="px-2 py-0.5 mt-0.5 mb-0.5 text-[10px] bg-slate-700/30 border-y border-slate-700/30 flex items-center justify-between text-amber-200/90 font-mono">
           <span className="truncate">{match.scheduledTime || 'TBD'}</span>
        </div>
      )}

      <div
        onClick={(e) => handlePlayerClick(match.player1Id, match.player1Name, e)}
        className={`flex items-center justify-between px-2 py-0.5 border-b border-slate-700/40 transition-all ${
          p1Pending
            ? 'bg-green-900/50 text-green-300 font-semibold'
            : p1Win ? 'text-green-400 font-semibold' : 'text-slate-300'
        } ${canAdvance ? 'cursor-pointer hover:bg-slate-700/50' : ''}`}
      >
        <div className="flex-1 min-w-0 flex items-center gap-1">
          {match.player1Seed && (
            <span className="text-[9px] font-bold text-amber-500/80 shrink-0">[{match.player1Seed}]</span>
          )}
          {match.player1Name ? (
            <div className="min-w-0">
              <span className="truncate block">{match.player1Name}</span>
              {match.player1Id && <span className="text-[8px] text-slate-500 font-normal truncate block">{fmtAlias(match.player1Id)}</span>}
            </div>
          ) : <span className="text-slate-600 italic text-[10px]">TBD</span>}
        </div>
        {p1Pending && <span className="text-green-400 ml-1 shrink-0 text-[10px] font-bold">W</span>}
        {!p1Pending && isComplete && p1Win && <span className="text-green-500 ml-1 shrink-0 text-[10px]">W</span>}
      </div>

      <div
        onClick={(e) => handlePlayerClick(match.player2Id, match.player2Name, e)}
        className={`flex items-center justify-between px-2 py-0.5 transition-all ${
          p2Pending
            ? 'bg-green-900/50 text-green-300 font-semibold'
            : p2Win ? 'text-green-400 font-semibold' : 'text-slate-300'
        } ${canAdvance ? 'cursor-pointer hover:bg-slate-700/50' : ''}`}
      >
        <div className="flex-1 min-w-0 flex items-center gap-1">
          {match.player2Seed && (
            <span className="text-[9px] font-bold text-amber-500/80 shrink-0">[{match.player2Seed}]</span>
          )}
          {match.player2Name ? (
            <div className="min-w-0">
              <span className="truncate block">{match.player2Name}</span>
              {match.player2Id && <span className="text-[8px] text-slate-500 font-normal truncate block">{fmtAlias(match.player2Id)}</span>}
            </div>
          ) : (
            <span className="text-slate-600 italic text-[10px]">{isBye ? '— bye —' : 'TBD'}</span>
          )}
        </div>
        {p2Pending && <span className="text-green-400 ml-1 shrink-0 text-[10px] font-bold">W</span>}
        {!p2Pending && isComplete && p2Win && <span className="text-green-500 ml-1 shrink-0 text-[10px]">W</span>}
      </div>

    </div>
  );
}

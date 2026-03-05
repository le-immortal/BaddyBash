import { MatchDocument } from '../lib/models';

interface MatchCardProps {
  match: MatchDocument;
  onClick?: (match: MatchDocument) => void;
}

export default function MatchCard({ match, onClick }: MatchCardProps) {
  const isBye = match.status === 'bye';
  const isLive = match.status === 'in_progress';
  const isComplete = match.status === 'completed';
  const fmtAlias = (id: string) => id.includes('|') ? id.split('|').map(a => `@${a}`).join(' & ') : `@${id}`;
  const p1Win = match.winnerId && match.winnerId === match.player1Id;
  const p2Win = match.winnerId && match.winnerId === match.player2Id;

  return (
    <div
      onClick={() => !isBye && onClick?.(match)}
      className={`w-56 rounded border text-xs leading-tight shrink-0 transition-colors bg-white overflow-hidden ${
        isBye
          ? 'bg-slate-800/30 border-slate-700/40 cursor-default'
          : onClick
            ? 'cursor-pointer hover:border-blue-500/50 hover:bg-slate-800/80'
            : 'cursor-default'
      } ${
        isLive
          ? 'bg-slate-800 border-amber-600/50 ring-1 ring-amber-500/20'
          : isComplete
            ? 'bg-slate-800 border-slate-600'
            : 'bg-slate-800 border-slate-700'
      }`}
    >
      {/* Header: match number + badge */}
      <div className="flex items-center justify-between px-1.5 pt-0.5">
        {match.matchNumber ? (
          <span className="text-[9px] font-mono text-slate-500">M{match.matchNumber}</span>
        ) : <span />}
        <span className={`text-[8px] font-bold uppercase tracking-wider px-1 rounded ${
          isBye ? 'bg-slate-700/50 text-slate-500'
          : isLive ? 'bg-amber-900/60 text-amber-400'
          : isComplete ? 'bg-green-900/60 text-green-400'
          : 'bg-slate-700 text-slate-400'
        }`}>
          {isBye ? 'BYE' : isLive ? 'Live' : isComplete ? 'Winner' : 'Upcoming'}
        </span>
      </div>

      {/* Schedule Info */}
      {(match.scheduledTime) && !isBye && (
        <div className="px-2 py-0.5 mt-0.5 mb-0.5 text-[10px] bg-slate-700/30 border-y border-slate-700/30 flex items-center justify-between text-amber-200/90 font-mono">
            <span className="truncate">{match.scheduledTime || 'TBD'}</span>
        </div>
      )}

      {/* Player 1 */}
      <div className={`flex items-center justify-between px-2 py-0.5 border-b border-slate-700/40 ${p1Win ? 'text-green-400 font-semibold' : 'text-slate-300'}`}>
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
        {isComplete && p1Win && <span className="text-green-500 ml-1 shrink-0 text-[10px]">W</span>}
      </div>

      {/* Player 2 */}
      <div className={`flex items-center justify-between px-2 py-0.5 ${p2Win ? 'text-green-400 font-semibold' : 'text-slate-300'}`}>
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
        {isComplete && p2Win && <span className="text-green-500 ml-1 shrink-0 text-[10px]">W</span>}
      </div>
    </div>
  );
}

import { MatchDocument, formatSetScores } from '../lib/models';

interface MatchCardProps {
  match: MatchDocument;
  onClick?: (match: MatchDocument) => void;
}

export default function MatchCard({ match, onClick }: MatchCardProps) {
  const isBye = match.status === 'bye';
  const isLive = match.status === 'in_progress';
  const isComplete = match.status === 'completed';
  const scoreStr = formatSetScores(match.sets ?? []);
  const p1Win = match.winnerId && match.winnerId === match.player1Id;
  const p2Win = match.winnerId && match.winnerId === match.player2Id;

  return (
    <div
      onClick={() => !isBye && onClick?.(match)}
      className={`w-56 rounded border text-xs leading-tight shrink-0 transition-colors ${
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
          {isBye ? 'BYE' : isLive ? 'Live' : isComplete ? 'Final' : 'Upcoming'}
        </span>
      </div>

      {/* Player 1 */}
      <div className={`flex items-center justify-between px-2 py-0.5 border-b border-slate-700/40 ${p1Win ? 'text-green-400 font-semibold' : 'text-slate-300'}`}>
        <span className="truncate flex-1 flex items-center gap-1">
          {match.player1Seed && (
            <span className="text-[9px] font-bold text-amber-500/80 shrink-0">[{match.player1Seed}]</span>
          )}
          {match.player1Name || <span className="text-slate-600 italic text-[10px]">TBD</span>}
        </span>
        {isComplete && p1Win && <span className="text-green-500 ml-1 shrink-0 text-[10px]">W</span>}
      </div>

      {/* Player 2 */}
      <div className={`flex items-center justify-between px-2 py-0.5 ${p2Win ? 'text-green-400 font-semibold' : 'text-slate-300'}`}>
        <span className="truncate flex-1 flex items-center gap-1">
          {match.player2Seed && (
            <span className="text-[9px] font-bold text-amber-500/80 shrink-0">[{match.player2Seed}]</span>
          )}
          {match.player2Name || (
            <span className="text-slate-600 italic text-[10px]">{isBye ? '— bye —' : 'TBD'}</span>
          )}
        </span>
        {isComplete && p2Win && <span className="text-green-500 ml-1 shrink-0 text-[10px]">W</span>}
      </div>

      {/* Score */}
      {scoreStr && (
        <div className="border-t border-slate-700/40 px-2 py-0.5 text-center font-mono text-blue-400 text-[10px]">
          {scoreStr}
        </div>
      )}
    </div>
  );
}

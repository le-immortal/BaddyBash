import { MatchDocument } from '../lib/models';
import { Trophy, CircleDot } from 'lucide-react';

interface ScheduleMatchCardProps {
  match: MatchDocument;
  userId: string;
  totalRounds: number;
}

function getRoundLabel(round: number, totalRounds: number): string {
  if (round === totalRounds) return 'Final';
  if (round === totalRounds - 1) return 'Semi-Final';
  if (round === totalRounds - 2) return 'Quarter-Final';
  return `Round ${round}`;
}

const CAT_COLOR: Record<string, { dot: string; circle: string; border: string }> = {
  MS: { dot: 'bg-sky-400', circle: 'bg-sky-400', border: 'border-l-sky-400' },
  WS: { dot: 'bg-pink-400', circle: 'bg-pink-400', border: 'border-l-pink-400' },
  MD: { dot: 'bg-indigo-400', circle: 'bg-indigo-400', border: 'border-l-indigo-400' },
  WD: { dot: 'bg-purple-400', circle: 'bg-purple-400', border: 'border-l-purple-400' },
  XD: { dot: 'bg-teal-400', circle: 'bg-teal-400', border: 'border-l-teal-400' },
};

export default function ScheduleMatchCard({ match, userId, totalRounds }: ScheduleMatchCardProps) {
  const isLive = match.status === 'in_progress';
  const isComplete = match.status === 'completed';
  const isScheduled = match.status === 'scheduled';

  const isPlayer1 = match.player1Id === userId || (match.player1Id?.split('|').includes(userId) ?? false);
  const opponentName = isPlayer1 ? match.player2Name : match.player1Name;
  const opponentAlias = isPlayer1 ? match.player2Id : match.player1Id;
  const userWon = match.winnerId === userId || (match.winnerId?.split('|').includes(userId) ?? false);

  const cat = CAT_COLOR[match.category] || CAT_COLOR.MS;

  return (
    <div
      className={`relative rounded-xl border border-l-4 overflow-hidden transition-all ${cat.border} ${
        isLive
          ? 'bg-court-850 border-amber-400/40 ring-1 ring-amber-400/20'
          : isComplete
            ? userWon
              ? 'bg-emerald-400/5 border-emerald-400/25'
              : 'bg-court-900/50 border-white/10 opacity-75'
            : 'bg-court-850 border-white/10 hover:border-white/20'
      }`}
    >
      {/* Decorative oversized circle — category accent */}
      <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.08] ${cat.circle}`} />

      <div className="relative p-5">
        {/* Time — hero element in display font */}
        {match.scheduledTime ? (
          <div className={`mb-3 ${isLive ? 'text-amber-300' : 'text-court-100'}`}>
            <span className="font-display text-3xl tracking-wider leading-none">
              {match.scheduledTime}
            </span>
          </div>
        ) : (
          <div className="mb-3">
            <span className="font-display text-3xl tracking-wider text-court-600 leading-none">
              {match.matchNumber ? `MATCH ${match.matchNumber}` : 'TBD'}
            </span>
          </div>
        )}

        {/* Category dot + round + match number */}
        <div className="flex items-center gap-2 text-xs mb-3">
          <span className={`w-2 h-2 rounded-full shrink-0 ${cat.dot}`} />
          <span className="font-bold text-court-200">{match.category}</span>
          <span className="text-court-500">·</span>
          <span className="text-court-300">{getRoundLabel(match.round, totalRounds)}</span>
          {match.matchNumber && match.scheduledTime && (
            <>
              <span className="text-court-500">·</span>
              <span className="text-court-400 font-mono">M{match.matchNumber}</span>
            </>
          )}
        </div>

        {/* Opponent + status */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-court-300 truncate min-w-0">
            vs{' '}
            <span className="font-semibold text-court-100">
              {opponentName || <span className="text-court-500 italic font-normal">TBD</span>}
            </span>
            {opponentAlias && <span className="text-xs text-court-400 ml-1">({opponentAlias.includes('|') ? opponentAlias.split('|').map(a => `@${a}`).join(' & ') : `@${opponentAlias}`})</span>}
          </p>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0 ${
              isLive
                ? 'bg-amber-400/15 text-amber-300'
                : isComplete
                  ? userWon
                    ? 'bg-emerald-400/15 text-emerald-300'
                  : 'bg-white/5 text-court-400'
                : 'bg-white/5 text-court-300'
            }`}
          >
            {isLive && <><CircleDot className="w-3 h-3 animate-pulse" /> Live</>}
            {isComplete && (userWon ? <><Trophy className="w-3 h-3" /> Won</> : 'Lost')}
            {isScheduled && 'Upcoming'}
          </span>
        </div>
      </div>
    </div>
  );
}

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

const CAT_COLOR: Record<string, { dot: string; circle: string }> = {
  MS: { dot: 'bg-blue-500', circle: 'bg-blue-400' },
  WS: { dot: 'bg-pink-500', circle: 'bg-pink-400' },
  MD: { dot: 'bg-indigo-500', circle: 'bg-indigo-400' },
  WD: { dot: 'bg-purple-500', circle: 'bg-purple-400' },
  XD: { dot: 'bg-teal-500', circle: 'bg-teal-400' },
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
      className={`relative rounded-xl border overflow-hidden transition-all ${
        isLive
          ? 'bg-white border-amber-200 shadow-md ring-1 ring-amber-100'
          : isComplete
            ? userWon
              ? 'bg-white border-green-200 shadow-sm'
              : 'bg-white border-slate-200 shadow-sm opacity-70'
            : 'bg-white border-slate-200 shadow-sm hover:shadow-md'
      }`}
    >
      {/* Decorative oversized circle — category accent */}
      <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.07] ${cat.circle}`} />

      <div className="relative p-5">
        {/* Time — hero element in display font */}
        {match.scheduledTime ? (
          <div className={`mb-3 ${isLive ? 'text-amber-600' : 'text-slate-900'}`}>
            <span className="font-[family-name:var(--font-bebas)] text-3xl tracking-wider leading-none">
              {match.scheduledTime}
            </span>
          </div>
        ) : (
          <div className="mb-3">
            <span className="font-[family-name:var(--font-bebas)] text-3xl tracking-wider text-slate-300 leading-none">
              {match.matchNumber ? `MATCH ${match.matchNumber}` : 'TBD'}
            </span>
          </div>
        )}

        {/* Category dot + round + match number */}
        <div className="flex items-center gap-2 text-xs mb-3">
          <span className={`w-2 h-2 rounded-full shrink-0 ${cat.dot}`} />
          <span className="font-bold text-slate-600">{match.category}</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-400">{getRoundLabel(match.round, totalRounds)}</span>
          {match.matchNumber && match.scheduledTime && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-slate-300 font-mono">M{match.matchNumber}</span>
            </>
          )}
        </div>

        {/* Opponent + status */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600 truncate min-w-0">
            vs{' '}
            <span className="font-semibold text-slate-800">
              {opponentName || <span className="text-slate-400 italic font-normal">TBD</span>}
            </span>
            {opponentAlias && <span className="text-xs text-slate-400 ml-1">({opponentAlias.includes('|') ? opponentAlias.split('|').map(a => `@${a}`).join(' & ') : `@${opponentAlias}`})</span>}
          </p>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0 ${
              isLive
                ? 'bg-amber-50 text-amber-600'
                : isComplete
                  ? userWon
                    ? 'bg-green-50 text-green-600'
                    : 'bg-slate-50 text-slate-400'
                  : 'bg-slate-50 text-slate-400'
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

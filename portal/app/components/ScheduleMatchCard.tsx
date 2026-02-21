import { MatchDocument, formatSetScores } from '../lib/models';
import { Clock, Trophy, Swords, CircleDot } from 'lucide-react';

interface ScheduleMatchCardProps {
  match: MatchDocument;
  userId: string;
  totalRounds: number;
}

/** Convert round number to a human-readable label. */
function getRoundLabel(round: number, totalRounds: number): string {
  if (round === totalRounds) return 'Final';
  if (round === totalRounds - 1) return 'Semi-Final';
  if (round === totalRounds - 2) return 'Quarter-Final';
  return `Round ${round}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  MS: 'bg-blue-100 text-blue-700',
  WS: 'bg-pink-100 text-pink-700',
  MD: 'bg-indigo-100 text-indigo-700',
  WD: 'bg-purple-100 text-purple-700',
  XD: 'bg-teal-100 text-teal-700',
};

export default function ScheduleMatchCard({ match, userId, totalRounds }: ScheduleMatchCardProps) {
  const isLive = match.status === 'in_progress';
  const isComplete = match.status === 'completed';
  const isScheduled = match.status === 'scheduled';

  // Determine if this user is player 1 or player 2
  // For doubles, player IDs are pipe-separated (e.g., "alice|bob"), so check with split
  const isPlayer1 = match.player1Id === userId || (match.player1Id?.split('|').includes(userId) ?? false);
  const opponentName = isPlayer1 ? match.player2Name : match.player1Name;
  // For doubles, winnerId is pipe-separated (e.g. "m79|m80"), so check with split
  const userWon = match.winnerId === userId || (match.winnerId?.split('|').includes(userId) ?? false);
  const scoreStr = formatSetScores(match.sets);

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        isLive
          ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-200'
          : isComplete
            ? userWon
              ? 'bg-green-50 border-green-200'
              : 'bg-slate-50 border-slate-200'
            : 'bg-white border-slate-200 hover:border-blue-200'
      }`}
    >
      {/* Top row: category badge, round, match number, time */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs">
          <span className={`px-2 py-0.5 rounded-full font-bold ${CATEGORY_COLORS[match.category] || 'bg-slate-100 text-slate-700'}`}>
            {match.category}
          </span>
          <span className="text-slate-500">
            {getRoundLabel(match.round, totalRounds)}
          </span>
          {match.matchNumber && (
            <span className="text-slate-400 font-mono">M{match.matchNumber}</span>
          )}
        </div>
        {match.scheduledTime && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="w-3 h-3" />
            {match.scheduledTime}
          </span>
        )}
      </div>

      {/* Opponent row */}
      <div className="flex items-center gap-2 mb-2">
        <Swords className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="text-sm text-slate-800 font-medium">
          You vs{' '}
          <span className="font-semibold">
            {opponentName || <span className="text-slate-400 italic">TBD</span>}
          </span>
        </span>
      </div>

      {/* Bottom row: score + status badge */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {isComplete && scoreStr && (
            <span className="font-mono">{scoreStr}</span>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
            isLive
              ? 'bg-amber-100 text-amber-700'
              : isComplete
                ? userWon
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
                : 'bg-slate-100 text-slate-600'
          }`}
        >
          {isLive && <><CircleDot className="w-3 h-3 animate-pulse" /> Live</>}
          {isComplete && (userWon ? <><Trophy className="w-3 h-3" /> Won</> : 'Lost')}
          {isScheduled && 'Upcoming'}
        </span>
      </div>
    </div>
  );
}

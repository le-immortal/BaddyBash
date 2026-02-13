'use client';

import { useMemo, useState } from 'react';
import { MatchDocument } from '../lib/models';
import MatchCard from './MatchCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/* ── Layout constants ──────────────────────────────────────────────── */
const SLOT_H = 64;         // Uniform height for match slots
const CONN_W = 28;         // Width of SVG connectors
const VISIBLE_ROUNDS = 4;

/** Block height logic for tree alignment */
function blockH(colIdx: number) { return SLOT_H * Math.pow(2, colIdx); }

function getRoundName(round: number, totalRounds: number): string {
  const r = totalRounds - round;
  if (r === 0) return 'Final';
  if (r === 1) return 'Semis';
  if (r === 2) return 'Quarters';
  return `R${round}`;
}

/* ── SVG Connectors ────────────────────────────────────────────────── */
function Connectors({ colIdx, matchCount }: { colIdx: number; matchCount: number }) {
  const bh = blockH(colIdx);
  const totalH = matchCount * bh;
  const pairs = Math.floor(matchCount / 2);

  return (
    <svg width={CONN_W} height={totalH} className="block shrink-0" style={{ minHeight: totalH }}>
      {Array.from({ length: pairs }).map((_, i) => {
        const topY  = (2 * i + 0.5) * bh;
        const botY  = (2 * i + 1.5) * bh;
        const midY  = (2 * i + 1)   * bh;
        const midX  = CONN_W / 2;
        return (
          <g key={i} strokeWidth={1.5} fill="none" stroke="#475569">
            <line x1={0}    y1={topY}  x2={midX}  y2={topY}  />
            <line x1={0}    y1={botY}  x2={midX}  y2={botY}  />
            <line x1={midX} y1={topY}  x2={midX}  y2={botY}  />
            <line x1={midX} y1={midY}  x2={CONN_W} y2={midY} />
          </g>
        );
      })}
    </svg>
  );
}

interface BracketVisualizerProps {
  matches: MatchDocument[];
  onMatchClick?: (match: MatchDocument) => void;
}

export default function BracketVisualizer({ matches, onMatchClick }: BracketVisualizerProps) {
  const [roundOffset, setRoundOffset] = useState(0);

  // Group matches by round
  const { sortedRounds, totalRounds, stats } = useMemo(() => {
    const rMap = new Map<number, MatchDocument[]>();
    matches.forEach(m => { 
        const l = rMap.get(m.round) || []; 
        l.push(m); 
        rMap.set(m.round, l); 
    });
    
    // Sort keys (rounds) to ensure 1, 2, 3... order
    // Sort values (matches) by position
    rMap.forEach(l => l.sort((a, b) => a.position - b.position));
    
    const sorted = Array.from(rMap.entries()).sort(([a], [b]) => a - b);
    const byes = matches.filter(m => m.status === 'bye').length;
    
    return { 
        sortedRounds: sorted, 
        totalRounds: rMap.size, 
        stats: { total: matches.length, real: matches.length - byes, byes } 
    };
  }, [matches]);

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 border border-dashed border-slate-700 rounded rounded-lg bg-slate-900/30">
        <p>No bracket generated yet.</p>
      </div>
    );
  }

  const visibleRounds = sortedRounds.slice(roundOffset, roundOffset + VISIBLE_ROUNDS);
  const maxOffset = Math.max(0, sortedRounds.length - VISIBLE_ROUNDS);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Scroll controls if bracket is huge */}
      {sortedRounds.length > VISIBLE_ROUNDS && (
          <div className="flex justify-between items-center mb-2 px-1">
            <button 
              disabled={roundOffset === 0}
              onClick={() => setRoundOffset(p => Math.max(0, p - 1))}
              className="p-1 rounded hover:bg-slate-700 disabled:opacity-30"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-xs text-slate-500">
                Wait, rounds {roundOffset + 1} - {Math.min(roundOffset + VISIBLE_ROUNDS, totalRounds)}
            </span>
            <button 
              disabled={roundOffset >= maxOffset}
              onClick={() => setRoundOffset(p => Math.min(maxOffset, p + 1))}
              className="p-1 rounded hover:bg-slate-700 disabled:opacity-30"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
      )}

      {/* Bracket Tree */}
      <div className="flex-1 overflow-auto bg-slate-900/40 rounded border border-slate-700/50 p-6">
        <div className="flex items-stretch min-h-min">
          {visibleRounds.map(([roundNum, roundMatches], i) => {
            const isLastVisible = i === visibleRounds.length - 1;
            const absoluteColIdx = roundOffset + i;
            const bh = blockH(absoluteColIdx);

            return (
              <div key={roundNum} className="flex shrink-0">
                {/* Round Column */}
                <div className="flex flex-col w-56">
                  {/* Header */}
                  <div className="text-center pb-3 text-sm font-bold text-slate-400 border-b border-transparent mb-2">
                    {getRoundName(roundNum, totalRounds)}
                  </div>
                  
                  {/* Matches Stack */}
                  <div className="flex flex-col" style={{ gap: 0 }}>
                    {roundMatches.map((match) => (
                      <div 
                        key={match.id} 
                        style={{ height: bh }} 
                        className="flex items-center justify-center py-2" // py-2 adds vertical spacing within the slot
                      >
                         <MatchCard match={match} onClick={onMatchClick} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Connector Column (not after final round) */}
                {roundNum < totalRounds && (
                   <div className="flex flex-col pt-[42px]"> 
                     {/* 42px offset is approx header(20) + mb(8) + half-slot(32)? No, needs tuning. 
                         Actually, SVG handles relative positioning. We just need to align top.
                         The headers are height ~30px. 
                     */}
                      <div className="h-[30px]" /> {/* Spacer for header alignment */}
                      <Connectors 
                        colIdx={absoluteColIdx} 
                        matchCount={roundMatches.length} 
                      />
                   </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Stats Footer */}
      <div className="mt-2 text-[10px] text-slate-500 flex gap-4 justify-end font-mono">
        <span>Matches: {stats.total}</span>
        <span>Real: {stats.real}</span>
        <span>Byes: {stats.byes}</span>
      </div>
    </div>
  );
}

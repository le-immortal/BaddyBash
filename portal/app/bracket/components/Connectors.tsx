'use client';

import { CONN_W, blockH } from '../lib/bracketLayout';

export function Connectors({ colIdx, matchCount }: { colIdx: number; matchCount: number }) {
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

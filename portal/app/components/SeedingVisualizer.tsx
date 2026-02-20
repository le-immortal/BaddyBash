'use client';

import { useState, useMemo } from 'react';
import { generateSeedOrder, nextPowerOf2 } from '../lib/bracketUtils';
import { GripVertical } from 'lucide-react';

interface Participant {
  id: string; // unique ID (registration ID or user ID)
  name: string;
  currentSeed: number; // 1-based seed
}

interface SeedingVisualizerProps {
  participants: Participant[];
  onSeedsChange: (updatedParticipants: Participant[]) => void;
}

function initItems(participants: Participant[]): Participant[] {
  const sorted = [...participants].sort((a, b) => (a.currentSeed || 0) - (b.currentSeed || 0));
  return sorted.map((p, i) => ({ ...p, currentSeed: i + 1 }));
}

export default function SeedingVisualizer({ participants, onSeedsChange }: SeedingVisualizerProps) {
  // Track previous participants to detect changes and reset items
  const [prevParticipants, setPrevParticipants] = useState(participants);
  const [items, setItems] = useState<Participant[]>(() => initItems(participants));
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Sync items when participants prop changes (during render, per React recommendation)
  if (participants !== prevParticipants) {
    setPrevParticipants(participants);
    setItems(initItems(participants));
  }

  // Derive bracketSize and matchups from items without extra state
  const bracketSize = useMemo(() => nextPowerOf2(items.length), [items.length]);

  const matchups = useMemo(() => {
    if (bracketSize === 0) return [];
    
    const order = generateSeedOrder(bracketSize);
    const result: Array<{ p1: Participant | null, p2: Participant | null, seed1: number, seed2: number }> = [];
    for (let i = 0; i < order.length; i += 2) {
      if (i + 1 >= order.length) break;
      const s1 = order[i];
      const s2 = order[i + 1];
      const p1 = items.find(p => p.currentSeed === s1) || null;
      const p2 = items.find(p => p.currentSeed === s2) || null;
      result.push({ p1, p2, seed1: s1, seed2: s2 });
    }
    return result;
  }, [items, bracketSize]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetSeed: number) => {
    e.preventDefault();
    if (!draggedId) return;

    // Find the source player
    const sourceIdx = items.findIndex(p => p.id === draggedId);
    if (sourceIdx === -1) return;
    
    const sourcePlayer = items[sourceIdx];
    const sourceSeed = sourcePlayer.currentSeed;

    if (sourceSeed === targetSeed) return;

    // Find target player (if any) occupying the target seed
    const targetPlayer = items.find(p => p.currentSeed === targetSeed);
    
    let newItems = [...items];
    
    if (targetPlayer) {
      // SWAP seeds between source and target
      newItems = newItems.map(p => {
        if (p.id === sourcePlayer.id) return { ...p, currentSeed: targetSeed };
        if (p.id === targetPlayer.id) return { ...p, currentSeed: sourceSeed };
        return p;
      });
    } else {
      // Ignore drops on BYEs
      return; 
    }

    setItems(newItems);
    onSeedsChange(newItems);
    setDraggedId(null);
  };

  return (
    <div className="flex flex-col gap-6 select-none">
       {/* Instruction Banner */}
       <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
         <h3 className="font-semibold mb-1">Seeding Strategy</h3>
         <p>Drag and drop players onto each other to swap their seeds. The bracket matches below update in real-time.</p>
         <div className="mt-2 flex gap-4 text-xs opacity-75">
            <span>Participants: <strong>{items.length}</strong></span>
            <span>Bracket Size: <strong>{bracketSize}</strong></span>
            <span>Byes: <strong>{bracketSize - items.length}</strong></span>
         </div>
       </div>

       {/* Matchup Grid */}
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
         {matchups.map((m, i) => (
           <div key={i} className="flex flex-col bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
             {/* Header */}
             <div className="bg-slate-50 px-3 py-1 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100 flex justify-between">
               <span>Match {i + 1}</span>
             </div>
             
             {/* Player 1 */}
             <PlayerSlot 
               player={m.p1} 
               seed={m.seed1} 
               isBye={!m.p1}
               onDragStart={handleDragStart}
               onDragOver={handleDragOver}
               onDrop={handleDrop}
             />
             
             <div className="h-px bg-slate-100 mx-4 relative">
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-[10px] text-slate-300 font-bold">VS</span>
             </div>

             {/* Player 2 */}
             <PlayerSlot 
               player={m.p2} 
               seed={m.seed2} 
               isBye={!m.p2} 
               onDragStart={handleDragStart}
               onDragOver={handleDragOver}
               onDrop={handleDrop}
             />
           </div>
         ))}
       </div>
    </div>
  );
}

function PlayerSlot({ 
  player, 
  seed, 
  isBye, 
  onDragStart, 
  onDragOver, 
  onDrop 
}: { 
  player: Participant | null, 
  seed: number, 
  isBye: boolean, 
  onDragStart: (e: React.DragEvent, id: string) => void,
  onDragOver: (e: React.DragEvent) => void,
  onDrop: (e: React.DragEvent, seed: number) => void
}) {
  return (
    <div 
      className={`p-3 transition-all duration-200 border-l-4 ${
        isBye ? 'bg-slate-50 border-slate-200' : 'bg-white border-blue-500 hover:bg-slate-50 cursor-grab active:cursor-grabbing'
      }`}
      draggable={!isBye}
      onDragStart={(e) => player && onDragStart(e, player.id)}
      onDragOver={!isBye ? onDragOver : undefined}
      onDrop={!isBye ? (e) => onDrop(e, seed) : undefined}
    >
      <div className="flex items-center gap-3">
        <span className={`flex items-center justify-center w-6 h-6 rounded text-xs font-bold shadow-sm ${
           isBye ? 'bg-slate-100 text-slate-400' : 'bg-blue-100 text-blue-700'
        }`}>
          {seed}
        </span>
        
        {isBye ? (
          <span className="text-sm font-medium text-slate-400 italic">Bye</span>
        ) : (
          <div className="flex-1 min-w-0">
             <div className="text-sm font-medium text-slate-700 truncate">{player!.name}</div>
          </div>
        )}

        {!isBye && <GripVertical className="w-4 h-4 text-slate-300 ml-auto" />}
      </div>
    </div>
  );
}

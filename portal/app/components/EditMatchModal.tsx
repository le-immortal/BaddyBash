'use client';

import { useState } from 'react';
import { X, Trophy, Save, ShieldAlert } from 'lucide-react';
import { MatchDocument, SetScore } from '../lib/models';

interface EditMatchModalProps {
  match: MatchDocument;
  onClose: () => void;
  onUpdate: () => void; // Trigger refresh after update
}

export default function EditMatchModal({ match, onClose, onUpdate }: EditMatchModalProps) {
  const [sets, setSets] = useState<SetScore[]>(
    match.sets && match.sets.length > 0 
    ? match.sets 
    : [{ set: 1, score1: 0, score2: 0 }]
  );
  const [winnerId, setWinnerId] = useState<string | undefined>(match.winnerId);
  const [saving, setSaving] = useState(false);

  const p1 = { id: match.player1Id, name: match.player1Name };
  const p2 = { id: match.player2Id, name: match.player2Name };

  const handleScoreChange = (idx: number, field: 'score1' | 'score2', val: string) => {
    const num = parseInt(val) || 0;
    const newSets = [...sets];
    newSets[idx] = { ...newSets[idx], [field]: num };
    
    // Auto-detect winner if score is "final" (e.g. 21-10)?
    // For now, let's keep it manual or simple.
    
    setSets(newSets);
  };

  const addSet = () => {
    if (sets.length >= 3) return;
    setSets([...sets, { set: sets.length + 1, score1: 0, score2: 0 }]);
  };

  const removeSet = (idx: number) => {
    setSets(sets.filter((_, i) => i !== idx).map((s, i) => ({ ...s, set: i + 1 })));
  };

  // Helper to calculate winner based on sets
  const autoCalculateWinner = () => {
    let p1Wins = 0;
    let p2Wins = 0;
    sets.forEach(s => {
      if (s.score1 > s.score2 && s.score1 >= 21) p1Wins++;
      if (s.score2 > s.score1 && s.score2 >= 21) p2Wins++;
    });
    
    // Simple BO3 logc
    if (p1Wins >= 2) return p1.id;
    if (p2Wins >= 2) return p2.id;
    // Or if it's a 1-set tournament (e.g. group stage 30 points)
    if (sets.length === 1 && Math.max(sets[0].score1, sets[0].score2) >= 21) {
        return sets[0].score1 > sets[0].score2 ? p1.id : p2.id;
    }
    return undefined;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // If user hasn't manually picked a winner, try to deduce it?
      // Actually, better to explicitly ask for winner or trust the manual selection.
      // But we can enforce consistency.
      if (winnerId === undefined && sets.length > 0) {
        const calculated = autoCalculateWinner();
        if (calculated && !confirm(`Auto-selecting winner as ${calculated === p1.id ? p1.name : p2.name}?`)) {
            setSaving(false);
            return;
        }
      }
      
      const payload: Partial<MatchDocument> = {
        id: match.id,
        category: match.category,
        sets,
      };

      if (winnerId) {
        payload.winnerId = winnerId;
        payload.winnerName = (winnerId === p1.id ? p1.name : p2.name);
      }

      const res = await fetch('/api/matches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to update match');
        return;
      }
      
      onUpdate();
      onClose();
    } catch (error) {
      console.error(error);
      alert('Failed to save request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            Update Match M{match.matchNumber}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-6 overflow-y-auto">
          {/* Players */}
          <div className="grid grid-cols-2 gap-4 text-center">
            <div 
                onClick={() => setWinnerId(p1.id)}
                className={`p-3 rounded border cursor-pointer transition-all ${
                    winnerId === p1.id 
                    ? 'bg-green-900/40 border-green-500/50 ring-1 ring-green-500' 
                    : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                }`}
            >
                <div className="text-xs text-slate-400 mb-1">Player 1</div>
                <div className="font-bold text-sm truncate">{p1.name || 'TBD'}</div>
            </div>
            
            <div 
                onClick={() => setWinnerId(p2.id)}
                className={`p-3 rounded border cursor-pointer transition-all ${
                    winnerId === p2.id 
                    ? 'bg-green-900/40 border-green-500/50 ring-1 ring-green-500' 
                    : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                }`}
            >
                <div className="text-xs text-slate-400 mb-1">Player 2</div>
                <div className="font-bold text-sm truncate">{p2.name || 'TBD'}</div>
            </div>
          </div>
          
          {/* Sets */}
          <div className="space-y-3">
             <div className="flex justify-between items-center">
                <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Scores</label>
                <button 
                    onClick={addSet}
                    disabled={sets.length >= 3}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                >
                    + Add Set
                </button>
             </div>
             
             {sets.map((set, idx) => (
                <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400 w-8">S{idx + 1}</span>
                    <input 
                        type="number"
                        value={set.score1}
                        onChange={(e) => handleScoreChange(idx, 'score1', e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-center font-mono text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <span className="text-slate-600">-</span>
                    <input 
                        type="number"
                        value={set.score2}
                        onChange={(e) => handleScoreChange(idx, 'score2', e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-center font-mono text-sm focus:border-blue-500 focus:outline-none"
                    />
                    {sets.length > 1 && (
                        <button onClick={() => removeSet(idx)} className="text-slate-600 hover:text-red-400">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
             ))}
          </div>
          
          {/* Warning for TBD */}
          {(!p1.id || !p2.id) && (
             <div className="flex gap-2 items-start p-3 bg-amber-900/20 text-amber-500 text-xs rounded border border-amber-900/50">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>You are editing a match that isn&apos;t fully set yet. Wait for previous rounds to complete properly.</span>
             </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3 rounded-b-xl">
            <button 
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            >
                Cancel
            </button>
            <button 
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {saving ? (
                   <>Saving...</> 
                ) : (
                   <><Save className="w-4 h-4" /> Update Match</>
                )}
            </button>
        </div>
      </div>
    </div>
  );
}

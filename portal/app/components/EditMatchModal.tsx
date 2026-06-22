'use client';

import { useState } from 'react';
import { X, Trophy, Save, ShieldAlert } from 'lucide-react';
import { MatchDocument } from '../lib/models';

interface EditMatchModalProps {
  match: MatchDocument;
  onClose: () => void;
  onUpdate: () => void; // Trigger refresh after update
}

export default function EditMatchModal({ match, onClose, onUpdate }: EditMatchModalProps) {
  // Initialize with existing winner or undefined
  const [winnerId, setWinnerId] = useState<string | undefined>(match.winnerId);
  const [scheduledTime, setScheduledTime] = useState<string>(match.scheduledTime || '');
  const [saving, setSaving] = useState(false);

  const p1 = { id: match.player1Id, name: match.player1Name };
  const p2 = { id: match.player2Id, name: match.player2Name };
    
  const isLocked = match.status === 'completed';

  const handleSave = async () => {
    // If not locked (completed), allow winner selection or schedule update
    const isUpdatingScheduleOnly = !winnerId && (scheduledTime !== match.scheduledTime);

    if (!winnerId && !isUpdatingScheduleOnly) {
      alert('Please select a winner or update schedule');
      return;
    }

    setSaving(true);
    try {
      const payload: {
        matchId: string;
        category: string;
        seasonId?: string;
        winnerId?: string;
        winnerName?: string;
        scheduledTime?: string;
      } = {
        matchId: match.id,
        category: match.category,
        seasonId: match.seasonId,
        scheduledTime,
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
            Update Match M{match.matchNumber} - Select Winner
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
                className={`p-6 rounded border cursor-pointer transition-all ${
                    winnerId === p1.id 
                    ? 'bg-green-900/40 border-green-500/50 ring-1 ring-green-500 transform scale-105' 
                    : 'bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-500'
                }`}
            >
                <div className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Player 1</div>
                <div className="font-bold text-lg text-white mb-2">{p1.name || 'TBD'}</div>
                {winnerId === p1.id && (
                  <div className="inline-block bg-green-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                    WINNER
                  </div>
                )}
            </div>
            
            <div 
                onClick={() => setWinnerId(p2.id)}
                className={`p-6 rounded border cursor-pointer transition-all ${
                    winnerId === p2.id 
                    ? 'bg-green-900/40 border-green-500/50 ring-1 ring-green-500 transform scale-105' 
                    : 'bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-500'
                }`}
            >
                <div className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Player 2</div>
                <div className="font-bold text-lg text-white mb-2">{p2.name || 'TBD'}</div>
                {winnerId === p2.id && (
                  <div className="inline-block bg-green-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                    WINNER
                  </div>
                )}
            </div>
          </div>
          
          <div className="border-t border-slate-700/50 my-2"></div>
          
          {/* Scheduling inputs */}
          <div>
            <label className="block text-xs uppercase text-slate-400 mb-1">Scheduled Time</label>
            <input 
              type="text" 
              value={scheduledTime}
              onChange={e => setScheduledTime(e.target.value)}
              placeholder="e.g. 10:30 AM"
              disabled={isLocked}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>
          
          <div className="bg-amber-500/10 border border-amber-500/20 rounded p-3 flex gap-3 text-amber-200/80 text-xs">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-500" />
            <p>Selecting a winner will automatically advance them to the next bracket round.</p>
          </div>
          
          {(!p1.id || !p2.id) && (
             <div className="flex gap-2 items-start p-3 bg-red-900/20 text-red-500 text-xs rounded border border-red-900/50">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>One or both players are TBD. You cannot select a winner yet.</span>
             </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (!winnerId && scheduledTime === (match.scheduledTime||''))}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
            {!saving && <Save className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

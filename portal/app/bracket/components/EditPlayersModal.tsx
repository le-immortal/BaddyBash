'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Loader2, Pencil, Save, Search, X } from 'lucide-react';
import type { Category, MatchDocument } from '@/app/lib/models';

interface UserOption {
  id: string;
  name: string;
  alias?: string;
}

interface EditPlayersModalProps {
  match: MatchDocument;
  category: Category;
  onClose: () => void;
  onSaved: (updated: MatchDocument) => void;
}

export function EditPlayersModal({ match, category, onClose, onSaved }: EditPlayersModalProps) {
  const [p1Id, setP1Id] = useState(match.player1Id || '');
  const [p1Name, setP1Name] = useState(match.player1Name || '');
  const [p2Id, setP2Id] = useState(match.player2Id || '');
  const [p2Name, setP2Name] = useState(match.player2Name || '');
  const [scheduledTime, setScheduledTime] = useState(match.scheduledTime || '');
  const [saving, setSaving] = useState(false);

  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [activeSlot, setActiveSlot] = useState<1 | 2 | null>(null);
  const [slotSearch, setSlotSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.ok ? r.json() : [])
      .then((users: UserOption[]) => { setAllUsers(users); setUsersLoaded(true); })
      .catch(() => setUsersLoaded(true));
  }, []);

  const filteredUsers = useMemo(() => {
    const q = slotSearch.trim().toLowerCase();
    if (!q) return allUsers.slice(0, 20);
    return allUsers.filter(u =>
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.alias && u.alias.toLowerCase().includes(q)) ||
      (u.id && u.id.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [slotSearch, allUsers]);

  useEffect(() => {
    if (activeSlot && searchRef.current) searchRef.current.focus();
  }, [activeSlot]);

  const selectUser = (user: UserOption, slot: 1 | 2) => {
    if (slot === 1) { setP1Id(user.id); setP1Name(user.name); }
    else { setP2Id(user.id); setP2Name(user.name); }
    setActiveSlot(null);
    setSlotSearch('');
  };

  const handleSwap = () => {
    setP1Id(prev => { const old2 = p2Id; setP2Id(prev); return old2; });
    setP1Name(prev => { const old2 = p2Name; setP2Name(prev); return old2; });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/matches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: match.id,
          category,
          seasonId: match.seasonId,
          player1Id: p1Id || '',
          player1Name: p1Name || '',
          player2Id: p2Id || '',
          player2Name: p2Name || '',
          scheduledTime,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to update');
        return;
      }
      const data = await res.json();
      onSaved(data.match);
      onClose();
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = p1Id !== (match.player1Id || '') || p1Name !== (match.player1Name || '') ||
                     p2Id !== (match.player2Id || '') || p2Name !== (match.player2Name || '') ||
                     scheduledTime !== (match.scheduledTime || '');

  const renderSlot = (slot: 1 | 2) => {
    const id = slot === 1 ? p1Id : p2Id;
    const name = slot === 1 ? p1Name : p2Name;
    const isSearching = activeSlot === slot;

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase text-slate-400 font-medium">Player {slot}</span>
          <button
            onClick={() => { setActiveSlot(isSearching ? null : slot); setSlotSearch(''); }}
            className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
          >
            <Search className="w-2.5 h-2.5" />
            {isSearching ? 'Cancel' : 'Search'}
          </button>
        </div>

        {isSearching ? (
          <div className="relative">
            <input
              ref={searchRef}
              type="text"
              value={slotSearch}
              onChange={(e) => setSlotSearch(e.target.value)}
              placeholder="Type name or alias..."
              className="w-full bg-slate-700 border border-slate-600 rounded px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            {usersLoaded && (
              <div className="absolute left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-40 overflow-y-auto z-10">
                {filteredUsers.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-500">No users found</div>
                ) : filteredUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => selectUser(u, slot)}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-700 transition-colors flex items-center justify-between"
                  >
                    <span className="text-sm text-white truncate">{u.name}</span>
                    <span className="text-[10px] text-slate-500 shrink-0 ml-2">@{u.alias || u.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => slot === 1 ? setP1Name(e.target.value) : setP2Name(e.target.value)}
              placeholder="Name"
              className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              value={id}
              onChange={(e) => slot === 1 ? setP1Id(e.target.value) : setP2Id(e.target.value)}
              placeholder="alias"
              className="w-24 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-400 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono text-[11px]"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b border-slate-800">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Pencil className="w-3.5 h-3.5 text-blue-400" />
            Edit Match M{match.matchNumber}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {renderSlot(1)}

          <div className="flex justify-center">
            <button
              onClick={handleSwap}
              className="flex items-center gap-1.5 px-3 py-1 text-xs text-slate-400 hover:text-blue-400 border border-slate-700 hover:border-blue-500/50 rounded-full transition-colors"
            >
              <ArrowLeftRight className="w-3 h-3" />
              Swap
            </button>
          </div>

          {renderSlot(2)}

          <div className="mt-2 pt-2 border-t border-slate-700/50">
            <label className="block text-[10px] uppercase text-slate-400 font-medium mb-1">Scheduled Time</label>
            <input
              type="text"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              placeholder="e.g. 10:30 AM, Court 2 - 11am"
              className="w-full bg-slate-700 border border-slate-600 rounded px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="p-3 border-t border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

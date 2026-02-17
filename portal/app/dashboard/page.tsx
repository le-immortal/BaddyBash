'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Navbar from '../components/Navbar';
import RegistrationCard from '../components/RegistrationCard';
import { Category } from '../lib/models';
import { AlertCircle, Loader2, Lock } from 'lucide-react';

const CATEGORIES: { id: Category; name: string }[] = [
  { id: 'MS', name: "Men's Singles" },
  { id: 'WS', name: "Women's Singles" },
  { id: 'MD', name: "Men's Doubles" },
  { id: 'WD', name: "Women's Doubles" },
  { id: 'XD', name: "Mixed Doubles" },
];

interface Registration {
  id: string;
  userId: string;
  userName: string;
  category: Category;
  status: string;
  partnerId?: string;
  partnerName?: string;
  partnerPhone?: string;
}

export default function Dashboard() {
  const { data: session, status: sessionStatus } = useSession();
  const [playerName, setPlayerName] = useState('');
  const [alias, setAlias] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [savedAlias, setSavedAlias] = useState<string | null>(null);
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [partners, setPartners] = useState<Record<string, { name: string, alias: string, phone: string }>>({}); 
  const [committedCategories, setCommittedCategories] = useState<Category[]>([]);
  const [committedRegistrations, setCommittedRegistrations] = useState<Registration[]>([]);
  const [selection, setSelection] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkingAlias, setLinkingAlias] = useState(false);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(true);

  // Check global registration setting
  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(data => {
      setRegistrationOpen(data.registrationOpen !== false);
    }).catch(console.error);
  }, []);

  // Determine if profile is fully set up.
  // The user is considered registered if they have an alias associated with their account.
  // Email is used for login/lookup, but the alias is the core identity.
  const profileSaved = !!savedAlias;

  // sessionEmail is used only for lookup — the actual Cosmos user ID is always the alias
  const sessionEmail = session?.user?.email || '';
  const userId = resolvedUserId || '';
  const userName = savedName || session?.user?.name || 'Player';

  // Fetch existing registrations from API
  const fetchRegistrations = useCallback(async (uid?: string) => {
    const targetId = uid || userId;
    if (!targetId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/registrations?userId=${encodeURIComponent(targetId)}`);
      if (res.ok) {
        const regs: Registration[] = await res.json();
        const active = regs.filter(r => r.status !== 'cancelled');
        setCommittedCategories(active.map(r => r.category));
        setCommittedRegistrations(active);
      }
    } catch (err) {
      console.error('Failed to fetch registrations:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // On login: look up existing user by email — NO doc creation here
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !session?.user) return;
    const initUser = async () => {
      try {
        // Look up by email to see if this user has already set up their profile
        const res = await fetch(`/api/users?email=${encodeURIComponent(sessionEmail)}`);
        if (res.ok) {
          const user = await res.json();
          // Check if we got a valid user object with required fields
          if (user && user.alias) {
            setSavedName(user.name);
            setSavedAlias(user.alias);
            setSavedPhone(user.phoneNumber);
            setPlayerName(user.name);
            setAlias(user.alias);
            setPhoneNumber(user.phoneNumber || '');
            setResolvedUserId(user.id); // id = alias
          }
        }
        // If 404, user hasn't set up profile yet — that's fine, show the setup form
      } catch (err) {
        console.error('Failed to init user:', err);
      } finally {
        setLoading(false);
      }
    };
    initUser();
  }, [sessionStatus, session, sessionEmail]);

  useEffect(() => {
    if (sessionStatus === 'authenticated' && profileSaved) {
      fetchRegistrations();
    }
  }, [sessionStatus, profileSaved, fetchRegistrations]);

  const maxSelections = 2;
  const totalCount = committedCategories.length + selection.length;
  const isMaxReached = totalCount >= maxSelections;

  // Gender Logic
  const allActive = [...committedCategories, ...selection];
  const hasMenSelection = allActive.some(c => c === 'MS' || c === 'MD');
  const hasWomenSelection = allActive.some(c => c === 'WS' || c === 'WD');

  const handleSelect = (catId: Category) => {
    if (!registrationOpen) return;
    if (isMaxReached) return;
    if (committedCategories.includes(catId)) return;
    if ((catId === 'MS' || catId === 'MD') && hasWomenSelection) return;
    if ((catId === 'WS' || catId === 'WD') && hasMenSelection) return;
    if (!selection.includes(catId)) {
      setSelection([...selection, catId]);
    }
  };

  const handleDeselect = (catId: Category) => {
    setSelection(selection.filter(id => id !== catId));
  };

  const handlePartnerChange = (catId: string, field: 'name' | 'alias' | 'phone', value: string) => {
    setPartners(prev => ({
      ...prev,
      [catId]: { ...prev[catId], [field]: value },
    }));
  };

  const isDoubles = (c: Category) => c === 'MD' || c === 'WD' || c === 'XD';

  const isSelectionValid = selection.every(catId => {
    if (!isDoubles(catId)) return true;
    const p = partners[catId];
    return p && p.name?.trim().length > 0 && p.alias?.trim().length > 0 && p.phone?.trim().length > 0;
  });

  const handleSaveProfile = async () => {
    if (!playerName.trim()) {
      alert('Please enter your name.');
      return;
    }
    if (!alias.trim()) {
      alert('Please enter your Microsoft alias.');
      return;
    }
    if (!phoneNumber.trim()) {
      alert('Please enter your phone number.');
      return;
    }

    setLinkingAlias(true);
    try {
      // Trim and lowercase alias for consistency
      const cleanAlias = alias.trim().toLowerCase();
      
      // Check if a user with this alias already exists (pre-created by a partner)
      const aliasRes = await fetch(`/api/users?alias=${encodeURIComponent(cleanAlias)}`);

      if (aliasRes.ok) {
        const existingUser = await aliasRes.json();
        // Found a pre-created user (partner registered them) — link email/avatar to it
        const linkRes = await fetch('/api/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: existingUser.id,
            name: playerName.trim(),
            email: session?.user?.email || '',
            avatar: session?.user?.image || undefined,
            phoneNumber: phoneNumber.trim(),
          }),
        });
        
        if (!linkRes.ok) {
          const errData = await linkRes.json();
          throw new Error(errData.error || 'Failed to update profile.');
        }

        setResolvedUserId(existingUser.id);
        setSavedName(playerName.trim());
        setSavedAlias(cleanAlias);
        setSavedPhone(phoneNumber.trim());
        await fetchRegistrations(existingUser.id);
      } else {
        // No pre-existing user — create a new user with id = alias (lowercase)
        const createRes = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: cleanAlias,
            name: playerName.trim(),
            email: session?.user?.email || '',
            alias: cleanAlias,
            phoneNumber: phoneNumber.trim(),
            avatar: session?.user?.image || undefined,
          }),
        });

        if (!createRes.ok) {
           const errData = await createRes.json();
           throw new Error(errData.error || 'Failed to create profile.');
        }

        setResolvedUserId(cleanAlias);
        setSavedName(playerName.trim());
        setSavedAlias(cleanAlias);
        setSavedPhone(phoneNumber.trim());
        await fetchRegistrations(cleanAlias);
      }
    } catch (err: unknown) {
      console.error('Profile save failed:', err);
      // Better error handling
      const msg = err instanceof Error ? err.message : 'Failed to save profile. Please check if the alias is already in use by another email.';
      alert(msg);
    } finally {
      setLinkingAlias(false);
    }
  };

  const handleSave = async () => {
    if (!isSelectionValid) return;

    if (!confirm('Are you sure you want to confirm these registrations? This action CANNOT be undone.')) return;

    setSaving(true);
    try {
      // POST each selected category
      for (const catId of selection) {
        const body: Record<string, string> = {
          userId,
          userName,
          category: catId,
        };
        if (isDoubles(catId)) {
          // Trim and lowercase partner alias
          body.partnerId = partners[catId]?.alias?.trim().toLowerCase() || '';
          body.partnerName = partners[catId]?.name?.trim() || '';
          body.partnerPhone = partners[catId]?.phone?.trim() || '';
          body.userPhone = savedPhone || phoneNumber || '';
        }
        const res = await fetch('/api/registrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(`Failed to register for ${catId}: ${err.error}`);
          break;
        }
      }

      // Refresh registrations
      setSelection([]);
      setPartners({});
      await fetchRegistrations();
    } catch (err) {
      console.error('Save failed:', err);
      alert('An error occurred while saving. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-slate-600">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (sessionStatus === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="flex items-center justify-center py-32 text-slate-600">
          Please sign in to access your dashboard.
        </div>
      </div>
    );
  }

  // Profile-first gate: if alias/name/phone not saved, show setup form
  if (!profileSaved) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <main className="container mx-auto py-16 px-4 max-w-md">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Welcome to Baddy Bash!</h1>
            <p className="text-slate-600 text-sm mb-6">
              Please fill in your details to get started. If your partner has already registered you, enter the <strong>same alias</strong> they used and we&apos;ll link your account.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g., John Doe"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-900 bg-white placeholder-slate-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Microsoft Alias <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g., v-john"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-900 bg-white placeholder-slate-400"
                />
                <p className="mt-1 text-xs text-slate-400">This is your unique identifier. If a partner registered you, use the alias they provided.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Phone Number <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  placeholder="9876543210"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                  maxLength={10}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-900 bg-white placeholder-slate-400"
                />
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={linkingAlias || !playerName.trim() || !alias.trim() || !phoneNumber.trim()}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {linkingAlias ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Setting up...</>
                ) : (
                  'Continue to Dashboard'
                )}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="container mx-auto py-8 px-4">
        <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Player Dashboard</h1>
            <p className="text-slate-600 mt-2">Manage your tournament entries. Max {maxSelections} categories allowed.</p>

            <div className="mt-3 flex flex-wrap items-center gap-2 md:gap-4 text-sm text-slate-600">
              <span className="font-medium text-slate-800">{savedName}</span>
              <span className="hidden md:inline text-slate-300">·</span>
              <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500" /> {savedAlias}
              </span>
              <span className="hidden md:inline text-slate-300">·</span>
              <span className="text-slate-600">{savedPhone}</span>
            </div>
          </div>
          {selection.length > 0 && (
            <button
              onClick={handleSave}
              disabled={!isSelectionValid || saving || !registrationOpen}
              className={`w-full md:w-auto font-bold py-3 px-6 rounded-lg shadow-md transition-all ${
                isSelectionValid && !saving && registrationOpen
                  ? 'bg-blue-600 hover:bg-blue-700 text-white animate-pulse'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Saving...</span>
              ) : (
                `Save Changes (${selection.length} Selected)`
              )}
            </button>
          )}
        </header>

        <section className="mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-slate-800">My Registrations</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${isMaxReached ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                {totalCount} / {maxSelections} Slots Used
              </span>
            </div>

            {isMaxReached && (
              <div className="flex items-center p-3 mb-6 bg-orange-50 text-orange-800 rounded-lg text-sm border border-orange-200">
                <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
                You have reached the maximum number of registrations per player.
              </div>
            )}

            {!registrationOpen && (
              <div className="flex items-center p-3 mb-6 bg-red-50 text-red-800 rounded-lg text-sm border border-red-200">
                <Lock className="w-5 h-5 mr-3 flex-shrink-0" />
                <div>
                  <span className="font-bold">Registrations Closed.</span> New registrations are currently paused.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {CATEGORIES.map(category => {
                const isCommitted = committedCategories.includes(category.id);
                const committedReg = committedRegistrations.find(r => r.category === category.id);
                const isSelected = selection.includes(category.id);
                let status: 'committed' | 'selected' | 'available' = 'available';
                if (isCommitted) status = 'committed';
                else if (isSelected) status = 'selected';

                let isDisabled = status === 'available' && isMaxReached;
                if (!registrationOpen && status === 'available') isDisabled = true;
                if (status === 'available') {
                  if ((category.id === 'MS' || category.id === 'MD') && hasWomenSelection) isDisabled = true;
                  if ((category.id === 'WS' || category.id === 'WD') && hasMenSelection) isDisabled = true;
                }

                return (
                  <RegistrationCard
                    key={category.id}
                    category={category}
                    status={status}
                    partnerName={isCommitted ? committedReg?.partnerName || '' : partners[category.id]?.name || ''}
                    partnerAlias={isCommitted ? committedReg?.partnerId || '' : partners[category.id]?.alias || ''}
                    partnerPhone={isCommitted ? committedReg?.partnerPhone || '' : partners[category.id]?.phone || ''}
                    onNameChange={(val) => handlePartnerChange(category.id, 'name', val)}
                    onAliasChange={(val) => handlePartnerChange(category.id, 'alias', val)}
                    onPhoneChange={(val) => handlePartnerChange(category.id, 'phone', val)}
                    disabled={isDisabled}
                    onSelect={handleSelect}
                    onDeselect={handleDeselect}
                  />
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

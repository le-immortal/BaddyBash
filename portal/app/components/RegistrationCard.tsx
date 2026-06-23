'use client';
import { useState } from 'react';
import { Category } from '../lib/models';
import { CheckCircle, Plus, User, Users, UsersRound, Lock, Check, Settings, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import PartnerPicker, { type PartnerOption } from './PartnerPicker';

interface RegistrationCardProps {
  category: { id: Category; name: string };
  status: 'available' | 'selected' | 'committed'; 
  partnerName?: string;
  partnerAlias?: string;
  partnerPhone?: string;
  partnerTShirtSize?: string;
  partnerSelected?: boolean;
  partnerError?: string;
  isAdmin?: boolean;
  onNameChange?: (val: string) => void;
  onAliasChange?: (val: string) => void;
  onPhoneChange?: (val: string) => void;
  onTShirtSizeChange?: (val: string) => void;
  onPartnerSelect?: (partner: PartnerOption) => void;
  onPartnerClear?: () => void;
  onAdminManualModeChange?: (manual: boolean) => void;
  disabled: boolean;
  onSelect: (catId: Category) => void;
  onDeselect: (catId: Category) => void;
  canWithdraw?: boolean;
  onWithdraw?: (catId: Category) => void;
}

// Per-category icon + subtitle + subtle available-state accent for a
// tournament-branded, distinct feel. Singles vs doubles are visually distinct.
const CATEGORY_META: Record<Category, { Icon: LucideIcon; subtitle: string; accent: string }> = {
  MS: { Icon: User,        subtitle: 'Solo bracket',   accent: 'bg-sky-100 text-sky-600' },
  WS: { Icon: User,        subtitle: 'Solo bracket',   accent: 'bg-rose-100 text-rose-600' },
  MD: { Icon: Users,       subtitle: 'Pick a partner', accent: 'bg-indigo-100 text-indigo-600' },
  WD: { Icon: Users,       subtitle: 'Pick a partner', accent: 'bg-fuchsia-100 text-fuchsia-600' },
  XD: { Icon: UsersRound,  subtitle: 'Pick a partner', accent: 'bg-violet-100 text-violet-600' },
};

export default function RegistrationCard({ 
  category, 
  status, 
  partnerName,
  partnerAlias, 
  partnerPhone,
  partnerTShirtSize,
  partnerSelected,
  partnerError,
  isAdmin = false,
  onNameChange,
  onAliasChange, 
  onPhoneChange,
  onTShirtSizeChange,
  onPartnerSelect,
  onPartnerClear,
  onAdminManualModeChange,
  disabled, 
  onSelect, 
  onDeselect,
  canWithdraw = false,
  onWithdraw
}: RegistrationCardProps) {
  const isDoubles = category.id !== 'MS' && category.id !== 'WS';
  const [partnerAliasWarning, setPartnerAliasWarning] = useState(false);
  const [adminManual, setAdminManual] = useState(false);

  const meta = CATEGORY_META[category.id];
  const CategoryIcon = meta.Icon;
  const isMuted = status === 'available' && disabled;

  const handleSelect = () => {
    onSelect(category.id);
  };

  const toggleAdminManual = () => {
    const next = !adminManual;
    setAdminManual(next);
    onAdminManualModeChange?.(next);
  };

  // Icon-badge styling follows the active state so the card reads at a glance.
  const iconBadgeClass =
    status === 'committed' ? 'bg-green-100 text-green-600' :
    status === 'selected' ? 'bg-blue-100 text-blue-600' :
    meta.accent;

  return (
    <div
      className={clsx(
        "group relative flex flex-col overflow-hidden rounded-2xl border shadow-sm transition-all duration-200",
        status === 'committed'
          ? "border-green-200 bg-gradient-to-b from-green-50/80 to-white"
          : status === 'selected'
            ? "border-blue-300 bg-gradient-to-b from-blue-50/80 to-white ring-1 ring-blue-200"
            : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
        isMuted && "opacity-60 hover:translate-y-0 hover:shadow-sm"
      )}
    >
      {/* Accent rail along the top edge to brand each state */}
      <div
        className={clsx(
          "h-1 w-full",
          status === 'committed' ? "bg-green-500" :
          status === 'selected' ? "bg-blue-500" :
          isMuted ? "bg-slate-200" : "bg-gradient-to-r from-blue-400 via-sky-400 to-emerald-400 opacity-60 group-hover:opacity-100 transition-opacity"
        )}
      />

      <div className="flex flex-1 flex-col p-4">
      {/* Header: icon badge + title/subtitle + status indicator */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={clsx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconBadgeClass)}>
            <CategoryIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold leading-tight text-slate-800">{category.name}</h3>
            <p className="mt-0.5 text-xs font-medium text-slate-400">{isMuted ? 'Unavailable' : meta.subtitle}</p>
          </div>
        </div>
        {status === 'committed' ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
            <CheckCircle className="h-3.5 w-3.5" /> Confirmed
          </span>
        ) : status === 'selected' ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            <Check className="h-3.5 w-3.5" strokeWidth={3} /> Selected
          </span>
        ) : isMuted ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
            <Lock className="h-3 w-3" /> Locked
          </span>
        ) : (
          <span className="h-6 w-6 shrink-0 rounded-full border-2 border-dashed border-slate-200 transition-colors group-hover:border-blue-300" aria-hidden="true" />
        )}
      </div>

      <div className="space-y-3">
        {isDoubles && status === 'committed' && (partnerName || partnerAlias || partnerPhone) && (
          <div className="space-y-1 rounded-xl border border-green-100 bg-green-50/60 p-3 text-sm text-slate-600">
            <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-green-700"><Users className="h-3.5 w-3.5" /> Partner Details</p>
            {partnerName && <p><span className="font-medium text-slate-700">Name:</span> {partnerName}</p>}
            {partnerAlias && <p><span className="font-medium text-slate-700">Alias:</span> {partnerAlias}</p>}
            {partnerPhone && <p><span className="font-medium text-slate-700">Phone:</span> {partnerPhone}</p>}
            {partnerTShirtSize && <p><span className="font-medium text-slate-700">Size:</span> {partnerTShirtSize}</p>}
          </div>
        )}

        {isDoubles && status === 'selected' && (
          <div className="space-y-2 rounded-xl border border-blue-100 bg-white/70 p-3">
            {!adminManual && (
              <PartnerPicker
                selected={
                  partnerSelected && partnerAlias
                    ? {
                        alias: partnerAlias,
                        name: partnerName || partnerAlias,
                      }
                    : null
                }
                onSelect={(p) => onPartnerSelect?.(p)}
                onClear={() => onPartnerClear?.()}
                submitError={partnerError}
              />
            )}

            {isAdmin && (
              <div className={adminManual ? 'rounded-lg border border-amber-200 bg-amber-50 p-3' : 'pt-1'}>
                <button
                  type="button"
                  onClick={toggleAdminManual}
                  aria-expanded={adminManual}
                  className="flex items-center gap-1 rounded text-[11px] font-medium text-amber-700 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                >
                  <Settings className="h-3 w-3" />
                  {adminManual ? 'Use member search instead' : 'Add an unregistered partner manually'}
                </button>

                {adminManual && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700">
                      Admin override — unverified partner
                    </p>
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase">Partner Name</label>
                      <input
                        type="text"
                        placeholder="e.g., Jane Doe"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        value={partnerName || ''}
                        onChange={(e) => onNameChange?.(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase">Partner Alias</label>
                      <input
                        type="text"
                        placeholder="e.g., janedoe"
                        className={clsx(
                          'mt-1 w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2',
                          partnerAliasWarning
                            ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                            : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
                        )}
                        value={partnerAlias || ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
                          if (raw !== cleaned) {
                            setPartnerAliasWarning(true);
                            setTimeout(() => setPartnerAliasWarning(false), 4000);
                          }
                          onAliasChange?.(cleaned);
                        }}
                      />
                      {partnerAliasWarning && (
                        <p className="mt-0.5 text-[10px] text-red-500 font-medium">Only letters and numbers allowed.</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase">Partner Phone (Optional)</label>
                      <input
                        type="tel"
                        placeholder="e.g., 9876543210"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        value={partnerPhone || ''}
                        onChange={(e) => onPhoneChange?.(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                        maxLength={10}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase">Partner T-Shirt Size (Optional)</label>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        value={partnerTShirtSize || ''}
                        onChange={(e) => onTShirtSizeChange?.(e.target.value)}
                      >
                        <option value="">Select Size</option>
                        <option value="XS">XS</option>
                        <option value="S">S</option>
                        <option value="M">M</option>
                        <option value="L">L</option>
                        <option value="XL">XL</option>
                        <option value="XXL">XXL</option>
                      </select>
                    </div>
                    {partnerError && (
                      <p role="alert" className="text-[11px] font-medium text-red-600">{partnerError}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {status === 'committed' ? (
          <div className="flex items-center justify-between border-t border-green-100 pt-3 text-sm font-medium text-green-700">
            <span className="flex items-center gap-1"><CheckCircle className="h-4 w-4" /> Locked in</span>
            {canWithdraw && onWithdraw && (
              <button
                onClick={() => onWithdraw(category.id)}
                className="rounded text-xs font-medium text-red-500 hover:text-red-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              >
                Withdraw
              </button>
            )}
          </div>
        ) : status === 'selected' ? (
           <button
             onClick={() => onDeselect(category.id)}
             className="flex w-full items-center justify-center rounded-lg border border-red-200 bg-white py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
           >
             Deselect
           </button>
        ) : (
          <button
            onClick={handleSelect}
            disabled={disabled}
            aria-label={disabled ? `${category.name} unavailable` : `Select ${category.name}`}
            className={clsx("flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2",
              disabled 
                ? "cursor-not-allowed bg-slate-100 text-slate-400" 
                : "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-sm hover:from-blue-700 hover:to-blue-600 hover:shadow focus-visible:ring-blue-300"
            )}
          >
            {disabled ? (
              <><Lock className="h-3.5 w-3.5" /><span>Unavailable</span></>
            ) : (
              <><Plus className="h-4 w-4" /><span>Select</span></>
            )}
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

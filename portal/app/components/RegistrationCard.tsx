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
  MS: { Icon: User,        subtitle: 'Solo bracket',   accent: 'bg-sky-400/15 text-sky-300' },
  WS: { Icon: User,        subtitle: 'Solo bracket',   accent: 'bg-rose-400/15 text-rose-300' },
  MD: { Icon: Users,       subtitle: 'Pick a partner', accent: 'bg-indigo-400/15 text-indigo-300' },
  WD: { Icon: Users,       subtitle: 'Pick a partner', accent: 'bg-fuchsia-400/15 text-fuchsia-300' },
  XD: { Icon: UsersRound,  subtitle: 'Pick a partner', accent: 'bg-violet-400/15 text-violet-300' },
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
    status === 'committed' ? 'bg-emerald-400/15 text-emerald-300' :
    status === 'selected' ? 'bg-volt-400/15 text-volt-300' :
    meta.accent;

  return (
    <div
      className={clsx(
        "group relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-200",
        status === 'committed'
          ? "border-emerald-400/30 bg-court-850"
          : status === 'selected'
            ? "border-volt-400/50 bg-court-850 ring-1 ring-volt-400/30"
            : "border-white/10 bg-court-900/70 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg hover:shadow-black/30",
        isMuted && "opacity-50 hover:translate-y-0 hover:shadow-none"
      )}
    >
      {/* Accent rail along the top edge to brand each state */}
      <div
        className={clsx(
          "h-1 w-full",
          status === 'committed' ? "bg-emerald-400" :
          status === 'selected' ? "bg-volt-400" :
          isMuted ? "bg-white/10" : "bg-volt-400/40 group-hover:bg-volt-400 transition-colors"
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
            <h3 className="truncate font-display text-lg tracking-wide leading-tight text-court-100">{category.name}</h3>
            <p className="mt-0.5 text-xs font-medium text-court-400">{isMuted ? 'Unavailable' : meta.subtitle}</p>
          </div>
        </div>
        {status === 'committed' ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
            <CheckCircle className="h-3.5 w-3.5" /> Confirmed
          </span>
        ) : status === 'selected' ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-volt-400 px-2 py-0.5 text-[11px] font-semibold text-court-950">
            <Check className="h-3.5 w-3.5" strokeWidth={3} /> Selected
          </span>
        ) : isMuted ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-court-400">
            <Lock className="h-3 w-3" /> Locked
          </span>
        ) : (
          <span className="h-6 w-6 shrink-0 rounded-full border-2 border-dashed border-white/15 transition-colors group-hover:border-volt-400/50" aria-hidden="true" />
        )}
      </div>

      <div className="space-y-3">
        {isDoubles && status === 'committed' && (partnerName || partnerAlias || partnerPhone) && (
          <div className="space-y-1 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-court-300">
            <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-emerald-300"><Users className="h-3.5 w-3.5" /> Partner Details</p>
            {partnerName && <p><span className="font-medium text-court-200">Name:</span> {partnerName}</p>}
            {partnerAlias && <p><span className="font-medium text-court-200">Alias:</span> {partnerAlias}</p>}
            {partnerPhone && <p><span className="font-medium text-court-200">Phone:</span> {partnerPhone}</p>}
            {partnerTShirtSize && <p><span className="font-medium text-court-200">Size:</span> {partnerTShirtSize}</p>}
          </div>
        )}

        {isDoubles && status === 'selected' && (
          <div className="space-y-2 rounded-xl border border-volt-400/20 bg-court-900/60 p-3">
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
              <div className={adminManual ? 'rounded-lg border border-amber-400/25 bg-amber-400/10 p-3' : 'pt-1'}>
                <button
                  type="button"
                  onClick={toggleAdminManual}
                  aria-expanded={adminManual}
                  className="flex items-center gap-1 rounded text-[11px] font-medium text-amber-300 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                >
                  <Settings className="h-3 w-3" />
                  {adminManual ? 'Use member search instead' : 'Add an unregistered partner manually'}
                </button>

                {adminManual && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-amber-300">
                      Admin override — unverified partner
                    </p>
                    <div>
                      <label className="text-xs font-medium text-court-400 uppercase">Partner Name</label>
                      <input
                        type="text"
                        placeholder="e.g., Jane Doe"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-court-900 px-2.5 py-1.5 text-sm text-court-100 placeholder-court-500 transition-colors focus:border-volt-400 focus:outline-none focus:ring-1 focus:ring-volt-400"
                        value={partnerName || ''}
                        onChange={(e) => onNameChange?.(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-court-400 uppercase">Partner Alias</label>
                      <input
                        type="text"
                        placeholder="e.g., janedoe"
                        className={clsx(
                          'mt-1 w-full rounded-lg border bg-court-900 px-2.5 py-1.5 text-sm text-court-100 placeholder-court-500 transition-colors focus:outline-none focus:ring-1',
                          partnerAliasWarning
                            ? 'border-red-400/60 focus:border-red-400 focus:ring-red-400'
                            : 'border-white/10 focus:border-volt-400 focus:ring-volt-400'
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
                        <p className="mt-0.5 text-[10px] text-red-300 font-medium">Only letters and numbers allowed.</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-court-400 uppercase">Partner Phone (Optional)</label>
                      <input
                        type="tel"
                        placeholder="e.g., 9876543210"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-court-900 px-2.5 py-1.5 text-sm text-court-100 placeholder-court-500 transition-colors focus:border-volt-400 focus:outline-none focus:ring-1 focus:ring-volt-400"
                        value={partnerPhone || ''}
                        onChange={(e) => onPhoneChange?.(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                        maxLength={10}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-court-400 uppercase">Partner T-Shirt Size (Optional)</label>
                      <select
                        className="mt-1 w-full rounded-lg border border-white/10 bg-court-900 px-2.5 py-1.5 text-sm text-court-100 transition-colors focus:border-volt-400 focus:outline-none focus:ring-1 focus:ring-volt-400"
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
                      <p role="alert" className="text-[11px] font-medium text-red-300">{partnerError}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {status === 'committed' ? (
          <div className="flex items-center justify-between border-t border-emerald-400/15 pt-3 text-sm font-medium text-emerald-300">
            <span className="flex items-center gap-1"><CheckCircle className="h-4 w-4" /> Locked in</span>
            {canWithdraw && onWithdraw && (
              <button
                onClick={() => onWithdraw(category.id)}
                className="rounded text-xs font-medium text-red-400 hover:text-red-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
              >
                Withdraw
              </button>
            )}
          </div>
        ) : status === 'selected' ? (
           <button
             onClick={() => onDeselect(category.id)}
             className="flex w-full items-center justify-center rounded-lg border border-red-400/30 bg-transparent py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
           >
             Deselect
           </button>
        ) : (
          <button
            onClick={handleSelect}
            disabled={disabled}
            aria-label={disabled ? `${category.name} unavailable` : `Select ${category.name}`}
            className={clsx("notch flex w-full items-center justify-center gap-2 py-2 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2",
              disabled
                ? "cursor-not-allowed bg-white/5 text-court-500"
                : "bg-volt-400 text-court-950 hover:bg-volt-300 focus-visible:ring-volt-300"
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

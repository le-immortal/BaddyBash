'use client';
import { useState } from 'react';
import { Category } from '../lib/models';
import {
  CheckCircle,
  Plus,
  User,
  Users,
  UsersRound,
  Lock,
  Check,
  Settings,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
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

const CATEGORY_META: Record<Category, { Icon: LucideIcon; lane: string; accent: string; glow: string; surface: string }> = {
  MS: {
    Icon: User,
    lane: 'Solo lane',
    accent: 'from-cyan-300 to-blue-300',
    glow: 'shadow-cyan-500/30',
    surface: 'bg-cyan-950/45',
  },
  WS: {
    Icon: User,
    lane: 'Solo lane',
    accent: 'from-rose-300 to-pink-300',
    glow: 'shadow-rose-500/30',
    surface: 'bg-rose-950/35',
  },
  MD: {
    Icon: Users,
    lane: 'Doubles lane',
    accent: 'from-indigo-300 to-sky-300',
    glow: 'shadow-indigo-500/30',
    surface: 'bg-indigo-950/35',
  },
  WD: {
    Icon: Users,
    lane: 'Doubles lane',
    accent: 'from-fuchsia-300 to-purple-300',
    glow: 'shadow-fuchsia-500/30',
    surface: 'bg-fuchsia-950/35',
  },
  XD: {
    Icon: UsersRound,
    lane: 'Mixed doubles lane',
    accent: 'from-amber-200 to-emerald-200',
    glow: 'shadow-emerald-500/30',
    surface: 'bg-emerald-950/35',
  },
};

const T_SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

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
  onWithdraw,
}: RegistrationCardProps) {
  const isDoubles = category.id !== 'MS' && category.id !== 'WS';
  const [partnerAliasWarning, setPartnerAliasWarning] = useState(false);
  const [adminManual, setAdminManual] = useState(false);

  const meta = CATEGORY_META[category.id];
  const CategoryIcon = meta.Icon;
  const isLocked = status === 'available' && disabled;
  const isActive = status === 'selected' || status === 'committed';
  const actionLabel = isLocked
    ? `${category.name} lane unavailable`
    : status === 'available'
      ? `Claim ${category.name} lane`
      : `${category.name} lane ${status === 'committed' ? 'locked in' : 'selected'}`;

  const handleLaneClick = () => {
    if (status === 'available' && !disabled) onSelect(category.id);
  };

  const toggleAdminManual = () => {
    const next = !adminManual;
    setAdminManual(next);
    onAdminManualModeChange?.(next);
  };

  return (
    <article
      className={clsx(
        'group relative flex min-h-full flex-col overflow-hidden rounded-[1.35rem] border p-1 text-white shadow-xl transition-all duration-300',
        status === 'committed'
          ? 'border-emerald-200/80 bg-emerald-400/25 shadow-emerald-500/30 ring-2 ring-emerald-200/70'
          : status === 'selected'
            ? 'border-sky-200/80 bg-sky-400/20 shadow-sky-500/25 ring-2 ring-sky-200/60'
            : isLocked
              ? 'border-white/15 bg-slate-900/55 opacity-75'
              : 'border-white/25 bg-white/10 hover:-translate-y-1 hover:border-white/50 hover:shadow-2xl',
        isActive && meta.glow,
      )}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className={clsx('absolute inset-0 opacity-75', meta.surface)} />
        <div className="absolute inset-x-4 top-1/2 h-px bg-white/55" />
        <div className="absolute inset-y-4 left-1/2 w-px bg-white/45" />
        <div className="absolute inset-3 rounded-[1rem] border border-white/35" />
        {isDoubles && <div className="absolute inset-y-3 left-1/2 w-3 -translate-x-1/2 rounded-full bg-white/10" />}
        {isActive && <div className={clsx('absolute inset-x-4 bottom-3 h-1 rounded-full bg-gradient-to-r', meta.accent)} />}
      </div>

      <div className="relative flex flex-1 flex-col rounded-[1.1rem] bg-slate-950/35 p-4 backdrop-blur-sm">
        <button
          type="button"
          onClick={handleLaneClick}
          disabled={isLocked || status !== 'available'}
          aria-pressed={isActive}
          aria-disabled={isLocked || status !== 'available'}
          aria-label={actionLabel}
          className={clsx(
            'flex w-full items-start justify-between gap-3 rounded-2xl border border-white/15 bg-white/10 p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-950',
            status === 'available' && !disabled && 'hover:bg-white/20',
            (isLocked || status !== 'available') && 'cursor-default',
          )}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-slate-950 shadow-lg', meta.accent)}>
              <CategoryIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-black tracking-tight text-white">{category.name}</span>
              <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.18em] text-white/75">{meta.lane}</span>
            </span>
          </span>

          <span
            className={clsx(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide',
              status === 'committed'
                ? 'bg-emerald-200 text-emerald-950'
                : status === 'selected'
                  ? 'bg-sky-200 text-sky-950'
                  : isLocked
                    ? 'bg-slate-700 text-slate-200'
                    : 'bg-white text-emerald-950',
            )}
          >
            {status === 'committed' ? <CheckCircle className="h-3.5 w-3.5" /> : null}
            {status === 'selected' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
            {isLocked ? <Lock className="h-3.5 w-3.5" /> : null}
            {status === 'available' && !isLocked ? <Plus className="h-3.5 w-3.5" /> : null}
            {status === 'committed' ? 'Locked in' : status === 'selected' ? 'Claimed' : isLocked ? 'Locked' : 'Claim'}
          </span>
        </button>

        <div className="mt-4 flex flex-1 flex-col gap-3">
          {isDoubles && (
            <div className="grid grid-cols-2 gap-2" aria-label={`${category.name} doubles slots`}>
              <div className="rounded-xl border border-white/20 bg-white/10 p-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/60">Slot 1</p>
                <p className="mt-1 text-sm font-bold text-white">You</p>
              </div>
              <div className={clsx('rounded-xl border p-2', partnerName || partnerAlias ? 'border-emerald-200/60 bg-emerald-200/15' : 'border-dashed border-white/25 bg-white/5')}>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/60">Slot 2</p>
                <p className="mt-1 truncate text-sm font-bold text-white">{partnerName || partnerAlias || 'Partner needed'}</p>
              </div>
            </div>
          )}

          {isDoubles && status === 'committed' && (partnerName || partnerAlias || partnerPhone || partnerTShirtSize) && (
            <div className="space-y-1 rounded-2xl border border-emerald-200/40 bg-emerald-950/40 p-3 text-sm text-emerald-50">
              <p className="mb-1.5 flex items-center gap-1 text-xs font-black uppercase tracking-wide text-emerald-100">
                <Users className="h-3.5 w-3.5" /> Partner details
              </p>
              {partnerName && <p><span className="font-semibold text-white">Name:</span> {partnerName}</p>}
              {partnerAlias && <p><span className="font-semibold text-white">Alias:</span> {partnerAlias}</p>}
              {partnerPhone && <p><span className="font-semibold text-white">Phone:</span> {partnerPhone}</p>}
              {partnerTShirtSize && <p><span className="font-semibold text-white">Size:</span> {partnerTShirtSize}</p>}
            </div>
          )}

          {isDoubles && status === 'selected' && (
            <div className="space-y-2 rounded-2xl border border-sky-100/70 bg-white p-3 text-slate-900 shadow-lg">
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
                              : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100',
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
                          <p className="mt-0.5 text-[10px] font-medium text-red-500">Only letters and numbers allowed.</p>
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
                          {T_SHIRT_SIZES.map((size) => (
                            <option key={size} value={size}>{size}</option>
                          ))}
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

          <div className="mt-auto pt-1">
            {status === 'committed' ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200/40 bg-emerald-300/20 px-3 py-2 text-sm font-bold text-emerald-50">
                <span className="flex items-center gap-1"><Sparkles className="h-4 w-4" /> Championship lane</span>
                {canWithdraw && onWithdraw && (
                  <button
                    type="button"
                    onClick={() => onWithdraw(category.id)}
                    className="rounded-md bg-white px-2.5 py-1 text-xs font-black text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            ) : status === 'selected' ? (
              <button
                type="button"
                onClick={() => onDeselect(category.id)}
                className="flex w-full items-center justify-center rounded-2xl border border-red-200 bg-white py-2 text-sm font-black text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              >
                Deselect lane
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLaneClick}
                disabled={disabled}
                aria-label={disabled ? `${category.name} unavailable` : `Select ${category.name}`}
                className={clsx(
                  'flex w-full items-center justify-center gap-2 rounded-2xl py-2 text-sm font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-950',
                  disabled
                    ? 'cursor-not-allowed bg-slate-800 text-slate-300'
                    : 'bg-white text-emerald-950 shadow-lg hover:bg-emerald-50',
                )}
              >
                {disabled ? (
                  <><Lock className="h-3.5 w-3.5" /><span>Lane unavailable</span></>
                ) : (
                  <><Plus className="h-4 w-4" /><span>Claim this lane</span></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

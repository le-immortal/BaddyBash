'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Search, Loader2, X, Check, Copy, UserSearch } from 'lucide-react';
import clsx from 'clsx';

export interface PartnerOption {
  alias: string;
  name: string;
  profileComplete: boolean;
}

interface PartnerPickerProps {
  /** Currently selected partner (verified member) or null. */
  selected: PartnerOption | null;
  onSelect: (partner: PartnerOption) => void;
  onClear: () => void;
  /** Inline error surfaced from the registration POST (e.g. PARTNER_NOT_FOUND). */
  submitError?: string;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

function initialsOf(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PartnerPicker({
  selected,
  onSelect,
  onClear,
  submitError,
}: PartnerPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PartnerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [inviteCopied, setInviteCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-option-${i}`;

  // Debounced search. GUARDRAIL: this effect depends ONLY on `query` and never
  // sets `query`, so it cannot form a render loop. All state updates happen
  // asynchronously inside the debounce timer; `active` guards stale results.
  useEffect(() => {
    const q = query.trim();
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      if (q.length < MIN_CHARS) {
        setResults([]);
        setLoading(false);
        setSearched(false);
        setHighlight(-1);
        return;
      }
      setLoading(true);
      fetch(`/api/users/search?q=${encodeURIComponent(q)}&limit=8`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('search failed'))))
        .then((data: { results?: PartnerOption[] }) => {
          if (!active) return;
          const r = Array.isArray(data.results) ? data.results : [];
          setResults(r);
          setSearched(true);
          setHighlight(r.length ? 0 : -1);
        })
        .catch(() => {
          if (!active) return;
          setResults([]);
          setSearched(true);
          setHighlight(-1);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const handleSelect = (partner: PartnerOption) => {
    onSelect(partner);
    setQuery('');
    setResults([]);
    setOpen(false);
    setSearched(false);
    setHighlight(-1);
  };

  const handleClear = () => {
    onClear();
    setQuery('');
    setResults([]);
    setSearched(false);
    setHighlight(-1);
    // Return focus to the search field for keyboard users.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length === 0) return;
      setOpen(true);
      setHighlight((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length === 0) return;
      setOpen(true);
      setHighlight((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      if (open && highlight >= 0 && highlight < results.length) {
        e.preventDefault();
        handleSelect(results[highlight]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  };

  const copyInvite = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const invite = `Sign in to BaddyBash once at ${origin} so I can pick you as my partner for the tournament!`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(invite).then(
        () => {
          setInviteCopied(true);
          setTimeout(() => setInviteCopied(false), 2500);
        },
        () => {},
      );
    }
  };

  // ---- Selected (verified member) state ----
  if (selected) {
    const fromAlias = selected.name.trim().toLowerCase() === selected.alias.trim().toLowerCase();
    return (
      <div>
        <label className="text-xs font-medium text-slate-500 uppercase">Partner</label>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            {initialsOf(selected.name || selected.alias)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-sm font-semibold text-slate-800">
              {selected.name || selected.alias}
              {fromAlias && (
                <span className="rounded bg-slate-200 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">
                  from alias
                </span>
              )}
            </p>
            <p className="flex items-center gap-1 truncate text-xs text-slate-500">
              <Check className="h-3 w-3 text-green-600" strokeWidth={3} /> Verified member · @{selected.alias}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClear}
            aria-label="Remove selected partner"
            className="shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-white hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {fromAlias && (
          <p className="mt-1 text-[10px] text-slate-400">
            This partner hasn&apos;t completed their profile yet — they can fill in their details after signing in. You can still register.
          </p>
        )}
        {submitError && (
          <p role="alert" className="mt-1 text-[11px] font-medium text-red-600">{submitError}</p>
        )}
      </div>
    );
  }

  // ---- Search / combobox state ----
  const q = query.trim();
  const showListbox = open && q.length >= MIN_CHARS;
  const showNoMatch = showListbox && !loading && searched && results.length === 0;

  let statusMessage = '';
  if (q.length > 0 && q.length < MIN_CHARS) statusMessage = 'Type at least 2 characters to search.';
  else if (loading) statusMessage = 'Searching…';
  else if (searched && results.length > 0) statusMessage = `${results.length} result${results.length === 1 ? '' : 's'} available.`;
  else if (showNoMatch) statusMessage = 'No matching members found.';

  return (
    <div>
      <label htmlFor={`${baseId}-input`} className="text-xs font-medium text-slate-500 uppercase">
        Partner
      </label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          id={`${baseId}-input`}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showListbox}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={showListbox && highlight >= 0 ? optionId(highlight) : undefined}
          autoComplete="off"
          placeholder="Search members by name or alias"
          className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-8 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (q.length >= MIN_CHARS) setOpen(true);
          }}
          onBlur={() => {
            // Delay so option mousedown/click registers before close.
            setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={handleKeyDown}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-500" aria-hidden="true" />
        )}

        {showListbox && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Matching members"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {loading && (
              <>
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex items-center gap-2 px-2.5 py-2" aria-hidden="true">
                    <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-slate-200" />
                    <div className="flex-1 space-y-1">
                      <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-200" />
                      <div className="h-2 w-1/3 animate-pulse rounded bg-slate-100" />
                    </div>
                  </li>
                ))}
              </>
            )}

            {!loading && results.map((r, i) => (
              <li
                key={r.alias}
                id={optionId(i)}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => handleSelect(r)}
                className={clsx(
                  'flex cursor-pointer items-center gap-2 px-2.5 py-2',
                  i === highlight ? 'bg-blue-50' : 'bg-white',
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600">
                  {initialsOf(r.name || r.alias)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{r.name || r.alias}</p>
                  <p className="truncate text-xs text-slate-500">@{r.alias}</p>
                </div>
              </li>
            ))}

            {showNoMatch && (
              <li className="px-2.5 py-2" role="presentation">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  <p className="flex items-start gap-1.5 font-medium">
                    <UserSearch className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      We couldn&apos;t find &ldquo;{q}&rdquo;. Your partner needs to sign in to BaddyBash once before you can pick them.
                    </span>
                  </p>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={copyInvite}
                    className="mt-2 inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                  >
                    {inviteCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {inviteCopied ? 'Invite copied' : 'Copy invite'}
                  </button>
                </div>
              </li>
            )}
          </ul>
        )}
      </div>

      {q.length > 0 && q.length < MIN_CHARS && (
        <p className="mt-1 text-[10px] text-slate-400">Type at least {MIN_CHARS} characters to search.</p>
      )}

      {submitError && (
        <p role="alert" className="mt-1 text-[11px] font-medium text-red-600">{submitError}</p>
      )}

      {/* Screen-reader live status for result counts and states. */}
      <span className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </span>
    </div>
  );
}

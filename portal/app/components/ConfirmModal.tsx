'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Accessible confirmation dialog that replaces native `confirm()`. Traps focus,
 * closes on Escape / backdrop click, and restores focus to the previously active
 * element on close. Ported from the admin dashboard's modal pattern.
 */
export default function ConfirmModal({
  open,
  title,
  lines,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  lines: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget = () => {
      const nextFocus =
        panelRef.current?.querySelector<HTMLElement>(MODAL_FOCUSABLE_SELECTOR) ||
        panelRef.current;
      nextFocus?.focus();
    };

    const frame = window.requestAnimationFrame(focusTarget);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR);
      if (!focusable || focusable.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const confirmClasses = tone === 'danger'
    ? 'bg-red-500 text-white hover:bg-red-400'
    : 'notch bg-volt-400 text-court-950 hover:bg-volt-300';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-court-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-court-850 text-court-100 shadow-2xl shadow-black/50"
      >
        <div className="border-b border-white/5 px-6 py-5">
          <h2 id="confirm-modal-title" className="font-display text-2xl tracking-wide text-court-100">
            {title}
          </h2>
          <div className="mt-2 space-y-1 text-sm leading-6 text-court-300">
            {lines.map((line, index) => (
              <p key={index} className={line.startsWith(' ') || /→/.test(line) ? 'font-medium text-court-100' : ''}>
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-court-300 transition hover:bg-white/5 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition disabled:opacity-60 ${confirmClasses}`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

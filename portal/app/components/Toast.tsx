'use client';

import { useCallback, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';

export type ToastTone = 'success' | 'error';

export type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
};

function createId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Toast notifications that replace native `alert()`. Success toasts auto-dismiss
 * after 4s; error toasts persist until dismissed so the user can read them.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutsRef = useRef<Record<string, number>>({});

  const dismissToast = useCallback((id: string) => {
    const timeoutId = timeoutsRef.current[id];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete timeoutsRef.current[id];
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = 'error') => {
    const id = createId();
    setToasts((current) => [...current, { id, message, tone }]);

    if (tone === 'success') {
      timeoutsRef.current[id] = window.setTimeout(() => {
        dismissToast(id);
      }, 4000);
    }
  }, [dismissToast]);

  return { toasts, showToast, dismissToast };
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => {
        const toneClasses = toast.tone === 'success'
          ? 'border-emerald-500/40 bg-emerald-950/95 text-emerald-50'
          : 'border-red-500/40 bg-red-950/95 text-red-50';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl transition-all duration-200 ${toneClasses}`}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
          >
            {toast.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            ) : (
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
            )}
            <p className="flex-1 text-sm leading-6">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-full p-1 text-current/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

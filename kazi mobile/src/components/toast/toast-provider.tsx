import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { Toast, type ToastAction, type ToastTone } from './toast';
import { setToastHandler } from './toast-bridge';

interface ToastOptions {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  durationMs?: number;
}

interface ToastContextValue {
  show: (options: ToastOptions) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastOptions | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setCurrent(null);
  }, []);

  const show = useCallback((options: ToastOptions) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setCurrent(options);
    timeoutRef.current = setTimeout(() => setCurrent(null), options.durationMs ?? 4000);
  }, []);

  // Let non-component code (the query client's global error handler) raise a
  // toast. Registered here rather than exported so it can never outlive the tree.
  useEffect(() => {
    setToastHandler(show);
    return () => setToastHandler(null);
  }, [show]);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      {current ? (
        <Toast
          message={current.message}
          tone={current.tone}
          action={
            current.action
              ? {
                  label: current.action.label,
                  onPress: () => {
                    current.action?.onPress();
                    dismiss();
                  },
                }
              : undefined
          }
        />
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

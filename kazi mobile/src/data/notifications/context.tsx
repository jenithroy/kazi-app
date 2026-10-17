import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/auth/auth-context';

import { markOneRead, markRead, subscribeNotifications } from './supabase';
import type { NotificationRecord } from './types';

interface NotificationsValue {
  records: NotificationRecord[];
  loading: boolean;
  error: boolean;
  unreadCount: number;
  markAllRead: () => void;
  markReadById: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

/** The last thing the listener said, plus the account it said it about. */
interface Snapshot {
  email: string;
  records: NotificationRecord[];
  loading: boolean;
  error: boolean;
}

const EMPTY: Snapshot = { email: '', records: [], loading: false, error: false };

/**
 * Holds the single `mobile_notifications` snapshot for the signed-in user, so
 * the bell badge and the Notifications screen share one listener. Mounted once,
 * inside `AuthProvider`.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const email = profile?.email ?? '';

  // The snapshot carries the email it belongs to, so a sign-in or sign-out is
  // handled by ignoring the stale snapshot during render rather than by
  // clearing state from the effect.
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const fresh = snapshot.email === email;

  const records = fresh ? snapshot.records : EMPTY.records;
  const loading = fresh ? snapshot.loading : Boolean(email);
  const error = fresh ? snapshot.error : false;

  useEffect(() => {
    if (!email) return;
    const unsub = subscribeNotifications(
      email,
      (recs) => setSnapshot({ email, records: recs, loading: false, error: false }),
      () => setSnapshot({ email, records: [], loading: false, error: true }),
    );
    return unsub;
  }, [email]);

  const unreadCount = useMemo(() => records.reduce((n, r) => (r.read ? n : n + 1), 0), [records]);

  const markAllRead = useCallback(() => {
    setSnapshot((prev) => {
      const ids = prev.records.filter((r) => !r.read).map((r) => r.id);
      if (!ids.length) return prev;
      void markRead(ids);
      return { ...prev, records: prev.records.map((r) => (r.read ? r : { ...r, read: true })) };
    });
  }, []);

  const markReadById = useCallback((id: string) => {
    setSnapshot((prev) => ({ ...prev, records: prev.records.map((r) => (r.id === id ? { ...r, read: true } : r)) }));
    void markOneRead(id);
  }, []);

  const value = useMemo<NotificationsValue>(
    () => ({ records, loading, error, unreadCount, markAllRead, markReadById }),
    [records, loading, error, unreadCount, markAllRead, markReadById],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
}

export function useUnreadCount(): number {
  return useNotifications().unreadCount;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setChatIdentity } from '@/data/chat/identity';
import { setActor } from '@/data/notifications/actor';

import * as mockAuth from './mock-auth';
import type { Session } from './mock-auth';
import * as realAuth from './real-auth';
import { isRealAuthConfigured } from './real-auth';
import {
  financeTabAllowed,
  messengerTabAllowed,
  messengerTabCanEdit,
  payrollVisible,
  sectionCanEdit,
  sectionVisible,
  type FinanceTabId,
  type MessengerTabId,
  type Profile,
  type SectionId,
} from './permissions';
import type { Role } from './roles';

interface AuthContextValue {
  session: Session | null;
  /** RBAC view of the session (reference `profile`). Null when signed out. */
  profile: Profile | null;
  role: Role | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Dev-only role switch (no real auth yet) — see More › Role. */
  setDevRole: (role: Role) => Promise<void>;
  /** Section shown in nav for the current profile. */
  canView: (section: SectionId) => boolean;
  /** Current profile may create/edit/delete in this section. */
  can: (section: SectionId) => boolean;
  /** One Finance sub-tab is available. */
  financeTab: (tab: FinanceTabId) => boolean;
  /** Payroll — salaries, deductions, slips — is visible to this profile. */
  canViewPayroll: boolean;
  /** May this profile read this Messenger tab (Leads)? */
  messengerTab: (tab: MessengerTabId) => boolean;
  /** May this profile reply, attach or take over on this Messenger tab? */
  messengerTabEdit: (tab: MessengerTabId) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Real auth (Supabase session) when configured; the in-memory mock otherwise. */
const impl = isRealAuthConfigured ? realAuth : mockAuth;

function toProfile(session: Session | null): Profile | null {
  if (!session) return null;
  return {
    email: session.email,
    name: session.name,
    initials: session.initials,
    role: session.appRole,
    jobRole: session.jobRole ?? session.role,
    positionId: session.positionId,
    personId: session.personId,
    permissions: session.permissions,
    uid: session.uid,
    location: session.location,
    status: session.status,
    createdAt: session.createdAt,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isRealAuthConfigured) {
      // Fires once on cold start (after both backends have restored whatever
      // they had persisted) and on every sign-in / sign-out thereafter.
      return realAuth.subscribe((s) => {
        setSession(s);
        setIsLoading(false);
      });
    }
    mockAuth.getSession().then((s) => {
      setSession(s);
      setIsLoading(false);
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // Mock returns the Session directly; Firebase delivers it via the subscription.
    const next = await impl.signIn(email, password);
    if (next) setSession(next);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    await impl.requestPasswordReset(email);
  }, []);

  const signOut = useCallback(async () => {
    await impl.signOut();
    setSession(null);
  }, []);

  const setDevRole = useCallback(async (role: Role) => {
    const next = await impl.setDevRole(role);
    if (next) setSession(next);
  }, []);

  // Keep the notifications module's "who am I" in sync so mutation hooks can
  // attribute events without prop-drilling the current user.
  useEffect(() => {
    setActor(session ? { name: session.name, email: session.email, role: session.appRole, uid: session.uid, personId: session.personId } : null);
  }, [session]);

  // Chat resolves "me" and "them" from a module-level registry rather than
  // props (see `data/chat/identity.ts`); this is the one write of the "me"
  // half. Signing out clears it, so a second account on the same device never
  // inherits the first one's id.
  useEffect(() => {
    setChatIdentity(session?.personId ?? null, session ? {
      id: session.personId ?? 'me',
      name: session.name,
      role: session.jobRole ?? session.role,
      initials: session.initials,
      avatarTint: 'dark',
      online: true,
      status: 'You',
      email: session.email,
    } : null);
  }, [session]);

  const profile = useMemo(() => toProfile(session), [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      role: profile?.role ?? null,
      isLoading,
      signIn,
      requestPasswordReset,
      signOut,
      setDevRole,
      canView: (section) => sectionVisible(profile, section),
      can: (section) => sectionCanEdit(profile, section),
      financeTab: (tab) => financeTabAllowed(profile, tab),
      canViewPayroll: payrollVisible(profile),
      messengerTab: (tab) => messengerTabAllowed(profile, tab),
      messengerTabEdit: (tab) => messengerTabCanEdit(profile, tab),
    }),
    [session, profile, isLoading, signIn, requestPasswordReset, signOut, setDevRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

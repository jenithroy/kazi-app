import { useCallback, useState } from 'react';

import { useAuth } from '@/auth/auth-context';
import { isRealAuthConfigured } from '@/auth/real-auth';

export type LoginView = 'signin' | 'forgot' | 'sent';

/** Only used on the mock-auth path, where any email is accepted. */
const DEV_FALLBACK_EMAIL = 'sita@kazi.com.np';

/**
 * Supabase Auth reports failures as an `AuthApiError.code`. The copy is
 * deliberately vague about which half was wrong — "Incorrect email or password"
 * for both a missing account and a bad password — so the login screen can't be
 * used to find out which addresses have accounts.
 */
function messageForError(err: unknown): string {
  const code =
    typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
  const name = typeof err === 'object' && err && 'name' in err ? String((err as { name: unknown }).name) : '';
  if (name === 'AuthRetryableFetchError') {
    return 'Network error — check your connection and try again.';
  }
  switch (code) {
    case 'validation_failed':
      return 'That doesn’t look like a valid email address.';
    case 'user_banned':
      return 'This account has been disabled. Contact your administrator.';
    case 'invalid_credentials':
    case 'user_not_found':
      return 'Incorrect email or password. Please try again.';
    case 'email_not_confirmed':
      return 'Confirm your email address first — check your inbox.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts — wait a few minutes and try again.';
    default:
      return 'Could not sign in. Please try again.';
  }
}

/** Ports the prototype's signin/forgot/sent state machine onto real auth calls — Stack.Protected redirects to (app) once signIn() resolves. */
export function useLoginFlow() {
  const { signIn, requestPasswordReset } = useAuth();
  const [view, setView] = useState<LoginView>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedEmail = isRealAuthConfigured ? email.trim() : email.trim() || DEV_FALLBACK_EMAIL;

  const goSignin = useCallback(() => {
    setView('signin');
    setError(null);
  }, []);

  const goForgot = useCallback(() => {
    setView('forgot');
    setError(null);
  }, []);

  const submitSignin = useCallback(async () => {
    if (loading) return;
    if (isRealAuthConfigured && (!resolvedEmail || !password)) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signIn(resolvedEmail, password);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoading(false);
    }
  }, [resolvedEmail, password, loading, signIn]);

  const submitReset = useCallback(async () => {
    if (loading) return;
    if (isRealAuthConfigured && !resolvedEmail) {
      setError('Enter your email address first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(resolvedEmail);
      setView('sent');
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoading(false);
    }
  }, [resolvedEmail, loading, requestPasswordReset]);

  return {
    view,
    email,
    setEmail,
    password,
    setPassword,
    loading,
    error,
    emailShown: resolvedEmail || 'your email',
    goSignin,
    goForgot,
    submitSignin,
    submitReset,
  };
}

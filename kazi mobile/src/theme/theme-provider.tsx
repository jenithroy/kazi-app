import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { themeFor, type Theme } from './index';

/** What the user picked in Settings. `system` follows the OS, which is the default. */
export type ThemeMode = 'system' | 'light' | 'dark';

// Namespaced key — a UI preference, not credentials. Safe in AsyncStorage,
// same as `kazi-primary-currency`.
const THEME_MODE_KEY = 'kazi-theme-mode';

interface ThemeModeValue {
  /** The user's choice, including `system`. */
  mode: ThemeMode;
  /** The scheme actually painting right now, with `system` already resolved. */
  scheme: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<Theme | null>(null);
const ThemeModeContext = createContext<ThemeModeValue | null>(null);

function isThemeMode(raw: unknown): raw is ThemeMode {
  return raw === 'system' || raw === 'light' || raw === 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Starts on `system` and corrects once storage answers. No gate on the read:
  // the OS scheme is the right first paint for everyone who never opened
  // Settings, and fonts already hold the splash screen up longer than this.
  useEffect(() => {
    AsyncStorage.getItem(THEME_MODE_KEY)
      .then((raw) => {
        if (isThemeMode(raw)) setModeState(raw);
      })
      .catch(() => {});
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(THEME_MODE_KEY, next);
  }, []);

  const scheme: 'light' | 'dark' = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const theme = useMemo(() => themeFor(scheme), [scheme]);
  const modeValue = useMemo<ThemeModeValue>(() => ({ mode, scheme, setMode }), [mode, scheme, setMode]);

  return (
    <ThemeModeContext.Provider value={modeValue}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </ThemeModeContext.Provider>
  );
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return theme;
}

/** The light/dark preference itself — only Settings and the status bar need this; everything else wants `useTheme()`. */
export function useThemeMode(): ThemeModeValue {
  const value = useContext(ThemeModeContext);
  if (!value) {
    throw new Error('useThemeMode must be used within a ThemeProvider');
  }
  return value;
}

import { Segmented, type SegmentedOption } from '@/components/ui/segmented';
import { useThemeMode, type ThemeMode } from '@/theme/theme-provider';

import { SettingRow } from './setting-row';

const OPTIONS: SegmentedOption<ThemeMode>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const META: Record<ThemeMode, string> = {
  system: 'Follows your phone — switches with its light/dark schedule',
  light: 'Always light, whatever the phone is set to',
  dark: 'Always dark, whatever the phone is set to',
};

/** Light/dark for the whole app. `System` is the default and the one most people should stay on. */
export function AppearanceCard() {
  const { mode, setMode } = useThemeMode();

  return (
    <SettingRow label="Appearance" meta={META[mode]}>
      <Segmented options={OPTIONS} value={mode} onChange={setMode} fill />
    </SettingRow>
  );
}

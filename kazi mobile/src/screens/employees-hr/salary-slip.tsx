import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { fontFamily } from '@/theme';
import { buildSalarySlipHtml, type SalarySlipData } from '@/lib/pdf/salary-slip-template';

export type { SalarySlipData } from '@/lib/pdf/salary-slip-template';

export interface SalarySlipProps {
  visible: boolean;
  slip: SalarySlipData | null;
  meta: string;
  onClose: () => void;
  onShare: () => void;
  busy?: boolean;
}

/**
 * The slip exactly as the website prints it: the same HTML in a WebView,
 * pinch-zoomable, on the same dark document ground. Because the viewer and
 * `expo-print` are fed by one builder, what is on screen is what gets shared.
 */
export function SalarySlip({ visible, slip, meta, onClose, onShare, busy = false }: SalarySlipProps) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  // Pure derived data — the sheet is rebuilt only when the slip or the measured
  // width changes, so the WebView is not handed a new `source` every render.
  const html = useMemo(
    () => (slip && width ? buildSalarySlipHtml(slip, { forScreen: true, screenScale: (width - 24) / 840 }) : null),
    [slip, width],
  );

  if (!visible || !slip) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {slip.fileName}
            </Text>
            <Text style={styles.headerMeta}>{meta}</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton} accessibilityLabel="Close">
            <Icon name="x" size={16} color="#E9F1EC" />
          </Pressable>
        </View>

        <View style={styles.paperGround} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          {html ? (
            <WebView
              originWhitelist={['*']}
              source={{ html }}
              style={styles.webview}
              scalesPageToFit
              setBuiltInZoomControls
              setDisplayZoomControls={false}
              showsHorizontalScrollIndicator={false}
              androidLayerType="hardware"
            />
          ) : (
            <View style={styles.loading}>
              <Spinner color="#5FD2A0" trackColor="rgba(233,241,236,0.2)" />
            </View>
          )}
        </View>

        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable onPress={onShare} disabled={busy} style={[styles.shareButton, busy && styles.buttonBusy]}>
            {busy ? (
              <Spinner size={16} color="#08251A" trackColor="rgba(8,37,26,0.25)" />
            ) : (
              <>
                <Icon name="share-2" size={16} color="#08251A" />
                <Text style={styles.shareLabel}>Share as PDF</Text>
              </>
            )}
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F241D' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerTextWrap: { flex: 1, gap: 3, minWidth: 0 },
  headerTitle: { color: '#E9F1EC', fontFamily: fontFamily.semibold, fontSize: 15 },
  headerMeta: { color: 'rgba(233,241,236,0.6)', fontFamily: fontFamily.mono, fontSize: 10.5 },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(233,241,236,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paperGround: { flex: 1, backgroundColor: '#d4e2d4' },
  webview: { flex: 1, backgroundColor: '#d4e2d4' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actionBar: { paddingHorizontal: 18, paddingTop: 12 },
  shareButton: {
    height: 50,
    borderRadius: 15,
    backgroundColor: '#5FD2A0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  buttonBusy: { opacity: 0.7 },
  shareLabel: { color: '#08251A', fontFamily: fontFamily.semibold, fontSize: 15 },
});

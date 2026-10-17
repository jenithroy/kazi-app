import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useToast } from '@/components/toast/toast-provider';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Spinner } from '@/components/ui/spinner';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { buildDocHtml, type DocData, type DocType } from '@/lib/pdf/doc-template';
import { docNumberOf } from '@/lib/pdf/doc-data';
import { generateDocPdf, saveFileToFolder, shareFile, writeDocPng, type DocFormat } from '@/lib/pdf/doc-pdf';
import { html2canvasSource } from '@/lib/pdf/html2canvas';
import { letterheadDataUri } from '@/lib/pdf/letterhead';

export interface DocViewerProps {
  data: DocData;
  docType: DocType;
  title: string;
  subtitle?: string;
  onBack: () => void;
  /** Sticky bar contents — the actions for this document type. */
  actions?: ReactNode;
}

type Intent = 'share' | 'save';

/** PNG capture streams back in chunks — a full-page data URL is megabytes. */
const CAPTURE_JS = `
  html2canvas(document.querySelector('.invoice-page'), {
    scale: 1.5,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    windowWidth: 794,
    windowHeight: 1123,
  }).then(function (canvas) {
    var b64 = canvas.toDataURL('image/png').split(',')[1];
    var size = 262144;
    var post = function (m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
    post({ t: 'png-start' });
    for (var i = 0; i < b64.length; i += size) post({ t: 'png-chunk', d: b64.slice(i, i + size) });
    post({ t: 'png-end' });
  }).catch(function (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'png-error', m: String(e && e.message || e) }));
  });
  true;
`;

/**
 * The document itself, exactly as the website renders and prints it: the same
 * A4 sheet in a WebView, pinch-zoomable, with share/save in the header and the
 * document's actions pinned to the bottom.
 *
 * The same WebView doubles as the PNG rasteriser — html2canvas runs against the
 * page that is already on screen, so the image can never disagree with it.
 */
export function DocViewer({ data, docType, title, subtitle, onBack, actions }: DocViewerProps) {
  const theme = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const chunks = useRef<string[]>([]);
  const [width, setWidth] = useState(0);
  const [html, setHtml] = useState<string | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState<Intent | null>(null);

  // The letterhead is a ~1.4 MB JPEG read off disk, so the sheet is built once
  // per document; the measured width sets the zoom that shows the whole page.
  useEffect(() => {
    if (!width) return;
    let alive = true;
    letterheadDataUri().then((letterhead) => {
      if (alive) {
        setHtml(buildDocHtml(data, docType, { letterhead, forScreen: true, screenScale: (width - 28) / 794 }));
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data), docType, width]);

  const fail = (verb: string, e: unknown) => {
    const detail = e instanceof Error ? e.message : String(e ?? '');
    toast.show({ message: `Could not ${verb} ${docNumberOf(data)} — ${detail || 'unknown error'}`, tone: 'bad' });
  };

  const deliverPdf = async (how: Intent) => {
    setBusy(how);
    try {
      const file = await generateDocPdf(data, docType);
      if (how === 'share') {
        const shared = await shareFile(file, 'pdf');
        if (!shared) toast.show({ message: 'Sharing is not available on this device', tone: 'bad' });
      } else {
        const folder = await saveFileToFolder(file, 'pdf');
        if (folder) toast.show({ message: `${file.name} saved to ${folder}`, tone: 'ok' });
      }
    } catch (e) {
      fail(how === 'share' ? 'share' : 'save', e);
    } finally {
      setBusy(null);
    }
  };

  const startPngCapture = async (how: Intent) => {
    setBusy(how);
    chunks.current = [];
    try {
      const source = await html2canvasSource();
      webRef.current?.injectJavaScript(`${source}\n${CAPTURE_JS}`);
    } catch (e) {
      setBusy(null);
      fail('render', e);
    }
  };

  const deliverPng = async (base64: string) => {
    const how = busy ?? 'share';
    try {
      const file = writeDocPng(data, base64);
      if (how === 'share') {
        const shared = await shareFile(file, 'png');
        if (!shared) toast.show({ message: 'Sharing is not available on this device', tone: 'bad' });
      } else {
        const folder = await saveFileToFolder(file, 'png');
        if (folder) toast.show({ message: `${file.name} saved to ${folder}`, tone: 'ok' });
      }
    } catch (e) {
      fail(how === 'share' ? 'share' : 'save', e);
    } finally {
      setBusy(null);
    }
  };

  const onMessage = (event: WebViewMessageEvent) => {
    let msg: { t?: string; d?: string; m?: string };
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.t === 'png-start') chunks.current = [];
    else if (msg.t === 'png-chunk' && msg.d) chunks.current.push(msg.d);
    else if (msg.t === 'png-end') void deliverPng(chunks.current.join(''));
    else if (msg.t === 'png-error') {
      setBusy(null);
      toast.show({ message: `Could not render the image — ${msg.m ?? 'unknown error'}`, tone: 'bad' });
    }
  };

  const choose = (format: DocFormat) => {
    const how = intent ?? 'share';
    setIntent(null);
    if (format === 'pdf') void deliverPdf(how);
    else void startPngCapture(how);
  };

  const iconButton = [styles.iconButton, { borderColor: theme.border, backgroundColor: theme.surface }];

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        rightSlot={
          <View style={styles.headerRight}>
            <Pressable onPress={() => setIntent('share')} disabled={busy !== null} style={iconButton} accessibilityLabel="Share">
              {busy === 'share' ? (
                <Spinner size={15} color={theme.textPrimary} trackColor={theme.border} />
              ) : (
                <Icon name="share-2" size={15} color={theme.textPrimary} />
              )}
            </Pressable>
            <Pressable onPress={() => setIntent('save')} disabled={busy !== null} style={iconButton} accessibilityLabel="Download">
              {busy === 'save' ? (
                <Spinner size={15} color={theme.textPrimary} trackColor={theme.border} />
              ) : (
                <Icon name="download" size={15} color={theme.textPrimary} />
              )}
            </Pressable>
          </View>
        }
      />

      <View style={[styles.flex, styles.sheetGround]} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {html ? (
          <WebView
            ref={webRef}
            originWhitelist={['*']}
            source={{ html }}
            style={styles.webview}
            onMessage={onMessage}
            // Zoom: the viewport meta opens the sheet fitted to the screen and
            // allows pinching on iOS; these two do the same on Android without
            // pasting zoom buttons over the page.
            scalesPageToFit
            setBuiltInZoomControls
            setDisplayZoomControls={false}
            showsHorizontalScrollIndicator={false}
            androidLayerType="hardware"
          />
        ) : (
          <View style={styles.loading}>
            <Spinner color={theme.accent} trackColor={theme.border} />
          </View>
        )}
      </View>

      {actions ? (
        <View style={[styles.actionBar, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: insets.bottom + 14 }]}>
          {actions}
        </View>
      ) : null}

      <BottomSheet
        visible={intent !== null}
        onClose={() => setIntent(null)}
        title={intent === 'save' ? `Download ${docNumberOf(data)}` : `Share ${docNumberOf(data)}`}
        maxHeight={360}
      >
        <FormatOption
          icon="file-text"
          label="PDF"
          hint="Print-ready A4, exactly as filed"
          onPress={() => choose('pdf')}
        />
        <FormatOption
          icon="image"
          label="PNG image"
          hint="A picture of the page — easiest to send on chat"
          onPress={() => choose('png')}
        />
      </BottomSheet>
    </View>
  );
}

function FormatOption({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: 'file-text' | 'image';
  label: string;
  hint: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.optionIcon, { backgroundColor: theme.accentWash }]}>
        <Icon name={icon} size={18} color={theme.accentWashText} />
      </View>
      <View style={styles.optionText}>
        <Text style={[styles.optionLabel, { color: theme.textPrimary }]}>{label}</Text>
        <Text style={[styles.optionHint, { color: theme.textSecondary }]}>{hint}</Text>
      </View>
      <Icon name="chevron-right" size={16} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheetGround: { backgroundColor: '#d4e2d4' },
  webview: { flex: 1, backgroundColor: '#d4e2d4' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { height: 34, width: 34, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: 16, borderWidth: 1 },
  optionIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, gap: 3 },
  optionLabel: { fontFamily: fontFamily.semibold, fontSize: 15 },
  optionHint: { fontSize: 12, lineHeight: 12 * 1.4 },
});

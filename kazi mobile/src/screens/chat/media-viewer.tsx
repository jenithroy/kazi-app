import { useEffect } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';

import { Icon } from '@/components/ui/icon';
import { fontFamily } from '@/theme';
import { duration as motionDuration, easeOut } from '@/theme/motion';
import type { Attachment } from '@/data/chat/types';
import { fileSize } from '@/data/chat/utils';

/** Zoom bounds. Below 1 the image springs back; above 5 there is nothing left to see. */
const MIN_SCALE = 1;
const MAX_SCALE = 5;
/** Where a double-tap lands when zooming in. */
const TAP_SCALE = 2.5;

export interface MediaViewerProps {
  /** Null closes it. Images open zoomable; videos open playing. */
  attachment: Attachment | null;
  onClose: () => void;
  /** Hands the file to the OS share sheet. */
  onShare?: () => void;
}

/**
 * Full-screen viewer for a photo or a video.
 *
 * Photos are pinch- and double-tap-zoomable. The upload caps the long edge at
 * 1920px, so a phone screen shows most of what there is at 1x — but "most" is
 * not enough when the picture is the evidence: a stitch line, a stain, a batch
 * code written on a label. Panning is only enabled once zoomed in, and the
 * translation is clamped to the scaled bounds, so the image cannot be flung
 * off screen and stranded.
 *
 * Videos play here rather than being handed to the browser. A signed Supabase
 * URL opened externally leaks the link into another app's history and drops
 * the viewer out of the conversation; `expo-video` keeps both inside the app.
 *
 * `GestureHandlerRootView` is repeated inside the modal on purpose — a RN
 * `Modal` renders in its own view hierarchy, which the root one at the app's
 * entry does not reach, and gestures silently do nothing without it.
 */
export function MediaViewer({ attachment, onClose, onShare }: MediaViewerProps) {
  const insets = useSafeAreaInsets();
  const isVideo = attachment?.kind === 'video';

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  /** Set on layout so panning can be clamped to what is actually off screen. */
  const width = useSharedValue(0);
  const height = useSharedValue(0);

  const player = useVideoPlayer(isVideo ? (attachment?.url ?? null) : null, (p) => {
    p.loop = false;
  });

  // Autoplay on open, and stop on close so audio never outlives the viewer.
  useEffect(() => {
    if (!player) return;
    if (isVideo && attachment?.url) player.play();
    else player.pause();
  }, [player, isVideo, attachment?.url]);

  /**
   * Dismiss, returning the zoom to 1:1 so the next photo does not inherit this
   * one's. The reset happens here rather than in an effect keyed on the
   * attachment: an effect that reads these values would freeze them, and the
   * gesture handlers below could then no longer write to them at all.
   */
  const handleClose = () => {
    scale.value = 1;
    savedScale.value = 1;
    x.value = 0;
    y.value = 0;
    savedX.value = 0;
    savedY.value = 0;
    onClose();
  };

  /** How far the image may travel at the current scale before its edge comes inside the frame. */
  const clamp = (value: number, limit: number) => {
    'worklet';
    return Math.min(limit, Math.max(-limit, value));
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_SCALE, Math.max(0.6, savedScale.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value < MIN_SCALE) {
        // Pinching below 1:1 rubber-bands, then settles back to fit.
        scale.value = withTiming(1, { duration: motionDuration.base, easing: easeOut });
        savedScale.value = 1;
        x.value = withTiming(0, { duration: motionDuration.base, easing: easeOut });
        y.value = withTiming(0, { duration: motionDuration.base, easing: easeOut });
        savedX.value = 0;
        savedY.value = 0;
        return;
      }
      savedScale.value = scale.value;
      const limitX = (width.value * (scale.value - 1)) / 2;
      const limitY = (height.value * (scale.value - 1)) / 2;
      x.value = withTiming(clamp(x.value, limitX), { duration: motionDuration.fast, easing: easeOut });
      y.value = withTiming(clamp(y.value, limitY), { duration: motionDuration.fast, easing: easeOut });
      savedX.value = clamp(x.value, limitX);
      savedY.value = clamp(y.value, limitY);
    });

  const pan = Gesture.Pan()
    // Only once there is something to pan to; at 1x the drag belongs to nothing
    // and swallowing it would just make the viewer feel stuck.
    .enabled(!isVideo)
    .averageTouches(true)
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      const limitX = (width.value * (scale.value - 1)) / 2;
      const limitY = (height.value * (scale.value - 1)) / 2;
      x.value = clamp(savedX.value + e.translationX, limitX);
      y.value = clamp(savedY.value + e.translationY, limitY);
    })
    .onEnd(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1, { duration: motionDuration.base, easing: easeOut });
        savedScale.value = 1;
        x.value = withTiming(0, { duration: motionDuration.base, easing: easeOut });
        y.value = withTiming(0, { duration: motionDuration.base, easing: easeOut });
        savedX.value = 0;
        savedY.value = 0;
        return;
      }
      scale.value = withTiming(TAP_SCALE, { duration: motionDuration.base, easing: easeOut });
      savedScale.value = TAP_SCALE;
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      // A tap closes the viewer, but only at rest — while zoomed in it is far
      // more likely to be a missed pan than a request to leave.
      if (scale.value <= 1) runOnJS(handleClose)();
    });

  const gesture = Gesture.Exclusive(
    Gesture.Simultaneous(pinch, pan),
    doubleTap,
    singleTap,
  );

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <Modal visible={!!attachment} transparent animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.root}>
          {isVideo && attachment?.url ? (
            <VideoView
              player={player}
              // Same `alignItems: 'center'` percentage-width trap as the image
              // branch below — without it this has no definite width to be
              // 100% of.
              style={[styles.media, styles.stretch]}
              contentFit="contain"
              nativeControls
              // The viewer is already full-bleed on black, so the extra
              // fullscreen step buys nothing but a rotation lock to escape.
              fullscreenOptions={{ enable: false }}
              allowsPictureInPicture={false}
            />
          ) : attachment?.url ? (
            <GestureDetector gesture={gesture}>
              <Animated.View
                // `root`'s `alignItems: 'center'` (needed to centre the loading
                // spinner below) otherwise leaves this flex:1 view with no
                // definite width, so `media`'s `width: '100%'` has nothing to
                // resolve against and the image collapses to nothing — black
                // screen, no error. `alignSelf: 'stretch'` opts this one view
                // out of that centering without touching the shared style.
                style={[styles.flex, styles.stretch]}
                onLayout={(e) => {
                  width.value = e.nativeEvent.layout.width;
                  height.value = e.nativeEvent.layout.height;
                }}
              >
                <Animated.Image
                  source={{ uri: attachment.url }}
                  style={[styles.media, imageStyle]}
                  resizeMode="contain"
                />
              </Animated.View>
            </GestureDetector>
          ) : (
            <ActivityIndicator color="#FFFFFF" />
          )}

          <View style={[styles.bar, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
            <Pressable onPress={handleClose} hitSlop={10} style={styles.button}>
              <Icon name="x" size={19} color="#FFFFFF" />
            </Pressable>
            <View style={styles.title}>
              <Text style={styles.name} numberOfLines={1}>
                {attachment?.name ?? ''}
              </Text>
              {attachment ? (
                <Text style={styles.meta}>
                  {/* Size is omitted for a picture we did not upload — the
                      library screens open a remote URL whose byte count we
                      never learn, and "0 B" reads as a broken file. */}
                  {attachment.size > 0 ? `${fileSize(attachment.size)}${isVideo ? '' : ' · '}` : ''}
                  {isVideo ? '' : 'pinch or double-tap to zoom'}
                </Text>
              ) : null}
            </View>
            {onShare ? (
              <Pressable onPress={onShare} hitSlop={10} style={styles.button}>
                <Icon name="share" size={17} color="#FFFFFF" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// Fixed colours, not theme tokens: a media viewer is black in both schemes,
// and every foreground here sits on the content rather than on a surface.
const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: {
    flex: 1,
    backgroundColor: '#05100D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stretch: { alignSelf: 'stretch' },
  media: { width: '100%', height: '100%' },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(5,16,13,0.55)',
  },
  button: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, gap: 2, minWidth: 0 },
  name: { fontFamily: fontFamily.semibold, fontSize: 14, color: '#FFFFFF' },
  meta: { fontFamily: fontFamily.mono, fontSize: 10, color: 'rgba(255,255,255,0.62)' },
});

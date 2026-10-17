/**
 * Records one short voice note — shared by Team chat's composer and the
 * Leads inbox's.
 *
 * `expo-audio` (not the deprecated `expo-av`) — see `AGENTS.md`: Expo's audio
 * API changed substantially for SDK 57. `prepareToRecordAsync` only needs to
 * run once per recorder instance; re-preparing before every take is what the
 * docs show, but doing it on an already-prepared recorder is harmless and
 * cheaper to reason about than tracking "have I prepared yet" by hand.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';

/** Long past what a DM or team reply needs. */
const MAX_RECORD_SECONDS = 120;
/** Below this it is a mis-tap, not a message. */
const MIN_RECORD_SECONDS = 1;

export interface RecordedVoiceNote {
  uri: string;
  durationSeconds: number;
}

export function useVoiceRecorder(onDone: (note: RecordedVoiceNote) => void, onError: (message: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);
  /**
   * Latched for the rest of the take, not just for the await: `state` is polled,
   * so the cap fires again on the next tick — and the stop button is still on
   * screen — after the recording has already been stopped and staged.
   */
  const stopped = useRef(false);

  const stop = useCallback(async () => {
    if (stopped.current) return;
    stopped.current = true;
    try {
      // The polled state can still read zero for a take shorter than one tick;
      // the recorder's own clock is the one that knows.
      const seconds = Math.max(recorder.currentTime || 0, state.durationMillis / 1000 || 0);
      await recorder.stop();
      if (!recorder.uri) throw new Error('the recorder produced no file');
      if (seconds < MIN_RECORD_SECONDS) {
        onError('Hold the mic a moment longer — that was too short to send.');
        return;
      }
      onDone({ uri: recorder.uri, durationSeconds: seconds });
    } catch {
      onError("That recording couldn't be saved.");
    }
  }, [recorder, state.durationMillis, onDone, onError]);

  const start = useCallback(async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        onError('Kazi needs permission to use your microphone. You can grant it in Settings.');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      stopped.current = false;
      recorder.record();
    } catch {
      onError('Could not start recording.');
    }
  }, [recorder, onError]);

  // Auto-stop at the cap rather than trusting the composer to police it.
  useEffect(() => {
    if (state.isRecording && state.durationMillis / 1000 >= MAX_RECORD_SECONDS) void stop();
  }, [state.isRecording, state.durationMillis, stop]);

  // Leaving the screen mid-take has to hand the microphone back, or the OS
  // recording indicator stays lit until this screen mounts again. This has to
  // be a layout effect: expo-audio's useAudioRecorder registers its own
  // *passive* effect that releases the native recorder on unmount, and
  // passive-effect cleanups on one unmounting component fire in registration
  // order — since useAudioRecorder runs before this hook, that release would
  // otherwise beat us to it and leave `recorder` a dead shared object here.
  // The try/catch is a backstop for the same race (e.g. Fast Refresh).
  useLayoutEffect(
    () => () => {
      try {
        if (recorder.isRecording) void recorder.stop().catch(() => {});
      } catch {
        // Native recorder was already released — nothing left to stop.
      }
      // Playback stays allowed on a silent phone — voice notes still have to be audible.
      void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    },
    [recorder],
  );

  return {
    recording: state.isRecording,
    seconds: state.durationMillis / 1000,
    start,
    stop,
  };
}

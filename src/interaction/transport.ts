import { PlaybackGesture } from './gestures';
import { useTurntable, type CameraView } from './store';
import { usePlayer } from '../state/store';
import { playback } from '../audio/PlaybackController';
import { saveUi } from '../lib/uiStorage';

/**
 * Turntable actions shared by the 3D model, the 2D transport row and the keyboard,
 * so all three always drive (and reflect) the same state.
 */
export function createPlaybackGesture() {
  return new PlaybackGesture({
    snapshot: () => { const s = usePlayer.getState(); return { trackId: s.track?.id || null, state: s.state, duration: s.duration, position: s.position }; },
    pause: () => playback.pause(),
    resume: () => playback.resume(),
    seek: position => playback.seek(position),
  });
}

/** The needle is on the record only while audio is actually playing. */
export function isNeedleDown() {
  return usePlayer.getState().state === 'playing' && !useTurntable.getState().needleLifted;
}

/** Lift (pause) or drop (resume) the needle. */
export function toggleNeedle() {
  if (isNeedleDown()) { useTurntable.getState().patch({ needleLifted: true }); playback.pause(); }
  else { useTurntable.getState().patch({ needleLifted: false }); void playback.resume(); }
}

export function togglePlay() {
  useTurntable.getState().patch({ needleLifted: false });
  void playback.toggle();
}

export function toggleCover() {
  const s = useTurntable.getState();
  s.patch({ coverOpen: !s.coverOpen });
}

export function setCameraView(view: CameraView) {
  useTurntable.getState().patch({ view });
  saveUi({ view });
}

export function resetCamera() {
  const s = useTurntable.getState();
  s.patch({ cameraReset: s.cameraReset + 1 });
}

/** Tiny tactile confirmation on devices that support it (mobile). */
export function haptic(ms = 8) {
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}

import type { PlaybackState, Settings } from './types';
export const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export const smoothstep = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
export function equalPower(progress: number): [number, number] { const p = clamp(progress); return [Math.cos(p * Math.PI / 2), Math.sin(p * Math.PI / 2)]; }
export interface TransitionFrame { trackId: string; state: PlaybackState; position: number; duration: number; dt: number; live?: boolean }
/** A timer-free envelope. The owning adapter supplies media time and elapsed active time. */
export class TransitionManager {
  private trackId = '';
  private incoming = false;
  private inElapsed = 0;
  private seenTrack = false;
  private pending = false;
  phase: 'idle' | 'out' | 'waiting' | 'in' = 'idle';
  factor = 1;
  manualSkip() { this.pending = true; this.phase = 'waiting'; }
  cancel() { this.incoming = false; this.pending = false; this.inElapsed = 0; this.factor = 1; this.phase = 'idle'; }
  update(frame: TransitionFrame, settings: Settings): number {
    const changed = frame.trackId && frame.trackId !== this.trackId;
    if (changed) {
      this.incoming = this.seenTrack || this.pending;
      this.inElapsed = 0; this.trackId = frame.trackId; this.seenTrack = true; this.pending = false;
    }
    if (!settings.transitions) { this.cancel(); return settings.volume; }
    if (frame.state === 'ended') { this.phase = 'waiting'; return settings.volume * this.factor; }
    if (frame.state !== 'playing') return settings.volume * this.factor;
    const ease = settings.easing === 'smooth' ? smoothstep : clamp;
    const finite = !frame.live && Number.isFinite(frame.duration) && frame.duration > 0;
    const outDuration = finite ? Math.min(settings.fadeOut, frame.duration / 3) : 0;
    let factor = 1;
    if (this.incoming) {
      this.inElapsed += Math.max(0, Math.min(frame.dt, 0.5));
      const inDuration = finite ? Math.min(settings.fadeIn, frame.duration / 3) : settings.fadeIn;
      factor = ease(this.inElapsed / Math.max(0.1, inDuration));
      this.phase = 'in';
      if (this.inElapsed >= inDuration) this.incoming = false;
    } else this.phase = 'idle';
    if (finite && frame.position >= frame.duration - outDuration && outDuration > 0) {
      factor = Math.min(factor, ease((frame.duration - frame.position) / outDuration)); this.phase = 'out';
    }
    this.factor = clamp(factor);
    return settings.volume * this.factor;
  }
}

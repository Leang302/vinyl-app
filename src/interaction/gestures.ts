/** Unwrap circular movement so crossing ±π never jumps the track. */
export function angularDelta(previous: number, current: number): number {
  return Math.atan2(Math.sin(current - previous), Math.cos(current - previous));
}
export function scrubTime(start: number, radians: number, duration: number, secondsPerTurn = 30): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(duration, start + radians / (2 * Math.PI) * secondsPerTurn));
}
export function tonearmProgress(angle: number): number {
  return Math.max(0, Math.min(1, (-angle - 0.42) / 0.25));
}
export type GestureSnapshot = { trackId: string | null; state: string; position: number; duration: number };
export interface GestureTransport {
  snapshot(): GestureSnapshot;
  pause(): void;
  resume(): Promise<void>;
  seek(position: number): void;
}
/** A gesture owns only the track it started on. Cancel never commits a seek. */
export class PlaybackGesture {
  private session?: { trackId: string; wasPlaying: boolean; duration: number };
  constructor(private transport: GestureTransport) {}
  begin(): boolean {
    const snapshot = this.transport.snapshot();
    if (!snapshot.trackId || !Number.isFinite(snapshot.duration) || snapshot.duration <= 0 || !['playing', 'paused'].includes(snapshot.state)) return false;
    this.session = { trackId: snapshot.trackId, wasPlaying: snapshot.state === 'playing', duration: snapshot.duration };
    if (this.session.wasPlaying) this.transport.pause();
    return true;
  }
  async finish(position?: number, cancel = false): Promise<void> {
    const session = this.session; this.session = undefined;
    if (!session || this.transport.snapshot().trackId !== session.trackId) return;
    if (!cancel && position !== undefined && Number.isFinite(position)) this.transport.seek(Math.max(0, Math.min(session.duration, position)));
    if (session.wasPlaying && !['error', 'ended', 'loading'].includes(this.transport.snapshot().state)) await this.transport.resume();
  }
  abandon(): void { this.session = undefined; }
}

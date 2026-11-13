import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../src/audio/types';

// Fake adapter: records loads and exposes the event hooks the controller registers.
const yt = vi.hoisted(() => ({ instance: undefined as any, loads: [] as string[] }));
vi.mock('../src/audio/YouTubePlayerAdapter', async importOriginal => {
  const real = await importOriginal<typeof import('../src/audio/YouTubePlayerAdapter')>();
  class FakeAdapter {
    transition = { phase: 'idle' };
    constructor(public listener: (s: any) => void, _settings: unknown, public events: any) { yt.instance = this; }
    async mount() {}
    loadVideo(id: string) { yt.loads.push(id); this.listener({ state: 'loading', position: 0, duration: 0, trackId: id }); }
    play = vi.fn(); pause = vi.fn(); stop = vi.fn(); seek = vi.fn(); dispose = vi.fn(); refreshSettings = vi.fn();
    readPlaylistIds = vi.fn(async () => ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  }
  return { ...real, YouTubePlayerAdapter: FakeAdapter };
});

const t = (id: string): Track => ({ id, videoId: id, title: id, artist: 'x', source: 'youtube', artwork: '' });
let usePlayer: typeof import('../src/state/store').usePlayer;
let playback: typeof import('../src/audio/PlaybackController').playback;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('document', { getElementById: () => ({ replaceChildren: vi.fn(), appendChild: vi.fn() }), createElement: () => ({}) });
  vi.resetModules();
  yt.loads = []; yt.instance = undefined;
  ({ usePlayer } = await import('../src/state/store'));
  ({ playback } = await import('../src/audio/PlaybackController'));
  vi.spyOn(playback.local, 'deactivate').mockImplementation(() => {});
  usePlayer.setState({ queue: ['a', 'b', 'c'].map(t), index: 0, track: t('a'), repeat: 'off', shuffle: false, unshuffled: null, toast: null, collections: [] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const playing = (id: string) => yt.instance.listener({ state: 'playing', position: 1, duration: 100, trackId: id });

describe('playback controller with an app-owned YouTube queue', () => {
  it('advances to the next queued video on ENDED with loadVideoById', async () => {
    await playback.playIndex(0); playing('a');
    yt.instance.events.onEnded(); await vi.runAllTimersAsync();
    expect(yt.loads).toEqual(['a', 'b']);
    expect(usePlayer.getState().index).toBe(1);
  });
  it('skips an embed-blocked video after ~1s with one toast and keeps an Open on YouTube link for it', async () => {
    await playback.playIndex(0);
    yt.instance.events.onError(150);
    const s = usePlayer.getState();
    expect(s.toast).toMatchObject({ message: 'Skipped “a”: embedding disabled', link: { href: 'https://www.youtube.com/watch?v=a', label: 'Open on YouTube' } });
    expect(s.queue[0].blocked).toBe(true);
    expect(yt.loads).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(999); expect(yt.loads).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(1); expect(yt.loads).toEqual(['a', 'b']);
  });
  it('stays on a song the listener clicked when YouTube blocks it, instead of playing a different one', async () => {
    await playback.pick(1);
    yt.instance.events.onError(150);
    await vi.advanceTimersByTimeAsync(3000);
    expect(yt.loads).toEqual(['b']);
    const s = usePlayer.getState();
    expect(s.index).toBe(1);
    expect(s.queue[1].blocked).toBe(true);
    expect(s.toast).toMatchObject({ message: 'Can\'t play “b” here: embedding disabled', link: { href: 'https://www.youtube.com/watch?v=b' } });
  });
  it('still auto-skips a blocked song the queue reached on its own after a picked song', async () => {
    await playback.pick(0); playing('a');
    yt.instance.events.onEnded(); await vi.runAllTimersAsync();
    yt.instance.events.onError(150); await vi.advanceTimersByTimeAsync(1000);
    expect(yt.loads).toEqual(['a', 'b', 'c']);
  });
  it('does not skip on a browser playback error (5)', async () => {
    await playback.playIndex(0); yt.instance.events.onError(5); await vi.advanceTimersByTimeAsync(2000);
    expect(yt.loads).toEqual(['a']); expect(usePlayer.getState().queue[0].blocked).toBeUndefined();
  });
  it('stops instead of looping forever when every video is blocked', async () => {
    usePlayer.setState({ repeat: 'all' });
    await playback.playIndex(0);
    for (let i = 0; i < 3; i++) { yt.instance.events.onError(150); await vi.advanceTimersByTimeAsync(1000); }
    expect(yt.loads).toEqual(['a', 'b', 'c']);
    expect(usePlayer.getState().state).toBe('ended');
  });
  it('steps over already-blocked tracks on next/previous', async () => {
    usePlayer.setState({ queue: [t('a'), { ...t('b'), blocked: true }, t('c')] });
    await playback.playIndex(0); await playback.next(); expect(yt.loads.at(-1)).toBe('c');
    usePlayer.setState({ position: 0 }); await playback.previous(); expect(yt.loads.at(-1)).toBe('a');
  });
  it('repeats the current video on ENDED with repeat one', async () => {
    usePlayer.setState({ repeat: 'one' });
    await playback.playIndex(1); playing('b');
    yt.instance.events.onEnded(); await vi.runAllTimersAsync();
    expect(yt.instance.seek).toHaveBeenCalledWith(0); expect(yt.loads).toEqual(['b']);
  });
  it('stops at the end of the queue with repeat off', async () => {
    await playback.playIndex(2); playing('c');
    yt.instance.events.onEnded(); await vi.runAllTimersAsync();
    expect(yt.loads).toEqual(['c']); expect(usePlayer.getState().state).toBe('ended');
  });
  it('shuffles the upcoming tracks and restores the order when shuffle is turned off', () => {
    usePlayer.setState({ queue: 'abcdefgh'.split('').map(t) });
    playback.setShuffle(true);
    expect(usePlayer.getState().queue[0].id).toBe('a');
    playback.setShuffle(false);
    expect(usePlayer.getState().queue.map(x => x.id).join('')).toBe('abcdefgh');
  });
  it('fills in placeholder titles from the official player', async () => {
    usePlayer.setState({ queue: [{ ...t('a'), title: 'Track 1', artist: 'YouTube' }], track: { ...t('a'), title: 'Track 1', artist: 'YouTube' } });
    await playback.playIndex(0);
    yt.instance.listener({ state: 'playing', position: 1, duration: 200, trackId: 'a', title: 'Real title', artist: 'Singer - Topic' });
    expect(usePlayer.getState().queue[0]).toMatchObject({ title: 'Real title', artist: 'Singer', duration: 200 });
  });
});

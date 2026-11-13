import type { RepeatMode, Track } from './types';

/**
 * Pure queue operations. The app owns the queue: YouTube and local audio both
 * play one track at a time from this list, so next/previous/shuffle/repeat
 * behave identically for every source.
 */

/** Index to play after `index`, or -1 when playback should stop. */
export function nextIndex(length: number, index: number, repeat: RepeatMode, auto: boolean): number {
  if (!length) return -1;
  if (auto && repeat === 'one') return Math.min(Math.max(index, 0), length - 1);
  if (index + 1 < length) return index + 1;
  return repeat === 'off' ? -1 : 0;
}

export function previousIndex(length: number, index: number, repeat: RepeatMode): number {
  if (!length) return -1;
  if (index > 0) return index - 1;
  return repeat === 'off' ? 0 : length - 1;
}

/** Fisher–Yates over the tracks after the current one; history stays put. */
export function shuffleUpcoming(queue: Track[], index: number, random: () => number = Math.random): Track[] {
  const head = queue.slice(0, index + 1);
  const tail = queue.slice(index + 1);
  for (let i = tail.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [tail[i], tail[j]] = [tail[j], tail[i]];
  }
  return [...head, ...tail];
}

/** Restore the pre-shuffle order, keeping only tracks still queued and appending new ones. */
export function unshuffle(queue: Track[], original: Track[], currentId: string | undefined): { queue: Track[]; index: number } {
  const present = new Map(queue.map(t => [t.id, t]));
  const restored = original.filter(t => present.has(t.id)).map(t => present.get(t.id)!);
  const seen = new Set(restored.map(t => t.id));
  for (const t of queue) if (!seen.has(t.id)) restored.push(t);
  return { queue: restored, index: Math.max(0, restored.findIndex(t => t.id === currentId)) };
}

/** Move one item and keep `index` pointing at the same (current) track. */
export function moveItem(queue: Track[], index: number, from: number, to: number): { queue: Track[]; index: number } {
  if (from === to || from < 0 || from >= queue.length) return { queue, index };
  const target = Math.max(0, Math.min(queue.length - 1, to));
  const currentId = queue[index]?.id;
  const next = queue.slice();
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return { queue: next, index: Math.max(0, next.findIndex(t => t.id === currentId)) };
}

export function removeItem(queue: Track[], index: number, at: number): { queue: Track[]; index: number; removedCurrent: boolean } {
  if (at < 0 || at >= queue.length) return { queue, index, removedCurrent: false };
  const next = queue.filter((_, i) => i !== at);
  const removedCurrent = at === index;
  const newIndex = at < index ? index - 1 : Math.min(index, next.length - 1);
  return { queue: next, index: Math.max(0, newIndex), removedCurrent };
}

/** Drop later duplicates so every queue row has a stable unique key. */
export function dedupe(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter(t => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

import type { RepeatMode, Track } from '../audio/types';

/** Queue + last position, kept in localStorage so a refresh puts the same record back on. */
const KEY = 'vinyl.queue.v1';

export interface SavedQueue { queue: Track[]; index: number; position: number; shuffle: boolean; repeat: RepeatMode; unshuffled: Track[] | null }

function storage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

export function loadQueue(): SavedQueue | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedQueue>;
    if (!Array.isArray(data.queue)) return null;
    const queue = data.queue.filter((t): t is Track => !!t && typeof t.id === 'string' && (t.source === 'youtube' || t.source === 'local'));
    const index = Math.max(0, Math.min(queue.length - 1, Number(data.index) || 0));
    return {
      queue, index,
      position: Math.max(0, Number(data.position) || 0),
      shuffle: !!data.shuffle,
      repeat: data.repeat === 'all' || data.repeat === 'one' ? data.repeat : 'off',
      unshuffled: Array.isArray(data.unshuffled) ? data.unshuffled : null,
    };
  } catch { return null; }
}

export function saveQueue(value: SavedQueue) {
  try { storage()?.setItem(KEY, JSON.stringify(value)); } catch { /* Quota or privacy mode: listening still works. */ }
}

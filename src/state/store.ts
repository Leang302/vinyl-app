import { create } from 'zustand';
import { defaultSettings, type Collection, type Track, type Settings, type PlaybackState, type SourceMode, type RepeatMode } from '../audio/types';
import { readPreference, writePreference } from '../lib/persistence';
import { initialCollections } from '../lib/library';
import { loadQueue } from '../lib/queueStorage';

/** One message at a time. A newer toast replaces the current one. */
export interface Toast { id: number; message: string; link?: { href: string; label: string }; action?: { label: string; run: () => void } }

interface Store {
 settings: Settings; collections: Collection[]; favorites: string[]; recent: string[]; hydrated: boolean;
 mode: SourceMode; track: Track | null; queue: Track[]; index: number; state: PlaybackState; position: number; duration: number; buffered: number; phase: string;
 shuffle: boolean; repeat: RepeatMode;
 /** Original order while shuffle is on, restored when it is turned off. */
 unshuffled: Track[] | null;
 /** A pasted link is being resolved into tracks. */
 resolving: boolean;
 toast: Toast | null;
 patch: (value: Partial<Store>) => void; setSettings: (value: Partial<Settings>) => void;
 setCollections: (value: Collection[]) => void; toggleFavorite: (id: string) => void; markRecent: (id: string) => void; hydrate: () => Promise<void>;
 notify: (message: string, extra?: Omit<Toast, 'id' | 'message'>) => void; dismissToast: () => void;
 toggleMute: () => void;
}
let persistenceErrorShown = false;
let toastId = 0;
let volumeBeforeMute = defaultSettings.volume;
function persist(key: string, value: Settings | Collection[] | string[]) { void writePreference(key, value).catch(() => { if (!persistenceErrorShown) { persistenceErrorShown = true; usePlayer.getState().notify('Browser storage is full or unavailable. Changes may not survive a refresh.'); } }); }
/** Same playlist/video added twice collapses to the first copy. */
function dedupeCollections(list: Collection[]): Collection[] {
 const seen = new Set<string>();
 return list.filter(c => { const key = c.sourceKey || c.youtubeUrl; if (!key) return true; if (seen.has(key)) return false; seen.add(key); return true; });
}
export const usePlayer = create<Store>((set, get) => ({
 settings: {...defaultSettings},collections: initialCollections, favorites: [], recent: [], hydrated:false,
 mode:'local', track:initialCollections[0].tracks[0], queue: initialCollections[0].tracks, index:0, state:'idle', position:0, duration:0, buffered:0, phase:'idle', shuffle:false, repeat:'off', unshuffled:null, resolving:false, toast:null,
 patch: value => set(value),
 notify: (message, extra) => set({toast:{id:++toastId,message,...extra}}),
 dismissToast: () => set({toast:null}),
 toggleMute: () => { const v = get().settings.volume; if (v) { volumeBeforeMute = v; get().setSettings({volume:0}); } else get().setSettings({volume:volumeBeforeMute || defaultSettings.volume}); },
 setSettings: value => { const settings = {...get().settings,...value}; set({settings}); persist('settings',settings); },
 setCollections: collections => { set({collections}); persist('collections', collections); },
 toggleFavorite: id => { const favorites = get().favorites.includes(id) ? get().favorites.filter(x=>x!==id) : [...get().favorites,id]; set({favorites}); persist('favorites',favorites); },
 markRecent: id => { const recent = [id,...get().recent.filter(x=>x!==id)].slice(0,30); set({recent}); persist('recent', recent); },
 hydrate: async () => { try {
   const [settings,collections,favorites,recent] = await Promise.all([readPreference<Partial<Settings>>('settings'),readPreference<Collection[]>('collections'),readPreference<string[]>('favorites'),readPreference<string[]>('recent')]);
   const safe = {...defaultSettings,...settings};
   safe.volume = Math.max(0,Math.min(100,Number(safe.volume)||0));
   safe.fadeIn = Math.max(1,Math.min(10,Number(safe.fadeIn)||3)); safe.fadeOut = Math.max(1,Math.min(10,Number(safe.fadeOut)||3));
   const stored = Array.isArray(collections) ? collections : initialCollections;
   const library = dedupeCollections(stored);
   if (library.length !== stored.length) persist('collections', library);
   const saved = loadQueue();
   const restored = saved && saved.queue.length ? {queue:saved.queue,index:saved.index,track:saved.queue[saved.index],position:saved.position,shuffle:saved.shuffle,repeat:saved.repeat,unshuffled:saved.unshuffled,mode:saved.queue[saved.index].source}
     : {queue:library[0]?.tracks||[],track:library[0]?.tracks[0]||null,index:0};
   set({settings:safe,collections:library,favorites:favorites||[],recent:recent||[],hydrated:true,...restored});
 } catch { set({hydrated:true}); get().notify('Your library could not be restored. Listening still works.'); } }
}));

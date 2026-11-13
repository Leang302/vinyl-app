import { create } from 'zustand';
import { defaultSettings, type Collection, type Track, type Settings, type PlaybackState, type SourceMode, type RepeatMode } from '../audio/types';
import { readPreference, writePreference } from '../lib/persistence';
import { initialCollections } from '../lib/library';
interface Store {
 settings: Settings; collections: Collection[]; favorites: string[]; recent: string[]; hydrated: boolean;
 mode: SourceMode; track: Track | null; queue: Track[]; index: number; state: PlaybackState; position: number; duration: number; error: string | null; phase: string; shuffle: boolean; repeat: RepeatMode;
 patch: (value: Partial<Store>) => void; setSettings: (value: Partial<Settings>) => void;
 setCollections: (value: Collection[]) => void; toggleFavorite: (id: string) => void; markRecent: (id: string) => void; hydrate: () => Promise<void>;
}
let persistenceErrorShown = false;
function persist(key: string, value: Settings | Collection[] | string[]) { void writePreference(key, value).catch(() => { if (!persistenceErrorShown) { persistenceErrorShown = true; usePlayer.getState().patch({error:'Browser storage is unavailable or full. You can keep listening, but these changes may not survive a refresh.'}); } }); }
export const usePlayer = create<Store>((set, get) => ({
 settings: {...defaultSettings},collections: initialCollections, favorites: [], recent: [], hydrated:false,
 mode:'local', track:initialCollections[0].tracks[0], queue: initialCollections[0].tracks, index:0, state:'idle', position:0, duration:0, error:null, phase:'idle', shuffle:false,repeat:'off',
 patch: value => set(value),
 setSettings: value => { const settings = {...get().settings,...value}; set({settings}); persist('settings',settings); },
 setCollections: collections => { set({collections}); persist('collections', collections); },
 toggleFavorite: id => { const favorites = get().favorites.includes(id) ? get().favorites.filter(x=>x!==id) : [...get().favorites,id]; set({favorites}); persist('favorites',favorites); },
 markRecent: id => { const recent = [id,...get().recent.filter(x=>x!==id)].slice(0,30); set({recent}); persist('recent', recent); },
 hydrate: async () => { try {
   const [settings,collections,favorites,recent] = await Promise.all([readPreference<Partial<Settings>>('settings'),readPreference<Collection[]>('collections'),readPreference<string[]>('favorites'),readPreference<string[]>('recent')]);
   const safe = {...defaultSettings,...settings};
   safe.volume = Math.max(0,Math.min(100,Number(safe.volume)||0));
   safe.fadeIn = Math.max(1,Math.min(10,Number(safe.fadeIn)||3)); safe.fadeOut = Math.max(1,Math.min(10,Number(safe.fadeOut)||3));
   const library = Array.isArray(collections) ? collections : initialCollections;
   set({settings:safe,collections:library,favorites:favorites||[],recent:recent||[],hydrated:true,queue:library[0]?.tracks||[],track:library[0]?.tracks[0]||null});
 } catch { set({hydrated:true,error:'Your browser could not restore the library. Listening still works; check your storage permissions.'}); } }
}));

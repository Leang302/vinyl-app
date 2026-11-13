import { DEFAULT_RECORD_COLOR } from '../lib/palette';
export type SourceMode = 'local' | 'youtube';
export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';
export type RepeatMode = 'off' | 'all' | 'one';
export interface Track { id: string; title: string; artist: string; source: SourceMode; url?: string; videoId?: string; artwork: string; duration?: number; collectionId?: string; /** YouTube refused to embed it; the queue row offers "Open on YouTube". */ blocked?: boolean; /** Renamed by the listener; player metadata must not overwrite it. */ customTitle?: boolean }
export interface Collection { id: string; title: string; subtitle: string; artwork: string; color: string; tracks: Track[]; youtubeUrl?: string; /** Identity of the source (playlist/video/search) to prevent duplicates. */ sourceKey?: string; /** Title is a placeholder, replaced once real metadata arrives. */ autoTitle?: boolean }
export interface Settings { volume: number; transitions: boolean; fadeOut: number; fadeIn: number; easing: 'smooth' | 'linear'; bass: number; mid: number; treble: number; balance: number; crackle: boolean; rpm: 33 | 45; vinylColor: string; quality: 'auto' | 'high' | 'low'; artwork?: string }
export interface Snapshot { state: PlaybackState; position: number; duration: number; trackId: string; title?: string; artist?: string; error?: string; live?: boolean; /** 0–1 fraction loaded ahead. */ buffered?: number }
export interface PlaybackAdapter { readonly kind: SourceMode; play(): Promise<void>; pause(): void; seek(time: number): void; setVolume(volume: number): void; dispose(): void }
export type PlaybackListener = (snapshot: Snapshot) => void;
export const defaultSettings: Settings = {volume: 70, transitions: true, fadeOut: 3, fadeIn: 3, easing: 'smooth', bass: 0, mid: 0, treble: 0, balance: 0, crackle: false, rpm: 33, vinylColor: DEFAULT_RECORD_COLOR, quality: 'auto'};

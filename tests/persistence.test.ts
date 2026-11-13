import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { readPreference, writePreference, getFile, saveFile, deleteFile } from '../src/lib/persistence';
import { defaultSettings } from '../src/audio/types';
import { usePlayer } from '../src/state/store';
describe('persistent listening room',()=>{
 it('round-trips settings without changing master volume',async()=>{const settings={...defaultSettings,volume:47,fadeOut:8,transitions:false,bass:6};await writePreference('settings',settings);expect(await readPreference('settings')).toEqual(settings);});
 it('stores local audio as persistent blobs and supports deletion',async()=>{const blob=new Blob(['audio bytes'],{type:'audio/wav'});await saveFile('track-test',blob);const read=await getFile('track-test');expect(await read?.text()).toBe('audio bytes');await deleteFile('track-test');expect(await getFile('track-test')).toBeUndefined();});
 it('restores collections, favorites, and settings on a fresh hydration',async()=>{await writePreference('favorites',['first-light']);await writePreference('recent',['open-window']);await usePlayer.getState().hydrate();expect(usePlayer.getState().settings.volume).toBe(47);expect(usePlayer.getState().settings.bass).toBe(6);expect(usePlayer.getState().favorites).toEqual(['first-light']);expect(usePlayer.getState().recent).toEqual(['open-window']);expect(usePlayer.getState().hydrated).toBe(true);});
 it('clamps invalid persisted volume and transition durations',async()=>{await writePreference('settings',{...defaultSettings,volume:250,fadeOut:-2,fadeIn:90});await usePlayer.getState().hydrate();expect(usePlayer.getState().settings.volume).toBe(100);expect(usePlayer.getState().settings.fadeOut).toBe(1);expect(usePlayer.getState().settings.fadeIn).toBe(10);});
});

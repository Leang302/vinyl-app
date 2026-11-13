import { describe, expect, it } from 'vitest';
import { TransitionManager, smoothstep, equalPower } from '../src/audio/TransitionManager';
import { defaultSettings } from '../src/audio/types';
const settings={...defaultSettings,volume:80};
const frame={trackId:'a',state:'playing' as const,position:0,duration:100,dt:.1};
describe('smooth sequential transition envelope',()=>{
 it('leaves normal playback at the selected master volume',()=>{const t=new TransitionManager();expect(t.update(frame,settings)).toBe(80);expect(t.phase).toBe('idle');});
 it('fades during the final three seconds without changing saved volume',()=>{const t=new TransitionManager();t.update(frame,settings);expect(t.update({...frame,position:98.5},settings)).toBeCloseTo(40);expect(t.phase).toBe('out');expect(t.update({...frame,position:100},settings)).toBe(0);expect(settings.volume).toBe(80);});
 it('fades into a new track once and does not restart on repeated snapshots',()=>{const t=new TransitionManager();t.update(frame,settings);let volume=t.update({...frame,trackId:'b',dt:.5},settings);const first=volume;for(let i=0;i<5;i++)volume=t.update({...frame,trackId:'b',dt:.5},settings);expect(first).toBeLessThan(volume);expect(volume).toBeCloseTo(80);expect(t.update({...frame,trackId:'b'},settings)).toBe(80);});
 it('freezes the fade on pause and buffering, then resumes',()=>{const t=new TransitionManager();t.update(frame,settings);const volume=t.update({...frame,trackId:'b',dt:.5},settings);expect(t.update({...frame,trackId:'b',state:'paused',dt:20},settings)).toBe(volume);expect(t.update({...frame,trackId:'b',state:'buffering',dt:20},settings)).toBe(volume);expect(t.update({...frame,trackId:'b',dt:.5},settings)).toBeGreaterThan(volume);});
 it('holds the outgoing level on pause',()=>{const t=new TransitionManager();t.update(frame,settings);const volume=t.update({...frame,position:99},settings);expect(t.update({...frame,position:99,state:'paused',dt:3},settings)).toBe(volume);});
 it('cancels obsolete operations on manual skipping',()=>{const t=new TransitionManager();t.update(frame,settings);t.update({...frame,position:99.9},settings);t.manualSkip();expect(t.phase).toBe('waiting');const b=t.update({...frame,trackId:'b',dt:.1},settings);expect(t.phase).toBe('in');t.manualSkip();const c=t.update({...frame,trackId:'c',dt:.1},settings);expect(c).toBe(b);t.cancel();expect(t.factor).toBe(1);expect(t.phase).toBe('idle');});
 it('restores the master volume immediately when fades are disabled',()=>{const t=new TransitionManager();t.update({...frame,position:99},settings);expect(t.update(frame,{...settings,transitions:false})).toBe(80);expect(t.factor).toBe(1);expect(t.update(frame,{...settings,transitions:false,volume:35})).toBe(35);});
 it.each([0,NaN,Infinity,-4])('ignores invalid or unknown duration %s',duration=>{const t=new TransitionManager();expect(t.update({...frame,position:99,duration},settings)).toBe(80);});
 it('does not fade live content at its advancing edge',()=>{const t=new TransitionManager();expect(t.update({...frame,position:99,live:true},settings)).toBe(80);});
 it('limits fade duration for short songs to prevent an all-song fade',()=>{const t=new TransitionManager();expect(t.update({...frame,duration:3,position:1},settings)).toBe(80);expect(t.update({...frame,duration:3,position:2.5},settings)).toBe(40);});
 it('uses the latest master volume within an ongoing fade',()=>{const t=new TransitionManager();t.update(frame,settings);expect(t.update({...frame,position:98.5},{...settings,volume:40})).toBe(20);});
 it('holds an end-of-track envelope while awaiting the next video',()=>{const t=new TransitionManager();t.update({...frame,position:100},settings);expect(t.update({...frame,state:'ended'},settings)).toBe(0);expect(t.phase).toBe('waiting');});
});
describe('volume curves',()=>{
 it('uses smooth easing with bounded endpoints',()=>{expect(smoothstep(-1)).toBe(0);expect(smoothstep(2)).toBe(1);expect(smoothstep(.5)).toBe(.5);expect(smoothstep(.1)).toBeLessThan(.1);});
 it('supports linear easing',()=>{const t=new TransitionManager();expect(t.update({...frame,position:99},{...settings,easing:'linear'})).toBeCloseTo(80/3);});
 it('conserves equal power throughout local overlap',()=>{for(let p=0;p<=1;p+=.05){const [a,b]=equalPower(p);expect(a*a+b*b).toBeCloseTo(1,10);}expect(equalPower(0)).toEqual([1,0]);expect(equalPower(1)[1]).toBe(1);});
});

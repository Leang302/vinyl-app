import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YouTubePlayerAdapter, describeError } from '../src/audio/YouTubePlayerAdapter';
import { defaultSettings } from '../src/audio/types';
let autoReady=true;
let handlers:Record<string,(e:any)=>void>; // Mock boundary: YouTube's event payload is supplied by the external API.
let data={video_id:'aaaaaaaaaaa',title:'First track',author:'Artist'};let position=0;let duration=100;
const methods={setVolume:vi.fn(),playVideo:vi.fn(),pauseVideo:vi.fn(),stopVideo:vi.fn(),seekTo:vi.fn(),loadVideoById:vi.fn(),cuePlaylist:vi.fn(),loadPlaylist:vi.fn(),nextVideo:vi.fn(),previousVideo:vi.fn(),playVideoAt:vi.fn(),setShuffle:vi.fn(),setLoop:vi.fn(),destroy:vi.fn(),getCurrentTime:()=>position,getDuration:()=>duration,getVideoData:()=>data,getPlaylist:()=>['aaaaaaaaaaa','bbbbbbbbbbb']};
function MockPlayer(_element:unknown,config:any){handlers=config.events;if(autoReady)queueMicrotask(()=>handlers.onReady({target:methods}));return methods;}
beforeEach(()=>{vi.useFakeTimers();autoReady=true;data={video_id:'aaaaaaaaaaa',title:'First track',author:'Artist'};position=0;duration=100;vi.stubGlobal('window',{YT:{Player:MockPlayer},location:{origin:'http://localhost:5173'},setTimeout,clearTimeout,setInterval,clearInterval});Object.values(methods).forEach(value=>{if(vi.isMockFunction(value))value.mockClear();});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const mount=async(listener=vi.fn(),events={})=>{const a=new YouTubePlayerAdapter(listener,()=>defaultSettings,events);await a.mount({} as HTMLElement);return a;};
describe('single-video YouTube adapter',()=>{
 it('plays one video with loadVideoById and never uses YouTube playlist navigation',async()=>{const a=await mount();a.loadVideo('aaaaaaaaaaa',12);expect(methods.loadVideoById).toHaveBeenCalledWith({videoId:'aaaaaaaaaaa',startSeconds:12});for(const m of [methods.loadPlaylist,methods.nextVideo,methods.previousVideo,methods.playVideoAt,methods.setShuffle,methods.setLoop])expect(m).not.toHaveBeenCalled();a.dispose();});
 it('reports ENDED to the owner so the app queue can advance',async()=>{const onEnded=vi.fn();const listener=vi.fn();const a=await mount(listener,{onEnded});handlers.onStateChange({data:1});handlers.onStateChange({data:0});expect(onEnded).toHaveBeenCalledOnce();expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({state:'ended'}));a.dispose();});
 it('polls while playing and reports track metadata',async()=>{const listener=vi.fn();const a=await mount(listener);handlers.onStateChange({data:1});data={video_id:'bbbbbbbbbbb',title:'Second track',author:'Other'};await vi.advanceTimersByTimeAsync(100);expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({trackId:'bbbbbbbbbbb',title:'Second track',state:'playing'}));a.dispose();expect(vi.getTimerCount()).toBe(0);});
 it.each([2,5,100,101,150])('forwards error %i to the owner and stops polling',async code=>{const onError=vi.fn();const listener=vi.fn();const a=await mount(listener,{onError});handlers.onStateChange({data:1});handlers.onError({data:code});expect(onError).toHaveBeenCalledWith(code);expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({state:'error'}));expect(vi.getTimerCount()).toBe(0);a.dispose();});
 it('marks embed-blocked, removed and invalid videos as skippable, but not browser playback errors',()=>{expect(describeError(150)).toMatchObject({skip:true,short:'Skipped: embedding disabled'});expect(describeError(101).skip).toBe(true);expect(describeError(100).skip).toBe(true);expect(describeError(2).skip).toBe(true);expect(describeError(5).skip).toBe(false);});
 it('keeps an embed error stable through late UNSTARTED and CUED events',async()=>{const listener=vi.fn();const a=await mount(listener);handlers.onError({data:150});handlers.onStateChange({data:-1});handlers.onStateChange({data:5});expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({state:'error',error:expect.stringContaining('does not allow')}));a.dispose();});
 it('clears the error when the next video actually plays',async()=>{const listener=vi.fn();const a=await mount(listener);handlers.onError({data:150});a.loadVideo('bbbbbbbbbbb');handlers.onStateChange({data:1});expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({state:'playing',error:undefined}));a.dispose();});
 it('reads playlist IDs from a cued list without playing YouTube’s playlist',async()=>{const listener=vi.fn();const a=await mount(listener);listener.mockClear();const ids=a.readPlaylistIds('PLabcdefghijk');expect(methods.cuePlaylist).toHaveBeenCalledWith({list:'PLabcdefghijk',listType:'playlist',index:0});handlers.onStateChange({data:5});await expect(ids).resolves.toEqual(['aaaaaaaaaaa','bbbbbbbbbbb']);expect(listener).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);a.dispose();});
 it('resolves an unreadable playlist to an empty list',async()=>{const a=await mount();const ids=a.readPlaylistIds('PLprivate12345');handlers.onError({data:100});await expect(ids).resolves.toEqual([]);a.dispose();});
 it('reports a stalled load once and clears its deadline',async()=>{const onStalled=vi.fn();const a=await mount(vi.fn(),{onStalled});a.loadVideo('aaaaaaaaaaa');await vi.advanceTimersByTimeAsync(20000);expect(onStalled).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);a.dispose();});
 it('cancels the load deadline when autoplay is blocked',async()=>{const onAutoplayBlocked=vi.fn();const a=await mount(vi.fn(),{onAutoplayBlocked});a.loadVideo('aaaaaaaaaaa');handlers.onAutoplayBlocked({});expect(onAutoplayBlocked).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);a.dispose();});
 it('cancels an unfinished mount and clears its timeout',async()=>{autoReady=false;const a=new YouTubePlayerAdapter(vi.fn(),()=>defaultSettings);const pending=a.mount({} as HTMLElement);const rejected=expect(pending).rejects.toThrow('cancelled');await Promise.resolve();a.dispose();await rejected;expect(vi.getTimerCount()).toBe(0);});
 it('rejects a player error before ready instead of hanging',async()=>{autoReady=false;const a=new YouTubePlayerAdapter(vi.fn(),()=>defaultSettings);const pending=a.mount({} as HTMLElement);const rejected=expect(pending).rejects.toThrow('private');await Promise.resolve();handlers.onError({data:100});await rejected;a.dispose();expect(vi.getTimerCount()).toBe(0);});
 it('ignores late events after disposal',async()=>{const listener=vi.fn();const onError=vi.fn();const a=await mount(listener,{onError});a.dispose();listener.mockClear();handlers.onStateChange({data:1});handlers.onError({data:150});expect(listener).not.toHaveBeenCalled();expect(onError).not.toHaveBeenCalled();});
 it('fades out at the end of one song and fades the next one in',async()=>{
  const settings={...defaultSettings,volume:80,fadeOut:3,fadeIn:3};
  const a=new YouTubePlayerAdapter(vi.fn(),()=>settings,{onEnded:()=>{a.loadVideo('bbbbbbbbbbb');}});await a.mount({} as HTMLElement);
  const volume=()=>methods.setVolume.mock.calls.at(-1)![0] as number;
  a.loadVideo('aaaaaaaaaaa');handlers.onStateChange({data:1});
  position=50;await vi.advanceTimersByTimeAsync(4000);const mid=volume();
  const out:number[]=[];for(const p of [97.5,98.5,99.5]){position=p;await vi.advanceTimersByTimeAsync(100);out.push(volume());}
  position=100;handlers.onStateChange({data:0});
  data={video_id:'bbbbbbbbbbb',title:'Second',author:'B'};position=0;handlers.onStateChange({data:1});
  const inn:number[]=[volume()];for(let i=0;i<40;i++){position+=.1;await vi.advanceTimersByTimeAsync(100);}inn.push(volume());
  expect(mid).toBe(80);
  expect(out[0]).toBeLessThan(80);expect(out[1]).toBeLessThan(out[0]);expect(out[2]).toBeLessThan(out[1]);
  expect(methods.loadVideoById).toHaveBeenLastCalledWith({videoId:'bbbbbbbbbbb',startSeconds:0});
  expect(inn[0]).toBeLessThan(5);expect(inn[1]).toBe(80);
  console.log('fade out',mid,'→',out.map(Math.round).join(' → '),'| next song fade in',Math.round(inn[0]),'→',inn[1]);
  a.dispose();
 });
 it('seeks and pauses without leaving timers',async()=>{const a=await mount();handlers.onStateChange({data:1});expect(vi.getTimerCount()).toBe(1);handlers.onStateChange({data:2});expect(vi.getTimerCount()).toBe(0);a.seek(34);expect(methods.seekTo).toHaveBeenCalledWith(34,true);a.dispose();expect(methods.destroy).toHaveBeenCalledOnce();});
});

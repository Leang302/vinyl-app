import { describe, expect, it, vi } from 'vitest';
import { angularDelta, scrubTime, tonearmProgress, PlaybackGesture, type GestureSnapshot } from '../src/interaction/gestures';
function setup(initial:Partial<GestureSnapshot>={}) {
 let snapshot:GestureSnapshot={trackId:'a',state:'playing',position:10,duration:100,...initial};
 const transport={snapshot:()=>snapshot,pause:vi.fn(()=>{snapshot={...snapshot,state:'paused'};}),resume:vi.fn(async()=>{snapshot={...snapshot,state:'playing'};}),seek:vi.fn()};
 return {gesture:new PlaybackGesture(transport),transport,change:(patch:Partial<GestureSnapshot>)=>{snapshot={...snapshot,...patch};}};
}
describe('circular record and tonearm mapping',()=>{
 it('unwraps crossing the circle seam in either direction',()=>{expect(angularDelta(3.1,-3.1)).toBeCloseTo(.0831853);expect(angularDelta(-3.1,3.1)).toBeCloseTo(-.0831853);});
 it('maps a full revolution to 30 seconds and clamps to the media',()=>{expect(scrubTime(10,Math.PI*2,100)).toBe(40);expect(scrubTime(10,-Math.PI*2,100)).toBe(0);expect(scrubTime(90,Math.PI*2,100)).toBe(100);expect(scrubTime(10,1,Infinity)).toBe(0);});
 it('maps the outer and inner grooves to valid playback progress',()=>{expect(tonearmProgress(-.42)).toBe(0);expect(tonearmProgress(-.67)).toBe(1);expect(tonearmProgress(.1)).toBe(0);expect(tonearmProgress(-.8)).toBe(1);});
});
describe('physical playback gestures',()=>{
 it('pauses a playing track, commits a seek, then resumes',async()=>{const {gesture,transport}=setup();expect(gesture.begin()).toBe(true);expect(transport.pause).toHaveBeenCalledOnce();await gesture.finish(30);expect(transport.seek).toHaveBeenCalledWith(30);expect(transport.resume).toHaveBeenCalledOnce();});
 it('keeps a paused track paused after seeking',async()=>{const {gesture,transport}=setup({state:'paused'});gesture.begin();await gesture.finish(40);expect(transport.pause).not.toHaveBeenCalled();expect(transport.seek).toHaveBeenCalledWith(40);expect(transport.resume).not.toHaveBeenCalled();});
 it('cancels a gesture without seeking and restores playing state',async()=>{const {gesture,transport}=setup();gesture.begin();await gesture.finish(40,true);expect(transport.seek).not.toHaveBeenCalled();expect(transport.resume).toHaveBeenCalledOnce();});
 it('does not seek or resume a replacement track after a skip',async()=>{const {gesture,transport,change}=setup();gesture.begin();change({trackId:'b'});await gesture.finish(50);expect(transport.seek).not.toHaveBeenCalled();expect(transport.resume).not.toHaveBeenCalled();});
 it('makes release and lost-pointer-capture idempotent',async()=>{const {gesture,transport}=setup();gesture.begin();await gesture.finish(50);await gesture.finish(50);expect(transport.seek).toHaveBeenCalledOnce();expect(transport.resume).toHaveBeenCalledOnce();});
 it.each([{state:'idle'},{duration:0},{duration:Infinity},{trackId:null},{state:'error'}])('does not begin on unavailable media %j',initial=>{const {gesture,transport}=setup(initial);expect(gesture.begin()).toBe(false);expect(transport.pause).not.toHaveBeenCalled();});
 it('holds the brake without changing the playback position',async()=>{const {gesture,transport}=setup();gesture.begin();await gesture.finish();expect(transport.seek).not.toHaveBeenCalled();expect(transport.resume).toHaveBeenCalledOnce();});
 it('clamps out-of-range positions before committing',async()=>{const {gesture,transport}=setup();gesture.begin();await gesture.finish(200);expect(transport.seek).toHaveBeenCalledWith(100);});
 it('does not resume an errored source after release',async()=>{const {gesture,transport,change}=setup();gesture.begin();change({state:'error'});await gesture.finish(undefined,true);expect(transport.resume).not.toHaveBeenCalled();});
 it('restores playback when a quick release precedes the asynchronous pause event',async()=>{const {gesture,transport,change}=setup();gesture.begin();change({state:'playing'});await gesture.finish();expect(transport.resume).toHaveBeenCalledOnce();});
});

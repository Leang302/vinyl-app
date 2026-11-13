import { describe, expect, it } from 'vitest';
import { dedupe, moveItem, nextIndex, previousIndex, removeItem, shuffleUpcoming, unshuffle } from '../src/audio/queue';
import type { Track } from '../src/audio/types';
const t=(id:string):Track=>({id,title:id,artist:'a',source:'youtube',videoId:id,artwork:''});
const q=['a','b','c','d','e'].map(t);
const ids=(list:Track[])=>list.map(x=>x.id).join('');
describe('app-owned queue',()=>{
 it('advances, stops at the end with repeat off and wraps with repeat all',()=>{expect(nextIndex(5,1,'off',true)).toBe(2);expect(nextIndex(5,4,'off',true)).toBe(-1);expect(nextIndex(5,4,'all',true)).toBe(0);expect(nextIndex(0,0,'all',true)).toBe(-1);});
 it('repeats one track on natural end but lets manual next move on',()=>{expect(nextIndex(5,2,'one',true)).toBe(2);expect(nextIndex(5,2,'one',false)).toBe(3);expect(nextIndex(5,4,'one',false)).toBe(0);});
 it('goes back, staying on the first track unless repeating',()=>{expect(previousIndex(5,3,'off')).toBe(2);expect(previousIndex(5,0,'off')).toBe(0);expect(previousIndex(5,0,'all')).toBe(4);});
 it('shuffles only upcoming tracks and keeps history and current in place',()=>{let seed=1;const rnd=()=>((seed=seed*16807%2147483647)/2147483647);const s=shuffleUpcoming(q,1,rnd);expect(ids(s).slice(0,2)).toBe('ab');expect(ids(s).slice(2).split('').sort().join('')).toBe('cde');});
 it('restores the original order when shuffle is turned off',()=>{const shuffled=['a','d','c','e','b'].map(t);expect(unshuffle(shuffled,q,'d')).toEqual({queue:q,index:3});});
 it('keeps tracks added while shuffled and drops removed ones on unshuffle',()=>{const shuffled=['a','e','c','f'].map(t);const r=unshuffle(shuffled,q,'c');expect(ids(r.queue)).toBe('acef');expect(r.index).toBe(1);});
 it('reorders and keeps the index on the current track',()=>{expect(moveItem(q,2,4,0)).toEqual({queue:['e','a','b','c','d'].map(t),index:3});expect(moveItem(q,2,2,0).index).toBe(0);const r=moveItem(q,2,0,4);expect(ids(r.queue)).toBe('bcdea');expect(r.index).toBe(1);});
 it('removes items and reports when the current track was removed',()=>{expect(removeItem(q,2,0)).toMatchObject({index:1,removedCurrent:false});expect(removeItem(q,2,2)).toMatchObject({index:2,removedCurrent:true});expect(removeItem(q,4,4)).toMatchObject({index:3,removedCurrent:true});});
 it('drops duplicate videos so every row has a unique key',()=>{expect(ids(dedupe(['a','b','a','c','b'].map(t)))).toBe('abc');});
});

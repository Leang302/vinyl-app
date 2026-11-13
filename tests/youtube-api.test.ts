import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanArtist, looksLikeYouTubeUrl, parseDuration, resolveYouTube } from '../src/lib/youtubeApi';
const video=(id:string,o:{embeddable?:boolean;privacy?:string;title?:string;channel?:string}={})=>({id,snippet:{title:o.title||`Song ${id}`,channelTitle:o.channel||'Artist - Topic'},contentDetails:{duration:'PT3M5S'},status:{embeddable:o.embeddable??true,privacyStatus:o.privacy||'public',uploadStatus:'processed'}});
function mockFetch(routes:Record<string,(url:URL)=>unknown>){
 const calls:URL[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:URL)=>{const url=new URL(input);calls.push(url);const path=url.pathname.split('/').pop()!;const body=routes[path]?.(url);return {ok:body!==undefined,status:body===undefined?404:200,json:async()=>body??{error:{errors:[{reason:'playlistNotFound'}]}}};}));
 return calls;
}
afterEach(()=>vi.unstubAllGlobals());
describe('YouTube Data API resolver',()=>{
 it('parses ISO durations and cleans channel names',()=>{expect(parseDuration('PT1H2M3S')).toBe(3723);expect(parseDuration('PT45S')).toBe(45);expect(parseDuration(undefined)).toBeUndefined();expect(cleanArtist('Nina Simone - Topic')).toBe('Nina Simone');expect(cleanArtist('ArtistVEVO')).toBe('Artist');});
 it('tells links from search phrases',()=>{expect(looksLikeYouTubeUrl('https://youtu.be/jfKfPfyJRdk')).toBe(true);expect(looksLikeYouTubeUrl('youtube.com/playlist?list=PL1')).toBe(true);expect(looksLikeYouTubeUrl('lofi beats')).toBe(false);});
 it('resolves a PL playlist with playlistItems.list and drops unembeddable and private videos',async()=>{
  const calls=mockFetch({playlists:()=>({items:[{snippet:{title:'Late night'}}]}),playlistItems:()=>({items:['aaaaaaaaaaa','bbbbbbbbbbb','ccccccccccc','ddddddddddd'].map(videoId=>({contentDetails:{videoId}}))}),videos:()=>({items:[video('aaaaaaaaaaa'),video('bbbbbbbbbbb',{embeddable:false}),video('ccccccccccc',{privacy:'private'}),video('ddddddddddd')]})});
  const r=await resolveYouTube('https://www.youtube.com/playlist?list=PL1234567890_abcdefgh','KEY','col');
  expect(r.tracks.map(t=>t.id)).toEqual(['aaaaaaaaaaa','ddddddddddd']);expect(r.skipped).toBe(2);expect(r.title).toBe('Late night');
  expect(r.tracks[0]).toMatchObject({source:'youtube',videoId:'aaaaaaaaaaa',artist:'Artist',duration:185,collectionId:'col'});
  expect(calls.every(u=>u.searchParams.get('key')==='KEY')).toBe(true);
 });
 it('starts a playlist at the linked video',async()=>{mockFetch({playlists:()=>({items:[]}),playlistItems:()=>({items:['aaaaaaaaaaa','bbbbbbbbbbb'].map(videoId=>({contentDetails:{videoId}}))}),videos:()=>({items:[video('aaaaaaaaaaa'),video('bbbbbbbbbbb')]})});const r=await resolveYouTube('https://youtube.com/watch?v=bbbbbbbbbbb&list=PL1234567890_abcdefgh&t=30','KEY');expect(r.startIndex).toBe(1);expect(r.startSeconds).toBe(30);});
 it('turns a radio (RD) link into seed + embeddable search results, never an RD playlist',async()=>{
  const calls=mockFetch({videos:url=>({items:url.searchParams.get('id')!.split(',').map(id=>video(id,{title:id==='eeeeeeeeeee'?'Seed song (Official Video)':id==='fffffffffff'?'Seed Song':`Song ${id}`,embeddable:id!=='hhhhhhhhhhh'}))}),search:()=>({items:['fffffffffff','ggggggggggg','hhhhhhhhhhh','eeeeeeeeeee'].map(videoId=>({id:{videoId}}))})});
  const r=await resolveYouTube('https://www.youtube.com/watch?v=eeeeeeeeeee&list=RDeeeeeeeeeee&start_radio=1','KEY');
  expect(r.kind).toBe('radio');expect(r.tracks.map(t=>t.id)).toEqual(['eeeeeeeeeee','ggggggggggg']);
  const search=calls.find(u=>u.pathname.endsWith('/search'))!;
  expect(search.searchParams.get('type')).toBe('video');expect(search.searchParams.get('videoEmbeddable')).toBe('true');expect(search.searchParams.get('videoSyndicated')).toBe('true');expect(search.searchParams.get('q')).toBe('Artist');
  expect(calls.some(u=>u.searchParams.get('playlistId')?.startsWith('RD'))).toBe(false);
 });
 it('searches plain text with embeddable, syndicated video filters',async()=>{const calls=mockFetch({search:()=>({items:[{id:{videoId:'aaaaaaaaaaa'}}]}),videos:()=>({items:[video('aaaaaaaaaaa')]})});const r=await resolveYouTube('quiet piano','KEY');expect(r.kind).toBe('search');expect(r.tracks).toHaveLength(1);const s=calls.find(u=>u.pathname.endsWith('/search'))!;expect(s.searchParams.get('q')).toBe('quiet piano');expect(s.searchParams.get('videoEmbeddable')).toBe('true');});
 it('explains API failures in plain language',async()=>{mockFetch({});await expect(resolveYouTube('https://www.youtube.com/playlist?list=PL1234567890_abcdefgh','KEY')).rejects.toThrow('private or no longer exists');});
 it('fails clearly when nothing in a playlist can be embedded',async()=>{mockFetch({playlists:()=>({items:[]}),playlistItems:()=>({items:[{contentDetails:{videoId:'aaaaaaaaaaa'}}]}),videos:()=>({items:[video('aaaaaaaaaaa',{embeddable:false})]})});await expect(resolveYouTube('https://youtube.com/playlist?list=PL1234567890_abcdefgh','KEY')).rejects.toThrow('None of the videos');});
});

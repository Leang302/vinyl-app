import { describe, expect, it } from 'vitest';
import { parseYouTubeUrl } from '../src/lib/youtube';
describe('YouTube URL parsing',()=>{
 const videoId='jfKfPfyJRdk';const playlistId='PL1234567890_abcdefgh';
 it.each([`https://youtube.com/watch?v=${videoId}`,`https://www.youtube.com/watch?v=${videoId}`,`https://m.youtube.com/watch?v=${videoId}`,`https://youtu.be/${videoId}`,`https://youtube.com/shorts/${videoId}`,`https://youtube.com/live/${videoId}`,`https://www.youtube-nocookie.com/embed/${videoId}`])('extracts a supported video from %s',url=>expect(parseYouTubeUrl(url).videoId).toBe(videoId));
 it.each([`https://youtube.com/playlist?list=${playlistId}`,`https://music.youtube.com/playlist?list=${playlistId}`,`https://youtube.com/watch?v=${videoId}&list=${playlistId}`])('extracts playlists from %s',url=>expect(parseYouTubeUrl(url).playlistId).toBe(playlistId));
 it('retains a playlist alongside a video and zero-based index',()=>expect(parseYouTubeUrl(`https://youtube.com/watch?v=${videoId}&list=${playlistId}&index=3&t=1m20s`)).toEqual({videoId,playlistId,index:2,startSeconds:80}));
 it('parses seconds and hour timestamps',()=>{expect(parseYouTubeUrl(`https://youtu.be/${videoId}?t=95`).startSeconds).toBe(95);expect(parseYouTubeUrl(`https://youtu.be/${videoId}?t=1h2m3s`).startSeconds).toBe(3723);});
 it.each(['not a URL','javascript:alert(1)','https://youtube.com.evil.com/watch?v=jfKfPfyJRdk','https://evil.com/?v=jfKfPfyJRdk','https://youtube.com/watch?v=short','https://youtube.com/','https://youtube.com/playlist?list=bad','ftp://youtube.com/watch?v=jfKfPfyJRdk'])('rejects malformed and misleading links: %s',url=>expect(()=>parseYouTubeUrl(url)).toThrow());
 it('opens the seed video from the reported radio URL instead of loading RD as a playlist',()=>{expect(parseYouTubeUrl('https://www.youtube.com/watch?v=pMuyCwMkXAU&list=RDpMuyCwMkXAU&start_radio=1')).toEqual({videoId:'pMuyCwMkXAU',playlistId:undefined,index:0,startSeconds:0,radioMix:true});});
 it('retains the video and timestamp in YouTube Music radio links',()=>{expect(parseYouTubeUrl('https://music.youtube.com/watch?v=pMuyCwMkXAU&list=RDAMVMpMuyCwMkXAU&t=45')).toEqual({videoId:'pMuyCwMkXAU',playlistId:undefined,index:0,startSeconds:45,radioMix:true});});
 it('extracts a seed from a plain RD video mix URL',()=>{expect(parseYouTubeUrl('https://www.youtube.com/playlist?list=RDpMuyCwMkXAU').videoId).toBe('pMuyCwMkXAU');});
 it('explains how to recover a generated mix with no seed video',()=>{expect(()=>parseYouTubeUrl('https://youtube.com/playlist?list=RDCLAK5uy_abcdefghijk')).toThrow('needs a video link');});

});

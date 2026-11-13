import { usePlayer } from '../state/store';
import { LocalAudioAdapter } from './LocalAudioAdapter';
import { YouTubePlayerAdapter, describeError } from './YouTubePlayerAdapter';
import { parseYouTubeUrl } from '../lib/youtube';
import { cleanArtist, looksLikeYouTubeUrl, resolveYouTube, youtubeApiKey, type Resolved } from '../lib/youtubeApi';
import { saveQueue } from '../lib/queueStorage';
import { COLLECTION_TINT } from '../lib/palette';
import { dedupe, moveItem, nextIndex, previousIndex, removeItem, shuffleUpcoming, unshuffle } from './queue';
import type { Collection, Snapshot, Track } from './types';
const state=usePlayer.getState;
const SKIP_DELAY=1000;
export const watchUrl=(t:Track)=>`https://www.youtube.com/watch?v=${t.videoId||t.id}`;
const placeholder=(videoId:string,i:number,collectionId?:string):Track=>({id:videoId,videoId,source:'youtube',title:`Track ${i+1}`,artist:'YouTube',artwork:`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,collectionId});
const withScheme=(input:string)=>/^https?:/i.test(input.trim())?input.trim():`https://${input.trim()}`;

/** Stable identity for a pasted source, used to stop the same playlist being added twice. */
export function sourceKeyFor(input:string):string{
  const text=input.trim();
  if(looksLikeYouTubeUrl(text)){try{const s=parseYouTubeUrl(withScheme(text));return s.playlistId?`pl:${s.playlistId}`:`v:${s.videoId}`;}catch{/* fall through */}}
  return `q:${text.toLowerCase().replace(/\s+/g,' ')}`;
}

/** What the Add-music dialog shows before anything is saved. */
export type Preview={kind:'resolved';resolved:Resolved}|{kind:'link';title:string;artwork?:string;count?:number;note:string};

/**
 * Single transport for both sources. The queue (tracks, index, shuffle, repeat)
 * lives in the store and is owned here; adapters only ever play one track.
 */
export class PlaybackController {
  local=new LocalAudioAdapter(snapshot=>this.localSnapshot(snapshot),()=>state().settings);
  private youtube?:YouTubePlayerAdapter;
  private youtubeMount?:Promise<void>;
  private generation=0;
  /** Track currently loaded in an adapter ('' after a refresh until the user presses play). */
  private loadedId='';
  /** Restored position, used by the first play after a refresh. */
  private resumeAt=0;
  private skipTimer?:number;
  private skipStreak=0;
  /** The current track was chosen directly by the listener, so a block should not jump elsewhere. */
  private picked=false;
  private savedPosition=0;
  private unsubscribe?:()=>void;
  private onPageHide=()=>this.save();

  start(){
    this.local.nextTrack=()=>{const s=state();const i=this.findNext(true);return i>=0&&s.queue[i].source==='local'?s.queue[i]:undefined;};
    this.local.onAdvance=track=>{this.loadedId=track.id;state().patch({track,index:Math.max(0,state().queue.findIndex(t=>t.id===track.id))});state().markRecent(track.id);};
    this.local.onEnded=()=>void this.advance(true);
    this.unsubscribe=usePlayer.subscribe((s,prev)=>{
      if(s.settings!==prev.settings){this.local.applySettings();this.youtube?.refreshSettings();}
      if(s.hydrated&&!prev.hydrated){this.resumeAt=s.position;this.savedPosition=s.position;}
      if(!s.hydrated)return;
      if(s.queue!==prev.queue||s.index!==prev.index||s.shuffle!==prev.shuffle||s.repeat!==prev.repeat||s.unshuffled!==prev.unshuffled||(s.state!==prev.state&&s.state==='paused')||Math.abs(s.position-this.savedPosition)>=3)this.save();
    });
    window.addEventListener('pagehide',this.onPageHide);
  }
  private save(){const s=state();if(!s.hydrated)return;this.savedPosition=s.position;saveQueue({queue:s.queue,index:s.index,position:s.state==='ended'?0:s.position,shuffle:s.shuffle,repeat:s.repeat,unshuffled:s.unshuffled});}

  // ── Adapter events ─────────────────────────────────────────────
  private localSnapshot(snapshot:Snapshot){
    if(state().mode!=='local')return;
    state().patch({state:snapshot.state,position:snapshot.position,duration:snapshot.duration,buffered:snapshot.buffered||0,phase:this.local.phase});
    if(snapshot.error)state().notify(snapshot.error);
  }
  private ytSnapshot(snapshot:Snapshot){
    const s=state();if(s.mode!=='youtube')return;
    s.patch({state:snapshot.state,position:snapshot.position,duration:snapshot.duration||s.track?.duration||0,buffered:snapshot.buffered||0,phase:this.youtube?.transition.phase||'idle'});
    if(snapshot.state==='playing')this.skipStreak=0;
    // Keyless queues start with placeholder titles; the official player fills them in.
    const t=s.track;
    if(t?.source==='youtube'&&snapshot.trackId===(t.videoId||t.id)&&snapshot.title){
      const title=t.customTitle?t.title:snapshot.title;
      const artist=cleanArtist(snapshot.artist)||t.artist;const duration=t.duration||(snapshot.duration>0&&!snapshot.live?Math.round(snapshot.duration):undefined);
      if(title!==t.title||artist!==t.artist||duration!==t.duration){this.updateTrack(t.id,{title,artist,duration});this.nameCollectionFrom({...t,title,artist});}
    }
  }
  /** Replace a placeholder collection name ("YouTube playlist") with real metadata once it is known. */
  private nameCollectionFrom(track:Track){
    const s=state();const c=s.collections.find(x=>x.autoTitle&&x.tracks.some(t=>t.id===track.id));if(!c)return;
    const title=c.tracks.length===1?track.title:`${track.artist} · playlist`;
    s.setCollections(s.collections.map(x=>x.id===c.id?{...x,title,autoTitle:false,artwork:x.artwork||track.artwork}:x));
  }
  private onYouTubeError(code:number){
    const s=state();const track=s.track;if(!track)return;
    const info=describeError(code);
    if(!info.skip){s.notify(info.message);return;}
    this.updateTrack(track.id,{blocked:true});
    const link={href:watchUrl(track),label:'Open on YouTube'};
    const reason=info.short.replace(/^Skipped:\s*/,'');
    // The listener asked for this exact song: stay on it rather than playing something they didn't choose.
    if(this.picked){s.notify(`Can't play “${track.title}” here: ${reason}`,{link});return;}
    this.skipStreak++;
    const next=this.findNext(false);
    if(next<0||this.skipStreak>=state().queue.length){s.patch({state:'ended'});s.notify(`${info.short}. Nothing left to play here.`,{link});return;}
    s.notify(`Skipped “${track.title}”: ${reason}`,{link});
    const generation=this.generation;
    clearTimeout(this.skipTimer);
    this.skipTimer=window.setTimeout(()=>{if(generation===this.generation)void this.playIndex(this.findNext(false));},SKIP_DELAY);
  }
  /** Patch one track everywhere it appears: queue, current track, shuffle backup, saved collection. */
  private updateTrack(id:string,patch:Partial<Track>){
    const s=state();const apply=(list:Track[])=>list.map(t=>t.id===id?{...t,...patch}:t);
    s.patch({queue:apply(s.queue),unshuffled:s.unshuffled&&apply(s.unshuffled),track:s.track?.id===id?{...s.track,...patch}:s.track});
    if(s.collections.some(c=>c.tracks.some(t=>t.id===id)))s.setCollections(s.collections.map(c=>c.tracks.some(t=>t.id===id)?{...c,tracks:apply(c.tracks)}:c));
  }

  // ── Queue navigation ───────────────────────────────────────────
  /** Next playable index (skipping tracks YouTube already refused), or -1. */
  private findNext(auto:boolean):number{
    const {queue,index,repeat}=state();
    let i=nextIndex(queue.length,index,repeat,auto);
    for(let guard=0;i>=0&&queue[i]?.blocked&&guard<queue.length;guard++)i=nextIndex(queue.length,i,repeat==='one'?'all':repeat,false);
    return i>=0&&!queue[i]?.blocked?i:-1;
  }
  private async advance(auto:boolean){
    const s=state();const i=this.findNext(auto);
    if(i<0){s.patch({state:'ended'});return;}
    if(i===s.index&&this.loadedId===s.queue[i]?.id){this.seek(0);await this.resume();return;}
    await this.playIndex(i);
  }
  async next(){
    const i=this.findNext(false);
    if(i>=0){await this.playIndex(i);return;}
    this.stopAdapters();state().patch({state:'ended',position:0});
  }
  async previous(){
    const s=state();
    if(s.position>3&&this.loadedId){this.seek(0);return;}
    let i=previousIndex(s.queue.length,s.index,s.repeat);
    for(let guard=0;i>0&&s.queue[i]?.blocked&&guard<s.queue.length;guard++)i=previousIndex(s.queue.length,i,s.repeat);
    if(i>=0)await this.playIndex(i);
  }
  async playIndex(i:number,startAt=0,picked=false){const track=state().queue[i];if(track)await this.load(track,i,startAt,picked);}
  /** The listener chose this row: play it, and don't jump to another song if YouTube blocks it. */
  async pick(i:number){await this.playIndex(i,0,true);}
  /** Play a track; if it is not queued yet, it is inserted after the current one. */
  async selectTrack(track:Track,picked=false){
    const s=state();let i=s.queue.findIndex(t=>t.id===track.id);
    if(i<0){i=s.queue.length?s.index+1:0;const queue=s.queue.slice();queue.splice(i,0,track);s.patch({queue,unshuffled:s.unshuffled&&[...s.unshuffled,track]});}
    await this.playIndex(i,0,picked);
  }
  private async load(track:Track,index:number,startAt=0,picked=false){
    clearTimeout(this.skipTimer);this.picked=picked;
    const generation=++this.generation;
    const s=state();this.loadedId=track.id;this.resumeAt=0;s.markRecent(track.id);
    if(track.source==='youtube'){
      this.local.deactivate();
      s.patch({mode:'youtube',track,index,state:'loading',position:startAt,duration:track.duration||0,buffered:0,phase:'idle'});
      try{await this.ensureYouTube();}
      catch(error){if(generation!==this.generation)return;this.loadedId='';s.patch({state:'error'});s.notify(error instanceof Error?error.message:'The YouTube player could not be loaded.');return;}
      if(generation!==this.generation)return;
      this.youtube!.loadVideo(track.videoId||track.id,startAt);
    }else{
      this.youtube?.stop();
      s.patch({mode:'local',track,index,position:startAt,duration:0,buffered:0});
      await this.local.load(track,startAt);
    }
  }
  private async ensureYouTube(){
    if(!this.youtube){
      const host=document.getElementById('youtube-host');if(!host)throw new Error('The YouTube player could not be opened.');
      host.replaceChildren();const node=document.createElement('div');host.appendChild(node);
      const yt=this.youtube=new YouTubePlayerAdapter(snapshot=>this.ytSnapshot(snapshot),()=>state().settings,{
        onEnded:()=>void this.advance(true),
        onError:code=>this.onYouTubeError(code),
        onAutoplayBlocked:()=>state().notify('Your browser blocked autoplay. Press play to start.'),
        onStalled:()=>state().notify('YouTube is taking a while to start. Press play to try again.'),
      });
      this.youtubeMount=yt.mount(node).catch(error=>{if(this.youtube===yt){this.youtube=undefined;this.youtubeMount=undefined;yt.dispose();}throw error;});
    }
    await this.youtubeMount;
  }
  private stopAdapters(){clearTimeout(this.skipTimer);this.generation++;this.loadedId='';this.local.deactivate();this.youtube?.stop();}

  // ── Transport ──────────────────────────────────────────────────
  pause(){const s=state();if(s.mode==='youtube')this.youtube?.pause();else if(['playing','buffering'].includes(s.state))this.local.pause();}
  async resume(){const s=state();if(['playing','buffering'].includes(s.state))return;await this.toggle();}
  async toggle(){
    const s=state();
    if(s.state==='playing'||s.state==='buffering'){this.pause();return;}
    if(!s.track)return;
    const loaded=this.loadedId===s.track.id&&!['idle','error','ended'].includes(s.state);
    if(loaded){if(s.mode==='youtube')await this.youtube?.play();else await this.local.play();return;}
    if(s.state==='ended'&&s.index>=s.queue.length-1&&s.repeat==='off'&&this.loadedId){await this.playIndex(0);return;}
    await this.playIndex(s.index,s.state==='ended'?0:this.resumeAt);
  }
  seek(time:number){
    if(!this.loadedId){this.resumeAt=Math.max(0,time);state().patch({position:this.resumeAt});return;}
    if(state().mode==='youtube')this.youtube?.seek(time);else this.local.seek(time);
  }
  /** Relative seek for the J/L and ←/→ shortcuts. */
  seekBy(delta:number){const s=state();if(!s.track)return;const end=s.duration||Infinity;this.seek(Math.max(0,Math.min(end-0.5,s.position+delta)));}
  setShuffle(on:boolean){
    const s=state();if(on===s.shuffle)return;
    if(on)s.patch({shuffle:true,unshuffled:s.queue,queue:shuffleUpcoming(s.queue,s.index)});
    else s.patch({shuffle:false,unshuffled:null,...unshuffle(s.queue,s.unshuffled||s.queue,s.track?.id)});
  }
  cycleRepeat(){const r=state().repeat;state().patch({repeat:r==='off'?'all':r==='all'?'one':'off'});}

  // ── Queue editing ──────────────────────────────────────────────
  private setQueue(tracks:Track[],index:number){
    const queue=dedupe(tracks);const s=state();
    if(s.shuffle)s.patch({unshuffled:queue,queue:shuffleUpcoming(queue,index),index});
    else s.patch({queue,index,unshuffled:null});
  }
  move(from:number,to:number){const s=state();s.patch(moveItem(s.queue,s.index,from,to));}
  /** Put tracks right after the current one (moving them if already queued). */
  playNext(tracks:Track[]){
    const s=state();if(!tracks.length)return;
    if(!s.queue.length){this.setQueue(tracks,0);state().patch({track:tracks[0]});return;}
    const ids=new Set(tracks.filter(t=>t.id!==s.track?.id).map(t=>t.id));
    const rest=s.queue.filter(t=>!ids.has(t.id));
    const at=Math.max(0,rest.findIndex(t=>t.id===s.track?.id));
    const incoming=tracks.filter(t=>ids.has(t.id));
    const queue=[...rest.slice(0,at+1),...incoming,...rest.slice(at+1)];
    s.patch({queue,index:at,unshuffled:s.unshuffled&&dedupe([...s.unshuffled,...incoming])});
    s.notify(incoming.length===1?`“${incoming[0].title}” plays next`:`${incoming.length} tracks play next`);
  }
  async remove(at:number){
    const s=state();const wasPlaying=['playing','buffering','loading'].includes(s.state);
    const r=removeItem(s.queue,s.index,at);
    if(!r.queue.length){this.clear();return;}
    s.patch({queue:r.queue,index:r.index,unshuffled:s.unshuffled&&s.unshuffled.filter(t=>t.id!==s.queue[at].id)});
    if(r.removedCurrent){if(wasPlaying)await this.playIndex(r.index);else{this.stopAdapters();state().patch({track:r.queue[r.index],state:'idle',position:0,duration:0});}}
  }
  renameTrack(id:string,title:string){const clean=title.trim();if(clean)this.updateTrack(id,{title:clean,customTitle:true});}
  renameCollection(id:string,title:string){const s=state();const clean=title.trim();if(clean)s.setCollections(s.collections.map(c=>c.id===id?{...c,title:clean,autoTitle:false}:c));}
  async selectCollection(collection:Collection){
    if(!collection.tracks.length&&collection.youtubeUrl){
      // Collections saved before the app owned its queue only stored the link.
      try{const r=await this.resolve(collection.youtubeUrl,collection.id);
        const updated={...collection,tracks:r.tracks,artwork:r.tracks[0]?.artwork||collection.artwork};
        state().setCollections(state().collections.map(c=>c.id===collection.id?updated:c));
        this.setQueue(r.tracks,r.startIndex);await this.playIndex(r.startIndex,r.startSeconds);
      }catch(error){state().notify(error instanceof Error?error.message:'This link could not be opened.');}
      return;
    }
    this.setQueue(collection.tracks,0);if(collection.tracks.length)await this.playIndex(0);
  }
  private existing(input:string){const key=sourceKeyFor(input);return state().collections.find(c=>c.sourceKey===key||(c.youtubeUrl&&sourceKeyFor(c.youtubeUrl)===key));}
  /**
   * Look a link up without saving or playing anything (for the Add-music preview).
   * With an API key this is the full resolve; without one only the link itself is inspected.
   */
  async preview(input:string,signal?:AbortSignal):Promise<Preview>{
    const key=youtubeApiKey();
    if(key)return {kind:'resolved',resolved:await resolveYouTube(input,key,undefined,signal)};
    if(!looksLikeYouTubeUrl(input))throw new Error('Paste a youtube.com or youtu.be link. Searching needs a YouTube API key.');
    const s=parseYouTubeUrl(withScheme(input));
    if(s.playlistId)return {kind:'link',title:'YouTube playlist',artwork:s.videoId?`https://i.ytimg.com/vi/${s.videoId}/mqdefault.jpg`:undefined,note:'Track count and titles load when added.'};
    return {kind:'link',title:'YouTube video',artwork:`https://i.ytimg.com/vi/${s.videoId}/mqdefault.jpg`,count:1,note:'Title loads when it starts playing.'};
  }
  /** Save a previewed (or freshly resolved) source as a collection and start playing it. Throws so the caller can show one inline error. */
  async addFromYouTube(input:string,name?:string,resolved?:Resolved):Promise<Collection>{
    const already=this.existing(input);
    if(already){state().notify(`“${already.title}” is already in your collection`);await this.selectCollection(already);return already;}
    const id=crypto.randomUUID();
    const r=resolved?{...resolved,tracks:resolved.tracks.map(t=>({...t,collectionId:id}))}:await this.resolve(input,id);
    const placeholderTitle=!resolved&&!youtubeApiKey();
    const collection:Collection={id,title:name?.trim()||r.title,subtitle:`${r.tracks.length} ${r.tracks.length===1?'track':'tracks'} · YouTube`,artwork:r.tracks[0].artwork,color:COLLECTION_TINT.youtube,tracks:r.tracks,youtubeUrl:looksLikeYouTubeUrl(input)?input.trim():undefined,sourceKey:sourceKeyFor(input),autoTitle:placeholderTitle&&!name?.trim()};
    state().setCollections([...state().collections,collection]);
    this.setQueue(r.tracks,r.startIndex);
    await this.playIndex(r.startIndex,r.startSeconds);
    if(r.skipped)state().notify(`${r.skipped} ${r.skipped===1?'video was':'videos were'} left out: embedding disabled or unavailable.`);
    return collection;
  }
  private async resolve(input:string,collectionId:string):Promise<Resolved>{
    state().patch({resolving:true});
    try{
      const key=youtubeApiKey();
      if(key)return await resolveYouTube(input,key,collectionId);
      if(!looksLikeYouTubeUrl(input))throw new Error('Searching needs a YouTube API key. Paste a video or playlist link instead.');
      const source=parseYouTubeUrl(withScheme(input));
      if(source.playlistId){
        await this.ensureYouTube();
        const ids=dedupe((await this.youtube!.readPlaylistIds(source.playlistId)).map((v,i)=>placeholder(v,i,collectionId)));
        if(!ids.length)throw new Error('This playlist is private, empty, or unavailable.');
        const at=source.videoId?ids.findIndex(t=>t.id===source.videoId):source.index;
        return {tracks:ids,startIndex:Math.max(0,Math.min(ids.length-1,at)),startSeconds:source.videoId?source.startSeconds:0,title:'YouTube playlist',kind:'playlist',skipped:0};
      }
      return {tracks:[placeholder(source.videoId!,0,collectionId)],startIndex:0,startSeconds:source.startSeconds,title:'YouTube video',kind:'video',skipped:0};
    }finally{state().patch({resolving:false});}
  }
  clear(){this.stopAdapters();this.resumeAt=0;state().patch({track:null,queue:[],unshuffled:null,index:0,state:'idle',position:0,duration:0,buffered:0,phase:'idle'});}
  /** Clear the queue, with an Undo in the toast. */
  clearWithUndo(){
    const s=state();const snapshot={queue:s.queue,index:s.index,track:s.track,unshuffled:s.unshuffled,mode:s.mode};
    this.clear();
    state().notify('Queue cleared',{action:{label:'Undo',run:()=>state().patch({...snapshot,state:'idle',position:0,duration:0})}});
  }
  dispose(){this.save();window.removeEventListener('pagehide',this.onPageHide);this.unsubscribe?.();clearTimeout(this.skipTimer);this.youtube?.dispose();this.local.dispose();}
}
export const playback=new PlaybackController();

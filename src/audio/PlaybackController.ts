import { usePlayer } from '../state/store';
import { LocalAudioAdapter } from './LocalAudioAdapter';
import { YouTubePlayerAdapter } from './YouTubePlayerAdapter';
import { parseYouTubeUrl } from '../lib/youtube';
import type { Collection, Snapshot, Track } from './types';
const state=usePlayer.getState;
export class PlaybackController {
  local=new LocalAudioAdapter(snapshot=>this.localSnapshot(snapshot),()=>state().settings);
  private youtube?:YouTubePlayerAdapter;
  private youtubeMount?:Promise<void>;
  private activeCollection?:Collection;
  private loadGeneration=0;
  private unsubscribe?:()=>void;
  private ytSeen=new Map<string,Track>();
  private currentLocalId='';
  start(){
    this.local.nextTrack=()=>this.peekNext();
    this.local.onAdvance=track=>{this.currentLocalId=track.id;state().patch({track,index:state().queue.findIndex(t=>t.id===track.id)});state().markRecent(track.id);};
    this.local.onEnded=()=>{const next=this.peekNext();if(next)void this.selectTrack(next);};
    this.unsubscribe=usePlayer.subscribe((s,prev)=>{
      if(s.settings!==prev.settings){this.local.applySettings();this.youtube?.refreshSettings();}
      if(s.shuffle!==prev.shuffle)this.youtube?.setShuffle(s.shuffle);
      if(s.repeat!==prev.repeat)this.youtube?.setRepeat(s.repeat);
    });
  }
  private localSnapshot(snapshot:Snapshot){if(state().mode!=='local')return;state().patch({state:snapshot.state,position:snapshot.position,duration:snapshot.duration,phase:this.local.phase,...(snapshot.error?{error:snapshot.error}:{})});}
  private ytSnapshot(snapshot:Snapshot){
    if(state().mode!=='youtube')return;
    const s=state();const patch:Parameters<typeof s.patch>[0]={state:snapshot.state,position:snapshot.position,duration:snapshot.duration,phase:this.youtube?.transition.phase||'idle'};
    if(snapshot.error)patch.error=snapshot.error;else if(snapshot.state==='playing')patch.error=null;
    const ids=snapshot.playlist?.length?snapshot.playlist:snapshot.trackId?[snapshot.trackId]:[];
    if(ids.length){
      patch.queue=ids.map((id,index)=>{
        const current=id===snapshot.trackId;
        const old=this.ytSeen.get(id);
        const track:Track={id,title:current&&snapshot.title?snapshot.title:old?.title||`Playlist track ${index+1}`,artist:current&&snapshot.artist?snapshot.artist:old?.artist||'YouTube',source:'youtube',videoId:id,artwork:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,collectionId:this.activeCollection?.id};
        this.ytSeen.set(id,track);return track;
      });
      patch.index=Math.max(0,patch.queue.findIndex(t=>t.id===snapshot.trackId));patch.track=patch.queue[patch.index];
      if(patch.track?.id!==s.track?.id&&snapshot.state==='playing')s.markRecent(patch.track.id);
      if(this.activeCollection&&snapshot.title){const updated={...this.activeCollection,tracks:patch.queue};this.activeCollection=updated;const collections=s.collections.map(c=>c.id===updated.id?updated:c);if(JSON.stringify(s.collections.find(c=>c.id===updated.id)?.tracks)!==JSON.stringify(updated.tracks))s.setCollections(collections);}
    }
    s.patch(patch);
  }
  private peekNext():Track|undefined{
    const s=state();if(s.repeat==='one')return s.track||undefined;
    if(s.shuffle&&s.queue.length>1){const candidates=s.queue.filter(t=>t.id!==s.track?.id);return candidates[Math.floor(Math.random()*candidates.length)];}
    if(s.index+1<s.queue.length)return s.queue[s.index+1];if(s.repeat==='all')return s.queue[0];return undefined;
  }
  async selectCollection(collection:Collection){
    this.activeCollection=collection;
    if(collection.youtubeUrl){await this.loadYouTube(collection.youtubeUrl,collection);return;}
    state().patch({queue:collection.tracks,index:0});if(collection.tracks[0])await this.selectTrack(collection.tracks[0]);
  }
  async selectTrack(track:Track){
    state().patch({error:null});
    if(track.source==='youtube'){
      if(this.youtube&&state().mode==='youtube'){const index=state().queue.findIndex(t=>t.id===track.id);if(index>=0){this.youtube.playAt(index);return;}}
      await this.loadYouTube(`https://www.youtube.com/watch?v=${track.videoId||track.id}`);return;
    }
    this.loadGeneration++;this.youtube?.dispose();this.youtube=undefined;this.youtubeMount=undefined;
    const host=document.getElementById('youtube-host');host?.replaceChildren();
    state().patch({mode:'local',sourceNotice:null,youtubeUrl:null,track,index:Math.max(0,state().queue.findIndex(t=>t.id===track.id)),position:0,duration:0});
    this.currentLocalId=track.id;state().markRecent(track.id);await this.local.load(track);
  }
  async loadYouTube(url:string,collection?:Collection){
    let generation=0;
    try{
      const source=parseYouTubeUrl(url);generation=++this.loadGeneration;this.local.deactivate();
      state().patch({mode:'youtube',state:'loading',error:null,youtubeUrl:url,sourceNotice:source.radioMix?'This is a generated YouTube radio mix. VINYL opens its seed video; the full radio mix is available on YouTube.':null,position:0,duration:0,track:collection?.tracks[0]||null,queue:collection?.tracks||[],index:0});this.activeCollection=collection;
      if(!this.youtube){
        const host=document.getElementById('youtube-host');if(!host)throw new Error('The YouTube player could not be opened.');
        host.replaceChildren();const node=document.createElement('div');host.appendChild(node);
        const yt=this.youtube=new YouTubePlayerAdapter(snapshot=>this.ytSnapshot(snapshot),()=>state().settings);
        this.youtubeMount=yt.mount(node);
      }
      await this.youtubeMount;if(generation!==this.loadGeneration)return;
      this.youtube!.load(source);this.youtube!.setRepeat(state().repeat);this.youtube!.setShuffle(state().shuffle);
    }catch(error){if(generation&&generation!==this.loadGeneration)return;state().patch({state:'error',error:error instanceof Error?error.message:'The YouTube player could not be loaded.'});this.youtube?.dispose();this.youtube=undefined;this.youtubeMount=undefined;}
  }
  async toggle(){const s=state();if(s.state==='playing'||s.state==='buffering'){if(s.mode==='youtube')this.youtube?.pause();else this.local.pause();return;}if(s.mode==='youtube'){if(this.youtube&&s.state!=='error')await this.youtube.play();else if(this.activeCollection?.youtubeUrl)await this.loadYouTube(this.activeCollection.youtubeUrl,this.activeCollection);return;}if(s.track){if(s.track.id===this.currentLocalId&&s.state!=='idle'&&s.state!=='error'&&s.state!=='ended')await this.local.play();else await this.selectTrack(s.track);}}
  async next(){if(state().mode==='youtube'){this.youtube?.next();return;}const next=this.peekNext();if(next)await this.selectTrack(next);else {this.local.pause();this.local.seek(0);}}
  async previous(){if(state().position>3){this.seek(0);return;}if(state().mode==='youtube'){this.youtube?.previous();return;}const s=state();const index=s.index>0?s.index-1:s.repeat==='all'?s.queue.length-1:0;const track=s.queue[index];if(track)await this.selectTrack(track);}
  seek(time:number){if(state().mode==='youtube')this.youtube?.seek(time);else this.local.seek(time);}
  clear(){this.loadGeneration++;this.local.deactivate();this.youtube?.dispose();this.youtube=undefined;this.youtubeMount=undefined;this.currentLocalId='';this.activeCollection=undefined;state().patch({sourceNotice:null,youtubeUrl:null,track:null,queue:[],index:0,state:'idle',position:0,duration:0,phase:'idle'});}
  dispose(){this.unsubscribe?.();this.youtube?.dispose();this.local.dispose();}
}
export const playback=new PlaybackController();

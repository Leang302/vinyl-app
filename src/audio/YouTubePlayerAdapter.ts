import type { PlaybackAdapter, PlaybackListener, Snapshot, Settings } from './types';
import type { YouTubeSource } from '../lib/youtube';
import { TransitionManager } from './TransitionManager';
let apiPromise: Promise<void> | undefined;
export function loadYouTubeAPI(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) apiPromise = new Promise<void>((resolve,reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(()=>{ apiPromise=undefined; reject(new Error('YouTube could not connect. Check your connection or content blocker, then try again.')); },15000);
    window.onYouTubeIframeAPIReady = () => { previous?.(); clearTimeout(timeout); resolve(); };
    const old = document.getElementById('youtube-api-script'); old?.remove();
    const script = document.createElement('script'); script.id='youtube-api-script'; script.src='https://www.youtube.com/iframe_api';
    script.onerror=()=>{ clearTimeout(timeout); apiPromise=undefined; script.remove(); reject(new Error('Unable to reach YouTube. Check your connection and try again.')); };
    document.head.appendChild(script);
  });
  return apiPromise;
}
const errors: Record<number,string> = {2:'YouTube could not read this video link.',5:'Your browser could not play this video. Try its YouTube controls.',100:'This video is private, removed, or unavailable.',101:'The owner does not allow this video to be embedded. Try another video.',150:'The owner does not allow this video to be embedded. Try another video.',153:'YouTube could not verify this website. Open VINYL through its HTTP address.'};
export class YouTubePlayerAdapter implements PlaybackAdapter {
  readonly kind='youtube' as const;
  private player?: YT.Player;
  private timer?: number;
  private destroyed=false;
  private readyTimeout?:number;
  private loadTimeout?:number;
  private rejectMount?:(message?:string)=>void;
  private status: Snapshot['state']='idle';
  private previousTime=0;
  private repeatOne=false;
  private repeatAll=false;
  readonly transition=new TransitionManager();
  constructor(private listener: PlaybackListener,private settings: ()=>Settings) {}
  async mount(element: HTMLElement) {
    await loadYouTubeAPI(); if(this.destroyed) return;
    await new Promise<void>((resolve,reject)=>{
      const timeout=this.readyTimeout=window.setTimeout(()=>reject(new Error('YouTube did not finish loading. Try again or use local files.')),15000);
      this.rejectMount=(message)=>reject(new Error(message||'YouTube loading was cancelled.'));
      this.player=new window.YT.Player(element,{width:'100%',height:'100%',playerVars:{playsinline:1,controls:1,origin:window.location.origin,rel:0},events:{
        onReady:()=>{clearTimeout(timeout);this.readyTimeout=undefined;this.rejectMount=undefined; if(this.destroyed){this.player?.destroy();return;} this.player?.setVolume(this.settings().volume); resolve();},
        onStateChange:event=>this.onState(event.data),
        onError:event=>{if(this.destroyed)return;if(this.loadTimeout)clearTimeout(this.loadTimeout);this.loadTimeout=undefined;clearTimeout(timeout);this.readyTimeout=undefined;this.rejectMount?.(errors[event.data]||'YouTube cannot play this video.');this.rejectMount=undefined;this.status='error';this.stopPolling();this.emit(errors[event.data]||'YouTube cannot play this video. Choose another track.');},
        onAutoplayBlocked:()=>{if(this.destroyed)return;if(this.loadTimeout)clearTimeout(this.loadTimeout);this.loadTimeout=undefined;this.status='paused';this.stopPolling();this.emit('Your browser paused autoplay. Press Play in the visible YouTube player to continue.');},
      }});
    });
  }
  load(source: YouTubeSource) {
    this.transition.manualSkip();this.status='loading';this.emit();
    if(this.loadTimeout)clearTimeout(this.loadTimeout);this.loadTimeout=window.setTimeout(()=>{if(this.destroyed)return;this.status='error';this.stopPolling();this.emit('This YouTube source did not start. The playlist may be private, unavailable, or restricted. Try another link or press Play to retry.');},20000);
    if(source.playlistId) this.player?.loadPlaylist({list:source.playlistId,listType:'playlist',index:source.index,startSeconds:source.startSeconds});
    else if(source.videoId) this.player?.loadVideoById({videoId:source.videoId,startSeconds:source.startSeconds});
  }
  private onState(state: number) {
    if(this.destroyed)return;
    if([0,1,2,5].includes(state)&&this.loadTimeout){clearTimeout(this.loadTimeout);this.loadTimeout=undefined;}
    const map:Record<number,Snapshot['state']>={[-1]:'loading',0:'ended',1:'playing',2:'paused',3:'buffering',5:'paused'};
    this.status=map[state]||'idle';
    if(state===0 && (this.repeatOne || (this.repeatAll && (this.player?.getPlaylist?.()?.length||0)<=1))){this.status='loading';this.transition.cancel();this.player?.seekTo(0,true);this.player?.playVideo();return;}
    if(state===1 || state===3) this.startPolling();else this.stopPolling();
    this.tick();
  }
  private startPolling(){ if(this.timer)return;this.previousTime=performance.now();this.timer=window.setInterval(()=>this.tick(),100); }
  private stopPolling(){if(this.timer)clearInterval(this.timer);this.timer=undefined;}
  private tick(){
    if(this.destroyed||!this.player?.getVideoData)return;
    const now=performance.now(); const dt=this.previousTime ? (now-this.previousTime)/1000 : 0;this.previousTime=now;
    const data=this.player.getVideoData() as {video_id?:string;title?:string;author?:string;isLive?:boolean};
    const volume=this.transition.update({trackId:data.video_id||'',state:this.status,position:this.player.getCurrentTime()||0,duration:this.player.getDuration()||0,dt,live:data.isLive},this.settings());
    this.player.setVolume(volume); this.emit();
  }
  private emit(error?:string){
    const p=this.player;if(!p||this.destroyed)return;
    const data=p.getVideoData?.() as {video_id?:string;title?:string;author?:string;isLive?:boolean}|undefined;
    this.listener({state:this.status,position:p.getCurrentTime?.()||0,duration:p.getDuration?.()||0,trackId:data?.video_id||'',title:data?.title,artist:data?.author,playlist:p.getPlaylist?.()||[],playlistIndex:p.getPlaylistIndex?.()||0,live:data?.isLive,error});
  }
  async play(){this.player?.playVideo();}
  pause(){this.player?.pauseVideo();}
  seek(time:number){this.transition.cancel();this.player?.setVolume(this.settings().volume);this.player?.seekTo(time,true);this.tick();}
  setVolume(volume:number){this.player?.setVolume(volume*this.transition.factor);}
  refreshSettings(){if(!this.settings().transitions)this.transition.cancel();this.setVolume(this.settings().volume);}
  next(){this.transition.manualSkip();this.player?.nextVideo();}
  previous(){this.transition.manualSkip();this.player?.previousVideo();}
  playAt(index:number){this.transition.manualSkip();this.player?.playVideoAt(index);}
  setShuffle(value:boolean){this.player?.setShuffle(value);this.emit();}
  setRepeat(value:'off'|'all'|'one'){this.repeatOne=value==='one';this.repeatAll=value==='all';this.player?.setLoop(value==='all');}
  dispose(){this.destroyed=true;if(this.loadTimeout)clearTimeout(this.loadTimeout);this.loadTimeout=undefined;if(this.readyTimeout)clearTimeout(this.readyTimeout);this.readyTimeout=undefined;this.rejectMount?.();this.rejectMount=undefined;this.stopPolling();this.transition.cancel();this.player?.destroy();}
}

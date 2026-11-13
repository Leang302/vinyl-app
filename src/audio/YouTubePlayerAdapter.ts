import type { PlaybackAdapter, PlaybackListener, Snapshot, Settings } from './types';
import { TransitionManager } from './TransitionManager';
let apiPromise: Promise<void> | undefined;
export function loadYouTubeAPI(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) apiPromise = new Promise<void>((resolve,reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(()=>{ apiPromise=undefined; reject(new Error('YouTube could not connect. Check your connection or content blocker.')); },15000);
    window.onYouTubeIframeAPIReady = () => { previous?.(); clearTimeout(timeout); resolve(); };
    const old = document.getElementById('youtube-api-script'); old?.remove();
    const script = document.createElement('script'); script.id='youtube-api-script'; script.src='https://www.youtube.com/iframe_api';
    script.onerror=()=>{ clearTimeout(timeout); apiPromise=undefined; script.remove(); reject(new Error('Unable to reach YouTube. Check your connection and try again.')); };
    document.head.appendChild(script);
  });
  return apiPromise;
}

/** IFrame API onError codes. https://developers.google.com/youtube/iframe_api_reference#onError */
export const YT_ERRORS: Record<number,{message:string;skip:boolean;short:string}> = {
  2:{message:'YouTube could not read this video ID.',skip:true,short:'Skipped: invalid video'},
  5:{message:'Your browser could not play this video.',skip:false,short:'This video could not play in your browser'},
  100:{message:'This video is private, removed, or unavailable.',skip:true,short:'Skipped: video unavailable'},
  101:{message:'The owner does not allow this video to be embedded.',skip:true,short:'Skipped: embedding disabled'},
  150:{message:'The owner does not allow this video to be embedded.',skip:true,short:'Skipped: embedding disabled'},
  153:{message:'YouTube could not verify this site. Open VINYL through http://, not a file.',skip:false,short:'YouTube could not verify this site'},
};
export function describeError(code:number){return YT_ERRORS[code]||{message:'YouTube cannot play this video.',skip:true,short:'Skipped: video unavailable'};}

export interface YouTubeEvents { onEnded?: () => void; onError?: (code: number) => void; onAutoplayBlocked?: () => void; onStalled?: () => void }

/**
 * One official, visible IFrame player that plays a single video at a time.
 * The app owns the queue; this adapter never uses YouTube playlists or mixes.
 */
export class YouTubePlayerAdapter implements PlaybackAdapter {
  readonly kind='youtube' as const;
  private player?: YT.Player;
  private timer?: number;
  private destroyed=false;
  private readyTimeout?:number;
  private loadTimeout?:number;
  private rejectMount?:(message?:string)=>void;
  private status: Snapshot['state']='idle';
  private playbackError?:string;
  private previousTime=0;
  private cueing?:{resolve:(ids:string[])=>void;timer:number};
  readonly transition=new TransitionManager();
  constructor(private listener: PlaybackListener,private settings: ()=>Settings,private events: YouTubeEvents={}) {}
  async mount(element: HTMLElement) {
    await loadYouTubeAPI(); if(this.destroyed) return;
    await new Promise<void>((resolve,reject)=>{
      const timeout=this.readyTimeout=window.setTimeout(()=>reject(new Error('YouTube did not finish loading. Try again.')),15000);
      this.rejectMount=(message)=>reject(new Error(message||'YouTube loading was cancelled.'));
      this.player=new window.YT.Player(element,{width:'100%',height:'100%',playerVars:{playsinline:1,controls:1,origin:window.location.origin,rel:0,enablejsapi:1},events:{
        onReady:()=>{clearTimeout(timeout);this.readyTimeout=undefined;this.rejectMount=undefined; if(this.destroyed){this.player?.destroy();return;} this.player?.setVolume(this.settings().volume); resolve();},
        onStateChange:event=>this.onState(event.data),
        onError:event=>this.onError(Number(event.data)),
        onAutoplayBlocked:()=>{if(this.destroyed||this.playbackError)return;this.clearLoadTimeout();this.status='paused';this.stopPolling();this.emit();this.events.onAutoplayBlocked?.();},
      }});
    });
  }
  private clearLoadTimeout(){if(this.loadTimeout)clearTimeout(this.loadTimeout);this.loadTimeout=undefined;}
  private onError(code:number){
    if(this.destroyed)return;
    if(import.meta.env.DEV)console.info('[VINYL] YouTube error',code,(this.player?.getVideoData?.() as {video_id?:string}|undefined)?.video_id||'');
    const info=describeError(code);
    this.clearLoadTimeout();
    if(this.readyTimeout){clearTimeout(this.readyTimeout);this.readyTimeout=undefined;}
    if(this.rejectMount){this.rejectMount(info.message);this.rejectMount=undefined;return;}
    if(this.cueing){this.finishCue([]);return;}
    this.status='error';this.playbackError=info.message;this.stopPolling();this.emit();
    this.events.onError?.(code);
  }
  /** Play one video. Advancing is the caller's job (see onEnded). */
  loadVideo(videoId:string,startSeconds=0){
    this.playbackError=undefined;this.stopPolling();this.transition.manualSkip();this.status='loading';this.emit();
    this.clearLoadTimeout();
    this.loadTimeout=window.setTimeout(()=>{if(this.destroyed)return;this.loadTimeout=undefined;this.status='paused';this.stopPolling();this.emit();this.events.onStalled?.();},20000);
    this.player?.loadVideoById({videoId,startSeconds});
  }
  /**
   * Keyless fallback for real (PL…) playlists: cue the list, read its video IDs,
   * and hand them to the app queue. Nothing is played from YouTube's playlist.
   */
  readPlaylistIds(listId:string):Promise<string[]>{
    if(!this.player)return Promise.resolve([]);
    if(this.cueing)this.finishCue([]);
    return new Promise(resolve=>{
      const timer=window.setTimeout(()=>this.finishCue(this.player?.getPlaylist?.()||[]),8000);
      this.cueing={resolve,timer};
      this.player!.cuePlaylist({list:listId,listType:'playlist',index:0});
    });
  }
  private finishCue(ids:string[]){const c=this.cueing;if(!c)return;this.cueing=undefined;clearTimeout(c.timer);c.resolve(ids);}
  private onState(state: number) {
    if(this.destroyed)return;
    if(this.cueing){if(state===5)this.finishCue(this.player?.getPlaylist?.()||[]);return;}
    // YouTube can send UNSTARTED/CUED after a fatal error. Keep the error stable.
    if(this.playbackError && state!==1)return;
    if(state===1)this.playbackError=undefined;
    if([0,1,2,5].includes(state))this.clearLoadTimeout();
    const map:Record<number,Snapshot['state']>={[-1]:'loading',0:'ended',1:'playing',2:'paused',3:'buffering',5:'paused'};
    this.status=map[state]||'idle';
    if(state===1 || state===3) this.startPolling();else this.stopPolling();
    this.tick();
    if(state===0)this.events.onEnded?.();
  }
  private startPolling(){ if(this.timer)return;this.previousTime=performance.now();this.timer=window.setInterval(()=>this.tick(),100); }
  private stopPolling(){if(this.timer)clearInterval(this.timer);this.timer=undefined;}
  private tick(){
    if(this.destroyed||!this.player?.getVideoData)return;
    const now=performance.now(); const dt=this.previousTime ? (now-this.previousTime)/1000 : 0;this.previousTime=now;
    const data=this.player.getVideoData() as {video_id?:string;isLive?:boolean};
    const volume=this.transition.update({trackId:data.video_id||'',state:this.status,position:this.player.getCurrentTime()||0,duration:this.player.getDuration()||0,dt,live:data.isLive},this.settings());
    this.player.setVolume(volume); this.emit();
  }
  private emit(){
    const p=this.player;if(!p||this.destroyed)return;
    const data=p.getVideoData?.() as {video_id?:string;title?:string;author?:string;isLive?:boolean}|undefined;
    this.listener({state:this.status,position:p.getCurrentTime?.()||0,duration:p.getDuration?.()||0,trackId:data?.video_id||'',title:data?.title,artist:data?.author,live:data?.isLive,error:this.playbackError,buffered:p.getVideoLoadedFraction?.()||0});
  }
  async play(){this.player?.playVideo();}
  pause(){this.player?.pauseVideo();}
  stop(){this.clearLoadTimeout();this.stopPolling();this.player?.stopVideo?.();this.status='idle';}
  seek(time:number){this.transition.cancel();this.player?.setVolume(this.settings().volume);this.player?.seekTo(time,true);this.tick();}
  setVolume(volume:number){this.player?.setVolume(volume*this.transition.factor);}
  refreshSettings(){if(!this.settings().transitions)this.transition.cancel();this.setVolume(this.settings().volume);}
  dispose(){this.destroyed=true;this.finishCue([]);this.clearLoadTimeout();if(this.readyTimeout)clearTimeout(this.readyTimeout);this.readyTimeout=undefined;this.rejectMount?.();this.rejectMount=undefined;this.stopPolling();this.transition.cancel();this.player?.destroy();}
}

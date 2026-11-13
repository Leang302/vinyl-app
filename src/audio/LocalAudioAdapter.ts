import type { PlaybackAdapter, PlaybackListener, Settings, Track, Snapshot } from './types';
import { equalPower, clamp } from './TransitionManager';
import { getFile } from '../lib/persistence';
interface Deck { audio: HTMLAudioElement; gain: GainNode; source: MediaElementAudioSourceNode; track: Track; objectUrl?: string }
/** One AudioContext, two decks, shared EQ and output. No processing touches YouTube. */
export class LocalAudioAdapter implements PlaybackAdapter {
  readonly kind='local' as const;
  private ctx?:AudioContext;private low?:BiquadFilterNode;private mid?:BiquadFilterNode;private high?:BiquadFilterNode;private pan?:StereoPannerNode;private master?:GainNode;
  analyser?:AnalyserNode;
  private current?:Deck;private incoming?:Deck;private timer?:number;private last=0;private generation=0;private paused=true;private crossElapsed=0;private crossLength=0;private crossLoading=false;private endedHandled=false;private crackleSource?:AudioBufferSourceNode;private crackleGain?:GainNode;
  nextTrack:()=>Track|undefined=()=>undefined;
  onAdvance:(track:Track)=>void=()=>{};
  onEnded:()=>void=()=>{};
  phase='idle';
  constructor(private listener:PlaybackListener,private settings:()=>Settings){}
  private async init(){
    if(!this.ctx){
      const ctx=this.ctx=new AudioContext();this.low=ctx.createBiquadFilter();this.low.type='lowshelf';this.low.frequency.value=180;
      this.mid=ctx.createBiquadFilter();this.mid.type='peaking';this.mid.frequency.value=1100;this.mid.Q.value=0.7;
      this.high=ctx.createBiquadFilter();this.high.type='highshelf';this.high.frequency.value=4500;
      this.pan=ctx.createStereoPanner();this.master=ctx.createGain();this.analyser=ctx.createAnalyser();this.analyser.fftSize=1024;this.analyser.smoothingTimeConstant=0.8;
      this.low.connect(this.mid).connect(this.high).connect(this.pan).connect(this.master).connect(this.analyser).connect(ctx.destination);
      const buffer=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);const data=buffer.getChannelData(0);
      let seed=43;for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;const n=seed/2147483647;data[i]=(n*2-1)*(n>0.9993?0.5:0.004);}
      this.crackleSource=ctx.createBufferSource();this.crackleSource.buffer=buffer;this.crackleSource.loop=true;this.crackleGain=ctx.createGain();this.crackleGain.gain.value=0;this.crackleSource.connect(this.crackleGain).connect(this.low);this.crackleSource.start();
      this.applySettings();
    }
    await this.ctx.resume();
  }
  private async makeDeck(track:Track):Promise<Deck>{
    if(!this.ctx||!this.low)throw new Error('Audio output is not ready.');
    let url=track.url;let objectUrl:string|undefined;
    if(!url){const blob=await getFile(track.id);if(!blob)throw new Error('This local file is missing. Import it again to continue.');url=objectUrl=URL.createObjectURL(blob);}
    const audio=new Audio();audio.preload='auto';audio.src=url!;
    const gain=this.ctx.createGain();const source=this.ctx.createMediaElementSource(audio);source.connect(gain).connect(this.low);
    return {audio,gain,source,track,objectUrl};
  }
  private release(deck?:Deck){if(!deck)return;deck.audio.pause();deck.audio.removeAttribute('src');deck.audio.load();deck.source.disconnect();deck.gain.disconnect();if(deck.objectUrl)URL.revokeObjectURL(deck.objectUrl);}
  async load(track:Track,startAt=0){
    const generation=++this.generation;this.stopTimer();this.release(this.current);this.release(this.incoming);this.current=undefined;this.incoming=undefined;this.crossLoading=false;this.crossElapsed=0;this.endedHandled=false;this.phase='idle';
    this.listener({state:'loading',position:0,duration:0,trackId:track.id});
    try{await this.init();if(generation!==this.generation)return;const deck=await this.makeDeck(track);if(generation!==this.generation){this.release(deck);return;}this.current=deck;deck.gain.gain.value=1;
      deck.audio.onerror=()=>{if(this.current===deck)this.fail('This audio file could not be played. Try a browser-supported MP3, WAV, M4A, OGG, or FLAC file.');};
      deck.audio.onended=()=>this.handleEnded(deck);
      if(startAt>0){await new Promise<void>(done=>{if(deck.audio.readyState>=1)done();else{deck.audio.addEventListener('loadedmetadata',()=>done(),{once:true});deck.audio.addEventListener('error',()=>done(),{once:true});}});if(generation!==this.generation)return;if(Number.isFinite(deck.audio.duration)&&startAt<deck.audio.duration-1)deck.audio.currentTime=startAt;}
      await deck.audio.play();if(generation!==this.generation)return;this.paused=false;this.applySettings();this.startTimer();this.emit('playing');
    }catch(error){if(generation===this.generation)this.fail(error instanceof Error?error.message:'Playback could not begin. Press Play to try again.');}
  }
  private handleEnded(deck:Deck){if(this.current!==deck||this.endedHandled||this.incoming)return;this.endedHandled=true;this.stopTimer();this.emit('ended');this.onEnded();}
  private async beginCrossfade(next:Track){
    if(!this.current||this.incoming||this.crossLoading)return;this.crossLoading=true;const generation=this.generation;
    try{const incoming=await this.makeDeck(next);if(generation!==this.generation){this.release(incoming);return;}
      incoming.gain.gain.value=0;await incoming.audio.play();if(generation!==this.generation){this.release(incoming);return;}
      if(this.paused)incoming.audio.pause();this.incoming=incoming;this.crossElapsed=0;this.crossLength=Math.max(0.1,Math.min(this.settings().fadeOut,this.current.audio.duration-this.current.audio.currentTime));this.phase='crossfading';
    }catch{ /* A failed preload leaves the current track audible; normal advance reports the error. */ }
    finally{if(generation===this.generation)this.crossLoading=false;}
  }
  private startTimer(){if(this.timer)return;this.last=performance.now();this.timer=window.setInterval(()=>this.tick(),50);}
  private stopTimer(){if(this.timer)clearInterval(this.timer);this.timer=undefined;}
  private tick(){
    const deck=this.current;if(!deck||this.paused)return;const now=performance.now();const dt=Math.min(0.25,(now-this.last)/1000);this.last=now;
    const s=this.settings();const duration=deck.audio.duration;const remaining=duration-deck.audio.currentTime;
    if(this.incoming){
      this.crossElapsed+=dt;const progress=clamp(this.crossElapsed/this.crossLength);const [outGain,inGain]=equalPower(progress);
      deck.gain.gain.setTargetAtTime(outGain,this.ctx!.currentTime,0.015);this.incoming.gain.gain.setTargetAtTime(inGain,this.ctx!.currentTime,0.015);
      if(progress>=1||deck.audio.ended)this.commitIncoming();
    } else if(s.transitions&&Number.isFinite(duration)&&duration>3&&remaining<=Math.min(s.fadeOut,duration/3)&&remaining>0){const next=this.nextTrack();if(next)void this.beginCrossfade(next);}
    this.emit('playing');
  }
  private commitIncoming(){if(!this.incoming)return;const old=this.current;this.current=this.incoming;this.incoming=undefined;this.current.gain.gain.setTargetAtTime(1,this.ctx!.currentTime,0.015);this.current.audio.onended=()=>this.handleEnded(this.current!);this.current.audio.onerror=()=>this.fail('The next local audio file could not be played.');this.release(old);this.crossElapsed=0;this.phase='idle';this.endedHandled=false;this.onAdvance(this.current.track);}
  private emit(state:Snapshot['state']){const a=this.current?.audio;const duration=a&&Number.isFinite(a.duration)?a.duration:0;const buffered=a&&duration&&a.buffered.length?a.buffered.end(a.buffered.length-1)/duration:0;this.listener({state,position:a?.currentTime||0,duration,trackId:this.current?.track.id||'',buffered});}
  private fail(error:string){this.paused=true;this.stopTimer();this.listener({state:'error',position:0,duration:0,trackId:this.current?.track.id||'',error});}
  async play(){if(!this.current)return;try{await this.init();await this.current.audio.play();if(this.incoming)await this.incoming.audio.play();this.paused=false;this.applySettings();this.last=performance.now();this.startTimer();this.emit('playing');}catch{this.fail('Playback was blocked. Press Play again to start audio.');}}
  pause(){this.paused=true;this.current?.audio.pause();this.incoming?.audio.pause();this.stopTimer();if(this.crackleGain)this.crackleGain.gain.value=0;this.emit('paused');}
  seek(time:number){if(!this.current)return;this.generation++;this.release(this.incoming);this.incoming=undefined;this.crossLoading=false;this.current.gain.gain.cancelScheduledValues(this.ctx!.currentTime);this.current.gain.gain.value=1;this.phase='idle';this.endedHandled=false;this.current.audio.currentTime=Math.max(0,Math.min(time,this.current.audio.duration||0));this.emit(this.paused?'paused':'playing');}
  setVolume(volume:number){if(this.master&&this.ctx)this.master.gain.setTargetAtTime(volume/100,this.ctx.currentTime,0.025);}
  applySettings(){const s=this.settings();if(!this.ctx)return;this.setVolume(s.volume);this.low!.gain.setTargetAtTime(s.bass,this.ctx.currentTime,0.03);this.mid!.gain.setTargetAtTime(s.mid,this.ctx.currentTime,0.03);this.high!.gain.setTargetAtTime(s.treble,this.ctx.currentTime,0.03);this.pan!.pan.setTargetAtTime(s.balance,this.ctx.currentTime,0.03);if(this.crackleGain)this.crackleGain.gain.setTargetAtTime(s.crackle&&!this.paused?0.22:0,this.ctx.currentTime,0.03);
    if(!s.transitions&&this.incoming){this.release(this.incoming);this.incoming=undefined;if(this.current){this.current.gain.gain.cancelScheduledValues(this.ctx.currentTime);this.current.gain.gain.value=1;}this.phase='idle';}
  }
  getSpectrum(){if(!this.analyser||this.paused)return new Uint8Array(64);const values=new Uint8Array(this.analyser.frequencyBinCount);this.analyser.getByteFrequencyData(values);const bands=new Uint8Array(64);for(let i=0;i<64;i++){const bin=Math.min(values.length-1,Math.round(1+Math.pow(i/63,2)*Math.min(350,values.length-2)));bands[i]=values[bin];}return bands;}
  deactivate(){this.generation++;this.pause();this.release(this.current);this.release(this.incoming);this.current=undefined;this.incoming=undefined;this.crossLoading=false;}
  dispose(){this.generation++;this.pause();this.release(this.current);this.release(this.incoming);this.current=undefined;this.incoming=undefined;this.crackleSource?.stop();void this.ctx?.close();this.ctx=undefined;}
}

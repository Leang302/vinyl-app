import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei';
import { EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { usePlayer } from '../state/store';
import { playback } from '../audio/PlaybackController';
import { useTurntable } from '../interaction/store';
import { angularDelta, scrubTime } from '../interaction/gestures';
import { createPlaybackGesture, isNeedleDown, resetCamera, toggleCover, toggleNeedle, togglePlay } from '../interaction/transport';
import { formatTime } from '../lib/utils';
import { TUNING, useCameraRig, useGlow, usePart } from './useTurntableControls';

/* ── Model (unchanged geometry and materials) ─────────────────────────────── */
function makeTexture(kind:'wood'|'metal'|'record'|'label'|'plate'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=kind==='plate'?256:1024;const c=canvas.getContext('2d')!;
  let seed=42;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  if(kind==='wood'){
    c.fillStyle='#613e29';c.fillRect(0,0,1024,1024);
    for(let i=0;i<3800;i++){const y=random()*1024;const width=random()*2+0.2;c.strokeStyle=`rgba(${random()>.5?'20,10,3':'214,156,96'},${random()*.16})`;c.lineWidth=width;c.beginPath();c.moveTo(0,y);for(let x=0;x<=1024;x+=20)c.lineTo(x,y+Math.sin(x*.008+y*.05)*3+Math.sin(x*.02)*.7);c.stroke();}
  }else if(kind==='metal'){
    c.fillStyle='#9a9c98';c.fillRect(0,0,1024,1024);for(let i=0;i<5000;i++){c.fillStyle=`rgba(${random()>.5?'255,255,255':'10,10,10'},${random()*.06})`;c.fillRect(0,random()*1024,1024,random()*.5+.1);}
  }else if(kind==='record'){
    c.fillStyle='#101312';c.fillRect(0,0,1024,1024);
    for(let r=155;r<509;r+=1.8){const v=24+Math.floor(random()*23);c.strokeStyle=`rgb(${v},${v+1},${v})`;c.lineWidth=random()*.8+.4;c.beginPath();c.arc(512,512,r,0,Math.PI*2);c.stroke();}
    const g=c.createConicGradient(0,512,512);g.addColorStop(0,'#ffffff00');g.addColorStop(.1,'#ffffff02');g.addColorStop(.23,'#ffffff22');g.addColorStop(.32,'#ffffff00');g.addColorStop(.59,'#ffffff00');g.addColorStop(.71,'#ffffff17');g.addColorStop(.82,'#ffffff00');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(0,0,1024,1024);
  }else if(kind==='label'){
    c.fillStyle='#c2c9a5';c.fillRect(0,0,1024,1024);c.fillStyle='#c87548';c.beginPath();c.arc(512,415,290,0,Math.PI*2);c.fill();c.fillStyle='#455644';c.beginPath();c.moveTo(0,670);c.quadraticCurveTo(450,420,1024,680);c.lineTo(1024,1024);c.lineTo(0,1024);c.fill();c.fillStyle='#273e31';c.fillRect(0,835,1024,200);c.fillStyle='#e7e6c9';c.textAlign='center';c.font='46px Georgia';c.fillText('slow mornings',512,760);c.font='22px sans-serif';c.fillText('V I N Y L   S E S S I O N S',512,920);
  }else{
    c.clearRect(0,0,1024,256);c.fillStyle='#303630';c.font='500 82px sans-serif';c.fillText('V I N Y L',30,95);c.font='25px sans-serif';c.fillStyle='#454a43';c.fillText('PRECISION AUDIO  /  MODEL 01',34,162);c.font='22px sans-serif';c.fillText('33⅓   /   45 RPM      ·      DIRECT DRIVE',34,210);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
function Cylinder({position,radius,height,color='#b5b5ad',metalness=.8,roughness=.24,children}:{position:[number,number,number];radius:number;height:number;color?:string;metalness?:number;roughness?:number;children?:ReactNode}){return <mesh position={position} castShadow receiveShadow><cylinderGeometry args={[radius,radius,height,80]}/><meshStandardMaterial color={color} metalness={metalness} roughness={roughness}/>{children}</mesh>;}
/** Invisible, raycastable-only material for oversized hit areas. */
const HitMaterial=()=> <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false}/>;
const GLOW='#c9ddb0';

/* ── Record: tap = play/pause, drag around the center = scrub ─────────────── */
function VinylRecord(){
  const group=useRef<THREE.Group>(null);const velocity=useRef(0);const ring=useRef<THREE.MeshBasicMaterial>(null);
  const texture=useMemo(()=>makeTexture('record'),[]);const label=useMemo(()=>makeTexture('label'),[]);const settings=usePlayer(s=>s.settings);
  const trackArtwork=usePlayer(s=>s.track?.artwork);const artwork=settings.artwork||trackArtwork;const [art,setArt]=useState<THREE.Texture>();
  const gesture=useMemo(()=>createPlaybackGesture(),[]);const glow=useGlow('record');const invalidate=useThree(s=>s.invalidate);
  const drag=useRef<{angle:number;radians:number;start:number;duration:number;canSeek:boolean}|null>(null);
  const plane=useMemo(()=>new THREE.Plane(new THREE.Vector3(0,1,0),-1.03),[]);const point=useMemo(()=>new THREE.Vector3(),[]);
  const angle=(event:{ray:THREE.Ray})=>{event.ray.intersectPlane(plane,point);return Math.atan2(point.x+.78,point.z);};
  useEffect(()=>{if(!artwork)return;const loader=new THREE.TextureLoader();let active=true;let loaded:THREE.Texture|undefined;loader.load(artwork,t=>{loaded=t;if(active){t.colorSpace=THREE.SRGBColorSpace;setArt(t);invalidate();}else t.dispose();},undefined,()=>{});return()=>{active=false;loaded?.dispose();};},[artwork,invalidate]);
  useEffect(()=>()=>{texture.dispose();label.dispose();gesture.abandon();},[texture,label,gesture]);
  useFrame((_,dt)=>{
    if(ring.current)ring.current.opacity=glow.current*.75;
    if(drag.current)return;
    const s=usePlayer.getState();const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target=s.state==='playing'?s.settings.rpm/60*Math.PI*2:0;
    // Spin-up/spin-down eased over ~TUNING.spinSeconds.
    velocity.current=THREE.MathUtils.damp(velocity.current,target,3/TUNING.spinSeconds,dt);
    if(Math.abs(velocity.current-target)<1e-3)velocity.current=target;
    if(group.current&&!reduced)group.current.rotation.y+=velocity.current*Math.min(dt,.05);
    if(velocity.current>1e-3)invalidate();
  });
  const time=(d:NonNullable<typeof drag.current>)=>scrubTime(d.start,d.radians,d.duration,TUNING.scrubSecondsPerTurn);
  const handlers=usePart('record',{
    label:()=>!useTurntable.getState().coverOpen?'Open cover':usePlayer.getState().state==='playing'?'Pause · drag to seek':'Play · drag to seek',
    onTap:()=>{if(!useTurntable.getState().coverOpen){toggleCover();return;}togglePlay();},
    drag:{
      start:e=>{if(!useTurntable.getState().coverOpen)return false;const s=usePlayer.getState();drag.current={angle:angle(e),radians:0,start:s.position,duration:s.duration,canSeek:gesture.begin()};velocity.current=0;return true;},
      move:e=>{const d=drag.current;if(!d)return;const next=angle(e);const delta=angularDelta(d.angle,next);d.angle=next;d.radians+=delta;if(group.current)group.current.rotation.y+=delta;
        if(d.canSeek){const t=time(d);useTurntable.getState().patch({preview:t,label:{text:`${formatTime(t)} / ${formatTime(d.duration)}`,x:e.clientX,y:e.clientY}});}},
      end:(_e,cancel)=>{const d=drag.current;drag.current=null;useTurntable.getState().patch({label:null});if(d)void gesture.finish(d.canSeek&&!cancel?time(d):undefined,cancel);},
    },
  });
  return <group ref={group} name="interactive-record" position={[-.78,1.005,0]}>
    <mesh castShadow><cylinderGeometry args={[2.09,2.09,.035,128]}/><meshStandardMaterial color={settings.vinylColor} metalness={.48} roughness={.25}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.019,0]}><circleGeometry args={[2.085,128]}/><meshStandardMaterial map={texture} color={settings.vinylColor==='#131516'?'#ffffff':settings.vinylColor} metalness={.42} roughness={.29}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.022,0]}><circleGeometry args={[.695,80]}/><meshStandardMaterial map={art||label} roughness={.85}/></mesh>
    <Cylinder position={[0,.06,0]} radius={.055} height={.11} color="#e1e3d9"/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.025,0]}><ringGeometry args={[2.08,2.12,128]}/><meshBasicMaterial ref={ring} color={GLOW} transparent opacity={0} depthWrite={false}/></mesh>
    {/* Hit area: 1.3× the platter, so the edge is easy to grab. */}
    <mesh name="hit-record" position={[0,.05,0]} {...handlers}><cylinderGeometry args={[2.09*TUNING.hitScale.platter,2.09*TUNING.hitScale.platter,.3,48]}/><HitMaterial/></mesh>
  </group>;
}

/* ── Tonearm: tap = lift/drop needle, drag snaps to rest or record ─────────── */
function Tonearm(){
  const arm=useRef<THREE.Group>(null);const tube=useRef<THREE.MeshStandardMaterial>(null);const glow=useGlow('tonearm');const invalidate=useThree(s=>s.invalidate);
  const dragging=useRef<{x:number;angle:number}|null>(null);
  const curve=useMemo(()=>new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,.45),new THREE.Vector3(.04,0,2.4),new THREE.Vector3(-.22,0,2.95)]),[]);
  useFrame((_,dt)=>{
    if(tube.current)tube.current.emissiveIntensity=glow.current*.35;
    if(!arm.current||dragging.current)return;
    const s=usePlayer.getState();const ui=useTurntable.getState();const onRecord=['playing','buffering','paused'].includes(s.state);const progress=s.duration?s.position/s.duration:0;
    const y=onRecord?-.42-progress*.25:.05;const x=s.state==='playing'&&!ui.needleLifted?0:-.13;
    arm.current.rotation.y=THREE.MathUtils.damp(arm.current.rotation.y,y,4,dt);arm.current.rotation.x=THREE.MathUtils.damp(arm.current.rotation.x,x,4,dt);
    if(Math.abs(arm.current.rotation.y-y)>1e-4||Math.abs(arm.current.rotation.x-x)>1e-4)invalidate();
  });
  const handlers=usePart('tonearm',{
    label:()=>isNeedleDown()?'Lift needle':'Drop needle',
    onTap:()=>toggleNeedle(),
    drag:{
      start:e=>{dragging.current={x:e.clientX,angle:arm.current?.rotation.y||0};return true;},
      move:e=>{const d=dragging.current;if(!d||!arm.current)return;arm.current.rotation.y=THREE.MathUtils.clamp(d.angle+(e.clientX-d.x)*.003,-.72,.15);arm.current.rotation.x=-.13;},
      end:(_e,cancel)=>{const a=arm.current?.rotation.y??0;dragging.current=null;if(cancel)return;
        // Snap to the nearest state: over the record = needle down, near the rest = lifted.
        const overRecord=a<-.28;if(overRecord!==isNeedleDown())toggleNeedle();},
    },
  });
  return <group position={[2.49,1.05,-1.75]}>
    <Cylinder position={[0,-.09,0]} radius={.43} height={.22} color="#343834"/><Cylinder position={[0,.08,0]} radius={.29} height={.22}/><Cylinder position={[0,.21,0]} radius={.18} height={.1} color="#363c36"/>
    <group ref={arm} name="interactive-tonearm" position={[0,.28,0]}>
      <mesh castShadow><tubeGeometry args={[curve,48,.053,12,false]}/><meshStandardMaterial ref={tube} color="#e0e1d7" metalness={.94} roughness={.18} emissive={GLOW} emissiveIntensity={0}/></mesh>
      <mesh position={[0,.025,-.4]} rotation={[Math.PI/2,0,0]} castShadow><cylinderGeometry args={[.19,.19,.43,40]}/><meshStandardMaterial color="#444943" metalness={.8} roughness={.3}/></mesh>
      <RoundedBox args={[.24,.12,.48]} radius={.025} position={[-.22,-.02,3.02]} castShadow><meshStandardMaterial color="#242c28" metalness={.7} roughness={.3}/></RoundedBox>
      <mesh position={[-.22,-.14,3.12]}><boxGeometry args={[.12,.15,.16]}/><meshStandardMaterial color="#899779" metalness={.5}/></mesh>
      <mesh position={[-.22,-.23,3.16]}><coneGeometry args={[.022,.1,8]}/><meshStandardMaterial color="#d5bd8c" metalness={1} roughness={.2}/></mesh>
      {/* Hit area: a capsule 3× thicker than the arm, running from pivot to headshell. */}
      <mesh name="hit-tonearm" position={[-.08,0,1.6]} rotation={[Math.PI/2,0,0]} {...handlers}><capsuleGeometry args={[.053*TUNING.hitScale.tonearm,3.1,4,12]}/><HitMaterial/></mesh>
    </group>
    <Cylinder position={[.2,-.02,1.7]} radius={.06} height={.38} color="#242b26"/>
  </group>;
}

/* ── Visual-only details: reflect state but never take pointer events ────── */
function VolumeKnob(){
 const volume=usePlayer(s=>s.settings.volume);
 return <group position={[3.09,.97,.72]} rotation={[0,-volume/100*4.7,0]}>
   <Cylinder position={[0,0,0]} radius={.34} height={.23}/><mesh position={[0,.12,-.22]}><boxGeometry args={[.035,.01,.1]}/><meshStandardMaterial color="#273127"/></mesh>
 </group>;
}

/* ── Dust cover: tap to open/close ────────────────────────────────────────── */
function DustCover(){
 const group=useRef<THREE.Group>(null);const mat=useRef<THREE.MeshPhysicalMaterial>(null);const open=useTurntable(s=>s.coverOpen);const glow=useGlow('cover');const invalidate=useThree(s=>s.invalidate);
 useFrame((_,dt)=>{
   if(mat.current){mat.current.opacity=.035+glow.current*.07;mat.current.emissiveIntensity=glow.current*.25;}
   if(!group.current)return;const target=open?-1.67:0;group.current.rotation.x=THREE.MathUtils.damp(group.current.rotation.x,target,4,dt);
   if(Math.abs(group.current.rotation.x-target)>1e-4)invalidate();
 });
 const handlers=usePart('cover',{label:()=>useTurntable.getState().coverOpen?'Close cover':'Open cover',onTap:toggleCover});
 return <group ref={group} position={[0,1.49,-2.67]} rotation={[-1.67,0,0]}><mesh name="interactive-cover" position={[0,0,2.3]} {...handlers}><boxGeometry args={[7.6,.035,4.8]}/><meshPhysicalMaterial ref={mat} color="#bfd4c5" emissive={GLOW} emissiveIntensity={0} transparent opacity={.035} roughness={.15} metalness={.1} depthWrite={false}/></mesh></group>;
}
function Speaker({x}:{x:number}){
  const cone=useRef<THREE.Mesh>(null);
  useFrame(()=>{if(!cone.current)return;const s=usePlayer.getState();const level=s.mode==='local'&&s.state==='playing'?playback.local.getSpectrum()[3]/255:0;cone.current.position.z=.37+level*.02;cone.current.scale.setScalar(1+level*.012);});
  return <group position={[x,.94,-1.3]} rotation={[0,x<0?.14:-.14,0]}>
    <RoundedBox args={[1.05,2.3,.8]} radius={.06} castShadow><meshStandardMaterial color="#272b26" roughness={.92}/></RoundedBox>
    <mesh position={[0,-.33,.405]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.4,.4,.05,48]}/><meshStandardMaterial color="#0c100e" roughness={.7}/></mesh>
    <mesh ref={cone} position={[0,-.33,.43]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.3,.12,.06,48]}/><meshStandardMaterial color="#343b32" roughness={.8}/></mesh>
    <mesh position={[0,.59,.42]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.17,.17,.05,32]}/><meshStandardMaterial color="#a8ab9e" metalness={.8} roughness={.5}/></mesh>
  </group>;
}
function Turntable(){
 const wood=useMemo(()=>makeTexture('wood'),[]);const metal=useMemo(()=>makeTexture('metal'),[]);const plate=useMemo(()=>makeTexture('plate'),[]);const playing=usePlayer(s=>s.state==='playing');
 useEffect(()=>()=>{wood.dispose();metal.dispose();plate.dispose();},[wood,metal,plate]);
 return <group>
  <RoundedBox args={[7.6,.66,5.6]} radius={.13} position={[0,.49,0]} castShadow receiveShadow><meshStandardMaterial map={wood} roughness={.48} metalness={.03}/></RoundedBox>
  <RoundedBox args={[7.34,.095,5.34]} radius={.07} position={[0,.848,0]} castShadow receiveShadow><meshStandardMaterial map={metal} metalness={.72} roughness={.4}/></RoundedBox>
  {[-2.9,2.9].flatMap(x=>[-2,2].map(z=><Cylinder key={`${x}${z}`} position={[x,.12,z]} radius={.33} height={.22} color="#171b17"/>))}
  <Cylinder position={[-.78,.91,0]} radius={2.23} height={.1} color="#111813"/><Cylinder position={[-.78,.965,0]} radius={2.19} height={.045} color="#c0c3b6"/><VinylRecord/><Tonearm/>
  <mesh position={[2.1,.9,2]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[2.1,.525]}/><meshStandardMaterial map={plate} transparent roughness={.7}/></mesh>
  <Cylinder position={[-3.12,.94,1.95]} radius={.255} height={.09} color={playing?'#b4c79d':'#4b5548'}/>
  <mesh position={[-3.12,1,1.95]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[.075,24]}/><meshStandardMaterial color="#bdcba9" emissive="#a5c87e" emissiveIntensity={playing?.7:0}/></mesh>
  <Cylinder position={[-2.36,.94,2.05]} radius={.14} height={.08} color="#555e51"/>
  <VolumeKnob/><DustCover/>
  <mesh position={[-3.2,.903,1.37]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[.035,16]}/><meshStandardMaterial color="#b8da83" emissive="#c4ed8c" emissiveIntensity={playing?2:.15}/></mesh>
  <Speaker x={-5.1}/><Speaker x={5.1}/>
 </group>;
}

/* ── Camera, rendering and performance ────────────────────────────────────── */
function CameraController(){
 const controls=useRef<OrbitControlsImpl>(null);const active=useTurntable(s=>!!s.active);const {onStart,onChange,onEnd}=useCameraRig(controls);
 // Orbit only happens on empty space: parts disable controls on press. Pan is off; zoom range is narrow (see TUNING.orbit).
 return <OrbitControls ref={controls} makeDefault enabled={!active} enablePan={false} enableDamping dampingFactor={.08} rotateSpeed={TUNING.orbit.rotateSpeed} zoomSpeed={.6} onStart={onStart} onChange={onChange} onEnd={onEnd}/>;
}
/** frameloop="demand": render continuously only while playing; otherwise only when state changes. */
function RenderDriver(){
 const invalidate=useThree(s=>s.invalidate);
 useEffect(()=>{
   const a=usePlayer.subscribe(()=>invalidate());const b=useTurntable.subscribe(()=>invalidate());
   const onVisible=()=>{if(!document.hidden)invalidate();};document.addEventListener('visibilitychange',onVisible);
   return()=>{a();b();document.removeEventListener('visibilitychange',onVisible);};
 },[invalidate]);
 useFrame(()=>{if(document.hidden)return;const s=usePlayer.getState().state;if(s==='playing'||s==='buffering')invalidate();});
 return null;
}
/** Steps quality down when playback renders below TUNING.minFps for 3 seconds in a row. */
function FpsGuard({onSlow}:{onSlow:()=>void}){
 const acc=useRef({frames:0,time:0,slow:0});
 useFrame((_,dt)=>{
   if(dt>.25||document.hidden)return;const a=acc.current;a.frames++;a.time+=dt;if(a.time<1)return;
   const fps=a.frames/a.time;a.frames=0;a.time=0;
   if(usePlayer.getState().state!=='playing'){a.slow=0;return;} // only continuous rendering is a fair measurement
   if(fps<TUNING.minFps){if(++a.slow>=3){a.slow=0;onSlow();}}else a.slow=0;
 });
 return null;
}

/** Dev-only hooks for qa/turntable-check.mjs: project model points to screen and read the camera. */
function DevProbe(){
 const {camera,gl,controls,scene}=useThree();
 useEffect(()=>{
   if(!import.meta.env.DEV)return;
   const w=window as unknown as Record<string,unknown>;
   w.__vinylProject=(x:number,y:number,z:number)=>{const r=gl.domElement.getBoundingClientRect();const p=new THREE.Vector3(x,y,z).project(camera);return {x:r.left+(p.x+1)/2*r.width,y:r.top+(1-p.y)/2*r.height};};
   w.__vinylArm=(z:number)=>{const arm=scene.getObjectByName('interactive-tonearm');if(!arm)return null;const v=arm.localToWorld(new THREE.Vector3(-.05,0,z));return (w.__vinylProject as (x:number,y:number,z:number)=>{x:number;y:number})(v.x,v.y,v.z);};
   w.__vinylCamera=()=>{const c=controls as unknown as OrbitControlsImpl|null;const t=c?.target??new THREE.Vector3();const s=new THREE.Spherical().setFromVector3(camera.position.clone().sub(t));return {azimuth:THREE.MathUtils.radToDeg(s.theta),polar:THREE.MathUtils.radToDeg(s.phi),distance:s.radius};};
   return()=>{delete w.__vinylProject;delete w.__vinylCamera;delete w.__vinylArm;};
 },[camera,gl,controls,scene]);
 return null;
}

/* ── 2D fallback (no WebGL, crashed renderer, or too slow) ────────────────── */
function Vinyl2D({message}:{message:string}){
 const playing=usePlayer(s=>s.state==='playing');const art=usePlayer(s=>s.settings.artwork||s.track?.artwork);const title=usePlayer(s=>s.track?.title);
 return <div className="scene-fallback">
   <button type="button" className={`vinyl-2d ${playing?'is-playing':''}`} aria-label={playing?`Pause ${title||''}`:`Play ${title||''}`} onClick={togglePlay} disabled={!title}>
     <span className="vinyl-2d-label" style={art?{backgroundImage:`url(${art})`}:undefined}/>
   </button>
   <p>{message}</p>
 </div>;
}
class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<Vinyl2D message="3D is unavailable on this device. The record and the controls below still work."/>:this.props.children;}}

function PointerLabel({host}:{host:React.RefObject<HTMLDivElement|null>}){
 const label=useTurntable(s=>s.label);
 if(!label||!host.current)return null;
 const r=host.current.getBoundingClientRect();
 const x=Math.min(label.x-r.left+14,r.width-160);const y=Math.min(label.y-r.top+18,r.height-40);
 return <div className="pointer-label" style={{transform:`translate(${x}px,${y}px)`}} aria-hidden="true">{label.text}</div>;
}

export default function TurntableScene(){
 const host=useRef<HTMLDivElement>(null);
 const quality=usePlayer(s=>s.settings.quality);const title=usePlayer(s=>s.track?.title);const status=usePlayer(s=>s.state);
 const [available]=useState(()=>{try{const c=document.createElement('canvas');return !!c.getContext('webgl2');}catch{return false;}});
 // 0 = as configured, 1 = lighter (no shadows/effects, DPR 1), 2 = 2D fallback.
 const [tier,setTier]=useState(0);
 const low=tier>0||quality==='low'||(quality==='auto'&&(navigator.hardwareConcurrency||4)<=4);
 const onSlow=()=>setTier(t=>{const next=Math.min(2,t+1);usePlayer.getState().notify(next===2?'Switched to a 2D turntable for smoother playback.':'Lowered 3D quality for smoother playback.');return next;});
 const statusText=title?`${status==='playing'?'Playing':status==='loading'||status==='buffering'?'Loading':'Paused'}: ${title}`:'No record on the platter';
 return <div ref={host} className="scene-wrap"
   onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('vinyl/collection');const collection=usePlayer.getState().collections.find(c=>c.id===id);if(collection)void playback.selectCollection(collection);}}
   onDoubleClick={()=>{if(!useTurntable.getState().hover&&!useTurntable.getState().active)resetCamera();}}>
  <div className="scene-aura"/>
  <SceneBoundary>{available&&tier<2?<Canvas role="img" aria-label={`3D turntable. ${statusText}`} frameloop="demand" shadows={!low} dpr={low?1:[1,2]} camera={{position:[5.8,7,8],fov:34}} gl={{antialias:!low,alpha:true,powerPreference:low?'low-power':'high-performance'}}>
    <ambientLight intensity={.65}/><directionalLight position={[-4,9,4]} intensity={2.1} castShadow={!low} shadow-mapSize={1024} shadow-bias={-.001}/><spotLight position={[3,8,-4]} intensity={75} angle={.8} penumbra={1} color="#c4d4b5"/>
    <Suspense fallback={null}><Environment resolution={128} frames={1}><Lightformer form="rect" intensity={3.5} color="#f2e5cb" position={[-4,6,1]} scale={[6,5,1]} rotation={[-Math.PI/3,0,0]}/><Lightformer form="rect" intensity={2} color="#b5c7ba" position={[6,4,2]} scale={[3,6,1]} rotation={[0,-Math.PI/2,0]}/><Lightformer form="rect" intensity={1.5} position={[0,3,-5]} scale={[8,2,1]}/></Environment><Turntable/>
    {!low&&<ContactShadows position={[0,-.03,0]} opacity={.6} scale={20} blur={2.7} far={4} resolution={256} color="#000000" frames={1}/>}</Suspense>
    <CameraController/><RenderDriver/>{import.meta.env.DEV&&<DevProbe/>}{quality==='auto'&&<FpsGuard onSlow={onSlow}/>}
    {quality==='high'&&!low&&<EffectComposer multisampling={0}><Vignette eskil={false} offset={.2} darkness={.5}/></EffectComposer>}
  </Canvas>:<Vinyl2D message={available?'Showing a lighter 2D turntable for smoother playback.':'WebGL is unavailable. The record and the controls below still work.'}/>}</SceneBoundary>
  <PointerLabel host={host}/>
  <p className="sr-only" aria-live="polite">{statusText}</p>
 </div>;
}

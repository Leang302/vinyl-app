import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei';
import { EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { usePlayer } from '../state/store';
import { playback } from '../audio/PlaybackController';
import { RotateCcw, Move3D } from 'lucide-react';
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
function Cylinder({position,radius,height,color='#b5b5ad',metalness=.8,roughness=.24,children,...props}:{position:[number,number,number];radius:number;height:number;color?:string;metalness?:number;roughness?:number;children?:ReactNode;onClick?:(e:ThreeEvent<MouseEvent>)=>void;onPointerDown?:(e:ThreeEvent<PointerEvent>)=>void;onPointerMove?:(e:ThreeEvent<PointerEvent>)=>void;onPointerUp?:(e:ThreeEvent<PointerEvent>)=>void}){return <mesh position={position} castShadow receiveShadow {...props}><cylinderGeometry args={[radius,radius,height,80]}/><meshStandardMaterial color={color} metalness={metalness} roughness={roughness}/>{children}</mesh>;}
function VinylRecord(){
  const group=useRef<THREE.Group>(null);const velocity=useRef(0);const texture=useMemo(()=>makeTexture('record'),[]);const label=useMemo(()=>makeTexture('label'),[]);const settings=usePlayer(s=>s.settings);
  const trackArtwork=usePlayer(s=>s.track?.artwork);const artwork=settings.artwork||trackArtwork;
  useEffect(()=>{if(!artwork)return;const loader=new THREE.TextureLoader();let active=true;let loaded:THREE.Texture|undefined;loader.load(artwork,t=>{loaded=t;if(active){t.colorSpace=THREE.SRGBColorSpace;setArt(t);}else t.dispose();},undefined,()=>{});return()=>{active=false;loaded?.dispose();};},[artwork]);
  const [art,setArt]=useState<THREE.Texture>();
  useEffect(()=>()=>{texture.dispose();label.dispose();},[texture,label]);
  useFrame((_,dt)=>{const s=usePlayer.getState();const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;const target=s.state==='playing'?s.settings.rpm/60*Math.PI*2:0;velocity.current=THREE.MathUtils.damp(velocity.current,target,2.4,dt);if(group.current&&!reduced)group.current.rotation.y+=velocity.current*Math.min(dt,.05);});
  return <group ref={group} position={[-.78,1.005,0]}>
    <mesh castShadow><cylinderGeometry args={[2.09,2.09,.035,128]}/><meshStandardMaterial color={settings.vinylColor} metalness={.48} roughness={.25}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.019,0]}><circleGeometry args={[2.085,128]}/><meshStandardMaterial map={texture} color={settings.vinylColor==='#131516'?'#ffffff':settings.vinylColor} metalness={.42} roughness={.29}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.022,0]}><circleGeometry args={[.695,80]}/><meshStandardMaterial map={art||label} roughness={.85}/></mesh>
    <Cylinder position={[0,.06,0]} radius={.055} height={.11} color="#e1e3d9"/>
  </group>;
}
function Tonearm(){
  const arm=useRef<THREE.Group>(null);const dragging=useRef(false);const dragStart=useRef(0);const dragAngle=useRef(0);
  const curve=useMemo(()=>new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,.45),new THREE.Vector3(.04,0,2.4),new THREE.Vector3(-.22,0,2.95)]),[]);
  useFrame((_,dt)=>{if(!arm.current||dragging.current)return;const s=usePlayer.getState();const active=s.state==='playing'||s.state==='buffering'||s.state==='paused';const progress=s.duration?s.position/s.duration:0;arm.current.rotation.y=THREE.MathUtils.damp(arm.current.rotation.y,active?-.46-progress*.18:.05,4,dt);arm.current.rotation.x=THREE.MathUtils.damp(arm.current.rotation.x,active?0:-.11,4,dt);});
  const down=(e:ThreeEvent<PointerEvent>)=>{e.stopPropagation();dragging.current=true;dragStart.current=e.clientX;dragAngle.current=arm.current?.rotation.y||0;(e.target as Element).setPointerCapture(e.pointerId);};
  const move=(e:ThreeEvent<PointerEvent>)=>{if(!dragging.current||!arm.current)return;e.stopPropagation();arm.current.rotation.y=THREE.MathUtils.clamp(dragAngle.current+(e.clientX-dragStart.current)*.007,-.8,.2);};
  const up=(e:ThreeEvent<PointerEvent>)=>{if(!dragging.current)return;e.stopPropagation();dragging.current=false;(e.target as Element).releasePointerCapture(e.pointerId);const shouldPlay=(arm.current?.rotation.y||0)<-.25;if(shouldPlay&&usePlayer.getState().state!=='playing')void playback.toggle();if(!shouldPlay&&usePlayer.getState().state==='playing')void playback.toggle();};
  return <group position={[2.49,1.05,-1.75]}>
    <Cylinder position={[0,-.09,0]} radius={.43} height={.22} color="#343834"/><Cylinder position={[0,.08,0]} radius={.29} height={.22}/><Cylinder position={[0,.21,0]} radius={.18} height={.1} color="#363c36"/>
    <group ref={arm} position={[0,.28,0]} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      <mesh castShadow><tubeGeometry args={[curve,48,.053,12,false]}/><meshStandardMaterial color="#e0e1d7" metalness={.94} roughness={.18}/></mesh>
      <mesh position={[0,.025,-.4]} rotation={[Math.PI/2,0,0]} castShadow><cylinderGeometry args={[.19,.19,.43,40]}/><meshStandardMaterial color="#444943" metalness={.8} roughness={.3}/></mesh>
      <RoundedBox args={[.24,.12,.48]} radius={.025} position={[-.22,-.02,3.02]} castShadow><meshStandardMaterial color="#242c28" metalness={.7} roughness={.3}/></RoundedBox>
      <mesh position={[-.22,-.14,3.12]}><boxGeometry args={[.12,.15,.16]}/><meshStandardMaterial color="#899779" metalness={.5}/></mesh>
      <mesh position={[-.22,-.23,3.16]}><coneGeometry args={[.022,.1,8]}/><meshStandardMaterial color="#d5bd8c" metalness={1} roughness={.2}/></mesh>
    </group>
    <Cylinder position={[.2,-.02,1.7]} radius={.06} height={.38} color="#242b26"/>
  </group>;
}
function Speaker({x}:{x:number}){
  const cone=useRef<THREE.Mesh>(null);
  useFrame(({clock})=>{if(!cone.current)return;const s=usePlayer.getState();const level=s.mode==='local'&&s.state==='playing'?playback.local.getSpectrum()[3]/255:0;cone.current.position.z= .37+level*.02;if(s.mode==='youtube')cone.current.position.z=.37;cone.current.scale.setScalar(1+level*.012+Math.sin(clock.elapsedTime)*0);});
  return <group position={[x,.94,-1.3]} rotation={[0,x<0?.14:-.14,0]}>
    <RoundedBox args={[1.05,2.3,.8]} radius={.06} castShadow><meshStandardMaterial color="#272b26" roughness={.92}/></RoundedBox>
    <mesh position={[0,-.33,.405]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.4,.4,.05,48]}/><meshStandardMaterial color="#0c100e" roughness={.7}/></mesh>
    <mesh ref={cone} position={[0,-.33,.43]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.3,.12,.06,48]}/><meshStandardMaterial color="#343b32" roughness={.8}/></mesh>
    <mesh position={[0,.59,.42]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.17,.17,.05,32]}/><meshStandardMaterial color="#a8ab9e" metalness={.8} roughness={.5}/></mesh>
  </group>;
}
function Turntable(){
 const wood=useMemo(()=>makeTexture('wood'),[]);const metal=useMemo(()=>makeTexture('metal'),[]);const plate=useMemo(()=>makeTexture('plate'),[]);const playing=usePlayer(s=>s.state==='playing');const volumeDrag=useRef<number|null>(null);const settings=usePlayer(s=>s.settings);
 useEffect(()=>()=>{wood.dispose();metal.dispose();plate.dispose();},[wood,metal,plate]);
 return <group>
  <RoundedBox args={[7.6,.66,5.6]} radius={.13} position={[0,.49,0]} castShadow receiveShadow><meshStandardMaterial map={wood} roughness={.48} metalness={.03}/></RoundedBox>
  <RoundedBox args={[7.34,.095,5.34]} radius={.07} position={[0,.848,0]} castShadow receiveShadow><meshStandardMaterial map={metal} metalness={.72} roughness={.4}/></RoundedBox>
  {[-2.9,2.9].flatMap(x=>[-2,2].map(z=><Cylinder key={`${x}${z}`} position={[x,.12,z]} radius={.33} height={.22} color="#171b17"/>))}
  <Cylinder position={[-.78,.91,0]} radius={2.23} height={.1} color="#111813"/><Cylinder position={[-.78,.965,0]} radius={2.19} height={.045} color="#c0c3b6"/><VinylRecord/><Tonearm/>
  <mesh position={[2.1,.9,2]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[2.1,.525]}/><meshStandardMaterial map={plate} transparent roughness={.7}/></mesh>
  <Cylinder position={[-3.12,.94,1.95]} radius={.255} height={.09} color={playing?'#b4c79d':'#4b5548'} onClick={e=>{e.stopPropagation();void playback.toggle();}}/>
  <mesh position={[-3.12,1,1.95]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[.075,24]}/><meshStandardMaterial color="#bdcba9" emissive="#a5c87e" emissiveIntensity={playing?.7:0}/></mesh>
  <Cylinder position={[-2.36,.94,2.05]} radius={.14} height={.08} color="#555e51" onClick={e=>{e.stopPropagation();usePlayer.getState().setSettings({rpm:settings.rpm===33?45:33});}}/>
  <group position={[3.09,.97,.72]} rotation={[0,-settings.volume/100*4.7,0]}>
    <Cylinder position={[0,0,0]} radius={.29} height={.2} onPointerDown={e=>{e.stopPropagation();volumeDrag.current=e.clientY;(e.target as Element).setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(volumeDrag.current===null)return;e.stopPropagation();const s=usePlayer.getState();s.setSettings({volume:THREE.MathUtils.clamp(s.settings.volume+(volumeDrag.current-e.clientY)*.7,0,100)});volumeDrag.current=e.clientY;}} onPointerUp={e=>{e.stopPropagation();volumeDrag.current=null;(e.target as Element).releasePointerCapture(e.pointerId);}}/>
    <mesh position={[0,.104,-.18]}><boxGeometry args={[.025,.008,.09]}/><meshStandardMaterial color="#273127"/></mesh>
  </group>
  <mesh position={[-3.2,.903,1.37]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[.035,16]}/><meshStandardMaterial color="#b8da83" emissive="#c4ed8c" emissiveIntensity={playing?2:.15}/></mesh>
  <Speaker x={-5.1}/><Speaker x={5.1}/>
 </group>;
}
function CameraController({reset}:{reset:number}){
 const {camera,size}=useThree();const controls=useRef<React.ComponentRef<typeof OrbitControls>>(null);
 useEffect(()=>{const narrow=size.width<600;camera.position.set(narrow?6.8:5.9,narrow?8.5:7.4,narrow?9.6:8.5);camera.lookAt(0,.35,0);controls.current?.target.set(0,.35,0);controls.current?.update();},[camera,size.width,reset]);
 return <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={8} maxDistance={23} minPolarAngle={.3} maxPolarAngle={1.25} enableDamping dampingFactor={.08} target={[0,.35,0]}/>;
}
class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<div className="scene-fallback"><div className="fallback-record"/><p>3D is unavailable on this device.<br/>Your music and controls are ready below.</p></div>:this.props.children;}}
export default function TurntableScene(){
 const [reset,setReset]=useState(0);const quality=usePlayer(s=>s.settings.quality);const [available]=useState(()=>{try{const c=document.createElement('canvas');return !!c.getContext('webgl2');}catch{return false;}});
 const low=quality==='low'||(quality==='auto'&&(navigator.hardwareConcurrency||4)<=4);
 return <div className="scene-wrap" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('vinyl/collection');const collection=usePlayer.getState().collections.find(c=>c.id===id);if(collection)void playback.selectCollection(collection);}}>
  <div className="scene-aura"/>
  <SceneBoundary>{available?<Canvas shadows={!low} dpr={low?1:[1,1.7]} camera={{position:[8.5,10.4,11.7],fov:34}} gl={{antialias:!low,alpha:true,powerPreference:low?'low-power':'high-performance'}}>
    <ambientLight intensity={.65}/><directionalLight position={[-4,9,4]} intensity={2.1} castShadow={!low} shadow-mapSize={1024} shadow-bias={-.001}/><spotLight position={[3,8,-4]} intensity={75} angle={.8} penumbra={1} color="#c4d4b5"/>
    <Suspense fallback={null}><Environment resolution={128} frames={1}><Lightformer form="rect" intensity={3.5} color="#f2e5cb" position={[-4,6,1]} scale={[6,5,1]} rotation={[-Math.PI/3,0,0]}/><Lightformer form="rect" intensity={2} color="#b5c7ba" position={[6,4,2]} scale={[3,6,1]} rotation={[0,-Math.PI/2,0]}/><Lightformer form="rect" intensity={1.5} position={[0,3,-5]} scale={[8,2,1]}/></Environment><Turntable/>
    {!low&&<ContactShadows position={[0,-.03,0]} opacity={.6} scale={20} blur={2.7} far={4} resolution={256} color="#000000" frames={1}/>}</Suspense>
    <CameraController reset={reset}/>{quality==='high'&&<EffectComposer multisampling={0}><Vignette eskil={false} offset={.2} darkness={.5}/></EffectComposer>}
  </Canvas>:<div className="scene-fallback"><div className="fallback-record"/><p>WebGL is unavailable. Your music player is ready.</p></div>}</SceneBoundary>
  <div className="scene-help"><Move3D size={13}/><span>Drag to explore · Scroll to zoom</span><button className="icon-button" aria-label="Reset camera" onClick={()=>setReset(r=>r+1)}><RotateCcw size={14}/></button></div>
 </div>;
}

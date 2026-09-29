import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js";

const socket=window.io();
const mount=document.getElementById("game");
const phaseEl=document.getElementById("phase");
const timerEl=document.getElementById("timer");
const feedEl=document.getElementById("feed");
const winnerEl=document.getElementById("winner");
const winTitle=document.getElementById("winTitle");
const winSub=document.getElementById("winSub");

const colors=["#ff2d72","#31a8ff","#ffd24a","#a66bff","#35dfa0"];
const names=["PATRON","RIVAL 1","RIVAL 2","RIVAL 3","RIVAL 4"];
const models=["GT-R","SUPRA","R8","911","GTR"];

let scene,camera,renderer,clock;
let trackCurve,roadGroup,worldGroup;
let cars=[];
let particles=[];
let phase="lobby",phaseAt=performance.now(),lastWinner=null;
let raceDistance=0;

const sceneFog=0x07101a;

function init(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x07101a);
  scene.fog=new THREE.FogExp2(sceneFog,.018);

  camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,500);
  camera.position.set(0,8,18);

  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  clock=new THREE.Clock();
  buildLights();
  buildWorld();
  buildTrack();
  resetRace();

  addEventListener("resize",resize);
  socket.on("live:event",e=>{if(e.type==="gift")gift(e)});
  socket.on("live:chat",chat);

  const params=new URLSearchParams(location.search);
  if(params.get("mode")==="live")socket.emit("join-stream",{username:params.get("username")||"",mode:"live"});

  requestAnimationFrame(loop);
}

function buildLights(){
  scene.add(new THREE.HemisphereLight(0xbfd9ff,0x182015,2.0));
  const sun=new THREE.DirectionalLight(0xffffff,3.0);
  sun.position.set(-30,45,20);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-70;sun.shadow.camera.right=70;
  sun.shadow.camera.top=70;sun.shadow.camera.bottom=-70;
  scene.add(sun);
}

function buildWorld(){
  worldGroup=new THREE.Group();
  scene.add(worldGroup);

  const ground=new THREE.Mesh(
    new THREE.PlaneGeometry(500,500),
    new THREE.MeshStandardMaterial({color:0x13241a,roughness:1})
  );
  ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;
  worldGroup.add(ground);

  for(let i=0;i<80;i++){
    const angle=Math.random()*Math.PI*2;
    const radius=45+Math.random()*100;
    const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
    const tree=makeTree();
    tree.position.set(x,0,z);
    tree.scale.setScalar(.7+Math.random()*1.2);
    worldGroup.add(tree);
  }

  for(let i=0;i<14;i++){
    const lamp=makeLamp();
    const a=(i/14)*Math.PI*2;
    const r=22;
    lamp.position.set(Math.cos(a)*r,0,Math.sin(a)*r);
    worldGroup.add(lamp);
  }
}

function makeTree(){
  const g=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.22,.3,2.2,8),new THREE.MeshStandardMaterial({color:0x5b3b22}));
  trunk.position.y=1.1;trunk.castShadow=true;g.add(trunk);
  const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1.45,1),new THREE.MeshStandardMaterial({color:0x1d6338,roughness:1}));
  crown.position.y=2.6;crown.castShadow=true;g.add(crown);
  return g;
}

function makeLamp(){
  const g=new THREE.Group();
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,5,8),new THREE.MeshStandardMaterial({color:0x303944,metalness:.7}));
  pole.position.y=2.5;g.add(pole);
  const light=new THREE.PointLight(0xffe8b0,8,12,2);
  light.position.y=5;g.add(light);
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(.16,12,12),new THREE.MeshBasicMaterial({color:0xfff0bd}));
  bulb.position.y=5;g.add(bulb);
  return g;
}

function buildTrack(){
  roadGroup=new THREE.Group();scene.add(roadGroup);

  const pts=[];
  const count=24;
  for(let i=0;i<count;i++){
    const a=(i/count)*Math.PI*2;
    const r=31+Math.sin(a*3)*4+Math.cos(a*5)*2;
    pts.push(new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r));
  }
  trackCurve=new THREE.CatmullRomCurve3(pts,true,"catmullrom",.35);

  const samples=220;
  const roadMat=new THREE.MeshStandardMaterial({color:0x252b33,roughness:.95});
  for(let i=0;i<samples;i++){
    const t=i/samples;
    const p=trackCurve.getPointAt(t);
    const tangent=trackCurve.getTangentAt(t).normalize();
    const segLen=trackCurve.getLength()/samples+1.2;
    const road=new THREE.Mesh(new THREE.BoxGeometry(12,.28,segLen),roadMat);
    road.position.copy(p);road.position.y=-.02;
    road.rotation.y=Math.atan2(tangent.x,tangent.z);
    road.receiveShadow=true;
    roadGroup.add(road);

    if(i%3===0){
      const stripe=new THREE.Mesh(new THREE.BoxGeometry(.16,.025,1.7),new THREE.MeshBasicMaterial({color:0xf2f2e8}));
      stripe.position.copy(p);stripe.position.y=.15;stripe.rotation.y=road.rotation.y;
      roadGroup.add(stripe);
    }

    if(i%2===0){
      addBarrier(p,tangent,-6.5);
      addBarrier(p,tangent,6.5);
    }
  }

  const start=trackCurve.getPointAt(0);
  const tangent=trackCurve.getTangentAt(0).normalize();
  for(let lane=-2;lane<=2;lane++){
    const x=start.x+tangent.z*lane*1.9;
    const z=start.z-tangent.x*lane*1.9;
    const line=new THREE.Mesh(new THREE.BoxGeometry(1.65,.03,2.5),new THREE.MeshBasicMaterial({color:lane%2===0?0xffffff:0x111111}));
    line.position.set(x,.17,z);
    line.rotation.y=Math.atan2(tangent.x,tangent.z);
    roadGroup.add(line);
  }
}

function addBarrier(p,tangent,offset){
  const normal=new THREE.Vector3(tangent.z,0,-tangent.x).normalize();
  const q=p.clone().addScaledVector(normal,offset);
  const rail=new THREE.Mesh(new THREE.BoxGeometry(.28,.55,2.5),new THREE.MeshStandardMaterial({color:0x9ca5af,metalness:.6}));
  rail.position.copy(q);rail.position.y=.35;rail.rotation.y=Math.atan2(tangent.x,tangent.z);
  rail.castShadow=true;roadGroup.add(rail);
}

function makeCar(color,index){
  const g=new THREE.Group();
  const bodyMat=new THREE.MeshStandardMaterial({color:new THREE.Color(color),metalness:.55,roughness:.3});
  const dark=new THREE.MeshStandardMaterial({color:0x080b10,metalness:.8,roughness:.18});
  const glass=new THREE.MeshStandardMaterial({color:0x8ed7ff,metalness:.2,roughness:.08,transparent:true,opacity:.8});

  const body=new THREE.Mesh(new THREE.BoxGeometry(1.65,.48,3.25),bodyMat);
  body.position.y=.62;body.castShadow=true;g.add(body);

  const hood=new THREE.Mesh(new THREE.BoxGeometry(1.42,.18,1.05),bodyMat);
  hood.position.set(0,.91,.85);hood.castShadow=true;g.add(hood);

  const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.22,.58,1.25),glass);
  cabin.position.set(0,1.02,-.25);cabin.castShadow=true;g.add(cabin);

  const spoiler=new THREE.Mesh(new THREE.BoxGeometry(1.55,.08,.35),dark);
  spoiler.position.set(0,.95,-1.55);g.add(spoiler);

  [-.72,.72].forEach(x=>{
    [-1.02,1.02].forEach(z=>{
      const w=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.22,16),dark);
      w.rotation.z=Math.PI/2;w.position.set(x,.38,z);w.castShadow=true;g.add(w);
    });
  });

  const glow=new THREE.PointLight(new THREE.Color(color),0,6,2);
  glow.position.set(0,.5,1.6);g.add(glow);
  g.userData.glow=glow;
  g.userData.index=index;
  return g;
}

function resetRace(){
  cars.forEach(c=>scene.remove(c.mesh));
  cars=[];
  for(let i=0;i<5;i++){
    const mesh=makeCar(colors[i],i);
    scene.add(mesh);
    cars.push({name:names[i],model:models[i],p:0,speed:0,boost:0,mesh,color:colors[i],score:0});
  }
  phase="lobby";phaseAt=performance.now();lastWinner=null;raceDistance=0;
  winnerEl.classList.add("hidden");
  addFeed("🏁 Yeni yarış hazırlanıyor");
}

function startRace(){
  if(phase==="lobby"){phase="countdown";phaseAt=performance.now();addFeed("🚦 Yarış başlıyor...")}
}

function gift(e){
  startRace();
  const value=Math.max(1,Number(e.diamondCount||1)*Number(e.repeatCount||1));
  const idx=Math.abs(Number(e.giftId||0))%5;
  const c=cars[idx];
  if(!c)return;
  c.boost=Math.min(1.8,c.boost+.35+Math.sqrt(value)*.03);
  c.speed+=.6+Math.sqrt(value)*.16;
  c.p=Math.min(.97,c.p+.008+Math.sqrt(value)*.0015);
  c.mesh.userData.glow.intensity=12;
  spawnBurst(c.mesh.position,c.color,16);
  addFeed("🎁 "+(e.user?.nickname||"Viewer")+" → "+(e.giftName||"Gift"),"gift");
}

function chat(e){
  const n=String(e.comment||"").trim();
  if(!/^[1-5]$/.test(n))return;
  startRace();
  const c=cars[Number(n)-1];
  c.speed+=.25;c.boost=Math.min(1.2,c.boost+.15);
  addFeed("💬 "+(e.user?.nickname||"Viewer")+" → "+n,"chat");
}

function spawnBurst(pos,color,count){
  for(let i=0;i<count;i++){
    const m=new THREE.Mesh(new THREE.SphereGeometry(.035+Math.random()*.05,6,6),new THREE.MeshBasicMaterial({color}));
    m.position.copy(pos);
    scene.add(m);
    particles.push({mesh:m,life:1,v:new THREE.Vector3((Math.random()-.5)*3,Math.random()*2.5,(Math.random()-.5)*3)});
  }
}

function update(dt){
  const now=performance.now();
  const elapsed=(now-phaseAt)/1000;

  if(phase==="countdown"&&elapsed>=3){
    phase="race";phaseAt=now;addFeed("🏁 GO!");
  }

  if(phase==="race"){
    cars.forEach((c,i)=>{
      const base=.035;
      const accel=(base+c.speed*.012+c.boost*.025)*dt;
      c.p=Math.min(1,c.p+accel);
      c.speed*=Math.pow(.76,dt);
      c.boost=Math.max(0,c.boost-dt*.14);
      c.mesh.userData.glow.intensity=Math.max(0,c.mesh.userData.glow.intensity-dt*18);
      placeCar(c,i);
    });

    const win=cars.find(c=>c.p>=1);
    if(win){
      phase="finished";phaseAt=now;lastWinner=win;
      winTitle.textContent=win.name+" WINS";
      winTitle.style.color=win.color;
      winSub.textContent=win.model+" • 3D Street Race";
      winnerEl.classList.remove("hidden");
      spawnBurst(win.mesh.position,win.color,60);
    }
  }else{
    cars.forEach((c,i)=>placeCar(c,i));
  }

  particles.forEach(p=>{
    p.life-=dt*1.8;
    p.mesh.position.addScaledVector(p.v,dt);
    p.v.y-=4*dt;
    p.mesh.scale.setScalar(Math.max(.01,p.life));
  });
  particles=particles.filter(p=>{
    if(p.life<=0){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();return false}
    return true;
  });

  if(phase==="finished"&&elapsed>=6)resetRace();

  phaseEl.textContent=phase.toUpperCase();
  timerEl.textContent=phase==="countdown"?String(Math.max(0,3-Math.floor(elapsed))):phase==="race"?Math.floor(elapsed)+"s":"—";

  cars.forEach((c,i)=>{
    const el=document.getElementById("s"+(i+1));
    if(el)el.textContent=Math.round(40+c.speed*28+c.boost*35)+" km/h";
  });
}

function placeCar(c,i){
  const t=Math.min(.999,c.p);
  const p=trackCurve.getPointAt(t);
  const tangent=trackCurve.getTangentAt(t).normalize();
  const normal=new THREE.Vector3(tangent.z,0,-tangent.x).normalize();
  const lane=(i-2)*1.75;
  c.mesh.position.copy(p).addScaledVector(normal,lane);
  c.mesh.position.y=.18;
  c.mesh.rotation.y=Math.atan2(tangent.x,tangent.z);
  c.mesh.rotation.z=Math.sin(performance.now()*.006+i)*.008;
}

function updateCamera(){
  if(!cars.length)return;
  const target=cars[0].mesh;
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(target.quaternion);
  const desired=target.position.clone().addScaledVector(forward,-9);
  desired.y+=5.2;
  camera.position.lerp(desired,.055);
  const look=target.position.clone();look.y+=.7;
  camera.lookAt(look);
}

function loop(){
  const dt=Math.min(.05,clock.getDelta());
  update(dt);
  updateCamera();
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
}

function resize(){
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
}

function addFeed(text,cls=""){
  const item=document.createElement("div");
  item.className="feed "+cls;item.textContent=text;
  feedEl.prepend(item);
  while(feedEl.children.length>7)feedEl.lastElementChild.remove();
}

for(let i=1;i<=5;i++){
  const el=document.getElementById("p"+i);
  if(el)el.textContent=names[i-1];
}

init();
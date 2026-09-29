import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/loaders/GLTFLoader.js";

const socket=window.io();
const mount=document.getElementById("game");
const phaseEl=document.getElementById("phase");
const timerEl=document.getElementById("timer");
const feedEl=document.getElementById("feed");
const winnerEl=document.getElementById("winner");
const winTitle=document.getElementById("winTitle");
const winSub=document.getElementById("winSub");

const colors=["#ff315f","#1e9bff","#ffc928","#a76cff","#25d99b"];
const names=["PATRON","RIVAL 1","RIVAL 2","RIVAL 3","RIVAL 4"];
const MODEL_URL="https://raw.githubusercontent.com/FahadS5534/3D-RACING-DODGE-GAME/main/Sports%20Car%20by%20Quaternius%20-%201mkmFkAz5v.glb";

let scene,camera,renderer,clock,trackCurve;
let cars=[],particles=[],world,trackGroup;
let phase="lobby",phaseAt=performance.now(),modelTemplate=null;
let cameraTarget=new THREE.Vector3();

init();

async function init(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x87a7c7);
  scene.fog=new THREE.Fog(0x87a7c7,70,240);

  camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,500);
  camera.position.set(0,7,16);

  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  mount.appendChild(renderer.domElement);

  clock=new THREE.Clock();
  addLights();
  buildWorld();
  buildTrack();
  await loadCarModel();
  resetRace();

  addEventListener("resize",resize);
  socket.on("live:event",e=>{if(e.type==="gift")gift(e)});
  socket.on("live:chat",chat);

  const params=new URLSearchParams(location.search);
  if(params.get("mode")==="live")socket.emit("join-stream",{username:params.get("username")||"",mode:"live"});

  requestAnimationFrame(loop);
}

function addLights(){
  scene.add(new THREE.HemisphereLight(0xd9efff,0x30452c,2.5));
  const sun=new THREE.DirectionalLight(0xfff5dc,3.8);
  sun.position.set(-45,70,35);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-90;sun.shadow.camera.right=90;
  sun.shadow.camera.top=90;sun.shadow.camera.bottom=-90;
  scene.add(sun);
}

function buildWorld(){
  world=new THREE.Group();
  scene.add(world);

  const grass=new THREE.Mesh(
    new THREE.PlaneGeometry(500,500),
    new THREE.MeshStandardMaterial({color:0x254a2b,roughness:1})
  );
  grass.rotation.x=-Math.PI/2;
  grass.receiveShadow=true;
  world.add(grass);

  // distant mountains
  const mountainMat=new THREE.MeshStandardMaterial({color:0x4d6672,roughness:1});
  for(let i=0;i<22;i++){
    const a=(i/22)*Math.PI*2;
    const r=145;
    const h=18+Math.random()*28;
    const m=new THREE.Mesh(new THREE.ConeGeometry(12+Math.random()*15,h,6),mountainMat);
    m.position.set(Math.cos(a)*r,h/2-2,Math.sin(a)*r);
    m.scale.x=1.5+Math.random();
    m.rotation.y=Math.random()*Math.PI;
    world.add(m);
  }

  // city blocks behind the circuit
  for(let i=0;i<38;i++){
    const a=Math.random()*Math.PI*2;
    const r=60+Math.random()*50;
    const h=5+Math.random()*18;
    const b=new THREE.Mesh(
      new THREE.BoxGeometry(4+Math.random()*7,h,4+Math.random()*7),
      new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(.58,.10,.18+Math.random()*.12),roughness:.85})
    );
    b.position.set(Math.cos(a)*r,h/2,Math.sin(a)*r);
    b.rotation.y=Math.random()*Math.PI;
    b.castShadow=true;
    world.add(b);
  }

  // trees
  for(let i=0;i<95;i++){
    const a=Math.random()*Math.PI*2;
    const r=38+Math.random()*82;
    const tree=makeTree();
    tree.position.set(Math.cos(a)*r,0,Math.sin(a)*r);
    tree.scale.setScalar(.75+Math.random()*1.3);
    world.add(tree);
  }

  // grandstands / spectator blocks
  for(let i=0;i<3;i++){
    const a=.35+i*2.05;
    const r=28;
    const stand=makeStand();
    stand.position.set(Math.cos(a)*r,0,Math.sin(a)*r);
    stand.rotation.y=-a+Math.PI/2;
    world.add(stand);
  }
}

function makeTree(){
  const g=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.18,.26,2,8),new THREE.MeshStandardMaterial({color:0x604026}));
  trunk.position.y=1;trunk.castShadow=true;g.add(trunk);
  const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1.35,1),new THREE.MeshStandardMaterial({color:0x1e6135,roughness:1}));
  crown.position.y=2.55;crown.castShadow=true;g.add(crown);
  return g;
}

function makeStand(){
  const g=new THREE.Group();
  const base=new THREE.Mesh(new THREE.BoxGeometry(15,2,5),new THREE.MeshStandardMaterial({color:0x252b34,roughness:.9}));
  base.position.y=1;g.add(base);
  for(let row=0;row<5;row++){
    const bench=new THREE.Mesh(new THREE.BoxGeometry(13,.35,1.0),new THREE.MeshStandardMaterial({color:row%2?0xd73555:0x1d8be0}));
    bench.position.set(0,2+row*.72,-1.4+row*.62);g.add(bench);
  }
  const roof=new THREE.Mesh(new THREE.BoxGeometry(15,.25,5.8),new THREE.MeshStandardMaterial({color:0x10151c,metalness:.3}));
  roof.position.y=5.8;g.add(roof);
  return g;
}

function buildTrack(){
  trackGroup=new THREE.Group();
  scene.add(trackGroup);

  const pts=[];
  for(let i=0;i<32;i++){
    const a=(i/32)*Math.PI*2;
    const r=30+Math.sin(a*2.2)*5+Math.cos(a*5)*2.2;
    pts.push(new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r));
  }
  trackCurve=new THREE.CatmullRomCurve3(pts,true,"catmullrom",.38);

  const samples=420;
  const roadWidth=12;
  const vertices=[];
  const uvs=[];
  const indices=[];
  const left=[],right=[],centers=[];
  for(let i=0;i<=samples;i++){
    const t=i/samples;
    const p=trackCurve.getPointAt(t);
    const tan=trackCurve.getTangentAt(t).normalize();
    const normal=new THREE.Vector3(tan.z,0,-tan.x).normalize();
    left.push(p.clone().addScaledVector(normal,roadWidth/2));
    right.push(p.clone().addScaledVector(normal,-roadWidth/2));
    centers.push(p);
    vertices.push(left[i].x,.02,left[i].z,right[i].x,.02,right[i].z);
    uvs.push(0,t*20,1,t*20);
    if(i<samples){
      const a=i*2,b=a+1,c=a+2,d=a+3;
      indices.push(a,b,c,c,b,d);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  geo.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geo.setIndex(indices);geo.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({color:0x20252c,roughness:.62,metalness:.08});
  const road=new THREE.Mesh(geo,mat);road.receiveShadow=true;trackGroup.add(road);

  // rumble strips
  addStrip(left,0xd83b46);
  addStrip(right,0xf1f1ea);

  // lane markers
  for(let i=0;i<samples;i+=8){
    if(Math.floor(i/8)%2===1)continue;
    const p=centers[i];
    const tan=trackCurve.getTangentAt(i/samples).normalize();
    const dash=new THREE.Mesh(new THREE.BoxGeometry(.16,.035,2.1),new THREE.MeshBasicMaterial({color:0xffffff}));
    dash.position.copy(p);dash.position.y=.07;dash.rotation.y=Math.atan2(tan.x,tan.z);
    trackGroup.add(dash);
  }

  // barriers and signs
  for(let i=0;i<samples;i+=7){
    const p=centers[i];
    const tan=trackCurve.getTangentAt(i/samples).normalize();
    const normal=new THREE.Vector3(tan.z,0,-tan.x).normalize();
    addBarrier(p,normal,7.1);
    addBarrier(p,normal,-7.1);
  }

  // start gantry
  const start=centers[0];
  const tan=trackCurve.getTangentAt(0).normalize();
  const gantry=new THREE.Group();
  const postMat=new THREE.MeshStandardMaterial({color:0x11161d,metalness:.8});
  [-7,7].forEach(x=>{
    const p=start.clone().add(new THREE.Vector3(tan.z,0,-tan.x).multiplyScalar(x));
    const post=new THREE.Mesh(new THREE.BoxGeometry(.5,7,.5),postMat);
    post.position.copy(p);post.position.y=3.5;post.rotation.y=Math.atan2(tan.x,tan.z);gantry.add(post);
  });
  const beam=new THREE.Mesh(new THREE.BoxGeometry(14,.65,.7),postMat);
  beam.position.copy(start);beam.position.y=7;beam.rotation.y=Math.atan2(tan.x,tan.z);gantry.add(beam);
  for(let i=0;i<7;i++){
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(1.1,.38,.5),new THREE.MeshBasicMaterial({color:i%2?0xff3030:0x39e5ff}));
    lamp.position.copy(start);lamp.position.y=6.45;lamp.position.add(new THREE.Vector3(tan.z,0,-tan.x).multiplyScalar(-5+i*1.65));lamp.rotation.y=Math.atan2(tan.x,tan.z);gantry.add(lamp);
  }
  trackGroup.add(gantry);
}

function addStrip(points,color){
  const verts=[];
  const width=.65;
  for(let i=0;i<points.length;i++){
    const p=points[i];
    const tan=trackCurve.getTangentAt(i/(points.length-1)).normalize();
    const n=new THREE.Vector3(tan.z,0,-tan.x).normalize();
    verts.push(p.x+n.x*width,.075,p.z+n.z*width,p.x-n.x*width,.075,p.z-n.z*width);
  }
  const inds=[];
  for(let i=0;i<points.length-1;i++){const a=i*2,b=a+1,c=a+2,d=a+3;inds.push(a,b,c,c,b,d)}
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(verts,3));g.setIndex(inds);g.computeVertexNormals();
  const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:.65}));
  trackGroup.add(m);
}

function addBarrier(p,normal,offset){
  const q=p.clone().addScaledVector(normal,offset);
  const b=new THREE.Mesh(new THREE.BoxGeometry(.28,.65,2.6),new THREE.MeshStandardMaterial({color:0xd5d9de,metalness:.65,roughness:.35}));
  b.position.copy(q);b.position.y=.38;b.rotation.y=Math.atan2(trackCurve.getTangentAt(.5).x,trackCurve.getTangentAt(.5).z);
  b.castShadow=true;trackGroup.add(b);
}

async function loadCarModel(){
  addFeed("🚗 3D araç modeli yükleniyor...");
  try{
    const loader=new GLTFLoader();
    const gltf=await loader.loadAsync(MODEL_URL);
    modelTemplate=gltf.scene;
    modelTemplate.traverse(o=>{
      if(o.isMesh){o.castShadow=true;o.receiveShadow=true}
    });
    addFeed("✓ Gerçek 3D yarış aracı hazır");
  }catch(err){
    console.warn("3D model load failed, using local fallback",err);
    addFeed("⚠ 3D model yüklenemedi; yerel araç kullanılıyor");
  }
}

function createCar(color,index){
  const g=modelTemplate?modelTemplate.clone(true):fallbackCar(color);
  if(modelTemplate){
    g.traverse(o=>{
      if(o.isMesh){
        o.material=o.material?.clone?.()||o.material;
        if(o.material?.color)o.material.color.set(color);
        if(o.material?.roughness!==undefined)o.material.roughness=.28;
        if(o.material?.metalness!==undefined)o.material.metalness=.48;
        o.castShadow=true;o.receiveShadow=true;
      }
    });
    const box=new THREE.Box3().setFromObject(g);
    const size=box.getSize(new THREE.Vector3());
    const scale=3.2/Math.max(size.x,size.z);
    g.scale.setScalar(scale);
  }
  const glow=new THREE.PointLight(new THREE.Color(color),0,8,2);
  glow.position.set(0,.35,1.8);g.add(glow);
  g.userData.glow=glow;
  g.userData.index=index;
  return g;
}

function fallbackCar(color){
  const g=new THREE.Group();
  const mat=new THREE.MeshStandardMaterial({color,metalness:.65,roughness:.25});
  const dark=new THREE.MeshStandardMaterial({color:0x080b10,metalness:.85});
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.75,.48,3.25),mat);body.position.y=.62;g.add(body);
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.22,.55,1.3),new THREE.MeshStandardMaterial({color:0x8ddcff,metalness:.2,roughness:.05,transparent:true,opacity:.8}));cabin.position.set(0,1,-.25);g.add(cabin);
  [-.72,.72].forEach(x=>[-1.05,1.05].forEach(z=>{const w=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.22,20),dark);w.rotation.z=Math.PI/2;w.position.set(x,.38,z);g.add(w)}));
  return g;
}

function resetRace(){
  cars.forEach(c=>scene.remove(c.mesh));
  cars=[];
  for(let i=0;i<5;i++){
    const mesh=createCar(colors[i],i);scene.add(mesh);
    cars.push({name:names[i],model:"AGT GT",p:0,speed:0,boost:0,mesh,color:colors[i]});
  }
  phase="lobby";phaseAt=performance.now();
  winnerEl.classList.add("hidden");
  addFeed("🏁 Yeni yarış hazırlanıyor");
}

function startRace(){
  if(phase==="lobby"){phase="countdown";phaseAt=performance.now();addFeed("🚦 3... 2... 1...")}
}

function gift(e){
  startRace();
  const value=Math.max(1,Number(e.diamondCount||1)*Number(e.repeatCount||1));
  const idx=Math.abs(Number(e.giftId||0))%5;
  const c=cars[idx];if(!c)return;
  c.boost=Math.min(2.2,c.boost+.55+Math.sqrt(value)*.035);
  c.speed+=.75+Math.sqrt(value)*.18;
  c.p=Math.min(.975,c.p+.006+Math.sqrt(value)*.0012);
  c.mesh.userData.glow.intensity=18;
  spawnBurst(c.mesh.position,c.color,22);
  addFeed("🎁 "+(e.user?.nickname||"Viewer")+" → "+(e.giftName||"Gift"),"gift");
}

function chat(e){
  const n=String(e.comment||"").trim();
  if(!/^[1-5]$/.test(n))return;
  startRace();
  const c=cars[Number(n)-1];if(!c)return;
  c.speed+=.32;c.boost=Math.min(1.4,c.boost+.18);
  addFeed("💬 "+(e.user?.nickname||"Viewer")+" → yarışçı "+n,"chat");
}

function placeCar(c,i){
  const t=Math.min(.999,c.p);
  const p=trackCurve.getPointAt(t);
  const tan=trackCurve.getTangentAt(t).normalize();
  const normal=new THREE.Vector3(tan.z,0,-tan.x).normalize();
  const lane=(i-2)*1.75;
  c.mesh.position.copy(p).addScaledVector(normal,lane);
  c.mesh.position.y=.18;
  c.mesh.rotation.y=Math.atan2(tan.x,tan.z);
  c.mesh.rotation.z=Math.sin(performance.now()*.004+i)*.006;
}

function update(dt){
  const now=performance.now();
  const elapsed=(now-phaseAt)/1000;
  if(phase==="countdown"&&elapsed>=3){phase="race";phaseAt=now;addFeed("🏁 GO!")}
  if(phase==="race"){
    cars.forEach((c,i)=>{
      c.p=Math.min(1,c.p+(.008+c.speed*.0028+c.boost*.006)*dt);
      c.speed*=Math.pow(.72,dt);
      c.boost=Math.max(0,c.boost-dt*.15);
      c.mesh.userData.glow.intensity=Math.max(0,c.mesh.userData.glow.intensity-dt*25);
      placeCar(c,i);
    });
    const win=cars.find(c=>c.p>=1);
    if(win){
      phase="finished";phaseAt=now;
      winTitle.textContent=win.name+" WINS";
      winTitle.style.color=win.color;
      winSub.textContent="AGT Street Race 3D • Yeni yarış hazırlanıyor";
      winnerEl.classList.remove("hidden");
      spawnBurst(win.mesh.position,win.color,80);
    }
  }else cars.forEach(placeCar);
  updateParticles(dt);
  if(phase==="finished"&&elapsed>=6)resetRace();
  phaseEl.textContent=phase.toUpperCase();
  timerEl.textContent=phase==="countdown"?String(Math.max(0,3-Math.floor(elapsed))):phase==="race"?Math.floor(elapsed)+"s":"—";
  cars.forEach((c,i)=>{
    const el=document.getElementById("s"+(i+1));
    if(el)el.textContent=Math.round(70+c.speed*32+c.boost*40)+" km/h";
  });
}

function spawnBurst(pos,color,count){
  for(let i=0;i<count;i++){
    const m=new THREE.Mesh(new THREE.SphereGeometry(.035+Math.random()*.055,7,7),new THREE.MeshBasicMaterial({color}));
    m.position.copy(pos);scene.add(m);
    particles.push({mesh:m,life:1,v:new THREE.Vector3((Math.random()-.5)*4,Math.random()*3.5,(Math.random()-.5)*4)});
  }
}
function updateParticles(dt){
  particles.forEach(p=>{p.life-=dt*1.8;p.mesh.position.addScaledVector(p.v,dt);p.v.y-=5*dt;p.mesh.scale.setScalar(Math.max(.01,p.life))});
  particles=particles.filter(p=>{if(p.life<=0){scene.remove(p.mesh);return false}return true});
}

function updateCamera(){
  if(!cars.length)return;
  const lead=cars[0].mesh;
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(lead.quaternion);
  const desired=lead.position.clone().addScaledVector(forward,-10);
  desired.y+=5.4;
  camera.position.lerp(desired,.075);
  cameraTarget.lerp(lead.position,.09);
  cameraTarget.y+=.8;
  camera.lookAt(cameraTarget);
}

function loop(){
  const dt=Math.min(.05,clock.getDelta());
  update(dt);updateCamera();renderer.render(scene,camera);
  requestAnimationFrame(loop);
}
function resize(){
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
}
function addFeed(text,cls=""){
  const item=document.createElement("div");item.className="feed "+cls;item.textContent=text;feedEl.prepend(item);
  while(feedEl.children.length>7)feedEl.lastElementChild.remove();
}
for(let i=1;i<=5;i++)document.getElementById("p"+i).textContent=names[i-1];
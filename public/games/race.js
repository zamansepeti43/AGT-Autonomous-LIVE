(() => {
const $=s=>document.querySelector(s);
const canvas=$("#raceCanvas"),ctx=canvas.getContext("2d");
const mini=$("#miniCanvas"),mctx=mini.getContext("2d");
const W=canvas.width,H=canvas.height;
const socket=window.io?window.io():null;
const cfg=window.AGT_RACE_CONFIG||{mode:"demo"};

const GIFT_UI=[
 {icon:"🍵",name:"ÇAY",effect:"OYUNA KATIL",key:"join",accent:"#ffd166"},
 {icon:"🌹",name:"GÜL",effect:"+%20 HIZ",key:"rose",accent:"#ff477e"},
 {icon:"🎵",name:"TIKTOK",effect:"NİTRO",key:"tiktok",accent:"#25d9ff"},
 {icon:"❤️",name:"KALP",effect:"MİNİ BOOST",key:"heart",accent:"#ff4d73"},
 {icon:"🫰",name:"PARMAK KALP",effect:"SOL DÖNÜŞ",key:"left",accent:"#c86bff"},
 {icon:"👑",name:"TAÇ",effect:"SAĞ DÖNÜŞ",key:"right",accent:"#ffd166"},
 {icon:"🦁",name:"ASLAN",effect:"BÜYÜK BOOST",key:"lion",accent:"#ff9d2e"},
 {icon:"🌌",name:"GALAKSİ",effect:"ÖZEL GÜÇ",key:"galaxy",accent:"#7d8cff"}
];

function giftCard(g){
 return '<div class="gift" style="--accent:'+g.accent+';--glow:'+g.accent+'"><div class="icon">'+g.icon+'</div><b>'+g.name+'</b><small>'+g.effect+'</small></div>';
}
$("#giftTop").innerHTML=GIFT_UI.slice(0,4).map(giftCard).join("");
$("#giftBottom").innerHTML=GIFT_UI.slice(4).map(giftCard).join("");

const colors=["#ff315c","#2ea8ff","#ffd23f","#32df89","#b56bff","#ff7b35","#00e5d4","#ff4fd8","#8dff3f","#ff9f1c"];
const botNames=["MertBot","ElifBot","KeremBot","DenizBot","AyşeBot","CanBot","EceBot","ArdaBot","MiraBot","AliBot"];
const path=[];
for(let i=0;i<64;i++){
 const a=(Math.PI*2*i)/64, x=540+390*Math.cos(a), y=360+255*Math.sin(a);
 path.push({x,y});
}
function pointAt(t, lane=0){
 const n=path.length, f=((t%1)+1)%1*n, i=Math.floor(f), q=f-i, a=path[i],b=path[(i+1)%n];
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
 const nx=-dy/len,ny=dx/len;
 return {x:a.x+(b.x-a.x)*q+nx*lane,y:a.y+(b.y-a.y)*q+ny*lane,angle:Math.atan2(dy,dx)};
}
function normName(e){return String(e?.user?.nickname||e?.user?.uniqueId||"Oyuncu").slice(0,13)}
function normId(e){return String(e?.user?.uniqueId||e?.user?.userId||normName(e)).toLowerCase()}

const cars=Array.from({length:10},(_,i)=>({
 slot:i,id:"bot-"+i,name:botNames[i],human:false,color:colors[i],progress:i*0.0025,speed:0.00145+Math.random()*.00025,
 boost:0,boostTimer:0,drift:0,flash:0,finished:false
}));
const players=new Map();
let phase="waiting", phaseStarted=performance.now(), raceStarted=0, last=performance.now(), lap=1, raceNo=1;
let effects=[], winner=null, joinOpen=true;

function findCar(id){return cars.find(c=>c.id===id)}
function joinPlayer(id,name,forcedSlot){
 let existing=findCar(id); if(existing){existing.name=name;existing.human=true;return existing}
 let idx=typeof forcedSlot==="number"&&cars[forcedSlot]&&!cars[forcedSlot].human?forcedSlot:cars.findIndex(c=>!c.human);
 if(idx<0) idx=cars.findIndex(c=>c.id.startsWith("bot-"));
 if(idx<0)return null;
 const c=cars[idx];c.id=id;c.name=name;c.human=true;c.color=colors[idx];c.progress=0;c.speed=.00135;c.boost=0;c.finished=false;players.set(id,c);
 return c;
}
function removeHumansForReset(){
 for(let i=0;i<cars.length;i++){cars[i].id="bot-"+i;cars[i].name=botNames[i];cars[i].human=false;cars[i].progress=i*.0025;cars[i].speed=.00145+Math.random()*.00025;cars[i].boost=0;cars[i].finished=false}
 players.clear();
}
function spawnEffect(x,y,color,text,icon){
 effects.push({x,y,color,text,icon,t:0,max:1.3,vy:-30});
}

const effectsMap={
 join:{label:"OYUNA KATILDI",color:"#ffd166",icon:"🍵"},
 rose:{label:"+%20 HIZ",color:"#ff477e",icon:"🌹"},
 tiktok:{label:"NİTRO!",color:"#25d9ff",icon:"🎵"},
 heart:{label:"MİNİ BOOST",color:"#ff4d73",icon:"❤️"},
 left:{label:"SOL DÖNÜŞ",color:"#c86bff",icon:"🫰"},
 right:{label:"SAĞ DÖNÜŞ",color:"#ffd166",icon:"👑"},
 lion:{label:"BÜYÜK BOOST",color:"#ff9d2e",icon:"🦁"},
 galaxy:{label:"ÖZEL GÜÇ",color:"#7d8cff",icon:"🌌"}
};

function classifyGift(name,diamonds){
 const s=String(name||"").toLowerCase();
 if(/çay|cay|tea/.test(s))return"join";
 if(/rose|gül|gul|rosa/.test(s))return"rose";
 if(/tiktok/.test(s))return"tiktok";
 if(/heart|kalp/.test(s)&&!/finger/.test(s))return"heart";
 if(/finger|parmak/.test(s))return"left";
 if(/crown|taç|tac|little crown/.test(s))return"right";
 if(/lion|aslan/.test(s))return"lion";
 if(/galaxy|galaksi|interstellar|universe/.test(s))return"galaxy";
 if(diamonds>=1000)return"galaxy";
 if(diamonds>=299)return"lion";
 if(diamonds>=99)return"right";
 if(diamonds>=5)return"heart";
 return"rose";
}
function applyGift(e){
 const id=normId(e), name=normName(e), diamonds=Math.max(1,Number(e?.diamondCount||0)*Number(e?.repeatCount||1));
 let c=findCar(id);
 const key=classifyGift(e?.giftName,diamonds);
 if(key==="join"&&!c)c=joinPlayer(id,name);
 if(!c&&phase!=="finished")c=joinPlayer(id,name);
 if(!c)return;
 if(key==="rose")c.boost=Math.max(c.boost,.20); 
 if(key==="tiktok")c.boost=Math.max(c.boost,.55);
 if(key==="heart")c.boost=Math.max(c.boost,.10);
 if(key==="left")c.drift=-1;
 if(key==="right")c.drift=1;
 if(key==="lion")c.boost=Math.max(c.boost,1.0);
 if(key==="galaxy"){c.boost=Math.max(c.boost,.75);c.speed+=.00035}
 c.boostTimer=key==="lion"?4.5:key==="tiktok"?2.8:1.7;
 const p=pointAt(c.progress,(c.slotOffset||0));
 spawnEffect(p.x,p.y,effectsMap[key].color,effectsMap[key].label,effectsMap[key].icon);
}
function applyChat(e){
 const id=normId(e), name=normName(e), msg=String(e?.comment||"").trim().toLowerCase();
 const match=msg.match(/^!(?:araba)?\\s*([1-8])$/);
 if(match){
   const slot=Math.max(0,Math.min(7,Number(match[1])-1));
   const c=joinPlayer(id,name,slot);
   if(c){spawnEffect(...Object.values(pointAt(c.progress)).slice(0,2), "#fff", "ARACA KATILDI", "🏎️");}
   return;
 }
 const c=findCar(id); if(!c)return;
 if(/\\b(start|başla|basla)\\b/.test(msg)&&phase==="waiting")startCountdown();
 if(/\\b(nitro|hızlan|hizlan)\\b/.test(msg))c.boost=Math.max(c.boost,.25);
 if(msg==="sol"||msg==="left")c.drift=-1;
 if(msg==="sağ"||msg==="sag"||msg==="right")c.drift=1;
}
function startCountdown(){if(phase!=="waiting")return;phase="countdown";phaseStarted=performance.now()}
function startRace(){
 phase="racing";phaseStarted=performance.now();raceStarted=performance.now();lap=1;winner=null;
 cars.forEach((c,i)=>{c.progress=i*.0025;c.finished=false;c.boost=0;c.boostTimer=0;c.speed=.00135+Math.random()*.00035});
}
function finishRace(){
 phase="finished";phaseStarted=performance.now();
 const ranked=[...cars].sort((a,b)=>b.progress-a.progress);winner=ranked[0];
 spawnEffect(...Object.values(pointAt(winner.progress)).slice(0,2),"#ffd166","KAZANAN: "+winner.name,"🏆");
}
function resetRace(){raceNo++;phase="waiting";phaseStarted=performance.now();removeHumansForReset();joinOpen=true}

function update(dt){
 if(phase==="waiting" && performance.now()-phaseStarted>11000){startCountdown()}
 if(phase==="countdown" && performance.now()-phaseStarted>3200)startRace();
 if(phase==="racing"){
   const elapsed=(performance.now()-raceStarted)/1000;
   cars.forEach((c,i)=>{
     const ai=c.speed;
     const boost=c.boostTimer>0?c.boost:0;
     c.progress += (ai*(1+boost))*dt/16.666;
     c.boostTimer=Math.max(0,c.boostTimer-dt/1000);
     if(c.drift){c.drift*=.92}
     if(c.progress>=1){c.progress-=1;c.laps=(c.laps||0)+1}
     if((c.laps||0)>=3)c.finished=true;
   });
   const done=cars.filter(c=>c.finished).sort((a,b)=>b.progress-a.progress);
   if(done.length||elapsed>75)finishRace();
 }
 if(phase==="finished"&&performance.now()-phaseStarted>6500)resetRace();
 effects.forEach(e=>{e.t+=dt/1000;e.y+=e.vy*dt/1000;e.vy*=.97});effects=effects.filter(e=>e.t<e.max);
}

function drawBackground(){
 ctx.fillStyle="#0b1513";ctx.fillRect(0,0,W,H);
 for(let i=0;i<40;i++){ctx.fillStyle=i%2?"#12251b":"#102019";ctx.beginPath();ctx.arc((i*137)%W,(i*71)%H,28+(i%5)*9,0,Math.PI*2);ctx.fill()}
 ctx.fillStyle="#06344b";ctx.beginPath();ctx.ellipse(540,360,500,340,0,0,Math.PI*2);ctx.fill();
}
function drawTrack(){
 ctx.save();
 ctx.translate(0,0);
 ctx.lineCap="round";ctx.lineJoin="round";
 ctx.beginPath();path.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
 ctx.strokeStyle="#151a20";ctx.lineWidth=170;ctx.stroke();
 ctx.strokeStyle="#d9dce0";ctx.lineWidth=132;ctx.stroke();
 ctx.strokeStyle="#252a30";ctx.lineWidth=118;ctx.stroke();
 ctx.setLineDash([18,18]);ctx.strokeStyle="#737b83";ctx.lineWidth=3;ctx.stroke();ctx.setLineDash([]);
 ctx.strokeStyle="#e9e9e9";ctx.lineWidth=6;ctx.setLineDash([14,10]);ctx.stroke();ctx.setLineDash([]);
 // curbs
 ctx.beginPath();path.forEach((p,i)=>{const q=pointAt(i/path.length,.0);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.closePath();ctx.strokeStyle="#f4f4f4";ctx.lineWidth=124;ctx.stroke();
 ctx.strokeStyle="#ef304e";ctx.lineWidth=124;ctx.setLineDash([18,18]);ctx.stroke();ctx.setLineDash([]);
 // redraw asphalt over inner curb
 ctx.beginPath();path.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.strokeStyle="#292d32";ctx.lineWidth=112;ctx.stroke();
 // start finish
 const a=pointAt(0);ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.angle);
 for(let i=-5;i<6;i++){ctx.fillStyle=i%2?"#fff":"#111";ctx.fillRect(i*18,-54,18,18);ctx.fillStyle=i%2?"#111":"#fff";ctx.fillRect(i*18,-36,18,18);ctx.fillStyle=i%2?"#111":"#fff";ctx.fillRect(i*18,-18,18,18)}
 ctx.restore();
 ctx.restore();
}
function drawScenery(){
 for(let i=0;i<18;i++){const p=path[(i*3+1)%path.length];const side=i%2?-1:1;const q=pointAt(((i*3+1)%path.length)/path.length,side*100);
   ctx.fillStyle="#0d2b1a";ctx.beginPath();ctx.arc(q.x,q.y,14,0,Math.PI*2);ctx.fill();ctx.fillStyle="#1b6a3d";ctx.beginPath();ctx.arc(q.x,q.y-10,18,0,Math.PI*2);ctx.fill();
 }
}
function drawCar(c,rank){
 const p=pointAt(c.progress,(c.slotOffset||0)+c.drift*8);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
 ctx.shadowColor=c.color;ctx.shadowBlur=c.boostTimer>0?18:8;
 ctx.fillStyle="#080a0d";ctx.fillRect(-17,-9,34,18);
 ctx.fillStyle=c.color;ctx.beginPath();ctx.roundRect(-12,-8,24,16,5);ctx.fill();
 ctx.fillStyle="#dff8ff";ctx.fillRect(-3,-6,8,12);ctx.fillStyle="#10141a";ctx.fillRect(6,-6,5,12);
 if(c.boostTimer>0){ctx.fillStyle=c.color;ctx.globalAlpha=.55;ctx.beginPath();ctx.moveTo(-15,0);ctx.lineTo(-40,-5);ctx.lineTo(-40,5);ctx.closePath();ctx.fill()}
 ctx.restore();
 // nameplate
 ctx.font="bold 10px Arial";ctx.textAlign="center";const label=c.human?c.name:"AI "+(rank+1);
 const w=ctx.measureText(label).width+22;ctx.fillStyle="rgba(3,6,11,.86)";ctx.beginPath();ctx.roundRect(p.x-w/2,p.y-30,w,17,8);ctx.fill();
 ctx.fillStyle=c.color;ctx.fillText(label,p.x,p.y-18);
 if(c.human){ctx.fillStyle="#ffd166";ctx.font="bold 8px Arial";ctx.fillText("#"+(rank+1),p.x,p.y-34)}
}
function drawHUD(){
 ctx.fillStyle="rgba(4,8,14,.7)";ctx.fillRect(0,0,W,42);
 ctx.fillStyle="#fff";ctx.font="900 18px Arial";ctx.fillText("AGT RACE",20,27);
 ctx.fillStyle="#6ee7ff";ctx.font="bold 11px Arial";ctx.fillText("TIKTOK LIVE • TOP DOWN",126,26);
 ctx.fillStyle="#fff";ctx.font="bold 12px Arial";ctx.textAlign="right";ctx.fillText("TUR "+Math.min(3,1+(cars[0].laps||0))+"/3",W-20,24);ctx.textAlign="left";
 if(phase==="countdown"){const n=Math.max(1,3-Math.floor((performance.now()-phaseStarted)/1000));ctx.fillStyle="rgba(0,0,0,.5)";ctx.fillRect(W/2-90,H/2-80,180,120);ctx.fillStyle="#ff2b83";ctx.font="900 64px Arial";ctx.textAlign="center";ctx.fillText(n,W/2,H/2+20);ctx.textAlign="left"}
 if(phase==="finished"){ctx.fillStyle="rgba(0,0,0,.65)";ctx.fillRect(280,260,520,180);ctx.fillStyle="#ffd166";ctx.font="900 32px Arial";ctx.textAlign="center";ctx.fillText("🏆 "+(winner?.name||"YARIŞ BİTTİ"),540,330);ctx.fillStyle="#fff";ctx.font="bold 15px Arial";ctx.fillText("Yeni yarış hazırlanıyor…",540,365);ctx.textAlign="left"}
}
function render(){
 drawBackground();drawScenery();drawTrack();
 const ranked=[...cars].sort((a,b)=>b.progress-a.progress);ranked.forEach((c,i)=>drawCar(c,i));
 drawHUD();
 // effects
 effects.forEach(e=>{ctx.save();ctx.globalAlpha=1-e.t/e.max;ctx.fillStyle=e.color;ctx.font="900 14px Arial";ctx.textAlign="center";ctx.shadowColor=e.color;ctx.shadowBlur=12;ctx.fillText(e.icon+" "+e.text,e.x,e.y);ctx.restore()});
 // minimap
 mctx.clearRect(0,0,180,120);mctx.fillStyle="#071018";mctx.fillRect(0,0,180,120);mctx.beginPath();
 path.forEach((p,i)=>{const x=90+(p.x-540)*.19,y=60+(p.y-360)*.19;i?mctx.lineTo(x,y):mctx.moveTo(x,y)});mctx.closePath();mctx.strokeStyle="#40505f";mctx.lineWidth=10;mctx.stroke();mctx.strokeStyle="#dcefff";mctx.lineWidth=2;mctx.stroke();
 cars.forEach(c=>{const p=pointAt(c.progress);mctx.fillStyle=c.color;mctx.beginPath();mctx.arc(90+(p.x-540)*.19,60+(p.y-360)*.19,3,0,Math.PI*2);mctx.fill()});
}
function updateUI(){
 const ranked=[...cars].sort((a,b)=>b.progress-a.progress);
 $("#leaderRows").innerHTML=ranked.slice(0,6).map((c,i)=>'<div class="leader-row"><span class="pos" style="color:'+c.color+'">'+(i+1)+'</span><span class="name">'+(c.human?"👤 ":"")+c.name+'</span><span class="gap">'+(i===0?"LIDER":"+"+(i*.41).toFixed(2))+'</span></div>').join("");
 $("#lapText").textContent="TUR "+Math.min(3,1+(cars[0].laps||0))+"/3";
 const sec=phase==="racing"?(performance.now()-raceStarted)/1000:0;
 $("#raceTimer").textContent=(Math.floor(sec/60)).toString().padStart(2,"0")+":"+((sec%60).toFixed(3)).padStart(6,"0");
 $("#phaseText").textContent=phase==="waiting"?"🍵 ÇAY GÖNDER VEYA !1-!8 YAZ":phase==="countdown"?"🏁 HAZIRLAN":"🎁 HEDİYELERLE ARABANI GÜÇLENDİR";
 $("#raceState").textContent=phase==="waiting"?"KATILIM AÇIK":phase==="countdown"?"YARIŞ BAŞLIYOR":"CANLI YARIŞ";
 const human=cars.find(c=>c.human);const speed=human?Math.round(150+human.boost*95):0;$("#speedText").textContent=speed;$("#boostText").textContent="BOOST "+Math.round((human?.boost||0)*100)+"%";
}
function loop(now){const dt=Math.min(40,now-last);last=now;update(dt);render();updateUI();requestAnimationFrame(loop)}
if(socket){
 socket.on("live:event",e=>{if(e?.type==="gift")applyGift(e);else if(e?.type==="like"){const c=findCar(normId(e));if(c)c.boost=Math.max(c.boost,.06)}});
 socket.on("live:chat",applyChat);
 socket.on("live:connected",()=>{});
}
setTimeout(()=>{if(cfg.mode!=="live" && phase==="waiting"){joinPlayer("demo-red","Mert",0);joinPlayer("demo-blue","Elif",1);joinPlayer("demo-yellow","Kerem",2);startCountdown()}},1200);
window.addEventListener("keydown",e=>{if(e.key==="1")applyChat({user:{uniqueId:"keyboard",nickname:"Testçi"},comment:"!1"});if(e.key==="2")applyChat({user:{uniqueId:"keyboard",nickname:"Testçi"},comment:"!2"});if(e.key==="3")applyChat({user:{uniqueId:"keyboard",nickname:"Testçi"},comment:"!3"});if(e.key==="g")applyGift({user:{uniqueId:"keyboard",nickname:"Testçi"},giftName:"Rose",diamondCount:1});if(e.key==="t")applyGift({user:{uniqueId:"keyboard",nickname:"Testçi"},giftName:"TikTok",diamondCount:1});if(e.key==="c")applyGift({user:{uniqueId:"keyboard",nickname:"Testçi"},giftName:"Tea",diamondCount:50})});
requestAnimationFrame(loop);
})();
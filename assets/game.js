(() => {
"use strict";

const SB=window.supabase, CFG=window.DHC_CONFIG||{}, screen=document.querySelector("#screen");
const PROMPTS=["an abandoned house","a cursed kitchen","a beach at midnight","a zombie apocalypse","a wizard's pantry","a haunted supermarket","a gas station at 3 AM","a grandmother's recipe book","a spaceship cafeteria","a medieval tavern"];
const FOODS=["pizza","burger","ramen","tacos","pancakes","fried rice","sandwich","curry","pasta","ice cream","hot dog","salad","sushi","pie","nachos","breakfast burrito"];
const FALLBACK=["salt","pepper","butter","garlic","onion","flour","cheese","mushrooms","tomato","potato"];
const $=s=>document.querySelector(s), esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rand=a=>a[Math.floor(Math.random()*a.length)];
const code=()=>Array.from({length:5},()=>rand("ABCDEFGHJKLMNPQRSTUVWXYZ23456789".split(""))).join("");
const id=()=>crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36);
const fmt=s=>String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");

let sb=null, channel=null, state=null, timerHandle=null, timerEnd=0, roundNonce=0;
const me={id:id(),name:"Player",host:false};

function toast(t){const e=document.createElement("div");e.className="toast";e.textContent=t;document.body.appendChild(e);setTimeout(()=>e.remove(),2300)}
function render(h){screen.innerHTML=`<div class="wrap">${h}</div>`}
function valid(){return CFG.SUPABASE_URL&&CFG.SUPABASE_KEY}
function stopTimer(){if(timerHandle){clearInterval(timerHandle);timerHandle=null}timerEnd=0}
function startTimer(seconds,onExpire){
  stopTimer(); timerEnd=Date.now()+seconds*1000;
  const tick=()=>{const left=Math.max(0,Math.ceil((timerEnd-Date.now())/1000));const e=$("#timer");if(e){e.textContent=fmt(left);e.classList.toggle("warn",left<=10)}if(left<=0){stopTimer();onExpire()}};
  tick();timerHandle=setInterval(tick,250);
}
async function send(type,payload={}){if(!channel)return false;try{const r=await channel.send({type:"broadcast",event:"dhc",payload:{type,payload,from:me.id}});return r==="ok"||!r}catch(e){console.error(e);return false}}

function clone(x){return JSON.parse(JSON.stringify(x))}
function connectedPresence(){
  if(!channel)return [];
  const ps=channel.presenceState(); const out=[];
  Object.values(ps).flat().forEach(p=>{if(p&&p.id&&!out.some(x=>x.id===p.id))out.push(p)});
  return out;
}
function ensurePlayersFromPresence(){
  for(const p of connectedPresence()){
    if(!state.players.some(x=>x.id===p.id))state.players.push({id:p.id,name:p.name||"Player",ready:false});
  }
}
function submittedIds(){
  const key=state.phase==="round1"?"sub1":state.phase==="round2"?"sub2":state.phase==="round3"?"sub3":null;
  return key?Object.keys(state[key]):[];
}
function statusHTML(){
  if(!state)return "";
  const ids=new Set(submittedIds());
  return `<div class="players">${state.players.map(p=>`<div class="player"><span>${esc(p.name)}${p.id===me.id?" (you)":""}${p.id===state.hostId?" 👑":""}</span><b>${ids.has(p.id)?"✓ Submitted":p.ready?"✓ Ready":"Thinking…"}</b></div>`).join("")}</div>`;
}
function lobby(){
 render(`<div class="header"><div><div class="brand">DID HE<br><span>COOK?</span></div><div class="tag">the chaotic kitchen game</div></div><div class="kitchen">🍳 🥄 🧂</div></div>
 <div class="panel"><div class="grid">
 <div class="field"><label>Your name</label><input id="name" maxlength="18" placeholder="Chef name"></div>
 <div class="field"><label>Room code</label><input id="room" maxlength="5" placeholder="ABCDE"></div></div>
 <div class="actions"><button class="btn primary" id="create">Create room</button><button class="btn" id="join">Join room</button></div>
 <div id="connection" class="status">${valid()?"Supabase multiplayer configured.":"Supabase configuration missing."}</div></div>
 <div class="panel" style="margin-top:15px"><h2>🍽️ How to play</h2><div class="hint">Create a room, send the five-character code to your friends, then everyone cooks independently. A submission is never allowed to redraw another player's active form.</div></div>`);
 $("#create").onclick=()=>startRoom(true); $("#join").onclick=()=>startRoom(false);
}
async function startRoom(host){
 const name=$("#name").value.trim()||"Player"; let room=$("#room").value.trim().toUpperCase();
 if(host)room=code(); if(room.length!==5)return toast("Enter a 5-character room code.");
 me.name=name;me.host=host;
 state={room,hostId:host?me.id:null,phase:"lobby",settings:{timer:90},players:[{id:me.id,name,ready:false}],sub1:{},sub2:{},sub3:{},assign2:{},assign3:{},votes:{}};
 render(`<div class="panel center"><div class="big">🍳</div><h2>Opening kitchen…</h2><div class="status">Connecting to room ${esc(room)}</div></div>`);
 try{
  channel=sb.channel("dhc:"+room,{config:{broadcast:{self:false},presence:{key:me.id}}});
  channel.on("broadcast",{event:"dhc"},({payload})=>message(payload))
   .on("presence",{event:"sync"},presenceChanged)
   .on("presence",{event:"join"},presenceChanged)
   .on("presence",{event:"leave"},presenceChanged);
  await new Promise((resolve,reject)=>{
   let done=false;
   channel.subscribe(async s=>{console.log("Realtime:",s);
    if(s==="SUBSCRIBED"&&!done){done=true;try{await channel.track({id:me.id,name:me.name,host:me.host});resolve()}catch(e){reject(e)}}
    if(["CHANNEL_ERROR","TIMED_OUT"].includes(s)&&!done){done=true;reject(new Error(s))}
   });
  });
  roomUI();
  if(host){await send("state",clone(state));}
  else {await send("hello",{id:me.id,name:me.name});}
 }catch(e){console.error(e);render(`<div class="panel center"><div class="big">🥄</div><h2>Could not connect</h2><div class="notice">${esc(e.message)}<br><br>Check Supabase → Realtime → Settings and ensure public channel access is enabled.</div><button class="btn primary" id="back">Back</button></div>`);$("#back").onclick=lobby}
}
function roomUI(){
 stopTimer();
 render(`<div class="topbar"><div><span class="pill">KITCHEN ROOM</span><div class="code">${esc(state.room)}</div></div><button class="btn" id="leave">Leave</button></div>
 <div class="panel"><h2>👨‍🍳 Kitchen staff</h2><div id="players">${statusHTML()}</div>
 <div class="grid"><div class="field"><label>Timer (seconds)</label><input id="timerSetting" type="number" min="15" max="300" value="${state.settings.timer}" ${me.host?"":"disabled"}></div></div>
 <div class="actions"><button class="btn primary" id="ready">${me.host?"Start cooking":"Ready to cook"}</button></div>
 <div class="notice">${me.host?"The room is live. Players joining from other devices appear here automatically.":"Waiting for the host to start the kitchen."}</div></div>`);
 $("#leave").onclick=()=>location.reload();
 $("#ready").onclick=async()=>{
  if(me.host){
   ensurePlayersFromPresence(); if(state.players.length<2)return toast("Need at least 2 players.");
   if(!state.players.every(p=>p.id===me.id||p.ready))return toast("Wait for everyone to ready up.");
   state.settings.timer=Math.max(15,Math.min(300,+$("#timerSetting").value||90));state.phase="round1";state.sub1={};state.sub2={};state.sub3={};state.votes={};await send("state",clone(state));renderCurrent();
  }else{await send("ready",{id:me.id,ready:true});toast("Ready!")}
 };
}
async function presenceChanged(){
 if(!state)return;
 if(me.host){
  const before=state.players.length;ensurePlayersFromPresence();
  const present=new Set(connectedPresence().map(p=>p.id));
  state.players=state.players.filter(p=>present.has(p.id)||p.id===me.id);
  if(before!==state.players.length||state.phase==="lobby")await send("state",clone(state));
 }
 updatePlayersOnly();
}
function updatePlayersOnly(){const e=$("#players");if(e)e.innerHTML=statusHTML()}
async function message(m){
 if(!m||m.from===me.id)return;
 if(m.type==="hello"){
  if(me.host){const p=m.payload;if(!state.players.some(x=>x.id===p.id))state.players.push({id:p.id,name:p.name,ready:false});await send("state",clone(state));updatePlayersOnly()}
  return;
 }
 if(m.type==="state"){
  // A remote state is authoritative only for phase transitions and statuses.
  // It never replaces a player's active input screen while they are in the same phase.
  const incoming=m.payload;
  const phaseChanged=!state||state.phase!==incoming.phase;
  state=incoming;
  if(phaseChanged)renderCurrent(); else updatePlayersOnly();
  return;
 }
 if(me.host){
  if(m.type==="ready"){const p=state.players.find(x=>x.id===m.payload.id);if(p)p.ready=true;await send("state",clone(state));updatePlayersOnly();return}
  if(m.type==="submit1"){state.sub1[m.payload.id]=m.payload;await send("state",clone(state));updatePlayersOnly();if(all(state.sub1))toRound2();return}
  if(m.type==="submit2"){state.sub2[m.payload.id]=m.payload;await send("state",clone(state));updatePlayersOnly();if(all(state.sub2))toRound3();return}
  if(m.type==="submit3"){state.sub3[m.payload.id]=m.payload;await send("state",clone(state));updatePlayersOnly();if(all(state.sub3))toVoting();return}
  if(m.type==="vote"){if(!state.votes[m.payload.id]){state.votes[m.payload.id]=m.payload.target;await send("state",clone(state));updatePlayersOnly()}if(Object.keys(state.votes).length>=state.players.length)toResults();return}
 }
}
function all(o){return state.players.length>=2&&state.players.every(p=>o[p.id])}
async function toRound2(){
 state.phase="round2";state.assign2={};state.players.forEach(p=>{state.assign2[p.id]=rand(state.players.filter(x=>x.id!==p.id)).id});await send("state",clone(state));renderCurrent();
}
async function toRound3(){
 state.phase="round3";state.assign3={};state.players.forEach(p=>{
  const others=state.players.filter(x=>x.id!==p.id),src=rand(others),s=state.sub2[src.id]?.ingredients||[];
  let pool=[...new Set(s)];while(pool.length<8)pool.push(rand(FALLBACK));pool=pool.slice(0,8);
  state.assign3[p.id]={ingredients:pool,food:rand(others).food};
 });await send("state",clone(state));renderCurrent();
}
async function toVoting(){state.phase="voting";state.votes={};await send("state",clone(state));renderCurrent()}
async function toResults(){state.phase="results";await send("state",clone(state));renderCurrent()}

function round1(){
 const nonce=++roundNonce;
 render(`<div class="topbar"><div><span class="pill">ROUND 1 / 3</span><div class="hint">Write the challenge</div></div><div class="timer" id="timer"></div></div>
 <div class="panel"><div class="prompt">🍲 What ingredients would you find in…?</div>
 <div class="field"><label>Ingredient prompt</label><input id="ip" maxlength="100" placeholder="${rand(PROMPTS)}"></div>
 <div class="prompt" style="font-size:25px">What food should they make?</div>
 <div class="field"><label>Food item prompt</label><input id="fp" maxlength="60" placeholder="${rand(FOODS)}"></div>
 <div class="actions"><button class="btn primary" id="submit">Serve challenge</button></div>
 <div id="players">${statusHTML()}</div></div>`);
 $("#submit").onclick=()=>submit1(nonce);
 startTimer(state.settings.timer,()=>submit1(nonce,true));
}
async function submit1(nonce,expired=false){
 if(nonce!==roundNonce)return;
 const ip=$("#ip"),fp=$("#fp"); if(!expired&&(!ip.value.trim()||!fp.value.trim()))return toast("Fill in both prompts.");
 const ingredient=ip?.value.trim()||rand(PROMPTS),food=fp?.value.trim()||rand(FOODS);stopTimer();
 const payload={id:me.id,ingredient,food};
 if(me.host){state.sub1[me.id]=payload;await send("state",clone(state));updatePlayersOnly();if(all(state.sub1))toRound2();else waitLocal("Waiting for everyone to finish Round 1…")}
 else {await send("submit1",payload);waitLocal("Submitted! Waiting for everyone to finish Round 1…")}
}
function round2(){
 const nonce=++roundNonce,source=state.players.find(p=>p.id===state.assign2[me.id]),prompt=state.sub1[source.id]?.ingredient||"a mysterious kitchen";
 render(`<div class="topbar"><div><span class="pill">ROUND 2 / 3</span><div class="hint">Six ingredients</div></div><div class="timer" id="timer"></div></div>
 <div class="panel"><div class="hint">Another chef's prompt:</div><div class="prompt">🥕 Ingredients you would find in ${esc(prompt)}</div>
 <div class="field"><label>Exactly 6 ingredients</label><textarea id="list" placeholder="One ingredient per line"></textarea></div>
 <div class="actions"><button class="btn primary" id="submit">Lock in six</button></div><div id="players">${statusHTML()}</div></div>`);
 $("#submit").onclick=()=>submit2(nonce);startTimer(state.settings.timer,()=>submit2(nonce,true));
}
async function submit2(nonce,expired=false){
 if(nonce!==roundNonce)return;const a=($("#list")?.value||"").split(/[\n,]+/).map(x=>x.trim()).filter(Boolean);
 if(!expired&&a.length!==6)return toast("Enter exactly 6 ingredients.");
 while(a.length<6)a.push(rand(FALLBACK));const ingredients=a.slice(0,6);stopTimer();const p={id:me.id,ingredients};
 if(me.host){state.sub2[me.id]=p;await send("state",clone(state));updatePlayersOnly();if(all(state.sub2))toRound3();else waitLocal("Waiting for everyone to finish Round 2…")}
 else{await send("submit2",p);waitLocal("Submitted! Waiting for everyone to finish Round 2…")}
}
function round3(){
 const nonce=++roundNonce,a=state.assign3[me.id];
 render(`<div class="topbar"><div><span class="pill">ROUND 3 / 3</span><div class="hint">Make the best dish</div></div><div class="timer" id="timer"></div></div>
 <div class="panel"><div class="hint">Use all eight ingredients to make:</div><div class="prompt">🍽️ ${esc(a.food)}</div>
 <div>${a.ingredients.map(x=>`<span class="ingredient">${esc(x)}</span>`).join("")}</div>
 <div class="field"><label>Recipe / pitch</label><textarea id="recipe" placeholder="Explain how your kitchen turns these ingredients into ${esc(a.food)}"></textarea></div>
 <div class="actions"><button class="btn primary" id="submit">Serve it!</button></div><div id="players">${statusHTML()}</div></div>`);
 $("#submit").onclick=()=>submit3(nonce);startTimer(state.settings.timer,()=>submit3(nonce,true));
}
async function submit3(nonce,expired=false){
 if(nonce!==roundNonce)return;const r=$("#recipe")?.value.trim();if(!expired&&!r)return toast("Write your recipe.");
 const a=state.assign3[me.id];stopTimer();const p={id:me.id,recipe:r||"A bold chef's special.",food:a.food,ingredients:a.ingredients};
 if(me.host){state.sub3[me.id]=p;await send("state",clone(state));updatePlayersOnly();if(all(state.sub3))toVoting();else waitLocal("Waiting for everyone to serve…")}
 else{await send("submit3",p);waitLocal("Served! Waiting for everyone to finish…")}
}
function waitLocal(t){stopTimer();render(`<div class="panel center"><div class="big">👨‍🍳</div><h2>${esc(t)}</h2><div id="players">${statusHTML()}</div><div class="notice">You are finished. Other chefs can still work. You will move automatically when everyone has submitted.</div></div>`)}
function voting(){
 stopTimer();const already=!!state.votes[me.id],others=state.players.filter(p=>p.id!==me.id);
 render(`<div class="topbar"><div><span class="pill">VOTING</span><div class="hint">Taste with your eyes</div></div></div><div class="panel"><div class="prompt">🏆 Which chef cooked the best dish?</div>
 ${others.map((p,i)=>{const s=state.sub3[p.id];return `<div class="vote"><b>DISH ${i+1}: ${esc(s.food)}</b><div>${s.ingredients.map(x=>`<span class="ingredient">${esc(x)}</span>`).join("")}</div><p>${esc(s.recipe)}</p><button class="btn ${already?"":"primary"}" data-v="${esc(p.id)}" ${already?"disabled":""}>${already?"Vote locked":"Vote for this dish"}</button></div>`}).join("")}
 <div id="players">${statusHTML()}</div></div>`);
 document.querySelectorAll("[data-v]").forEach(b=>b.onclick=async()=>{await send("vote",{id:me.id,target:b.dataset.v});b.disabled=true;b.textContent="Vote locked";if(me.host){state.votes[me.id]=b.dataset.v;await send("state",clone(state));if(Object.keys(state.votes).length>=state.players.length)toResults()}});
}
function results(){
 stopTimer();const counts={};Object.values(state.votes).forEach(v=>counts[v]=(counts[v]||0)+1);const max=Math.max(0,...Object.values(counts)),wid=Object.keys(counts).find(x=>counts[x]===max),w=state.players.find(p=>p.id===wid),s=w&&state.sub3[wid];
 render(`<div class="panel center"><div class="stamp">Kitchen winner</div><div class="big">🏆</div><h1>${w?esc(w.name):"Nobody"} cooked.</h1><div class="prompt">${max} vote${max===1?"":"s"} — ${s?esc(s.food):""}</div>${s?`<p>${esc(s.recipe)}</p><div>${s.ingredients.map(x=>`<span class="ingredient">${esc(x)}</span>`).join("")}</div>`:""}<div class="actions" style="justify-content:center">${me.host?'<button class="btn primary" id="again">Cook again</button>':""}</div></div>`);
 if(me.host)$("#again").onclick=async()=>{state.phase="lobby";state.sub1={};state.sub2={};state.sub3={};state.assign2={};state.assign3={};state.votes={};state.players.forEach(p=>p.ready=false);await send("state",clone(state));renderCurrent()}
}
function renderCurrent(){
 if(!state)return lobby();
 switch(state.phase){case"lobby":roomUI();break;case"round1":round1();break;case"round2":round2();break;case"round3":round3();break;case"voting":voting();break;case"results":results();break}
}
if(!valid()||!SB){lobby()}else{try{sb=SB.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});lobby()}catch(e){lobby()}}
})();

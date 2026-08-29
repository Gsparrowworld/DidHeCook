(()=>{
'use strict';
const C=window.DHC_CONFIG||{}, SB=window.supabase, A=document.querySelector('#app');
const PROMPTS=['an abandoned house','a cursed kitchen','a beach at midnight','a zombie apocalypse','a wizard pantry','a haunted supermarket','a gas station at 3 AM','a mysterious castle','a spaceship cafeteria','a medieval tavern'];
const FOODS=['pizza','burger','ramen','tacos','pancakes','fried rice','sandwich','curry','pasta','ice cream','sushi','pie','nachos','breakfast burrito'];
const FALLBACK=['salt','pepper','butter','garlic','onion','flour','cheese','mushrooms','tomato','potato'];
let db=null,ch=null,state=null,timer=null; let renderPhaseToken=0; let lastStateSeq=0;
const me={id:(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)),name:'Player',host:false};
const localSubmitted={r1:false,r2:false,r3:false};
const $=s=>document.querySelector(s), E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rand=a=>a[Math.floor(Math.random()*a.length)], code=()=>Array.from({length:5},()=>rand('ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.split(''))).join('');
const fmt=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
function toast(t){const x=document.createElement('div');x.className='toast';x.textContent=t;document.body.append(x);setTimeout(()=>x.remove(),2200)}
function render(x){A.innerHTML='<div class="wrap">'+x+'</div>'}
function stop(){if(timer){clearInterval(timer);timer=null}}
function clock(n,cb){stop();const e=$('#timer');if(!e)return;e.textContent=fmt(n);timer=setInterval(()=>{n--;e.textContent=fmt(Math.max(n,0));if(n<=10)e.classList.add('warn');if(n<=0){stop();cb()}},1000)}
function valid(){return !!(C.SUPABASE_URL?.startsWith('https://')&&C.SUPABASE_KEY?.startsWith('sb_publishable_'))}
async function send(type,payload={}){if(!ch)return false;const r=await ch.send({type:'broadcast',event:'dhc',payload:{type,payload,from:me.id}});if(r&&r!=='ok')console.warn('Broadcast result',r);return r==='ok'||!r}
function clone(){return JSON.parse(JSON.stringify(state))}
function all(o){return state.players.length>=2&&state.players.every(p=>!!o[p.id])}
function addPlayer(p){let x=state.players.find(x=>x.id===p.id);if(!x)state.players.push({id:p.id,name:p.name||'Player',ready:false});else x.name=p.name||x.name}
function presencePlayers(){if(!ch)return [];return Object.values(ch.presenceState()).flat().filter(x=>x&&x.id)}
function playerStatusMap(){
 const map=state?.phase==='r1'?state.s1:state?.phase==='r2'?state.s2:state?.phase==='r3'?state.s3:state?.phase==='vote'?state.votes:{};
 return map||{};
}
function playerListHtml(){
 const map=playerStatusMap();
 return state.players.map(p=>{
   const done=state.phase==='vote'?!!map[p.id]:!!map[p.id];
   const suffix=p.id===me.id?' (you)':'';
   const right=state.phase==='lobby'?(p.id===me.id&&me.host?'HOST':p.ready?'✓ Ready':'Waiting'):(done?'✓ Submitted':'Thinking…');
   return `<div class="player"><span>${E(p.name)}${suffix}</span><span>${right}</span></div>`;
 }).join('');
}
function updatePlayers(){const a=$('#players'),b=$('#submissionPlayers');if(a)a.innerHTML=playerListHtml();if(b)b.innerHTML=playerListHtml()}
function updateLobbyButton(){const b=$('#ready');if(!b||!state)return;if(me.host){b.textContent='Start game'}else b.textContent=state.players.find(p=>p.id===me.id)?.ready?'Ready ✓':'Ready up'}
async function publish(){ if(!state)return; state.seq=(state.seq||0)+1; lastStateSeq=state.seq; await send('state',clone()) }
async function maybeAdvance(){
 if(!me.host||!state)return;
 if(state.phase==='r1'&&all(state.s1))return advance2();
 if(state.phase==='r2'&&all(state.s2))return advance3();
 if(state.phase==='r3'&&all(state.s3))return startVoting();
 if(state.phase==='vote'&&Object.keys(state.votes).length>=state.players.length){state.phase='results';await publish();renderCurrent()}
}
async function onMessage(m){
 if(!m)return;
 if(m.type==='hello'){
   if(me.host){addPlayer(m.payload);await publish()}
   return;
 }
 if(m.type==='ready'){
   if(!me.host)return;
   addPlayer(m.payload);
   const p=state.players.find(p=>p.id===m.payload.id);if(p)p.ready=true;
   await publish();return;
 }
 if(m.type==='s1'||m.type==='s2'||m.type==='s3'||m.type==='vote'){
   const map=m.type==='s1'?state.s1:m.type==='s2'?state.s2:m.type==='s3'?state.s3:state.votes;
   if(!map[m.payload.id])map[m.payload.id]=m.payload.target?m.payload.target:m.payload;
   updatePlayers();
   // Host is the coordinator, but every client is allowed to request the transition.
   // This makes progression automatic rather than requiring a host button.
   if(me.host){await publish();await maybeAdvance()}else if(
      (state.phase==='r1'&&all(state.s1))||(state.phase==='r2'&&all(state.s2))||(state.phase==='r3'&&all(state.s3))){await send('requestAdvance',{})}
   return;
 }
 if(m.type==='requestAdvance'){if(me.host)await maybeAdvance();return}
 if(m.type==='state'){
   const incoming=m.payload;if(!incoming||incoming.room!==state?.room)return;
   if((incoming.seq||0)<lastStateSeq)return;
   const old=state?.phase;
   const phaseChanged=old!==incoming.phase;
   // Preserve this client's local submission flags and active form. A state
   // packet from another player is not permission to redraw the current round.
   state=incoming; lastStateSeq=state.seq||lastStateSeq;
   if(phaseChanged){stop();renderPhaseToken++;localSubmitted.r1=false;localSubmitted.r2=false;localSubmitted.r3=false;renderCurrent()}
   else {updatePlayers();updateLobbyButton()}
   return;
 }
}
function home(){stop();if(ch&&db)try{db.removeChannel(ch)}catch{}ch=null;state=null;me.host=false;lobby()}
function lobby(){render(`<div class="logo">🍳 DID HE<br><span>COOK?</span></div><div class="sub">A chaotic kitchen challenge for every chef.</div><div class="panel"><div class="grid"><div class="field"><label>Your name</label><input id="name" maxlength="18" placeholder="Chef name"></div><div class="field"><label>Room code</label><input id="room" maxlength="5" placeholder="ABCDE" autocomplete="off"></div></div><div class="actions"><button class="btn primary" id="create">Create room</button><button class="btn" id="join">Join room</button></div><div class="status ${valid()?'ok':'bad'}">${valid()?'Supabase configuration loaded.':'Supabase configuration is invalid.'}</div></div><div class="panel" style="margin-top:15px"><h3>How multiplayer works</h3><div class="hint">Create a room, send the 5-character code to friends, and they can join from another device. Everyone sees who is connected and who has submitted.</div></div>`);$('#create').onclick=()=>start(true);$('#join').onclick=()=>start(false)}
async function connect(room){
 if(ch)try{await db.removeChannel(ch)}catch{}
 ch=db.channel('dhc:'+room,{config:{broadcast:{self:false,ack:true},presence:{key:me.id}}});
 ch.on('broadcast',{event:'dhc'},x=>onMessage(x.payload))
   .on('presence',{event:'sync'},()=>onPresence())
   .on('presence',{event:'join'},()=>onPresence())
   .on('presence',{event:'leave'},()=>onPresence());
 await new Promise((res,rej)=>{let done=false;ch.subscribe(async(s,err)=>{console.log('Realtime',s,err||'');if(s==='SUBSCRIBED'&&!done){done=true;try{await ch.track({id:me.id,name:me.name,host:me.host});res()}catch(e){rej(e)}}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(s)&&!done){done=true;rej(err||Error('Realtime '+s))}})})
}
async function onPresence(){
 if(!state||!me.host)return;
 const ps=presencePlayers();
 for(const x of ps)addPlayer(x);
 const ids=new Set(ps.map(x=>x.id));
 state.players=state.players.filter(p=>ids.has(p.id));
 updatePlayers();
 await publish();
}
async function start(host){
 if(!valid())return toast('Fix Supabase config first');
 me.name=$('#name').value.trim()||'Player';let room=host?code():$('#room').value.trim().toUpperCase();
 if(room.length!==5)return toast('Enter a 5-character room code');
 me.host=host;localSubmitted.r1=localSubmitted.r2=localSubmitted.r3=false;
 state={room,phase:'lobby',timer:90,seq:0,players:[{id:me.id,name:me.name,ready:false}],s1:{},s2:{},s3:{},a2:{},a3:{},votes:{}};
 render('<div class="panel center"><div class="big">🔌</div><h2>Connecting…</h2><div class="status" id="conn">Opening '+E(room)+'</div></div>');
 try{await connect(room);roomScreen();if(host)await publish();else{await send('hello',{id:me.id,name:me.name});let n=0;const retry=async()=>{if(n++<8&&state?.phase==='lobby'){await send('hello',{id:me.id,name:me.name});setTimeout(retry,600)}};setTimeout(retry,350)}}catch(e){console.error(e);render('<div class="panel center"><div class="big">⚠️</div><h2>Could not connect</h2><div class="notice">Check Supabase → Realtime → Settings and make sure Realtime and public channel access are enabled.<br><br>'+E(e.message||e)+'</div><div class="actions" style="justify-content:center"><button class="btn primary" id="back">Back</button></div></div>');$('#back').onclick=home}
}
function roomScreen(){render(`<div class="top"><div><span class="pill">ROOM</span><div class="code">${E(state.room)}</div></div><button class="btn" id="leave">Leave</button></div><div class="panel center"><div class="hint">Send this code to the other players</div><div class="big">${E(state.room)}</div><div class="status ok">Connected to Realtime</div><div class="players" id="players"></div><div class="field"><label>Round timer seconds</label><input id="tm" type="number" min="15" max="300" value="${state.timer}" ${me.host?'':'disabled'}></div><div class="actions" style="justify-content:center"><button class="btn primary" id="ready">${me.host?'Start game':'Ready up'}</button></div><div class="notice">The host can see everyone here. Players can join from any device using this room code.</div></div>`);$('#leave').onclick=home;$('#ready').onclick=async()=>{if(me.host){state.timer=Math.max(15,Math.min(300,+$('#tm').value||90));if(state.players.length<2)return toast('Need at least 2 players');if(!state.players.every(p=>p.id===me.id||p.ready))return toast('Wait for everyone to ready up');state.phase='r1';state.s1={};state.s2={};state.s3={};state.votes={};await publish();renderCurrent()}else{const p=state.players.find(p=>p.id===me.id);if(p)p.ready=true;updatePlayers();updateLobbyButton();await send('ready',{id:me.id,name:me.name,ready:true});toast('Ready!')}};updatePlayers()}
function roundStatus(){return `<div id="submissionPlayers" class="players"></div>`}
function r1(){stop();render(`<div class="top"><div><span class="pill">ROUND 1 / 3</span><div class="hint">Create prompts</div></div><div class="timer" id="timer">--</div></div><div class="panel"><div class="prompt">What ingredients would you find in…?</div><div class="field"><label>Ingredient prompt</label><input id="ip" placeholder="an abandoned house"></div><div class="prompt" style="font-size:24px">What food should they make?</div><div class="field"><label>Food prompt</label><input id="fp" placeholder="pizza"></div>${roundStatus()}<div class="actions"><button class="btn primary" id="go">Submit</button></div></div>`);$('#go').onclick=()=>s1(false);updatePlayers();clock(state.timer,()=>s1(true))}
async function s1(expired=false){if(localSubmitted.r1)return;const ingredient=$('#ip')?.value.trim()||rand(PROMPTS),food=$('#fp')?.value.trim()||rand(FOODS);if(!expired&&(!ingredient||!food))return toast('Fill in both prompts');stop();localSubmitted.r1=true;state.s1[me.id]={id:me.id,ingredient,food};updatePlayers();await send('s1',state.s1[me.id]);wait('You submitted Round 1. Waiting for everyone else…');await send('requestAdvance',{})}
function r2(){stop();const src=state.players.find(p=>p.id===state.a2[me.id]);if(!src||!state.s1[src.id])return;const q=state.s1[src.id].ingredient;render(`<div class="top"><div><span class="pill">ROUND 2 / 3</span></div><div class="timer" id="timer">--</div></div><div class="panel"><div class="prompt">Ingredients you would find in ${E(q)}</div><div class="field"><label>Exactly 6 ingredients</label><textarea id="list" placeholder="one per line or comma separated"></textarea></div>${roundStatus()}<div class="actions"><button class="btn primary" id="go">Lock in six</button></div></div>`);$('#go').onclick=()=>s2(false);updatePlayers();clock(state.timer,()=>s2(true))}
async function s2(expired=false){if(localSubmitted.r2)return;const a=($('#list')?.value||'').split(/[\n,]+/).map(x=>x.trim()).filter(Boolean);if(!expired&&a.length!==6)return toast('Enter exactly 6 ingredients');while(a.length<6)a.push(rand(FALLBACK));a.splice(6);stop();localSubmitted.r2=true;state.s2[me.id]={id:me.id,ingredients:a};updatePlayers();await send('s2',state.s2[me.id]);wait('You submitted Round 2. Waiting for everyone else…');await send('requestAdvance',{})}
function r3(){stop();const a=state.a3[me.id];if(!a)return;render(`<div class="top"><div><span class="pill">ROUND 3 / 3</span></div><div class="timer" id="timer">--</div></div><div class="panel"><div class="prompt">${E(a.food)}</div><div>${a.ingredients.map(x=>`<span class="ingredient">${E(x)}</span>`).join('')}</div><div class="field"><label>Your recipe / pitch</label><textarea id="recipe" placeholder="How do you turn these ingredients into the requested food?"></textarea></div>${roundStatus()}<div class="actions"><button class="btn primary" id="go">SERVE IT</button></div></div>`);$('#go').onclick=()=>s3(false);updatePlayers();clock(state.timer,()=>s3(true))}
async function s3(expired=false){if(localSubmitted.r3)return;const recipe=$('#recipe')?.value.trim();if(!expired&&!recipe)return toast('Write your recipe');stop();localSubmitted.r3=true;const a=state.a3[me.id];state.s3[me.id]={id:me.id,recipe:recipe||'A chef’s special made under pressure.',food:a.food,ingredients:a.ingredients};updatePlayers();await send('s3',state.s3[me.id]);wait('You served your dish. Waiting for everyone else…');await send('requestAdvance',{})}
async function advance2(){state.phase='r2';state.a2={};for(const p of state.players){const o=state.players.filter(x=>x.id!==p.id);state.a2[p.id]=o.length?rand(o).id:p.id}localSubmitted.r2=false;await publish();renderCurrent()}
async function advance3(){state.phase='r3';state.a3={};for(const p of state.players){const o=state.players.filter(x=>x.id!==p.id);const src=o.length?rand(o):p;let pool=[...(state.s2[src.id]?.ingredients||[])];while(pool.length<8)pool.push(rand(FALLBACK));pool=[...new Set(pool)];while(pool.length<8)pool.push(rand(FALLBACK));const foodSource=o.length?rand(o):p;state.a3[p.id]={ingredients:pool.slice(0,8),food:state.s1[foodSource.id]?.food||rand(FOODS)}}localSubmitted.r3=false;await publish();renderCurrent()}
async function startVoting(){state.phase='vote';state.votes={};await publish();renderCurrent()}
function vote(){stop();const ps=state.players.filter(p=>p.id!==me.id),done=!!state.votes[me.id];render(`<div class="top"><div><span class="pill">VOTING</span></div></div><div class="panel"><div class="prompt">Who cooked the hardest?</div>${ps.map((p,i)=>{const s=state.s3[p.id];return `<div class="vote"><b>DISH ${i+1} — ${E(s.food)}</b><div>${s.ingredients.map(x=>`<span class="ingredient">${E(x)}</span>`).join('')}</div><p>${E(s.recipe)}</p><button class="btn" data-v="${E(p.id)}" ${done?'disabled':''}>${done?'Vote submitted':'Vote for this dish'}</button></div>`}).join('')}<div id="submissionPlayers" class="players"></div>${done?'<div class="notice">Vote locked. Waiting for everyone.</div>':''}</div>`);updatePlayers();document.querySelectorAll('[data-v]').forEach(b=>b.onclick=async()=>{if(state.votes[me.id])return;state.votes[me.id]=b.dataset.v;await send('vote',{id:me.id,target:b.dataset.v});updatePlayers();vote()})}
function results(){stop();const c={};Object.values(state.votes).forEach(x=>c[x]=(c[x]||0)+1);const max=Math.max(...Object.values(c),0),id=Object.keys(c).find(x=>c[x]===max),p=state.players.find(x=>x.id===id),s=state.s3[id];render(`<div class="panel center"><div class="big">👨‍🍳</div><h1>${p?E(p.name):'Nobody'} cooked.</h1>${s?`<div class="prompt">${max} vote${max===1?'':'s'} — ${E(s.food)}</div><p>${E(s.recipe)}</p>`:''}${me.host?'<div class="actions" style="justify-content:center"><button class="btn primary" id="again">Cook again</button></div>':''}</div>`);if(me.host)$('#again').onclick=async()=>{state.phase='r1';state.s1={};state.s2={};state.s3={};state.a2={};state.a3={};state.votes={};state.players.forEach(p=>p.ready=false);localSubmitted.r1=false;await publish();renderCurrent()}}
function wait(t){render(`<div class="panel center"><div class="big">⏳</div><h2>${E(t)}</h2><div id="submissionPlayers" class="players"></div><div class="notice">Everyone advances automatically when all connected players have submitted. The host does not need to press Next.</div></div>`);updatePlayers()}
function renderCurrent(){if(!state)return lobby();if(state.phase==='lobby')roomScreen();else if(state.phase==='r1')r1();else if(state.phase==='r2')r2();else if(state.phase==='r3')r3();else if(state.phase==='vote')vote();else results()}
if(!valid()||!SB)lobby();else{try{db=SB.createClient(C.SUPABASE_URL,C.SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});lobby()}catch(e){console.error(e);lobby()}}
})();

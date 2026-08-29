(()=>{"use strict";
const {createClient}=window.supabase||{};
const cfg=window.DHC_CONFIG||{};
const screen=document.querySelector("#screen");
const prompts=["an abandoned house","a cursed kitchen","a beach at midnight","a zombie apocalypse","a wizard's pantry","a haunted supermarket","a gas station at 3 AM","a grandmother's mysterious recipe book","a spaceship cafeteria","a medieval tavern"];
const foods=["pizza","burger","ramen","tacos","pancakes","fried rice","sandwich","curry","pasta","ice cream","hot dog","salad","sushi","pie","nachos","breakfast burrito"];
const fallbackIngredients=["salt","pepper","butter","garlic","onion","flour","cheese","mushrooms","tomato","potato"];
const $=s=>document.querySelector(s), esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const rand=a=>a[Math.floor(Math.random()*a.length)];
const uid=()=>crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now();
const code=()=>Array.from({length:5},()=>rand("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")).join("");
const fmt=s=>String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
function toast(t){const x=document.createElement("div");x.className="toast";x.textContent=t;document.body.appendChild(x);setTimeout(()=>x.remove(),2300)}
function beep(f=500){try{const A=new (AudioContext||webkitAudioContext)(),o=A.createOscillator(),g=A.createGain();o.frequency.value=f;o.connect(g);g.connect(A.destination);g.gain.value=.025;o.start();o.stop(A.currentTime+.07)}catch{}}

let client=null, channel=null, timer=null, state=null;
const me={id:uid(),name:"Player",host:false};

function validConfig(){return cfg.SUPABASE_URL&&cfg.SUPABASE_KEY&&!cfg.SUPABASE_URL.includes("PASTE_")&&!cfg.SUPABASE_KEY.includes("PASTE_")}
function initClient(){
 if(!validConfig())return false;
 try{client=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});return true}catch(e){console.error(e);return false}
}
function render(html){screen.innerHTML=`<div class="wrap">${html}</div>`}
function stopTimer(){if(timer){clearInterval(timer);timer=null}}
function startTimer(seconds,cb){
 stopTimer();let n=seconds,el=$("#timer");if(!el)return;
 el.textContent=fmt(n);timer=setInterval(()=>{n--;el.textContent=fmt(Math.max(0,n));if(n<=10)el.classList.add("warn");if(n<=0){stopTimer();cb()}},1000)
}
function gameState(){return state?JSON.parse(JSON.stringify(state)):null}
async function broadcast(type,payload){
 if(!channel)return;
 await channel.send({type:"broadcast",event:"game",payload:{type,payload}})
}
async function publishState(){
 await broadcast("state",state)
}
async function joinRoom(room,host){
 if(!client)return;
 if(channel)await client.removeChannel(channel);
 channel=client.channel("dhc:"+room,{config:{presence:{key:me.id},broadcast:{self:false}}});
 channel.on("presence",{event:"sync"},()=>{syncPlayers();if(!me.host)broadcast("request_state",{id:me.id})})
 .on("presence",{event:"join"},e=>{syncPlayers();if(me.host)broadcast("state",state)})
 .on("presence",{event:"leave"},()=>syncPlayers())
 .on("broadcast",{event:"game"},({payload})=>onMessage(payload));
 const {error}=await channel.subscribe(async status=>{
   if(status==="SUBSCRIBED"){await channel.track({id:me.id,name:me.name,host:me.host});if(!host)await broadcast("request_state",{id:me.id})}
 });
 if(error)throw error;
}
function syncPlayers(){
 if(!channel)return;
 const ps=channel.presenceState();
 const arr=[];
 Object.values(ps).flat().forEach(x=>arr.push({id:x.id,name:x.name,host:!!x.host,ready:false}));
 if(me.host&&state){
   const known=new Map(state.players.map(p=>[p.id,p]));
   arr.forEach(p=>{if(!known.has(p.id))known.set(p.id,{id:p.id,name:p.name,ready:false});else known.get(p.id).name=p.name});
   state.players=[...known.values()];
   publishState();
 }else if(state){
   state.players=state.players.map(p=>{let x=arr.find(a=>a.id===p.id);return x?{...p,name:x.name}:p}).filter(p=>arr.some(a=>a.id===p.id));
   renderCurrent();
 }
}
function onMessage(m){
 if(m.type==="request_state"&&me.host){broadcast("state",state);return}
 if(m.type==="state"&&!me.host){state=m.payload;renderCurrent();return}
 if(m.type==="submit1"&&me.host){state.submissions1[m.payload.id]=m.payload;publishState();maybeAdvance1();return}
 if(m.type==="submit2"&&me.host){state.submissions2[m.payload.id]=m.payload;publishState();maybeAdvance2();return}
 if(m.type==="submit3"&&me.host){state.submissions3[m.payload.id]=m.payload;publishState();maybeAdvance3();return}
 if(m.type==="vote"&&me.host){state.votes[m.payload.id]=m.payload.target;publishState();maybeFinishVotes();return}
 if(m.type==="set_ready"&&me.host){let p=state.players.find(x=>x.id===m.payload.id);if(p)p.ready=m.payload.ready;publishState();return}
}
function allPlayersSubmitted(obj){return state.players.length>=2&&state.players.every(p=>obj[p.id])}
function maybeAdvance1(){if(allPlayersSubmitted(state.submissions1)){state.phase="round2";state.assign2={};state.players.forEach(p=>{let others=state.players.filter(x=>x.id!==p.id);state.assign2[p.id]=rand(others).id});publishState();renderCurrent()}}
function maybeAdvance2(){if(allPlayersSubmitted(state.submissions2)){
 state.phase="round3";state.assign3={};state.players.forEach(p=>{let others=state.players.filter(x=>x.id!==p.id),source=rand(others);let pool=(state.submissions2[source.id]?.ingredients||fallbackIngredients).slice();while(pool.length<8)pool.push(rand(fallbackIngredients));pool=[...new Set(pool)].slice(0,8);while(pool.length<8)pool.push(rand(fallbackIngredients));state.assign3[p.id]={ingredients:pool,food:rand(others).food}});publishState();renderCurrent()}}
function maybeAdvance3(){if(allPlayersSubmitted(state.submissions3)){state.phase="voting";state.votes={};publishState();renderCurrent()}}
function maybeFinishVotes(){if(Object.keys(state.votes).length===state.players.length){state.phase="results";publishState();renderCurrent()}}
function lobby(){
 stopTimer();render(`<div class="logo">DID HE<br><span>COOK?</span></div><div class="sub">A multiplayer cooking battle. Prompt it. Cook it. Judge it.</div>
 <div class="panel"><div class="grid"><div class="field"><label>Your name</label><input id="name" maxlength="18" placeholder="Chef name"></div><div class="field"><label>Room code</label><input id="room" maxlength="5" placeholder="ABCDE"></div></div>
 <div class="actions"><button class="btn primary" id="create">Create room</button><button class="btn" id="join">Join room</button></div>
 <div class="notice" id="status">${validConfig()?"Realtime multiplayer is configured.":"Open assets/config.js and add your Supabase URL + publishable/anon key first."}</div></div>
 <div class="panel" style="margin-top:15px"><h2>Rules</h2><div class="hint">1. Everyone writes an ingredient prompt and food prompt. 2. Everyone gets another player's ingredient prompt and submits six ingredients. 3. Everyone gets eight ingredients plus another player's food prompt and cooks. 4. Everyone votes.</div></div>`);
 $("#create").onclick=()=>startRoom(true);
 $("#join").onclick=()=>startRoom(false);
}
async function startRoom(host){
 if(!validConfig())return toast("Configure Supabase in assets/config.js first");
 me.name=$("#name").value.trim()||"Player";let room=$("#room").value.trim().toUpperCase();
 if(host)room=code();if(room.length!==5)return toast("Enter a 5-character room code");
 me.host=host;
 state={room,phase:"lobby",settings:{timer:90},players:[{id:me.id,name:me.name,ready:false}],submissions1:{},submissions2:{},submissions3:{},assign2:{},assign3:{},votes:{}};
 try{await joinRoom(room,host);roomScreen()}catch(e){console.error(e);toast("Could not connect to multiplayer service")}
}
function roomScreen(){
 render(`<div class="topbar"><div><span class="pill">ROOM</span><div class="code">${esc(state.room)}</div></div><button class="btn" id="leave">Leave</button></div>
 <div class="panel center"><div class="tiny">Send this code to the other players</div><div class="big">${esc(state.room)}</div><div class="players" id="players"></div>
 <div class="field"><label>Round timer — seconds</label><input id="roundTimer" type="number" min="15" max="300" value="${state.settings.timer}" ${me.host?"":"disabled"}></div>
 <div class="actions" style="justify-content:center"><button class="btn primary" id="ready">${me.host?"Start game":"Ready up"}</button></div>
 <div class="notice">${me.host?"As host, you can start once everyone is ready.":"Wait for the host to start."}</div></div>`);
 $("#leave").onclick=()=>{if(channel)client.removeChannel(channel);channel=null;state=null;lobby()};
 $("#ready").onclick=()=>{if(me.host){let t=Math.max(15,Math.min(300,+$("#roundTimer").value||90));state.settings.timer=t;if(state.players.length<2)return toast("Need at least 2 players");if(!state.players.every(p=>p.ready||p.id===me.id))return toast("Wait for everyone to ready up");state.phase="round1";publishState();renderCurrent()}else{broadcast("set_ready",{id:me.id,ready:true})}};
 updatePlayerList();
}
function updatePlayerList(){let el=$("#players");if(!el||!state)return;el.innerHTML=state.players.map(p=>`<div class="player"><span>${esc(p.name)} ${p.id===me.id?"(you)":""}</span><span>${p.id===me.id&&me.host?"HOST":p.ready?"✓ Ready":"Waiting"}</span></div>`).join("")}
function round1(){
 let mine=state.submissions1[me.id];
 render(`<div class="topbar"><div><span class="pill">ROUND 1 / 3</span><div class="tiny">Room ${esc(state.room)}</div></div><div class="timer" id="timer">--</div></div>
 <div class="panel"><div class="hint">Write a prompt another player will receive.</div><div class="prompt">What ingredients would you find in…?</div>
 <div class="field"><label>Ingredient prompt</label><input id="ip" maxlength="100" placeholder="an abandoned house" value="${esc(mine?.ingredient||"")}"></div>
 <div class="prompt" style="font-size:24px">What food should they make?</div><div class="field"><label>Food item prompt</label><input id="fp" maxlength="60" placeholder="pizza" value="${esc(mine?.food||"")}"></div>
 <div class="actions"><button class="btn primary" id="submit">Submit</button></div></div>`);
 $("#submit").onclick=()=>submit1();startTimer(state.settings.timer,submit1)
}
async function submit1(){
 let ingredient=$("#ip")?.value.trim(),food=$("#fp")?.value.trim();if(!ingredient||!food)return toast("Fill in both prompts");
 stopTimer();await broadcast("submit1",{id:me.id,ingredient,food});wait("Waiting for everyone to finish Round 1…")
}
function round2(){
 let source=state.players.find(p=>p.id===state.assign2[me.id]),prompt=state.submissions1[source.id]?.ingredient||"mysterious kitchen";
 render(`<div class="topbar"><div><span class="pill">ROUND 2 / 3</span><div class="tiny">Your assigned prompt</div></div><div class="timer" id="timer">--</div></div>
 <div class="panel"><div class="hint">Another player wrote this. Give exactly six ingredients.</div><div class="prompt">Ingredients you would find in ${esc(prompt)}</div>
 <div class="field"><label>Six ingredients — one per line or comma separated</label><textarea id="list" placeholder="flour&#10;old apples&#10;…"></textarea></div><div class="actions"><button class="btn primary" id="submit">Lock in six</button></div></div>`);
 $("#submit").onclick=submit2;startTimer(state.settings.timer,submit2)
}
async function submit2(){
 let arr=($("#list")?.value||"").split(/[\\n,]+/).map(x=>x.trim()).filter(Boolean).slice(0,6);if(arr.length!==6)return toast("Enter exactly 6 ingredients");
 stopTimer();await broadcast("submit2",{id:me.id,ingredients:arr});wait("Waiting for everyone to finish Round 2…")
}
function round3(){
 let a=state.assign3[me.id];
 render(`<div class="topbar"><div><span class="pill">ROUND 3 / 3</span><div class="tiny">Final cook</div></div><div class="timer" id="timer">--</div></div>
 <div class="panel"><div class="hint">Use all eight ingredients to make the best possible version of the food.</div><div class="prompt">${esc(a.food)}</div>
 <div>${a.ingredients.map(x=>`<span class="ingredient">${esc(x)}</span>`).join("")}</div>
 <div class="field" style="margin-top:15px"><label>Your recipe / pitch</label><textarea id="recipe" placeholder="Explain how you turn this chaos into ${esc(a.food)}…"></textarea></div><div class="actions"><button class="btn primary" id="submit">SERVE IT</button></div></div>`);
 $("#submit").onclick=submit3;startTimer(state.settings.timer,submit3)
}
async function submit3(){
 let recipe=$("#recipe")?.value.trim();if(!recipe)return toast("Write your recipe/pitch");
 stopTimer();await broadcast("submit3",{id:me.id,recipe,food:state.assign3[me.id].food,ingredients:state.assign3[me.id].ingredients});wait("Waiting for everyone to serve…")
}
function voting(){
 stopTimer();let cards=state.players.filter(p=>p.id!==me.id);let already=state.votes[me.id];
 render(`<div class="topbar"><div><span class="pill">VOTING</span><div class="tiny">Choose the best dish — not yourself</div></div></div><div class="panel"><div class="prompt">Who cooked the hardest?</div><div class="recipes">${cards.map((p,i)=>{let s=state.submissions3[p.id];return `<div class="recipeCard"><h3>DISH ${i+1} — ${esc(s.food)}</h3><div>${s.ingredients.map(x=>`<span class="ingredient">${esc(x)}</span>`).join("")}</div><p>${esc(s.recipe)}</p><button class="vote" data-id="${esc(p.id)}" ${already?"disabled":""}>${already?"Vote submitted":"Vote for this dish"}</button></div>`}).join("")}</div>${already?'<div class="notice">Your vote is locked in. Waiting for everyone else.</div>':""}</div>`);
 document.querySelectorAll(".vote").forEach(b=>b.onclick=async()=>{await broadcast("vote",{id:me.id,target:b.dataset.id});voting()})
}
function results(){
 let counts={};Object.values(state.votes).forEach(t=>counts[t]=(counts[t]||0)+1);let max=Math.max(...Object.values(counts),0),winnerId=Object.keys(counts).find(id=>counts[id]===max),w=state.players.find(p=>p.id===winnerId),s=state.submissions3[winnerId];
 render(`<div class="panel center winner"><div class="pill">RESULTS</div><div class="big">👨‍🍳</div><h1>${esc(w.name)} cooked.</h1><div class="prompt">${max} vote${max===1?"":"s"} — ${esc(s.food)}</div><p>${esc(s.recipe)}</p><div>${s.ingredients.map(x=>`<span class="ingredient">${esc(x)}</span>`).join("")}</div><div class="actions" style="justify-content:center"><button class="btn primary" id="again">${me.host?"Cook again":"Back to lobby"}</button></div></div>`);
 if(me.host)$("#again").onclick=()=>{state.phase="round1";state.submissions1={};state.submissions2={};state.submissions3={};state.assign2={};state.assign3={};state.votes={};state.players.forEach(p=>p.ready=false);publishState();renderCurrent()}
}
function wait(text){render(`<div class="panel center"><div class="big">⏳</div><h2>${esc(text)}</h2><div class="notice">The game will advance automatically when the host receives every player's submission.</div></div>`)}
function renderCurrent(){
 if(!state)return lobby();
 if(state.phase==="lobby"){roomScreen();return}
 if(state.phase==="round1"){round1();return}
 if(state.phase==="round2"){round2();return}
 if(state.phase==="round3"){round3();return}
 if(state.phase==="voting"){voting();return}
 if(state.phase==="results"){results();return}
}
if(!initClient()){lobby()}else{lobby()}
})();
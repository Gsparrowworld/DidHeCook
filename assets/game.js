(() => {
"use strict";
const $=s=>document.querySelector(s), screen=$("#screen"), canvas=$("#fx"), ctx=canvas.getContext("2d");
let W=0,H=0;
function resize(){W=canvas.width=innerWidth*devicePixelRatio;H=canvas.height=innerHeight*devicePixelRatio;canvas.style.width=innerWidth+"px";canvas.style.height=innerHeight+"px";ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}
addEventListener("resize",resize);resize();

const prompts=["ingredients you would find in an abandoned house","ingredients from a cursed kitchen","ingredients you could buy with exactly $5","ingredients found at a beach","ingredients for a meal after a zombie apocalypse","ingredients a wizard would keep in a pantry","ingredients that sound fake but are edible","ingredients for the worst breakfast imaginable","ingredients you would find at a midnight gas station","ingredients from your grandmother's mysterious recipe book"];
const foods=["pizza","burger","ramen","tacos","pancakes","fried rice","sandwich","curry","pasta","ice cream","hot dog","salad","sushi","pie","nachos","breakfast burrito"];
const seedNames=["Player 1","Player 2","Player 3","Player 4","Player 5","Player 6","Player 7","Player 8"];
const rand=a=>a[Math.floor(Math.random()*a.length)];
const esc=s=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function store(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function load(k,d){try{let v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}}
function toast(t){let x=document.createElement("div");x.className="toast";x.textContent=t;document.body.appendChild(x);setTimeout(()=>x.remove(),2200)}
function beep(freq=440,dur=.06){try{let A=new (window.AudioContext||window.webkitAudioContext)(),o=A.createOscillator(),g=A.createGain();o.frequency.value=freq;o.connect(g);g.connect(A.destination);g.gain.setValueAtTime(.035,A.currentTime);g.gain.exponentialRampToValueAtTime(.0001,A.currentTime+dur);o.start();o.stop(A.currentTime+dur)}catch{}}

let saved=load("dhc_settings",{players:4,timer:90});
let state={room:"",me:0,phase:"lobby",players:[],prompt:null,answers:[],recipes:[],votes:{},timer:null,seconds:0,settings:saved};

function makePlayers(n){
 state.players=Array.from({length:n},(_,i)=>({id:i,name:seedNames[i],connected:i===0,ingredientPrompt:"",foodPrompt:"",list:[],recipe:null}));
 state.me=0;
}
function roomCode(){return Array.from({length:5},()=>rand("ABCDEFGHJKLMNPQRSTUVWXYZ23456789".split(""))).join("")}
function setScreen(html){screen.innerHTML=`<div class="wrap">${html}</div>`}
function lobby(){
 state.phase="lobby";
 if(!state.players.length)makePlayers(state.settings.players);
 setScreen(`<div style="width:100%">
  <div class="logo">DID HE<br><span>COOK?</span></div>
  <div class="sub">A chaotic multiplayer cooking game. Prompt it. Cook it. Judge it.</div>
  <div class="panel">
   <div class="grid">
    <div class="field"><label>Room code</label><input id="room" maxlength="5" placeholder="ABCDE" value="${esc(state.room)}"></div>
    <div class="field"><label>Your name</label><input id="name" maxlength="18" value="${esc(state.players[0]?.name||"Player 1")}"></div>
   </div>
   <div class="actions"><button class="btn primary" id="create">Create room</button><button class="btn" id="join">Join room</button></div>
   <div class="notice">Static-site multiplayer note: without a backend/signaling service, rooms are playable across multiple tabs on the <b>same browser/origin</b> using BroadcastChannel when available. Cross-device internet matchmaking requires a signaling/backend service, which this build intentionally does not use.</div>
  </div>
  <div class="panel" style="margin-top:16px">
   <h2>Game settings</h2>
   <div class="grid">
    <div class="field"><label>Players (2–8)</label><input id="players" type="number" min="2" max="8" value="${state.settings.players}"></div>
    <div class="field"><label>Seconds per round (15–300)</label><input id="timer" type="number" min="15" max="300" value="${state.settings.timer}"></div>
   </div>
   <div class="actions"><button class="btn" id="save">Save settings</button></div>
  </div>
 </div>`);
 $("#save").onclick=()=>{state.settings.players=Math.max(2,Math.min(8,+$("#players").value||4));state.settings.timer=Math.max(15,Math.min(300,+$("#timer").value||90));store("dhc_settings",state.settings);makePlayers(state.settings.players);toast("Settings saved")};
 $("#create").onclick=()=>{beep(660);state.room=roomCode();state.players[0].name=$("#name").value.trim()||"Player 1";showRoom(true)};
 $("#join").onclick=()=>{let r=$("#room").value.trim().toUpperCase();if(!r)return toast("Enter a room code");state.room=r;state.players[0].name=$("#name").value.trim()||"Player";showRoom(false)};
}
function showRoom(host){
 state.host=host;
 if(host){makePlayers(state.settings.players);state.players[0].name=$("#name").value.trim()||"Player 1"}
 setScreen(`<div class="topbar"><div><div class="pill">ROOM</div><div class="code">${esc(state.room)}</div></div><button class="btn" id="back">Back</button></div>
 <div class="panel center"><div class="tiny">Share this code with your group</div><div class="big">${esc(state.room)}</div><div class="sub">Waiting room</div>
 <div class="players" id="plist"></div>
 <div class="actions" style="justify-content:center"><button class="btn primary" id="start">${host?"Start game":"Ready up"}</button></div>
 <div class="notice">${host?"The host controls the game.":"You're in the room. In this static build, use another tab in the same browser/origin to simulate additional players."}</div></div>`);
 $("#back").onclick=lobby;
 renderPlayers();
 $("#start").onclick=()=>{if(host){startPrompts()}else{state.players[0].connected=true;renderPlayers();toast("Ready!")}};
}
function renderPlayers(){let p=$("#plist");if(!p)return;p.innerHTML=state.players.map(x=>`<div class="player"><span>${esc(x.name)}</span><span>${x.connected?"✓ Ready":"Waiting…"}</span></div>`).join("")}
function startPrompts(){
 state.phase="prompt";state.answers=[];state.prompt=rand(prompts);
 state.players.forEach(p=>{p.ingredientPrompt=rand(prompts);p.foodPrompt=rand(foods);p.list=[];p.recipe=null});
 promptScreen();
}
function promptScreen(){
 let p=state.players[state.me];
 setScreen(`<div class="topbar"><div><span class="pill">ROUND 1 / 3</span><div class="sub" style="margin:6px 0 0">Room ${esc(state.room)}</div></div><div class="timer" id="timer">--</div></div>
 <div class="panel">
 <div class="hint">Create a prompt for the next cook.</div>
 <div class="prompt">What ingredients would you find in…?</div>
 <div class="field"><label>Ingredient prompt</label><input id="ip" maxlength="100" placeholder="e.g. an abandoned house" value="${esc(p.ingredientPrompt)}"></div>
 <div class="prompt" style="font-size:24px;margin-top:22px">What food should they make?</div>
 <div class="field"><label>Food item prompt</label><input id="fp" maxlength="60" placeholder="e.g. pizza" value="${esc(p.foodPrompt)}"></div>
 <div class="actions"><button class="btn primary" id="submit">Submit prompt</button></div></div>`);
 startTimer(()=>{submitPrompt(true)});
}
function submitPrompt(auto=false){
 let p=state.players[state.me],a=$("#ip")?.value.trim(),f=$("#fp")?.value.trim();
 if(!auto&&(!a||!f))return toast("Fill in both prompts");
 p.ingredientPrompt=a||p.ingredientPrompt||rand(prompts);p.foodPrompt=f||p.foodPrompt||rand(foods);
 clearInterval(state.timer);state.answers.push({id:p.id,ingredientPrompt:p.ingredientPrompt,foodPrompt:p.foodPrompt});
 if(state.me<state.players.length-1){state.me++;promptScreen()}else{state.me=0;ingredientRound()}
}
function ingredientRound(){
 state.phase="ingredients";
 let source=state.players[(state.me+1)%state.players.length],p=state.players[state.me];
 p.targetPrompt=source.ingredientPrompt;
 setScreen(`<div class="topbar"><div><span class="pill">ROUND 2 / 3</span><div class="sub" style="margin:6px 0 0">Cook ${state.me+1}</div></div><div class="timer" id="timer">--</div></div>
 <div class="panel"><div class="hint">Someone else wrote this prompt. You have to answer it.</div><div class="prompt">Ingredients you would find in ${esc(p.targetPrompt.replace(/^ingredients you would find in /i,""))}</div>
 <div class="field"><label>Six ingredients — one per line or comma separated</label><textarea id="list" placeholder="flour&#10;old apples&#10;…"></textarea></div>
 <div class="actions"><button class="btn primary" id="submit">Lock in 6 ingredients</button></div></div>`);
 startTimer(()=>submitIngredients(true));
}
function submitIngredients(auto=false){
 let raw=$("#list")?.value||"",arr=raw.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean).slice(0,6);
 if(!auto&&arr.length<6)return toast(`Add ${6-arr.length} more ingredient${6-arr.length===1?"":"s"}`);
 while(arr.length<6)arr.push(rand(["salt","pepper","butter","garlic","onion","flour","cheese","mushrooms","tomato"]));
 state.players[state.me].list=arr;clearInterval(state.timer);
 if(state.me<state.players.length-1){state.me++;ingredientRound()}else{state.me=0;recipeRound()}
}
function recipeRound(){
 state.phase="recipe";
 let p=state.players[state.me];
 let others=state.players.filter(x=>x.id!==p.id), source=rand(others);
 let ingredients=[];
 while(ingredients.length<8){let q=rand(source.list.length?source.list:state.players.flatMap(x=>x.list));if(!ingredients.includes(q))ingredients.push(q)}
 let food=rand(others).foodPrompt||rand(foods);
 p.recipeIngredients=ingredients;p.recipeFood=food;
 setScreen(`<div class="topbar"><div><span class="pill">ROUND 3 / 3</span><div class="sub" style="margin:6px 0 0">Final cook</div></div><div class="timer" id="timer">--</div></div>
 <div class="panel"><div class="hint">Make the best possible version of the requested food.</div><div class="prompt">${esc(food)}</div>
 <div style="margin:8px 0 16px">${ingredients.map(x=>`<span class="ingredient">${esc(x)}</span>`).join("")}</div>
 <div class="field"><label>Your recipe / pitch</label><textarea id="recipe" placeholder="Describe how you would turn this cursed pile into ${esc(food)}…"></textarea></div>
 <div class="actions"><button class="btn primary" id="submit">SERVE IT</button></div></div>`);
 startTimer(()=>submitRecipe(true));
}
function submitRecipe(auto=false){
 let r=$("#recipe")?.value.trim()||"A bold improvised dish combining every ingredient with careful seasoning and a suspicious amount of confidence.";
 state.players[state.me].recipe=r;clearInterval(state.timer);
 if(state.me<state.players.length-1){state.me++;recipeRound()}else{state.me=0;voteRound()}
}
function voteRound(){
 state.phase="vote";
 let candidates=state.players.map((p,i)=>({i,food:p.recipeFood,recipe:p.recipe,ings:p.recipeIngredients}));
 // deterministic shuffle for the voting screen
 candidates.sort(()=>Math.random()-.5);
 state.voteCandidates=candidates;
 setScreen(`<div class="topbar"><div><span class="pill">VOTING</span><div class="sub" style="margin:6px 0 0">No voting for yourself</div></div><div class="timer" id="timer">--</div></div>
 <div class="panel"><div class="prompt">Who cooked the hardest?</div><div class="hint">Pick the recipe that sounds most delicious, ingenious, or gloriously cursed.</div>
 <div class="votes">${candidates.map((c,k)=>`<button class="vote" data-k="${k}"><span><b>DISH ${k+1}</b><br><span class="tiny">${esc(c.food)}</span></span><span>→</span></button>`).join("")}</div></div>`);
 document.querySelectorAll(".vote").forEach(b=>b.onclick=()=>castVote(+b.dataset.k));
 startTimer(()=>castVote(0,true));
}
function castVote(k,auto=false){
 clearInterval(state.timer);
 let c=state.voteCandidates[k];state.votes[c.i]=(state.votes[c.i]||0)+1;
 // For local simulation, one vote per player is advanced automatically.
 if(state.me<state.players.length-1){state.me++;voteRound()}else{results()}
}
function results(){
 let max=Math.max(...state.players.map((_,i)=>state.votes[i]||0));
 let winners=state.players.map((p,i)=>({p,i,v:state.votes[i]||0})).filter(x=>x.v===max);
 let w=rand(winners);
 setScreen(`<div class="panel center winner"><div class="pill">RESULTS</div><div class="big">👨‍🍳</div><h1>${esc(w.p.name)} cooked.</h1><div class="prompt">${w.v} vote${w.v===1?"":"s"} — ${esc(w.p.recipeFood)}</div><div class="recipe">“${esc(w.p.recipe)}”</div><div style="margin-top:18px">${w.p.recipeIngredients.map(x=>`<span class="ingredient">${esc(x)}</span>`).join("")}</div>
 <div class="actions" style="justify-content:center"><button class="btn primary" id="again">Cook again</button><button class="btn" id="home">Main menu</button></div></div>`);
 $("#again").onclick=()=>{state.votes={};state.me=0;startPrompts()};$("#home").onclick=()=>{state.room="";makePlayers(state.settings.players);lobby()};
}
function startTimer(cb){
 state.seconds=state.settings.timer;let el=$("#timer");if(!el)return;
 el.textContent=fmt(state.seconds);
 state.timer=setInterval(()=>{state.seconds--;el.textContent=fmt(Math.max(0,state.seconds));if(state.seconds<=10)el.classList.add("warn");if(state.seconds<=0){clearInterval(state.timer);cb()}},1000);
}
function fmt(s){return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")}

makePlayers(state.settings.players);
lobby();
})();
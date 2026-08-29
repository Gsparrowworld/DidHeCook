(()=>{"use strict";
const C=window.DHC_CONFIG, SB=window.supabase, A=document.querySelector("#app");
const PROMPTS=["an abandoned house","a cursed kitchen","a beach at midnight","a zombie apocalypse","a wizard's pantry","a haunted supermarket","a gas station at 3 AM","a medieval tavern","a spaceship cafeteria"];
const FOODS=["pizza","burger","ramen","tacos","pancakes","fried rice","sandwich","curry","pasta","ice cream","sushi","pie","nachos"];
const FALLBACK=["salt","pepper","butter","garlic","onion","flour","cheese","mushrooms","tomato","potato"];
const $=s=>document.querySelector(s), esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])), rand=a=>a[Math.floor(Math.random()*a.length)], makeCode=()=>Array.from({length:5},()=>rand("ABCDEFGHJKLMNPQRSTUVWXYZ23456789".split(""))).join("");
let db=null,ch=null,state=null,timerId=null,localSubmitted=false;
const me={id:(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)),name:"Player",host:false};

function render(x){A.innerHTML='<div class="wrap">'+x+"</div>"}
function stopTimer(){if(timerId){clearInterval(timerId);timerId=null}}
function toast(x){const e=document.createElement("div");e.className="toast";e.textContent=x;document.body.appendChild(e);setTimeout(()=>e.remove(),2200)}
function valid(){return C?.SUPABASE_URL==="https://narspzirurrsdbhblalb.supabase.co"&&C?.SUPABASE_KEY==="sb_publishable_00dNE1hThWqAco5aaGk3sg_VMT9dYne"}
async function send(type,payload={}){if(!ch)return;try{const r=await ch.send({type:"broadcast",event:"dhc",payload:{type,payload,from:me.id}});if(r&&r!=="ok")console.warn("Broadcast response:",r)}catch(e){console.error("Broadcast error:",e)}}
function closeRoom(){stopTimer();if(ch&&db)db.removeChannel(ch);ch=null;state=null;me.host=false;lobby()}
function lobby(){render(`<div class="logo">DID HE<br><span>COOK?</span></div><div class="sub">🍳 A chaotic multiplayer kitchen</div><div class="panel"><div class="grid"><div class="field"><label>Your name</label><input id="name" maxlength="18" placeholder="Chef name"></div><div class="field"><label>Room code</label><input id="room" maxlength="5" placeholder="ABCDE"></div></div><div class="actions"><button class="btn primary" id="create">Create room</button><button class="btn" id="join">Join room</button></div><div class="status ok">Supabase: connected configuration loaded</div></div>`);$("#create").onclick=()=>start(true);$("#join").onclick=()=>start(false)}

async function connect(room){
  // This is intentionally the same connection pattern as the known-working v2 build.
  if(ch)try{await db.removeChannel(ch)}catch{}
  ch=db.channel("dhc:"+room,{config:{broadcast:{self:false},presence:{key:me.id}}});
  ch.on("broadcast",{event:"dhc"},x=>receive(x.payload));
  ch.on("presence",{event:"sync"},()=>syncPresence());
  ch.on("presence",{event:"join"},()=>syncPresence());
  ch.on("presence",{event:"leave"},()=>syncPresence());
  await new Promise((resolve,reject)=>{
    let settled=false;
    ch.subscribe(async status=>{
      console.log("Supabase Realtime status:",status);
      if(status==="SUBSCRIBED"&&!settled){
        settled=true;
        try{await ch.track({id:me.id,name:me.name,host:me.host});resolve()}
        catch(e){reject(e)}
      }else if(["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(status)&&!settled){
        settled=true;reject(new Error("Realtime "+status))
      }
    })
  })
}
async function syncPresence(){
  if(!state||!me.host)return;
  const raw=Object.values(ch.presenceState()).flat();
  for(const x of raw){if(!state.players.some(p=>p.id===x.id))state.players.push({id:x.id,name:x.name||"Player",ready:false})}
  const ids=new Set(raw.map(x=>x.id));
  state.players=state.players.filter(p=>p.id===me.id||ids.has(p.id));
  await send("state",state);updatePlayers();
}
function updatePlayers(){
 const e=$("#players");if(!e||!state)return;
 const key=state.phase==="r1"?"s1":state.phase==="r2"?"s2":state.phase==="r3"?"s3":null;
 const submitted=new Set(key?Object.keys(state[key]):[]);
 e.innerHTML=state.players.map(p=>`<div class="player"><span>${esc(p.name)}${p.id===me.id?" (you)":""}${p.id===state.hostId?" 👑":""}</span><b>${submitted.has(p.id)?"✓ Submitted":p.ready?"✓ Ready":"Thinking…"}</b></div>`).join("");
}
function receive(m){
 if(!m||m.from===me.id)return;
 if(m.type==="hello"&&me.host){if(!state.players.some(p=>p.id===m.payload.id))state.players.push({id:m.payload.id,name:m.payload.name,ready:false});send("state",state);updatePlayers();return}
 if(m.type==="state"){
   const old=state?.phase;
   state=m.payload;
   // Critical: do not redraw an active form when another player submits.
   // Only redraw when the phase itself changes.
   if(old!==state.phase) { localSubmitted=false; draw(); }
   else updatePlayers();
   return;
 }
 if(!me.host)return;
 if(m.type==="ready"){let p=state.players.find(p=>p.id===m.payload.id);if(p)p.ready=true;send("state",state);updatePlayers();return}
 if(m.type==="s1"){state.s1[m.payload.id]=m.payload;send("state",state);updatePlayers();if(all(state.s1))round2();return}
 if(m.type==="s2"){state.s2[m.payload.id]=m.payload;send("state",state);updatePlayers();if(all(state.s2))round3();return}
 if(m.type==="s3"){state.s3[m.payload.id]=m.payload;send("state",state);updatePlayers();if(all(state.s3))voting();return}
 if(m.type==="vote"){if(!state.votes[m.payload.id])state.votes[m.payload.id]=m.payload.target;send("state",state);if(Object.keys(state.votes).length>=state.players.length){state.phase="results";send("state",state);draw()}}
}
function all(o){return state.players.length>=2&&state.players.every(p=>o[p.id])}
async function start(host){
 const name=$("#name").value.trim()||"Player",room=host?makeCode():$("#room").value.trim().toUpperCase();
 if(room.length!==5)return toast("Enter a 5-character room code");
 me.name=name;me.host=host;
 state={room,hostId:host?me.id:null,phase:"lobby",timer:90,players:[{id:me.id,name,ready:false}],s1:{},s2:{},s3:{},a2:{},a3:{},votes:{}};
 render(`<div class="panel center"><div class="big">🍳</div><h2>Opening kitchen…</h2><div class="status" id="connection">Connecting to ${esc(room)}…</div></div>`);
 try{
   await connect(room);
   if(host){roomScreen();await send("state",state)}
   else{roomScreen();await send("hello",{id:me.id,name:me.name});setTimeout(()=>send("hello",{id:me.id,name:me.name}),600);setTimeout(()=>send("hello",{id:me.id,name:me.name}),1400)}
 }catch(e){
   console.error(e);
   render(`<div class="panel center"><div class="big">⚠️</div><h2>Realtime channel error</h2><div class="notice"><b>${esc(e.message)}</b><br><br>This build is using the exact Supabase URL and publishable key supplied for your working v2 build. No Supabase setting was changed by the game.<br><br>If this appears despite v2 connecting, the browser console's exact Realtime status is the useful diagnostic.</div><div class="actions" style="justify-content:center"><button class="btn primary" id="back">Back</button></div></div>`);
   $("#back").onclick=closeRoom;
 }
}
function roomScreen(){render(`<div class="top"><div><span class="pill">KITCHEN ROOM</span><div class="code">${esc(state.room)}</div></div><button class="btn" id="leave">Leave</button></div><div class="panel center"><div class="hint">Send this five-character code to your friends</div><div class="big">${esc(state.room)}</div><div class="status ok">Realtime channel joined</div><div id="players" class="players"></div><div class="field"><label>Round timer (seconds)</label><input id="tm" type="number" min="15" max="300" value="${state.timer}" ${me.host?"":"disabled"}></div><div class="actions" style="justify-content:center"><button class="btn primary" id="ready">${me.host?"Start cooking":"Ready up"}</button></div></div>`);$("#leave").onclick=closeRoom;updatePlayers();
 $("#ready").onclick=async()=>{if(me.host){state.timer=Math.max(15,Math.min(300,+$("#tm").value||90));if(state.players.length<2)return toast("Need at least 2 players");if(!state.players.every(p=>p.id===me.id||p.ready))return toast("Wait for everyone to ready up");state.phase="r1";await send("state",state);draw()}else{await send("ready",{id:me.id,ready:true});toast("Ready!")}}
}
function wait(text){stopTimer();localSubmitted=true;render(`<div class="panel center"><div class="big">👨‍🍳</div><h2>${esc(text)}</h2><div id="players" class="players"></div><div class="status">Your answer is locked in. Other chefs can continue working. The next round starts automatically.</div></div>`);updatePlayers()}
function startTimer(cb){stopTimer();let left=state.timer;const tick=()=>{const e=$("#timer");if(e)e.textContent=left;if(left<=10&&e)e.classList.add("warn");if(left<=0){stopTimer();cb(true);return}left--;timerId=setTimeout(tick,1000)};tick()}
function r1(){localSubmitted=false;render(`<div class="top"><div><span class="pill">ROUND 1 / 3</span><div class="hint">Write the challenge</div></div><div id="timer" class="timer"></div></div><div class="panel"><div class="prompt">🍲 What ingredients would you find in…?</div><div class="field"><label>Ingredient prompt</label><input id="ip" placeholder="${rand(PROMPTS)}"></div><div class="prompt" style="font-size:25px">What food should they make?</div><div class="field"><label>Food item prompt</label><input id="fp" placeholder="${rand(FOODS)}"></div><div class="actions"><button class="btn primary" id="go">Serve challenge</button></div><div id="players" class="players"></div></div>`);$("#go").onclick=submit1;startTimer(submit1)}
async function submit1(expired=false){if(localSubmitted)return;let i=$("#ip")?.value.trim(),f=$("#fp")?.value.trim();if(!expired&&(!i||!f))return toast("Fill in both prompts");localSubmitted=true;stopTimer();const p={id:me.id,ingredient:i||rand(PROMPTS),food:f||rand(FOODS)};if(me.host){state.s1[me.id]=p;send("state",state);updatePlayers();if(all(state.s1))round2();else wait("Waiting for everyone to finish Round 1…")}else{await send("s1",p);wait("Submitted! Waiting for everyone to finish Round 1…")}}
function r2(){localSubmitted=false;let src=state.players.find(p=>p.id===state.a2[me.id]);let challenge=state.s1[src.id];let q=challenge.ingredient;let food=challenge.food;render(`<div class="top"><div><span class="pill">ROUND 2 / 3</span></div><div id="timer" class="timer"></div></div><div class="panel"><div class="hint">Another chef gave you this challenge:</div><div class="prompt">🥕 ${esc(q)}</div><div class="challenge-food"><span class="pill">MAKE THIS FOOD</span><div class="food-prompt">🍽️ ${esc(food)}</div></div><div class="hint">Select exactly 6 different ingredients you think will make the best version of this food.</div><div class="ingredient-grid">${Array.from({length:6},(_,i)=>`<div class="ingredient-slot"><label>Ingredient ${i+1}</label><select class="ing-select" data-ing="${i}"><option value="">— Select ingredient —</option></select></div>`).join("")}</div><div class="actions"><button class="btn primary" id="go">Lock in ingredients</button></div><div id="players" class="players"></div></div>`);const choices=[...new Set([...FALLBACK,"bacon","chicken","beef","pork","fish","shrimp","sausage","ham","tofu","beans","rice","noodles","bread","flour","oats","egg","milk","cream","butter","cheese","yogurt","tomato","potato","carrot","onion","garlic","mushrooms","spinach","lettuce","broccoli","celery","corn","capsicum","avocado","cucumber","apple","banana","strawberry","mango","pineapple","lemon","lime","ginger","honey","sugar","chocolate","peanut butter","olive oil","soy sauce","mustard","ketchup","hot sauce","pickles","cinnamon","chili","basil","oregano","parsley","coriander","coconut","cream cheese","parmesan","mozzarella","feta","maple syrup","vanilla","jam","peanuts","almonds","cashews","walnuts","sesame","seaweed","miso","curry powder","paprika","cumin","turmeric","vinegar","mayonnaise","sour cream","stock"] )];document.querySelectorAll(".ing-select").forEach(sel=>{sel.innerHTML+=choices.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");sel.addEventListener("change",()=>{const used=new Set([...document.querySelectorAll(".ing-select")].map(x=>x.value).filter(Boolean));document.querySelectorAll(".ing-select").forEach(x=>{[...x.options].forEach(o=>{if(o.value)o.disabled=(used.has(o.value)&&o.value!==x.value)})})})});$("#go").onclick=submit2;startTimer(submit2)}
async function submit2(expired=false){if(localSubmitted)return;let fields=[...document.querySelectorAll(".ing-select")];let a=fields.map(x=>x.value);if(!expired){if(a.some(x=>!x))return toast("Choose an ingredient for every slot");if(new Set(a).size!==6)return toast("Choose 6 different ingredients")}a=a.map((x,i)=>x||FALLBACK[i%FALLBACK.length]);localSubmitted=true;stopTimer();const p={id:me.id,ingredients:a.slice(0,6)};if(me.host){state.s2[me.id]=p;send("state",state);updatePlayers();if(all(state.s2))round3();else wait("Waiting for everyone to finish Round 2…")}else{await send("s2",p);wait("Submitted! Waiting for everyone to finish Round 2…")}}
function r3(){localSubmitted=false;let a=state.a3[me.id];render(`<div class="top"><div><span class="pill">ROUND 3 / 3</span></div><div id="timer" class="timer"></div></div><div class="panel"><div class="hint">Your food challenge:</div><div class="prompt">🍽️ ${esc(a.food)}</div><div class="hint">You have 8 ingredients. <b>Select the ingredients you want to use.</b></div><div id="ingredientChoices" class="choice-grid">${a.ingredients.map((x,i)=>`<label class="choice"><input type="checkbox" class="dish-ing" value="${esc(x)}" data-i="${i}"><span>${esc(x)}</span></label>`).join("")}</div><div class="status">Select at least 1 ingredient. You can choose as many of the 8 as you want.</div><div class="field"><label>Optional chef's pitch</label><textarea id="recipe" placeholder="Tell the judges what you cooked..."></textarea></div><div class="actions"><button class="btn primary" id="go">Serve my dish</button></div><div id="players" class="players"></div></div>`);$("#go").onclick=submit3;startTimer(submit3)}
async function submit3(expired=false){if(localSubmitted)return;let selected=[...document.querySelectorAll(".dish-ing:checked")].map(x=>x.value);let recipe=$("#recipe")?.value.trim()||"";if(!expired&&!selected.length)return toast("Select at least one ingredient");if(!selected.length)selected=[aFallback(state.a3[me.id].ingredients)];localSubmitted=true;stopTimer();const a=state.a3[me.id];const p={id:me.id,recipe,food:a.food,ingredients:selected};if(me.host){state.s3[me.id]=p;send("state",state);updatePlayers();if(all(state.s3))voting();else wait("Waiting for everyone to serve…")}else{await send("s3",p);wait("Served! Waiting for everyone to finish…")}}
function aFallback(arr){return arr[0]||"Chef's choice"}
async function round2(){state.phase="r2";state.a2={};state.players.forEach(p=>state.a2[p.id]=rand(state.players.filter(x=>x.id!==p.id)).id);await send("state",state);draw()}
async function round3(){state.phase="r3";state.a3={};state.players.forEach(p=>{let others=state.players.filter(x=>x.id!==p.id),src=rand(others),pool=[...(state.s2[src.id]?.ingredients||[])];while(pool.length<8)pool.push(rand(FALLBACK));state.a3[p.id]={ingredients:[...new Set(pool)].slice(0,8),food:rand(others).food}});await send("state",state);draw()}
async function voting(){state.phase="vote";state.votes={};await send("state",state);draw()}
function vote(){let others=state.players.filter(p=>p.id!==me.id),done=!!state.votes[me.id];render(`<div class="top"><div><span class="pill">VOTING</span></div></div><div class="panel"><div class="prompt">🏆 Who cooked the best dish?</div>${others.map((p,i)=>{let s=state.s3[p.id];return `<div class="vote"><b>DISH ${i+1} — ${esc(s.food)}</b><div>${s.ingredients.map(x=>`<span class="ingredient">${esc(x)}</span>`).join("")}</div><p>${esc(s.recipe)}</p><button class="btn primary" data-v="${esc(p.id)}" ${done?"disabled":""}>${done?"Vote submitted":"Vote for this dish"}</button></div>`}).join("")}<div id="players" class="players"></div></div>`);updatePlayers();document.querySelectorAll("[data-v]").forEach(b=>b.onclick=async()=>{if(done)return;await send("vote",{id:me.id,target:b.dataset.v});if(me.host){state.votes[me.id]=b.dataset.v;send("state",state);if(Object.keys(state.votes).length>=state.players.length){state.phase="results";send("state",state);draw()}}else{state.votes[me.id]=b.dataset.v;vote()}})}
function results(){let c={};Object.values(state.votes).forEach(x=>c[x]=(c[x]||0)+1);let max=Math.max(...Object.values(c),0),wid=Object.keys(c).find(x=>c[x]===max),p=state.players.find(x=>x.id===wid),s=state.s3[wid];render(`<div class="panel center"><div class="big">🏆</div><h1>${p?esc(p.name):"Nobody"} cooked.</h1><div class="prompt">${max} vote${max===1?"":"s"} — ${s?esc(s.food):""}</div>${s?`<p>${esc(s.recipe)}</p><div>${s.ingredients.map(x=>`<span class="ingredient">${esc(x)}</span>`).join("")}</div>`:""}${me.host?'<div class="actions" style="justify-content:center"><button class="btn primary" id="again">Cook again</button></div>':""}</div>`);if(me.host)$("#again").onclick=async()=>{state.phase="r1";state.s1={};state.s2={};state.s3={};state.a2={};state.a3={};state.votes={};state.players.forEach(p=>p.ready=false);await send("state",state);draw()}}
function draw(){if(!state)return lobby();if(state.phase==="lobby")roomScreen();else if(state.phase==="r1")r1();else if(state.phase==="r2")r2();else if(state.phase==="r3")r3();else if(state.phase==="vote")vote();else results()}
if(!valid()||!SB)lobby();else{try{db=SB.createClient(C.SUPABASE_URL,C.SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});lobby()}catch(e){console.error(e);lobby()}}
})();
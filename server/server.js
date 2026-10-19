// 蒼燼紀行 線上伺服器：帳號、營地同步、聊天、組隊、雲端存檔
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {WebSocketServer}=require('ws');
const PORT=process.env.PORT||8787,DATA=process.env.DATA_FILE||path.join(__dirname,'data.json'),MOTD=process.env.MOTD||'歡迎來到蒼燼紀行線上世界！按 Enter 聊天，點其他玩家可以組隊。';
const VER=1,MAXSAVE=600000,MAXP=4;
let db={acc:{}};try{db=JSON.parse(fs.readFileSync(DATA,'utf8'))||db;db.acc=db.acc||{}}catch(_){}
let dirty=false;setInterval(()=>{if(!dirty)return;dirty=false;try{fs.writeFileSync(DATA+'.tmp',JSON.stringify(db));fs.renameSync(DATA+'.tmp',DATA)}catch(e){console.error('save fail',e.message)}},5000);
const hash=(pw,salt)=>crypto.scryptSync(String(pw),salt,32).toString('hex');
const clean=s=>String(s||'').replace(/[<>"'`\\\u0000-\u001f]/g,'').trim();
const players=new Map();let nextId=1;const parties=new Map();let nextParty=1;
function send(p,o){try{if(p.ws.readyState===1)p.ws.send(JSON.stringify(o))}catch(_){}}
function room(p){return p.room}
function pub(p){return{id:p.id,name:p.name,cls:p.cls,lv:p.lv,ch:p.ch,look:p.look,x:p.x,y:p.y,d:p.d,st:p.st,room:p.room,party:p.party||0,hp:p.hp==null?1:p.hp}}
function bcast(o,filter){const s=JSON.stringify(o);for(const q of players.values())if(q.ok&&(!filter||filter(q)))try{if(q.ws.readyState===1)q.ws.send(s)}catch(_){}}
function partyInfo(pid){const P=parties.get(pid);if(!P)return null;return{id:pid,leader:P.leader,mem:P.mem.map(id=>{const q=players.get(id);return q?{id,name:q.name,cls:q.cls,lv:q.lv,ch:q.ch,hp:q.hp||1}:null}).filter(Boolean)}}
function partySync(pid){const info=partyInfo(pid);if(!info)return;for(const id of info.mem.map(m=>m.id)){const q=players.get(id);if(q)send(q,{t:'party',a:'info',party:info})}bcast({t:'pp',ids:info.mem.map(m=>m.id),party:pid})}
function partyLeave(p){const pid=p.party;if(!pid)return;const P=parties.get(pid);p.party=0;if(P){P.mem=P.mem.filter(id=>id!==p.id);if(P.mem.length<=1){for(const id of P.mem){const q=players.get(id);if(q){q.party=0;send(q,{t:'party',a:'info',party:null})}}parties.delete(pid)}else{if(P.leader===p.id)P.leader=P.mem[0];partySync(pid)}}send(p,{t:'party',a:'info',party:null});bcast({t:'pp',ids:[p.id],party:0})}
const srv=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/plain; charset=utf-8','access-control-allow-origin':'*'});res.end('蒼燼紀行 server OK  online='+[...players.values()].filter(p=>p.ok).length)});
const wss=new WebSocketServer({server:srv,maxPayload:MAXSAVE+20000});
wss.on('connection',(ws,req)=>{const p={id:nextId++,ws,ok:false,room:'',x:0,y:0,d:6,st:'idle',rate:[],lastPos:0};players.set(p.id,p);
  ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch(_){return}if(!m||typeof m.t!=='string')return;
    if(m.t==='g'){if(!p.ok||!p.party||raw.length>48000)return;const t=Date.now();if(t-(p.gw||0)>1000){p.gw=t;p.gn=0}if(++p.gn>80)return;const o={t:'g',from:p.id,m:m.m};
      if(m.to){const q=players.get(+m.to);if(q&&q.party===p.party)send(q,o)}else bcast(o,q=>q!==p&&q.party===p.party&&q.room===p.room);return}
    const now=Date.now();if(m.t!=='pos'){p.rate=p.rate.filter(t=>now-t<10000);p.rate.push(now);if(p.rate.length>40)return}
    if(m.t==='hello'){const name=clean(m.name).slice(0,12),pw=String(m.pw||'');if(!name||pw.length<3){send(p,{t:'err',m:'名稱或密碼不正確（密碼至少 3 個字）'});return}
      for(const q of players.values())if(q.ok&&q.name===name&&q!==p){send(p,{t:'err',m:'這個角色已經在線上'});return}
      let a=db.acc[name];if(!a){const salt=crypto.randomBytes(8).toString('hex');a=db.acc[name]={salt,h:hash(pw,salt),c:Date.now()};dirty=true}else if(hash(pw,a.salt)!==a.h){send(p,{t:'err',m:'密碼錯誤'});return}
      Object.assign(p,{ok:true,name,cls:clean(m.cls).slice(0,10),lv:+m.lv||1,ch:+m.ch||1,look:clean(m.look).slice(0,400),room:clean(m.room).slice(0,30)});
      send(p,{t:'welcome',id:p.id,motd:MOTD,ver:VER,cloud:a.save?{t:a.st||0,lv:a.slv||0}:null,players:[...players.values()].filter(q=>q.ok&&q!==p).map(pub)});
      bcast({t:'join',p:pub(p)},q=>q!==p);bcast({t:'chat',ch:'sys',m:name+' 上線了'},q=>q!==p);return}
    if(!p.ok)return;
    if(m.t==='pos'){if(now-p.lastPos<60&&(m.room==null||m.room===p.room))return;p.lastPos=now;p.x=+m.x||0;p.y=+m.y||0;p.d=(m.d|0)&7;p.st=clean(m.st).slice(0,8);if(m.hp!=null)p.hp=+m.hp;
      if(m.room!=null&&m.room!==p.room){p.room=clean(m.room).slice(0,30);bcast({t:'room',id:p.id,room:p.room,x:p.x,y:p.y},q=>q!==p)}
      const o={t:'pos',id:p.id,x:p.x,y:p.y,d:p.d,st:p.st,hp:p.hp};bcast(o,q=>q!==p&&q.room===p.room);return}
    if(m.t==='info'){p.lv=+m.lv||p.lv;p.ch=+m.ch||p.ch;p.cls=clean(m.cls).slice(0,10)||p.cls;if(m.look)p.look=clean(m.look).slice(0,400);bcast({t:'upd',p:pub(p)},q=>q!==p);if(p.party)partySync(p.party);return}
    if(m.t==='chat'){const txt=clean(m.m).slice(0,120);if(!txt)return;const ch=m.ch==='p'&&p.party?'p':m.ch==='r'?'r':'w';
      const o={t:'chat',ch,from:p.name,fid:p.id,m:txt};if(ch==='p')bcast(o,q=>q.party===p.party);else if(ch==='r')bcast(o,q=>q.room===p.room);else bcast(o);return}
    if(m.t==='party'){const a=m.a;
      if(a==='invite'){const q=players.get(+m.to);if(!q||!q.ok||q===p)return;if(q.party&&q.party===p.party)return;if(p.party){const P=parties.get(p.party);if(P&&P.mem.length>=MAXP){send(p,{t:'err',m:'隊伍已滿（最多 4 人）'});return}}send(q,{t:'party',a:'invite',from:p.id,name:p.name});send(p,{t:'chat',ch:'sys',m:'已邀請 '+q.name+' 組隊'});return}
      if(a==='accept'){const q=players.get(+m.from);if(!q||!q.ok)return;if(p.party)partyLeave(p);let pid=q.party;if(!pid){pid=nextParty++;parties.set(pid,{leader:q.id,mem:[q.id]});q.party=pid}const P=parties.get(pid);if(P.mem.length>=MAXP){send(p,{t:'err',m:'隊伍已滿'});return}P.mem.push(p.id);p.party=pid;partySync(pid);bcast({t:'chat',ch:'p',from:'系統',m:p.name+' 加入了隊伍'},x=>x.party===pid);return}
      if(a==='leave'){partyLeave(p);return}
      if(a==='kick'){const P=parties.get(p.party);if(!P||P.leader!==p.id)return;const q=players.get(+m.who);if(q&&q.party===p.party)partyLeave(q);return}
      if(a==='go'){const P=parties.get(p.party);if(!P||P.leader!==p.id)return;for(const id of P.mem){const q=players.get(id);if(q&&q!==p)send(q,{t:'party',a:'go',room:clean(m.room).slice(0,30),ch:+m.ch||1,from:p.name})}return}
      return}
    if(m.t==='save'){const s=typeof m.data==='string'?m.data:'';if(!s||s.length>MAXSAVE)return;const a=db.acc[p.name];if(!a)return;a.save=s;a.st=Date.now();a.slv=+m.lv||0;dirty=true;send(p,{t:'saved',at:a.st});return}
    if(m.t==='load'){const a=db.acc[p.name];send(p,{t:'load',data:a&&a.save||null,at:a&&a.st||0});return}
    if(m.t==='insp'){const q=players.get(+m.who);if(q&&q.ok)send(q,{t:'insp_req',from:p.id,name:p.name});return}
    if(m.t==='insp_res'){const q=players.get(+m.to);if(q&&q.ok)send(q,{t:'insp',from:p.id,name:p.name,eq:m.eq&&JSON.stringify(m.eq).length<20000?m.eq:null});return}
  });
  ws.on('close',()=>{players.delete(p.id);if(p.ok){partyLeave(p);bcast({t:'leave',id:p.id});bcast({t:'chat',ch:'sys',m:p.name+' 離線了'})}});
  ws.on('error',()=>{});
});
setInterval(()=>{for(const p of players.values()){if(p.ws.readyState===1)try{p.ws.ping()}catch(_){}}},25000);
srv.listen(PORT,()=>console.log('蒼燼紀行 server on :'+PORT));

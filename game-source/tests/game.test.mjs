import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,reduce,validState,randomCode,peerId} from '../source/engine.mjs';
import {Multiplayer} from '../source/network.mjs';
import {EventEmitter} from 'node:events';
const tick=()=>new Promise(r=>setTimeout(r,15));
const command=(s,seat,cell,action='move')=>reduce(s,seat,{action,cell,version:s.version,round:s.round});
const joined=()=>({...initialState(),players:[true,true],version:1});
test('reject out-of-turn, invalid, occupied, stale, and pre-join moves',()=>{
 let s=initialState();assert.throws(()=>command(s,0,0),/Wait/);s=joined();
 assert.throws(()=>command(s,1,0),/turn/);for(const i of [-1,9,1.5,'1',null])assert.throws(()=>command(s,0,i),/Invalid/);
 const before=s;s=command(s,0,0);assert.equal(before.board[0],null);assert.throws(()=>reduce(s,0,{action:'move',cell:1,version:1,round:1}),/changed/);
 assert.throws(()=>command(s,1,0),/taken/);assert.throws(()=>command(s,1,1,'unknown'),/Unknown/);assert.throws(()=>command(s,3,1),/seat/);
});
test('win, draw, score, two-vote rematch, alternate starter, stale previous-round command',()=>{
 let s=joined();for(const [i,c] of [0,3,1,4,2].entries())s=command(s,i%2,c);
 assert.equal(s.result,'X');assert.deepEqual(s.line,[0,1,2]);assert.deepEqual(s.scores,[1,0,0]);assert.throws(()=>command(s,1,6),/finished/);
 const old={action:'move',cell:8,version:s.version,round:s.round};s=command(s,0,null,'rematch');assert.equal(s.round,1);const voted=s;s=command(s,0,null,'rematch');assert.equal(s,voted);
 s=command(s,1,null,'rematch');assert.equal(s.round,2);assert.equal(s.turn,'O');assert.deepEqual(s.board,Array(9).fill(null));assert.throws(()=>reduce(s,1,old),/changed/);
 s=joined();for(const [i,c] of [0,1,2,4,3,5,7,6,8].entries())s=command(s,i%2,c);assert.equal(s.result,'draw');assert.deepEqual(s.scores,[0,0,1]);
});
test('all 255168 legal first-round games reach correct terminal states',()=>{
 let games=0;const walk=s=>{assert.ok(validState(s));if(s.result){games++;if(s.result==='draw')assert.ok(s.board.every(Boolean));else assert.equal(s.line.length,3);return;}for(let c=0;c<9;c++)if(!s.board[c])walk(command(s,s.turn==='X'?0:1,c));};walk(joined());assert.equal(games,255168);
});
test('codes use 32-symbol alphabet and consistent namespace',()=>{for(let i=0;i<1000;i++)assert.match(randomCode(),/^[A-HJ-NP-Z2-9]{6}$/);assert.equal(peerId('ABC234'),'tower-tactics-v1-ABC234');});
// Protocol tests only. This fake Peer transports messages between isolated clients;
// it does not test public signaling, ICE, NAT traversal, or browser rendering.
class Link extends EventEmitter{open=false;send(msg){if(this.open)queueMicrotask(()=>this.other.emit('data',structuredClone(msg)));}close(){if(!this.open)return;this.open=false;this.other.open=false;queueMicrotask(()=>{this.emit('close');this.other.emit('close');});}}
const registry=new Map();let nextId=0;
class FakePeer extends EventEmitter{
 constructor(id){super();this.id=typeof id==='string'?id:'test-guest-'+(++nextId);this.destroyed=false;this.disconnected=false;this.links=[];queueMicrotask(()=>{if(registry.has(this.id)){this.emit('error',{type:'unavailable-id'});return;}registry.set(this.id,this);this.emit('open',this.id);});}
 connect(id){const a=new Link(),b=new Link();a.other=b;b.other=a;this.links.push(a);queueMicrotask(()=>{const dest=registry.get(id);if(!dest){this.emit('error',{type:'peer-unavailable'});return;}dest.links.push(b);a.open=b.open=true;dest.emit('connection',b);a.emit('open');b.emit('open');});return a;}
 destroy(){if(this.destroyed)return;this.destroyed=true;if(registry.get(this.id)===this)registry.delete(this.id);for(const l of this.links)l.close();}
 reconnect(){this.disconnected=false;this.emit('open',this.id);}
}
const memory=()=>{const data=new Map();return{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
const client=storage=>new Multiplayer({Peer:FakePeer,storage});
globalThis.RTCPeerConnection=class{};
test('two isolated protocol clients sync; duplicate and out-of-turn intents cannot mutate state',async()=>{
 const h=client(memory()),g=client(memory());try{
 await h.start('host','ABC234');await g.start('guest','ABC234');await tick();assert.equal(g.state.players[1],true);
 await assert.rejects(()=>g.command('move',4),/turn/);assert.equal(h.state.board[4],null);
 await h.command('move',0);await tick();assert.equal(g.state.board[0],'X');await g.command('move',4);await tick();assert.deepEqual(g.state,h.state);
 const s=structuredClone(h.state);g.conn.send({type:'command',id:'duplicate',command:{action:'move',cell:5,version:s.version-1,round:s.round}});await tick();assert.deepEqual(h.state,s);
 assert.notEqual(h.storage,g.storage);assert.notEqual(h.token,g.token);
 }finally{h.stop();g.stop();}
});
test('third player rejected; guest reload restores reserved seat and latest board',async()=>{
 const hs=memory(),gs=memory(),h=client(hs),g=client(gs),third=client(memory());let recovered;
 try{await h.start('host','DEF567');await g.start('guest','DEF567');await h.command('move',0);await tick();await assert.rejects(()=>third.start('guest','DEF567'),/already has two/);assert.equal(h.online,true);g.stop();await tick();assert.equal(h.online,false);recovered=client(gs);await recovered.start('guest','DEF567');await tick();assert.equal(recovered.state.board[0],'X');assert.equal(h.online,true);assert.equal(recovered.token,g.token);await recovered.command('move',4);assert.equal(h.state.board[4],'O');}
 finally{h.stop();g.stop();third.stop();recovered?.stop();}
});
test('collision retries a new room; does not overwrite the existing host',async()=>{
 const h=client(memory()),second=client(memory());try{await h.start('host','GHJ789');await second.start('host','GHJ789');assert.notEqual(second.code,h.code);assert.equal(registry.get(peerId(h.code)),h.peer);}finally{h.stop();second.stop();}
});
test('host reload restores board and seat token, guest reconnects',async()=>{
 const hs=memory(),gs=memory(),h=client(hs),g=client(gs);let restored;
 try{await h.start('host','KLM234');await g.start('guest','KLM234');await h.command('move',0);await tick();h.stop();g.stop();await tick();restored=client(hs);await restored.start('host','KLM234',{resume:true});await g.start('guest','KLM234');assert.equal(g.state.board[0],'X');await g.command('move',4);assert.equal(restored.state.board[4],'O');}
 finally{h.stop();g.stop();restored?.stop();}
});
test('missing host returns an explicit error',async()=>{const g=client(memory());try{await assert.rejects(()=>g.start('guest','NPQ234'),/Host not found/);}finally{g.stop();}});
test('rematch votes and alternating opening turn synchronize through protocol',async()=>{
 const h=client(memory()),g=client(memory());try{
 await h.start('host','RST567');await g.start('guest','RST567');
 for(const [i,c] of [0,3,1,4,2].entries()){await (i%2===0?h:g).command('move',c);await tick();}
 assert.equal(h.state.result,'X');assert.deepEqual(g.state,h.state);await g.command('rematch');await tick();assert.equal(h.state.round,1);await h.command('rematch');await tick();assert.equal(g.state.round,2);assert.equal(g.state.turn,'O');await g.command('move',4);assert.equal(h.state.board[4],'O');
 }finally{h.stop();g.stop();}
});

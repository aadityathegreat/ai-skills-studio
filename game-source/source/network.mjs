import {initialState,reduce,validState,validCode,randomCode,randomToken,peerId} from './engine.mjs';
const OPTIONS={secure:true,debug:0,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]}};
const errors={
 'peer-unavailable':'Host not found. Check the code and ask your friend to keep their host tab open.',
 'network':'Cannot reach the PeerJS signaling server. Check your connection and retry.',
 'server-error':'The free PeerJS signaling service is unavailable. Please retry later.',
 'socket-error':'The signaling connection failed. Please retry.',
 'socket-closed':'The signaling connection closed. Please retry.',
 'browser-incompatible':'This browser does not support WebRTC. Try a current Safari, Firefox, Chrome, or Edge.',
 'webrtc':'Peer connection failed. Some restrictive networks block WebRTC. Try another network.',
 'unavailable-id':'This room already has a host tab open. Return to it, or close it and retry after a moment.'
};
export class Multiplayer {
 constructor({Peer=globalThis.Peer,onState=()=>{},onStatus=()=>{},onError=()=>{},storage=globalThis.localStorage}={}){
  this.Peer=Peer;this.onState=onState;this.onStatus=onStatus;this.onError=onError;this.storage=storage;this.epoch=0;this.connections=new Set();this.pending=new Map();
 }
 read(key){try{return JSON.parse(this.storage.getItem(key));}catch{return null;}}
 write(key,val){try{this.storage.setItem(key,JSON.stringify(val));}catch{this.onError('Browser storage unavailable: keep this tab open. Refreshing will lose your seat.');}}
 saved(){const s=this.read('tt-p2p-session-v1');return s&&validCode(s.code)&&['host','guest'].includes(s.role)?s:null;}
 publish(){this.onState({...structuredClone(this.state),code:this.code,seat:this.role==='host'?0:1});}
 persist(){if(this.role==='host')this.write('tt-p2p-host-'+this.code,{state:this.state,guestToken:this.guestToken,created:this.created});}
 status(online,message=''){this.online=online;this.onStatus(online,message);}
 send(conn,msg){if(conn?.open){try{conn.send(msg);return true;}catch{}}return false;}
 snapshot(conn=this.conn,extra={}){this.send(conn,{type:'state',state:this.state,...extra});}
 stop(){this.epoch++;clearInterval(this.heartbeat);clearTimeout(this.setupTimeout);clearTimeout(this.reconnectTimer);for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Connection closed.'));}this.pending.clear();this.peer?.destroy();this.peer=null;this.conn=null;for(const c of this.connections)c.close();this.connections.clear();this.online=false;}
 leave(){this.stop();try{this.storage.removeItem('tt-p2p-session-v1');}catch{}}
 async start(role,code,{resume=false,attempt=0}={}){
  this.stop();const epoch=this.epoch;
  if(!this.Peer)throw Error('PeerJS could not load. Please reload the page.');
  if(!globalThis.RTCPeerConnection)throw Error('WebRTC is unavailable in this browser. Use HTTPS and a current browser.');
  this.role=role;this.code=code||randomCode();this.guestToken=null;this.created=Date.now();this.state=initialState();this.lastSeen=Date.now();this.online=false;
  if(role==='host'&&resume){const saved=this.read('tt-p2p-host-'+this.code);if(!saved||!validState(saved.state))throw Error('The saved host game is unavailable. Create a new room.');this.state=saved.state;this.guestToken=saved.guestToken;this.created=saved.created;}
  if(role==='guest'&&!validCode(this.code))throw Error('Enter a six-character room code.');
  this.token=this.read('tt-p2p-token-v1');if(typeof this.token!=='string'||!/^[a-f0-9]{64}$/.test(this.token)){this.token=randomToken();this.write('tt-p2p-token-v1',this.token);}
  const peer=this.peer=role==='host'?new this.Peer(peerId(this.code),OPTIONS):new this.Peer(OPTIONS);
  this.status(false,role==='host'?'Reserving your room…':'Finding the host…');
  return new Promise((resolve,reject)=>{
   let settled=false;
   const fail=message=>{if(epoch!==this.epoch)return;this.status(false,message);this.onError(message);if(!settled){settled=true;clearTimeout(this.setupTimeout);reject(Error(message));}};
   const success=()=>{if(epoch!==this.epoch)return;if(!settled){settled=true;clearTimeout(this.setupTimeout);this.write('tt-p2p-session-v1',{role:this.role,code:this.code});resolve({...this.state,code:this.code,seat:role==='host'?0:1});}this.publish();};
   this.setupTimeout=setTimeout(()=>{fail('Connection timed out. Keep the host tab open. Some networks block WebRTC; try another network.');this.stop();},20000);
   peer.on('open',()=>{if(epoch!==this.epoch)return;if(role==='host'){this.persist();this.status(!this.state.players[1],this.state.players[1]?'Waiting for your rival to reconnect.':'Room ready. Keep this host tab open.');success();}else{const c=peer.connect(peerId(this.code),{reliable:true,serialization:'json'});this.bindGuest(c,epoch,success,fail);}});
   peer.on('connection',c=>{if(epoch!==this.epoch||role!=='host'){c.close();return;}this.bindHost(c,epoch);});
   peer.on('error',err=>{
    if(epoch!==this.epoch)return;
    if(err.type==='unavailable-id'&&role==='host'&&!resume&&!settled&&attempt<7){settled=true;clearTimeout(this.setupTimeout);this.start('host',null,{attempt:attempt+1}).then(resolve,reject);return;}
    fail(errors[err.type]||`Connection error (${err.type||'unknown'}). Please retry.`);
   });
   peer.on('disconnected',()=>{if(epoch!==this.epoch)return;this.onError('Signaling disconnected. Reconnecting; an existing game link may still work.');clearTimeout(this.reconnectTimer);this.reconnectTimer=setTimeout(()=>{if(epoch===this.epoch&&!peer.destroyed&&peer.disconnected)try{peer.reconnect();}catch{}},1500);});
   peer.on('close',()=>{if(epoch===this.epoch)fail('Room connection closed. Reconnect to continue, or create a new room.');});
   this.heartbeat=setInterval(()=>{if(epoch!==this.epoch)return;if(this.conn?.open){if(role==='host')this.snapshot();else this.send(this.conn,{type:'ping'});if(Date.now()-this.lastSeen>14000)this.status(false,'No response from your rival. Moves are paused. Reconnect to continue.');}if(peer.disconnected&&!peer.destroyed)try{peer.reconnect();}catch{}},2500);
  });
 }
 bindHost(c,epoch){
  if(this.connections.size>=8){c.close();return;}this.connections.add(c);let authenticated=false;
  const timeout=setTimeout(()=>{if(!authenticated)c.close();},12000);
  c.on('data',msg=>{
   if(epoch!==this.epoch||!msg||typeof msg!=='object')return;
   if(JSON.stringify(msg).length>4096){c.close();return;}
   if(msg.type==='hello'){
    if(!/^[a-f0-9]{64}$/.test(msg.token||'')){this.send(c,{type:'error',error:'Invalid seat key.'});return;}
    if(this.guestToken&&this.guestToken!==msg.token){this.send(c,{type:'error',error:'This room already has two players. Ask your friend to create a new room.'});setTimeout(()=>c.close(),100);return;}
    clearTimeout(timeout);authenticated=true;
    const old=this.conn;this.conn=c;this.guestToken=msg.token;this.lastSeen=Date.now();
    if(!this.state.players[1]){this.state={...this.state,players:[true,true],version:this.state.version+1};}
    this.persist();this.status(true,'Connected directly to your rival.');this.publish();this.snapshot();
    if(old&&old!==c)old.close();return;
   }
   if(!authenticated||this.conn!==c)return;
   this.lastSeen=Date.now();this.status(true,'Connected directly to your rival.');
   if(msg.type==='ping'){this.snapshot();return;}
   if(msg.type==='command'){
    try{this.state=reduce(this.state,1,msg.command);this.persist();this.publish();this.snapshot(c,{ack:msg.id});}
    catch(e){this.snapshot(c,{ack:msg.id,error:e.message});}
   }
  });
  const closed=()=>{clearTimeout(timeout);this.connections.delete(c);if(epoch===this.epoch&&this.conn===c){this.conn=null;this.status(false,'Your rival disconnected. Their seat is reserved. Ask them to reconnect.');}};
  c.on('close',closed);c.on('error',closed);
 }
 bindGuest(c,epoch,success,fail){
  let refused=false;
  this.conn=c;this.connections.add(c);
  c.on('open',()=>{if(epoch===this.epoch)this.send(c,{type:'hello',token:this.token});});
  c.on('data',msg=>{
   if(epoch!==this.epoch||!msg||typeof msg!=='object')return;
   if(JSON.stringify(msg).length>4096){fail('Invalid response from host.');return;}
   if(msg.type==='error'){refused=true;fail(msg.error||'The host refused the connection.');c.close();return;}
   if(msg.type!=='state'||!validState(msg.state))return;
   this.lastSeen=Date.now();this.status(true,'Connected directly to the host.');
   if(msg.state.version>=this.state.version){this.state=msg.state;success();}
   const pending=this.pending.get(msg.ack);if(pending){clearTimeout(pending.timer);this.pending.delete(msg.ack);if(msg.error)pending.reject(Error(msg.error));else pending.resolve();}
  });
  const closed=()=>{if(epoch===this.epoch&&!refused){this.connections.delete(c);fail('Host connection lost. Keep the host tab open, then reconnect.');}};
  c.on('close',closed);c.on('error',()=>{if(epoch===this.epoch)fail('Peer connection failed. Some restrictive networks block WebRTC. Try another network.');});
 }
 async command(action,cell){
  if(!this.online)throw Error('Connection is paused. Reconnect before making a move.');
  const command={action,cell,version:this.state.version,round:this.state.round};
  if(this.role==='host'){this.state=reduce(this.state,0,command);this.persist();this.publish();this.snapshot();return;}
  if(this.pending.size)throw Error('Waiting for the host to confirm your move.');
  const id=randomToken();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Host did not confirm the move. Reconnect to sync the board.'));},10000);this.pending.set(id,{resolve,reject,timer});if(!this.send(this.conn,{type:'command',command,id})){clearTimeout(timer);this.pending.delete(id);reject(Error('Host disconnected. Reconnect to continue.'));}});
 }
 async retry(){if(this.role==='host'&&this.peer&&!this.peer.destroyed){if(this.peer.disconnected)this.peer.reconnect();this.status(!this.state.players[1],'Waiting for your rival to reconnect. Keep this tab open.');return;}return this.start(this.role,this.code,{resume:this.role==='host'});}
}

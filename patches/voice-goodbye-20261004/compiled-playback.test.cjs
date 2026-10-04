const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
for(const file of fs.readdirSync('/app').filter(f=>f.startsWith('packages_crm_src_lib_agents_voice_')&&f.endsWith('.fixed.js'))){
 const entries=require(path.join('/app',file));
 const factory=entries.find(x=>typeof x==='function'&&x.toString().includes('voice_call_hangup_requested'));
 assert.ok(factory);
 const exports={};factory({i:()=>({ALL_TOOLS:[],logEvent:()=>{}}),s:values=>{for(let i=0;i<values.length;i+=3)exports[values[i]]=values[i+2];}});
 assert.equal(typeof exports.runVoiceCall,'function');
 function setup(extra={}){
  let sock;const hangups=[];
  class Socket{
   OPEN=1;CONNECTING=0;readyState=1;listeners={};closed=false;
   constructor(){sock=this;}
   addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
   on(){} send(){} close(){this.closed=true;this.readyState=3;}
   emit(msg){for(const f of this.listeners.message??[])f({data:JSON.stringify(msg)});}
  }
  const promise=exports.runVoiceCall({callId:'test',apiKey:'test',WebSocketImpl:Socket,hangupImpl:async()=>hangups.push(1),maxCallMs:1000,playbackHangupGraceMs:0,...extra});
  const bye=()=>sock.emit({type:'conversation.item.input_audio_transcription.completed',transcript:'goodbye'});
  const done=()=>sock.emit({type:'response.done',response:{id:'closing',output:[{type:'message',role:'assistant',content:[{type:'output_audio',transcript:'Have a good day'}]}]}});
  const drain=(id='closing')=>sock.emit({type:'output_audio_buffer.stopped',response_id:id});
  return {sock,promise,hangups,bye,done,drain};
 }
 test(file+': waits for actual matching playback',async()=>{
  const h=setup();h.bye();h.done();await new Promise(r=>setTimeout(r,10));assert.equal(h.hangups.length,0);
  h.drain('old');await new Promise(r=>setTimeout(r,10));assert.equal(h.hangups.length,0);
  h.drain();h.drain();assert.equal(await h.promise,'goodbye');assert.equal(h.hangups.length,1);
 });
 test(file+': handles drain before generation event',async()=>{const h=setup();h.bye();h.drain();h.done();assert.equal(await h.promise,'goodbye');});
 test(file+': interruption cancels farewell',async()=>{const h=setup({maxCallMs:60});h.bye();h.done();h.sock.emit({type:'input_audio_buffer.speech_started'});h.drain();await new Promise(r=>setTimeout(r,10));assert.equal(h.hangups.length,0);assert.equal(await h.promise,'timeout');});
 test(file+': missing drain bounded',async()=>{const h=setup({playbackDrainTimeoutMs:15});h.bye();h.done();assert.equal(await h.promise,'goodbye');});
 test(file+': turn cap waits for playback',async()=>{const h=setup({maxTurns:1});h.done();assert.equal(h.hangups.length,0);h.drain();assert.equal(await h.promise,'max_turns');});
}

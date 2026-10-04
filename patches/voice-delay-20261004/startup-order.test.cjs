const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const ts=createRequire('/app/packages/crm/package.json')('typescript');
const source=fs.readFileSync('/app/packages/crm/src/app/api/v1/voice/openai/webhook/route.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup(options={}) {
 const calls=[]; let background; let runArgs; const events=[];
 const record=(name,value)=>async (...args)=>{calls.push(name);return typeof value==='function'?value(...args):value;};
 const ctx={ctx:{orgId:'org',agentId:'agent'},transcriptAgentId:'agent',transcriptOrgId:'org',instructions:'Say Seck',audioVoice:'marin',greeting:'Hello Seck'};
 const exports={};
 const mocks={
  'next/server':{after:fn=>background=fn,NextResponse:{json:body=>body}},
  '@/lib/observability/log':{logEvent:(name)=>events.push(name)},
  '@/lib/agents/voice/openai-webhook-verify':{extractWebhookHeaders:()=>({}),verifyOpenAiWebhook:()=>({ok:true})},
  '@/lib/agents/voice/openai-realtime':{acceptCall:record('accept',{ok:!options.failAccept,status:options.failAccept?404:200,body:'',headers:{}}),runVoiceCall:record('run',args=>{runArgs=args;return 'closed';}),hangupCall:record('hangup'),buildPostCallSmsBody:()=>''},
  '@/lib/agents/voice/sip-headers':{extractDialedNumber:()=>'+15550000000',extractCallerNumber:()=>null},
  '@/lib/agents/voice/resolve-deployment-by-number':{resolveDeploymentByNumber:record('resolve',options.fallback?null:{id:'dep',builderOrgId:'org'})},
  '@/lib/agents/voice/deployment-voice':{loadDeploymentVoiceContext:record('context',options.contextPromise?()=>options.contextPromise:ctx)},
  '@/lib/agents/voice/transcript':{startVoiceConversation:record('transcript','conversation'),appendVoiceTurn:record('append'),endVoiceConversation:record('end')},
  '@/lib/telephony/voice-metering-orchestration':{isMeteredCall:()=>!!options.metered,gateMeteredAccept:record('gate',{accept:!options.blocked}),meterCallEnd:record('meter',{})},
  '@/lib/agents/voice/voice-workspace':{resolveVoiceContextByNumber:record('workspace',options.workspace?{ok:true,ctx:{orgId:'org',agentId:'agent'}}:null),loadVoicePersonaInputs:record('persona',{blueprint:{voice:'marin',greeting:'Hello'},timezone:'UTC'})},
  '@/lib/agents/brain-context':{loadAgentBrainContext:record('brain',{consumedNoteIds:[],notes:[]})},
  '@/lib/agents/voice/persona':{composeVoicePersona:()=> 'Say Seck'},
 };
 if(options.compiledCallback){
 const get=s=>mocks['@/lib/'+s];
 const meter=get('telephony/voice-metering-orchestration');
 background=vm.runInNewContext('('+options.compiledCallback+')',{
  n:'test',i:'test-only',r:{data:{}},process:{env:{}},console,Date,
  f:get('observability/log'),b:get('agents/voice/openai-realtime'),E:get('agents/voice/sip-headers'),
  T:get('agents/voice/resolve-deployment-by-number'),M:get('agents/voice/deployment-voice'),S:get('agents/voice/transcript'),I:get('agents/voice/voice-workspace'),R:get('agents/voice/persona'),
  B:{voiceManagedEnabled:()=>!!options.metered},V:meter.gateMeteredAccept,H:meter.meterCallEnd,U:{},q:{},j:{},x:{},k:get('agents/brain-context').loadAgentBrainContext,
 });
 exports.POST=async()=>({received:true});
 }else{ vm.runInNewContext(code,{exports,require:name=>mocks[name]||{},process:{env:{OPENAI_API_KEY:'test-only'}},console,Date,Response});
 }
 return {calls,events,get runArgs(){return runArgs;},post:()=>exports.POST({text:async()=>JSON.stringify({type:'realtime.call.incoming',data:{call_id:'test'}}),headers:new Headers()}),background:()=>background()};
}
test('acknowledges before work, prepares before answering, then immediately attaches',async()=>{const h=setup();await h.post();assert.deepEqual(h.calls,[]);await h.background();assert.deepEqual(h.calls,['resolve','context','transcript','accept','run']);assert.equal(h.runArgs.audioVoice,'marin');assert.equal(h.runArgs.instructions,'Say Seck');});
test('slow context cannot produce an answered silent call',async()=>{let ready;const contextPromise=new Promise(resolve=>ready=resolve);const h=setup({contextPromise});await h.post();const work=h.background();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(h.calls,['resolve','context']);ready(null);await work;assert.deepEqual(h.calls.slice(-2),['accept','run']);});
test('workspace fallback prepares transcript and persona before answering',async()=>{const h=setup({fallback:true,workspace:true});await h.post();await h.background();assert.deepEqual(h.calls,['resolve','workspace','persona','brain','transcript','accept','run']);});
test('unresolved caller still receives fallback greeting',async()=>{const h=setup({fallback:true});await h.post();await h.background();assert.deepEqual(h.calls,['resolve','workspace','accept','run']);});
test('failed accept never opens socket and closes prepared transcript',async()=>{const h=setup({failAccept:true});await h.post();await h.background();assert.deepEqual(h.calls,['resolve','context','transcript','accept','end']);assert.ok(h.events.includes('voice_call_accept_failed'));});
test('blocked wallet still accepts then hangs up without fallback',async()=>{const h=setup({metered:true,blocked:true});await h.post();await h.background();assert.deepEqual(h.calls,['resolve','gate','accept','hangup']);});
test('funded wallet keeps metering on completed call',async()=>{const h=setup({metered:true});await h.post();await h.background();assert.deepEqual(h.calls,['resolve','gate','context','transcript','accept','run','meter']);});
test('deployed compiled route matches source call ordering across all branches',async()=>{
 const chunk=fs.readFileSync('/app/route-chunk.fixed.js','utf8');
 const begin=chunk.indexOf('(0,h.after)(async()=>{')+'(0,h.after)('.length;
 const end=chunk.indexOf('),h.NextResponse.json({received:!0,call_id:n})',begin);
 assert.ok(begin>0&&end>begin);
 const callback=chunk.slice(begin,end);
 for(const options of [{},{fallback:true},{fallback:true,workspace:true},{failAccept:true},{metered:true},{metered:true,blocked:true}]) {
  const h=setup({...options,compiledCallback:callback});await h.post();await h.background();
  const source=setup(options);await source.post();await source.background();
  assert.deepEqual(h.calls,source.calls,JSON.stringify(options));
 }
});

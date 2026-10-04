from pathlib import Path
p=Path(__file__).parent
s=(p/'route-chunk.original.js').read_text()
def replace(old,new):
 global s
 assert s.count(old)==1,(old[:100],s.count(old))
 s=s.replace(old,new)
a=s.index('let o,a,l,s=await (0,b.acceptCall)')
b=s.index('let c=(0,E.extractDialedNumber)',a)
old=s[a:b]
body=old.replace('let o,a,l,s=','let s=',1).replace('if(!s.ok)return void(0,f.logEvent)', 'if(!s.ok){(0,f.logEvent)',1).replace('severity:"error"});(0,f.logEvent)("voice_call_accepted"','severity:"error"});return false;}(0,f.logEvent)("voice_call_accepted"',1)
replace(old,'let o,a,l;const acceptPreparedCall=async()=>{'+body+'return true;};')
replace('if(o){try{await (0,b.hangupCall)', 'if(o){if(!await acceptPreparedCall())return;try{await (0,b.hangupCall)')
replace('let _=Date.now();try{await (0,b.runVoiceCall)', 'if(!await acceptPreparedCall()){if(t)await (0,S.endVoiceConversation)({conversationId:t,turnCount:0});return;}let _=Date.now();try{await (0,b.runVoiceCall)')
replace('}),await (0,b.runVoiceCall)({callId:n,apiKey:i,toolContext:p?.ok', '});if(!await acceptPreparedCall()){if(w)await (0,S.endVoiceConversation)({conversationId:w,turnCount:0});return;}await (0,b.runVoiceCall)({callId:n,apiKey:i,toolContext:p?.ok')
(p/'route-chunk.fixed.js').write_text(s)
print('Patched compiled route with exact-match guards')

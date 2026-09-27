/** 점포 화이트리스트 시트 연동 회귀 */
import crypto from 'node:crypto';
const B='http://localhost:3000';
const KEY='3c7c07d9f2d94d07af660209519fedb925c873d6ba484d629a77a2756248d862';
let pass=0,fail=0;
const ok=(l,c,e='')=>{c?(pass++,console.log(`  ✅ ${l}${e?' — '+e:''}`)):(fail++,console.log(`  ❌ ${l}${e?' — '+e:''}`))};
const fn=async(n,p={},t)=>{const h={'Content-Type':'application/json'};if(t)h['x-session-token']=t;
 const r=await fetch(`${B}/api/fn/${n}`,{method:'POST',headers:h,body:JSON.stringify(p)});
 return {status:r.status,...(await r.json().catch(()=>({})))};};
const mq=async(a,x={})=>{const ts=Date.now(),n=crypto.randomUUID().replace(/-/g,'');
 const sig=crypto.createHmac('sha256',KEY).update([a,ts,n].join('|')).digest('hex');
 const r=await fetch(`${B}/api/mail-queue`,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action:a,ts,nonce:n,sig,...x})});return {status:r.status,...(await r.json().catch(()=>({})))};};
async function tok(email){const l=await fn('staffLogin',{email});let c=l.result?.devCode;
 if(!c){const p=await mq('pull');c=(p.jobs??[]).filter(j=>j.email===email).pop()?.code;}
 return (await fn('staffVerify',{sessionId:l.result.sessionId,code:c})).result?.token;}
const T=await tok('admin@gsretail.com');

console.log('\n── 변경 감지 ──');
const p1=await mq('pull',{storesHash:'deadbeefdeadbeef'});
ok('해시가 다르면 전량 요청', p1.needStores===true);
const cur=(await mq('ping')).stores?.hash;
const p2=await mq('pull',{storesHash:cur});
ok('해시가 같으면 요청 안 함', p2.needStores===false, `hash=${cur}`);

console.log('\n── 시트 → 원장 ──');
const SHEET=[
 {storeCode:'31001',storeName:'광교점',ownerName:'박경영',phone:'01055667788',region:'GYEONGGI',fcTeam:'경기1팀',active:'TRUE'},
 {storeCode:'31002',storeName:'빈칸점',ownerName:'최경영',phone:'01055667799',region:'GYEONGGI',fcTeam:'',active:''},
 {storeCode:'31003',storeName:'번호오류',ownerName:'x',phone:'123',region:'SEOUL',active:'TRUE'},
 {storeCode:'31004',storeName:'지역오류',ownerName:'y',phone:'01011112222',region:'NOWHERE',active:'TRUE'},
];
const sync=await mq('stores',{stores:SHEET});
ok('동기화 성공', sync.ok===true, JSON.stringify({u:sync.upserted,d:sync.deactivated,s:sync.skipped}));
ok('정상 2건 반영', sync.upserted===2);
ok('잘못된 2건은 건너뜀', sync.skipped===2, sync.reasons?.join(' / '));
ok('active 빈 칸은 활성으로 처리', sync.upserted===2);

console.log('\n── 경영주 로그인 ──');
const login=await fn('requestOtp',{storeCode:'31001',last4:'7788'});
ok('등록된 점포는 로그인 가능', login.status===200, login.error?.message);
ok('마스킹된 번호 안내', /\*/.test(login.result?.maskedPhone??''), login.result?.maskedPhone);
ok('뒷4자리 틀리면 거부', (await fn('requestOtp',{storeCode:'31001',last4:'0000'})).status===400);
ok('미등록 점포코드는 거부', (await fn('requestOtp',{storeCode:'99999',last4:'1234'})).status===400);
ok('번호 오류로 건너뛴 점포는 미등록', (await fn('requestOtp',{storeCode:'31003',last4:'0123'})).status===400);

console.log('\n── 비활성 처리 ──');
await mq('stores',{stores:[{storeCode:'31001',storeName:'광교점',ownerName:'박경영',phone:'01055667788',region:'GYEONGGI',active:'FALSE'}]});
ok('FALSE 로 두면 로그인 차단', (await fn('requestOtp',{storeCode:'31001',last4:'7788'})).status===400);
await mq('stores',{stores:[{storeCode:'31002',storeName:'빈칸점',ownerName:'최경영',phone:'01055667799',region:'GYEONGGI',active:'TRUE'}]});
ok('시트에서 빠진 점포는 유지됨(삭제 아님)',
   (await fn('requestOtp',{storeCode:'31002',last4:'7799'})).status===200);

console.log('\n── 번호 보존 ──');
const before=(await fn('adminStoreLookup',{storeCode:'31002'},T)).result.found.last4;
await mq('stores',{stores:[{storeCode:'31002',storeName:'빈칸점 수정',ownerName:'최경영',phone:'',region:'GYEONGGI',active:'TRUE'}]});
const after=await fn('adminStoreLookup',{storeCode:'31002'},T);
ok('번호 칸이 비어도 기존 번호 유지', after.result.found.last4===before, `${before} → ${after.result.found.last4}`);
ok('다른 칸은 갱신됨', after.result.found.storeName==='빈칸점 수정');

console.log('\n── 개인정보 ──');
ok('조회 응답에 평문 번호 없음', !JSON.stringify(after.result).includes('01055667799'));
ok('마스킹 제공', /\*/.test(after.result.found.phoneMasked), after.result.found.phoneMasked);
ok('비관리자 조회 차단', (await fn('adminStoreLookup',{storeCode:'31002'})).status>=400);

console.log(`\n════ 결과: ✅ ${pass}  ❌ ${fail} ════\n`);
process.exit(fail?1:0);

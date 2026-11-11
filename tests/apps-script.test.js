'use strict';
/* Runs apps-script/Code.gs against an in-memory fake of Google Sheets/Cache/Mail (no Google account needed). */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const SRC=fs.readFileSync(path.join(__dirname,'..','apps-script','Code.gs'),'utf8');
function sheetOf(rows){
 const s={rows:rows,
  getDataRange(){return {getValues:()=>s.rows.map(r=>r.slice())}},
  getRange(r,c,nr,nc){if(typeof r==='string'){const m=r.match(/^([A-Z])(\d+)$/);c=m[1].charCodeAt(0)-64;r=+m[2]}nr=nr||1;nc=nc||1;return {
   getValue:()=>(s.rows[r-1]||[])[c-1],
   setValue:v=>{while(s.rows.length<r)s.rows.push([]);s.rows[r-1][c-1]=v},
   setValues:vs=>{vs.forEach((row,i)=>row.forEach((v,j)=>{while(s.rows.length<r+i)s.rows.push([]);s.rows[r-1+i][c-1+j]=v}))},
   setNumberFormat(){}}},
  appendRow(a){s.rows.push(a)},getLastRow(){return s.rows.length}};
 return s;
}
function env(){
 const mails=[],cache={},props={};
 const tabs={Codes:sheetOf([['code','used','note','date'],['CVPRO-AAAAAAAA',false,'',''],['CVPRO-BBBBBBBB',true,'','']]),
  OwnerLogin:sheetOf([['pw'],['Strong-Pass-1234']]),Settings:sheetOf([['key','value'],['whatsapp','923001234567'],['email','a@b.com']]),Orders:sheetOf([['ts','name','wa','email','tpl','note','status','code','upd','rem','txn']])};
 const ctx={SpreadsheetApp:{openById:()=>({getSheetByName:n=>tabs[n]||null})},
  CacheService:{getScriptCache:()=>({get:k=>cache[k]===undefined?null:cache[k],put:(k,v)=>{cache[k]=String(v)},remove:k=>{delete cache[k]}})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v}})},
  MailApp:{sendEmail:(...a)=>mails.push(a),getRemainingDailyQuota:()=>100},
  Session:{getEffectiveUser:()=>({getEmail:()=>'owner@example.com'}),getScriptTimeZone:()=>'UTC'},
  Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
   computeDigest:(a,s)=>Array.from(crypto.createHash('sha256').update(s,'utf8').digest()).map(b=>b>127?b-256:b),formatDate:d=>d.toISOString()},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({text:t,setMimeType(){return this}})},
  Logger:{log(){}},console};
 vm.createContext(ctx);vm.runInContext(SRC,ctx);
 const call=body=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(body)}}).text);
 const mkDate=ms=>vm.runInContext('new Date('+ms+')',ctx); /* Date from the same realm as Code.gs */
 return {ctx,tabs,mails,call,cache,mkDate};
}
const PW='Strong-Pass-1234';
test('owner can log in; wrong password is rejected',()=>{
 const e=env();assert.equal(e.call({action:'verifyOwner',password:'nope'}).valid,false);
 const r=e.call({action:'verifyOwner',password:PW});assert.equal(r.valid,true);assert.ok(r.token.length>=32);
 assert.match(e.tabs.OwnerLogin.rows[1][0],/^h1\$/);
});
test('owner lock: 8 wrong passwords lock the login and send exactly one alert email',()=>{
 const e=env();
 for(let i=0;i<7;i++)assert.equal(e.call({action:'verifyOwner',password:'x'+i}).valid,false);
 assert.equal(e.mails.length,0);
 e.call({action:'verifyOwner',password:'x8'});assert.equal(e.mails.length,1);assert.match(e.mails[0][1],/owner login locked/);
 const r=e.call({action:'verifyOwner',password:PW});assert.equal(r.valid,false);assert.equal(r.error,'locked');
 e.call({action:'verifyOwner',password:'y'});assert.equal(e.mails.length,1);
});
test('customer code: valid code works once, used code is refused',()=>{
 const e=env();assert.equal(e.call({action:'verifyCustomer',code:'cvpro-aaaaaaaa'}).valid,true);
 const r=e.call({action:'verifyCustomer',code:'CVPRO-AAAAAAAA'});assert.equal(r.valid,false);assert.equal(r.reason,'used');
 assert.equal(e.call({action:'verifyCustomer',code:'CVPRO-ZZZZZZZZ'}).reason,'not_found');
});
test('customer code lock needs 150 wrong tries; a real customer is still served before that',()=>{
 const e=env();
 for(let i=0;i<149;i++)e.call({action:'verifyCustomer',code:'CVPRO-X'+i});
 assert.equal(e.call({action:'verifyCustomer',code:'CVPRO-AAAAAAAA'}).valid,true);
 for(let i=0;i<150;i++)e.call({action:'verifyCustomer',code:'CVPRO-Y'+i});
 assert.equal(e.call({action:'verifyCustomer',code:'CVPRO-BBBBBBBB'}).reason,'too_many');
});
test('Control tab keys are saved and validated',()=>{
 const e=env(),r=e.call({action:'saveSiteSettings',password:PW,values:{site_name:'My <b>CV</b> Site',tpl_free:'t2, T21, bad, t999999,t5',demo_video:'https://youtu.be/abc123'}});
 assert.equal(r.valid,true);const m={};e.tabs.Settings.rows.slice(1).forEach(x=>m[x[0]]=x[1]);
 assert.equal(m.site_name,'My bCV/b Site');assert.equal(m.tpl_free,'t2,t21,t5');assert.equal(m.demo_video,'https://youtu.be/abc123');
});
test('Control tab: bad video and unknown key are refused',()=>{
 const e=env();
 assert.equal(e.call({action:'saveSiteSettings',password:PW,values:{demo_video:'https://evil.example/x'}}).error,'bad_video');
 assert.equal(e.call({action:'saveSiteSettings',password:PW,values:{not_a_key:'1'}}).error,'bad_key');
 assert.equal(e.call({action:'saveSiteSettings',password:'wrong',values:{site_name:'x'}}).valid,false);
});
test('public settings never include QR images or the password',()=>{
 const e=env();e.call({action:'saveSiteSettings',password:PW,values:{site_name:'Demo'}});
 const s=e.call({action:'getSettings'});assert.equal(s.valid,true);assert.equal(s.settings.pay1_qr,undefined);assert.equal(s.settings.pay1_qr_set,'false');assert.ok(!JSON.stringify(s).includes('Strong-Pass'));
});
test('purgeOldOrders erases personal details of old orders only, keeps order data',()=>{
 const e=env(),DAY=864e5,old=e.mkDate(Date.now()-14*30*DAY),recent=e.mkDate(Date.now()-60*DAY);
 e.tabs.Orders.rows.push([old,'Old Name','0300111','old@x.com','t2','note old','Completed','CVPRO-AAAAAAAA','','','TXN1'],[recent,'New Name','0300222','new@x.com','t4','note new','Pending','','','','TXN2']);
 const tok=e.call({action:'verifyOwner',password:PW}).token;
 const r=e.call({action:'purgeOldOrders',token:tok,months:12});assert.equal(r.valid,true);assert.equal(r.purged,1);
 const o=e.tabs.Orders.rows[1],n=e.tabs.Orders.rows[2];
 assert.deepEqual([o[1],o[2],o[3],o[5],o[10]],['Deleted','','','','']);assert.deepEqual([o[4],o[6],o[7]],['t2','Completed','CVPRO-AAAAAAAA']);
 assert.deepEqual([n[1],n[2],n[3],n[5],n[10]],['New Name','0300222','new@x.com','note new','TXN2']);
 assert.equal(e.call({action:'purgeOldOrders',token:tok,months:12}).purged,0);
});
test('purgeOldOrders needs the owner and a sane number of months',()=>{
 const e=env();assert.equal(e.call({action:'purgeOldOrders',months:12}).error,'session_expired');
 const tok=e.call({action:'verifyOwner',password:PW}).token;
 [1,2,'abc',61,12.5].forEach(m=>assert.equal(e.call({action:'purgeOldOrders',token:tok,months:m}).error,'bad_months',String(m)));
 assert.equal(e.call({action:'purgeOldOrders',token:tok}).months,12);
});
test('orders: formula injection is neutralised and rate limit works',()=>{
 const e=env();const r=e.call({action:'submitOrder',name:'=HYPERLINK("x")',whatsapp:'+923001234567',template:'t2'});
 assert.equal(r.valid,true);assert.ok(String(e.tabs.Orders.rows[1][1]).startsWith("'="));
 assert.equal(e.call({action:'submitOrder',name:'',whatsapp:''}).error,'missing_fields');
});
test('admin actions are refused without a session',()=>{
 const e=env();['getOrders','generateCodes','approveOrder','updateStatus'].forEach(a=>assert.equal(e.call({action:a}).valid,false,a));
});
test('the repo copy never contains a real sheet id or secrets',()=>{assert.match(SRC,/PASTE_YOUR_SHEET_ID_HERE/);assert.ok(!/AIza|sk-[A-Za-z0-9]{20}/.test(SRC))});

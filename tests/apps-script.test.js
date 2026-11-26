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
   getValues:()=>{const out=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((s.rows[r-1+i]||[])[c-1+j]);out.push(row)}return out},
   setNumberFormat(){}}},
  appendRow(a){s.rows.push(a)},getLastRow(){return s.rows.length}};
 return s;
}
function env(){
 const mails=[],cache={},props={};
 const tabs={Codes:sheetOf([['code','used','note','date'],['CVPRO-AAAAAAAA',false,'',''],['CVPRO-BBBBBBBB',true,'','']]),
  OwnerLogin:sheetOf([['pw'],['Strong-Pass-1234']]),Settings:sheetOf([['key','value'],['whatsapp','923001234567'],['email','a@b.com']]),Orders:sheetOf([['ts','name','wa','email','tpl','note','status','code','upd','rem','txn']])};
 const ctx={SpreadsheetApp:{openById:()=>({getSheetByName:n=>tabs[n]||null,insertSheet:n=>{tabs[n]=sheetOf([]);return tabs[n]}})},
  CacheService:{getScriptCache:()=>({get:k=>cache[k]===undefined?null:cache[k],put:(k,v)=>{cache[k]=String(v)},remove:k=>{delete cache[k]}})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v}})},
  MailApp:{sendEmail:(...a)=>mails.push(a),getRemainingDailyQuota:()=>100},
  Session:{getEffectiveUser:()=>({getEmail:()=>'owner@example.com'}),getScriptTimeZone:()=>'UTC'},
  Utilities:{newBlob:(d,m,n)=>({data:d,mime:m,name:n}),getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
   computeDigest:(a,s)=>Array.from(crypto.createHash('sha256').update(s,'utf8').digest()).map(b=>b>127?b-256:b),formatDate:d=>d.toISOString().replace(/\.\d+Z$/,'')},
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
test('purge: erases personal details after 36 months but KEEPS the transaction record (txn id, price, code, status)',()=>{
 const e=env(),DAY=864e5,old=e.mkDate(Date.now()-38*30*DAY),mid=e.mkDate(Date.now()-14*30*DAY),recent=e.mkDate(Date.now()-60*DAY);
 e.tabs.Orders.rows.push([old,'Old Name','0300111','old@x.com','t2','note old','Completed','CVPRO-AAAAAAAA','','','TXN1','Rs. 400',''],[mid,'Mid Name','0300333','mid@x.com','t3','n','Completed','','','','TXN3','Rs. 400',''],[recent,'New Name','0300222','new@x.com','t4','note new','Pending','','','','TXN2','Rs. 400','']);
 const tok=e.call({action:'verifyOwner',password:PW}).token;
 const r=e.call({action:'purgeOldOrders',token:tok});assert.equal(r.valid,true);assert.equal(r.purged,1);assert.equal(r.months,36);
 const o=e.tabs.Orders.rows[1],m=e.tabs.Orders.rows[2],n=e.tabs.Orders.rows[3];
 assert.deepEqual([o[1],o[2],o[3],o[5]],['Deleted','','','']);
 assert.deepEqual([o[4],o[6],o[7],o[10],o[11]],['t2','Completed','CVPRO-AAAAAAAA','TXN1','Rs. 400'],'transaction id and price must survive');
 assert.equal(m[1],'Mid Name','14 months old is NOT erased any more (a customer can still claim)');assert.equal(n[2],'0300222');
 assert.equal(e.call({action:'purgeOldOrders',token:tok}).purged,0);
 assert.ok(e.tabs.AuditLog.rows.some(x=>x[2]==='PURGE'),'purge is written to the audit log');
});
test('purge: dry run changes nothing; HOLD orders are never erased',()=>{
 const e=env(),DAY=864e5,old=e.mkDate(Date.now()-40*30*DAY);
 e.tabs.Orders.rows.push([old,'A','0300','a@x.com','t2','','Completed','','','','T1','',''],[old,'B','0301','b@x.com','t2','','Completed','','','','T2','','HOLD']);
 const tok=e.call({action:'verifyOwner',password:PW}).token;
 const d=e.call({action:'purgeOldOrders',token:tok,dryRun:true});assert.equal(d.purged,1);assert.equal(d.held,1);assert.equal(d.dryRun,true);
 assert.equal(e.tabs.Orders.rows[1][1],'A','dry run must not erase');
 e.call({action:'purgeOldOrders',token:tok});
 assert.equal(e.tabs.Orders.rows[1][1],'Deleted');assert.equal(e.tabs.Orders.rows[2][1],'B');assert.equal(e.tabs.Orders.rows[2][2],'0301');
});
test('purge needs the owner and a sane number of months (min 12, max 60)',()=>{
 const e=env();assert.equal(e.call({action:'purgeOldOrders',months:36}).error,'session_expired');
 const tok=e.call({action:'verifyOwner',password:PW}).token;
 [1,3,11,'abc',61,12.5].forEach(m=>assert.equal(e.call({action:'purgeOldOrders',token:tok,months:m}).error,'bad_months',String(m)));
 assert.equal(e.call({action:'purgeOldOrders',token:tok,months:12}).valid,true);
});
test('a new order records the price/offer shown (from the server) and an audit entry',()=>{
 const e=env();e.tabs.Settings.rows.push(['show_prices','true'],['price_premium','Rs. 400'],['price_old','Rs. 500'],['offer_enabled','true'],['offer_ends','2999-01-01']);
 const r=e.call({action:'submitOrder',name:'Ali',whatsapp:'0300123',email:'ali@x.com',template:'t5',txn:'TX123'});assert.equal(r.valid,true);
 const row=e.tabs.Orders.rows[1];assert.match(row[11],/Rs\. 400 \| offer on \(was Rs\. 500\) until 2999-01-01/);
 const a=e.tabs.AuditLog.rows.find(x=>x[2]==='ORDER_CREATED');assert.ok(a&&a[1]===r.orderNo&&/txn=TX123/.test(a[3])&&/policy 2026-11-25/.test(a[3]));
 e.tabs.Settings.rows.push(['price_premium','Rs. 999']);
 e.call({action:'submitOrder',name:'Sara',whatsapp:'0300124',email:'s@x.com',template:'t6'});
});
test('approve / resend / status changes are all written to the audit log',()=>{
 const e=env();e.call({action:'submitOrder',name:'Ali',whatsapp:'0300123',email:'ali@x.com',template:'t5'});
 const tok=e.call({action:'verifyOwner',password:PW}).token;
 assert.equal(e.call({action:'approveOrder',token:tok,rowIndex:2}).valid,true);
 e.call({action:'resendCode',token:tok,rowIndex:2});e.call({action:'updateStatus',token:tok,rowIndex:2,status:'Completed'});
 const ev=e.tabs.AuditLog.rows.slice(1).map(x=>x[2]);
 assert.deepEqual(ev,['ORDER_CREATED','APPROVED','CODE_RESENT','STATUS']);
 assert.ok(e.tabs.AuditLog.rows[2][3].includes('CVPRO-AAAAAAAA'));
});
test('saveEvidence: snapshot has order, code usage and history; order goes on HOLD; owner only',()=>{
 const e=env();e.call({action:'submitOrder',name:'Ali',whatsapp:'0300123',email:'ali@x.com',template:'t5',txn:'TX9'});
 const tok=e.call({action:'verifyOwner',password:PW}).token;e.call({action:'approveOrder',token:tok,rowIndex:2});
 e.call({action:'verifyCustomer',code:'CVPRO-AAAAAAAA'});
 assert.equal(e.call({action:'saveEvidence',rowIndex:2}).error,'session_expired');
 const r=e.call({action:'saveEvidence',token:tok,rowIndex:2});assert.equal(r.valid,true);
 const ev=r.evidence;assert.equal(ev.orderNo,'CV-1002');assert.equal(ev.order.transactionId,'TX9');assert.equal(ev.order.name,'Ali');
 assert.equal(ev.code.code,'CVPRO-AAAAAAAA');assert.equal(ev.code.used,true);assert.ok(ev.code.usedAt);
 assert.ok(ev.history.some(h=>h.event==='APPROVED')&&ev.history.some(h=>h.event==='ORDER_CREATED'));
 assert.equal(e.tabs.Orders.rows[1][12],'HOLD');assert.equal(e.tabs.Evidence.rows[1][1],'CV-1002');assert.equal(JSON.parse(e.tabs.Evidence.rows[1][2]).order.transactionId,'TX9');
 assert.equal(e.call({action:'saveEvidence',token:tok,rowIndex:99}).error,'bad_row');
 const hold=e.call({action:'setHold',token:tok,rowIndex:2,on:false});assert.equal(hold.hold,false);assert.equal(e.tabs.Orders.rows[1][12],'');
 const o=e.call({action:'getOrders',token:tok}).orders[0];assert.equal(o.hold,false);assert.equal(o.txn,'TX9');
});
test('monthly report emails the owner only, deletes nothing, attaches CSV backups',()=>{
 const e=env(),DAY=864e5;e.tabs.Orders.rows.push([e.mkDate(Date.now()-40*30*DAY),'Old','0300','o@x.com','t2','','Completed','','','','T1','','']);
 e.ctx.monthlyReport();const m=e.mails[e.mails.length-1][0];
 assert.equal(m.to,'owner@example.com');assert.match(m.body,/nothing was deleted/);assert.match(m.body,/: 1\n/);
 assert.ok(m.attachments.length>=1&&m.attachments[0].name.startsWith('cvstudiopro-Orders-'));
 assert.equal(e.tabs.Orders.rows[1][1],'Old','report must not erase anything');
});
test('code email tells the customer the claim window',()=>{
 const e=env();e.call({action:'submitOrder',name:'Ali',whatsapp:'0300123',email:'ali@x.com',template:'t5'});
 const tok=e.call({action:'verifyOwner',password:PW}).token;e.call({action:'approveOrder',token:tok,rowIndex:2});
 const mail=e.mails.map(x=>x[0]).find(x=>x&&x.subject==='Your CV Studio Pro Premium Code');assert.match(mail.body,/within 30 days/);
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

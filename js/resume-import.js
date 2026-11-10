/* CV Studio Pro - old resume text importer.
   Pure functions (no DOM) so they can be unit-tested in Node. Rule based, not AI:
   it finds contact details, labelled personal info and standard section headings.
   Anything it cannot place is left out rather than guessed. */
(function(root){
'use strict';
var MAX_EXP=10,MAX_EDU=10,MAX_TECH=15;
var HEAD={
 summary:['summary','professional summary','career summary','profile','professional profile','personal profile','objective','career objective','about me','about','introduction'],
 exp:['experience','work experience','professional experience','employment','employment history','work history','career history','job experience','relevant experience'],
 edu:['education','academic','academics','academic background','education and training','educational qualification','educational qualifications','qualification','qualifications','academic qualification','academic qualifications'],
 tech:['skills','technical skills','key skills','core skills','core competencies','it skills','computer skills','professional skills','skills and abilities'],
 soft:['soft skills','personal skills','strengths','personal strengths'],
 lang:['languages','language','language skills'],
 certs:['certifications','certification','certificates','courses','training','trainings','licenses','licences','courses and certifications','certifications and training'],
 projects:['projects','project','key projects','academic projects'],
 ach:['achievements','key achievements','accomplishments','awards','honors','honours','awards and achievements'],
 refs:['references','reference','referees'],
 personal:['personal information','personal details','personal data','personal particulars','bio data','biodata','bio-data'],
 skip:['hobbies','interests','hobbies and interests','declaration','extra curricular activities','extracurricular activities','activities','volunteer work','volunteering']
};
var HEAD_MAP={};
Object.keys(HEAD).forEach(function(k){HEAD[k].forEach(function(w){HEAD_MAP[w]=k})});
var BULLET=/^\s*(?:[•●▪■◦‣⁃∙·►➤✓✔*\-–—>]+|\d{1,2}[.)])\s+/;

function clean(s){return String(s==null?'':s).replace(/\r\n?/g,'\n').replace(/ /g,' ').replace(/[​-‏‪-‮﻿]/g,'').replace(/\t/g,'  ')}
function stripBullet(l){return l.replace(BULLET,'').trim()}
function isBullet(l){return BULLET.test(l)}
function headKey(line){
 var t=String(line||'').trim();
 if(!t||t.length>45||isBullet(t))return '';
 t=t.replace(/^[#=*_\-\s]+|[#=*_\-:\s]+$/g,'').replace(/\s+/g,' ').toLowerCase();
 t=t.replace(/&/g,'and');
 return HEAD_MAP[t]||'';
}
function titleCase(s){return s.toLowerCase().replace(/(^|[\s'\-])([a-zÀ-ɏ])/g,function(m,a,b){return a+b.toUpperCase()})}
function toLines(txt){return clean(txt).split('\n').map(function(l){return l.replace(/\s+$/,'')})}

var LABELS=[
 ['father',/^(?:father'?s?\s*name|father|s\/o|son of|d\/o|daughter of)\s*[:\-]\s*(.+)$/i],
 ['dob',/^(?:date\s*of\s*birth|d\.?o\.?b\.?|birth\s*date|born)\s*[:\-]\s*(.+)$/i],
 ['cnic',/^(?:cnic|c\.n\.i\.c|nic|national\s*id|id\s*card(?:\s*no)?\.?|cnic\s*(?:no|number)\.?)\s*[:#\-]\s*(.+)$/i],
 ['marital',/^marital\s*status\s*[:\-]\s*(.+)$/i],
 ['nationality',/^nationality\s*[:\-]\s*(.+)$/i],
 ['domicile',/^domicile\s*[:\-]\s*(.+)$/i],
 ['religion',/^religion\s*[:\-]\s*(.+)$/i],
 ['address',/^(?:address|current\s*address|location|residence)\s*[:\-]\s*(.+)$/i],
 ['phone',/^(?:phone|mobile|cell|contact|tel|telephone|whatsapp)(?:\s*(?:no|number|#))?\.?\s*[:\-]\s*(.+)$/i],
 ['email',/^e-?mail(?:\s*address)?\s*[:\-]\s*(.+)$/i]
];
function labelled(line){
 var t=stripBullet(line);
 for(var i=0;i<LABELS.length;i++){var m=t.match(LABELS[i][1]);if(m)return [LABELS[i][0],m[1].trim()]}
 return null;
}

function findEmail(lines){
 for(var i=0;i<lines.length;i++){var m=lines[i].match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i);if(m)return m[0]}
 return '';
}
var DATEISH=/^(?:\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|(?:19|20)\d{2}\s*[\-–—to]+\s*(?:(?:19|20)\d{2}|present|current|now))$/i;
function phoneCandidates(line){
 var out=[],re=/(?:\+|00)?\(?\d[\d\s().\-]{7,20}\d/g,m;
 while((m=re.exec(line))){
  var raw=m[0].trim(),digits=raw.replace(/\D/g,'');
  if(digits.length<9||digits.length>15)continue;
  if(DATEISH.test(raw))continue;
  if(/^\d{5}-\d{7}-\d$/.test(raw))continue;
  if(/^(?:19|20)\d{2}[\s\-]+(?:19|20)\d{2}/.test(raw)&&digits.length<=10)continue;
  out.push(raw.replace(/\s{2,}/g,' '));
 }
 return out;
}
function findPhone(lines,headerEnd){
 var skip=/cnic|\bnic\b|id\s*card|passport|national\s*id|date\s*of\s*birth|\bdob\b/i;
 function scan(from,to){
  for(var i=from;i<to;i++){
   if(skip.test(lines[i]))continue;
   var c=phoneCandidates(lines[i]);if(c.length)return c[0];
  }
  return '';
 }
 return scan(0,headerEnd)||scan(headerEnd,lines.length);
}

function isShortWords(l,max){return l.split(/\s+/).length<=max}
function splitItems(blockLines){
 var items=[];
 blockLines.forEach(function(l){
  var t=stripBullet(l);if(!t)return;
  t.split(/\s*[,;|•·]\s*/).forEach(function(x){
   x=x.replace(/^[A-Za-z ]{2,20}:\s+(?=\S)/,'').trim();
   if(x&&x.length<=60)items.push(x);
  });
 });
 var seen={},out=[];
 items.forEach(function(x){var k=x.toLowerCase();if(!seen[k]){seen[k]=1;out.push(x)}});
 return out;
}
function datesOnly(l){return /^\(?(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?(?:19|20)\d{2}\)?\s*(?:[\-–—]|to)\s*\(?(?:(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?(?:19|20)\d{2}|present|current|now)\)?$/i.test(l.trim())}

function splitEntries(blockLines){
 var entries=[],cur=null,prevBlank=true,prevBullet=false;
 blockLines.forEach(function(l){
  var t=l.trim();
  if(!t){prevBlank=true;return}
  var b=isBullet(t);
  if(!b&&(prevBlank||prevBullet)){cur={head:[],body:[],started:false};entries.push(cur)}
  else if(!cur){cur={head:[],body:[],started:false};entries.push(cur)}
  if(b){cur.started=true;cur.body.push(stripBullet(t))}
  else if(!cur.started&&cur.head.length<3&&t.length<=90&&!/[.!?]$/.test(t)){cur.head.push(t)}
  else{cur.started=true;cur.body.push(t)}
  prevBlank=false;prevBullet=b;
 });
 return entries.map(function(e){
  var head=e.head.slice(),t=head.shift()||'',c='';
  if(head.length){
   var dates=head.filter(datesOnly),rest=head.filter(function(x){return !datesOnly(x)});
   c=rest.join(', ');
   if(dates.length)c=(c?c+' | ':'')+dates.join(' ');
  }
  if(!c&&t){var m=t.match(/^(.+?)\s+(?:at|@|–|—|\|)\s+(.+)$/i);if(m){t=m[1].trim();c=m[2].trim()}}
  return {t:t,c:c,d:e.body.join('\n')};
 }).filter(function(x){return x.t||x.c||x.d});
}

function parseResumeText(input){
 var res={name:'',job:'',email:'',phone:'',address:'',summary:'',father:'',dob:'',cnic:'',marital:'',nationality:'',domicile:'',religion:'',
  exp:[],edu:[],tech:[],soft:[],lang:[],certs:[],projects:[],achievements:[],refs:'',found:[]};
 var lines=toLines(input);
 if(!lines.some(function(l){return l.trim()}))return res;
 var sections=[],head=[],cur=null;
 lines.forEach(function(l){
  var k=headKey(l);
  if(k){cur={key:k,lines:[]};sections.push(cur)}
  else if(cur)cur.lines.push(l);
  else head.push(l);
 });
 var headEnd=head.length;
 var headTrim=head.filter(function(l){return l.trim()});
 /* contact */
 res.email=findEmail(lines);
 res.phone=findPhone(lines,headEnd||lines.length);
 /* labelled lines anywhere */
 lines.forEach(function(l){
  var lb=labelled(l);if(!lb)return;
  var k=lb[0],v=lb[1];
  if(k==='phone'){var c=phoneCandidates(v);if(c.length&&!res.phone)res.phone=c[0];return}
  if(k==='email')return;
  if(!res[k])res[k]=v.slice(0,120);
 });
 /* name and job title */
 var idx=0;
 function usable(l){
  var t=l.trim();
  return t&&!/@/.test(t)&&!/\d{3}/.test(t)&&!labelled(t)&&!/^(?:resume|curriculum vitae|c\.?v\.?|cv|resume of|bio-?data)$/i.test(t.replace(/[:\-]/g,'').trim());
 }
 for(;idx<headTrim.length;idx++){
  var t=headTrim[idx].trim();
  if(usable(t)&&isShortWords(t,5)&&t.length<=45){
   res.name=(t===t.toUpperCase()&&/[A-Z]/.test(t))?titleCase(t):t;idx++;break;
  }
 }
 if(res.name){
  for(;idx<headTrim.length&&idx<4;idx++){
   var j=headTrim[idx].trim();
   if(usable(j)&&j.length<=60&&isShortWords(j,8)&&!/[.!?]$/.test(j)){res.job=j;break}
   if(/@/.test(j)||/\d{5}/.test(j))continue;
  }
 }
 /* sections */
 sections.forEach(function(s){
  var body=s.lines;
  switch(s.key){
   case 'summary':
    var sm=body.map(stripBullet).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    if(sm&&!res.summary)res.summary=sm.slice(0,1200);break;
   case 'exp':res.exp=res.exp.concat(splitEntries(body));break;
   case 'edu':res.edu=res.edu.concat(splitEntries(body));break;
   case 'tech':res.tech=res.tech.concat(splitItems(body));break;
   case 'soft':res.soft=res.soft.concat(splitItems(body));break;
   case 'lang':res.lang=res.lang.concat(splitItems(body));break;
   case 'certs':res.certs=res.certs.concat(body.map(stripBullet).filter(Boolean));break;
   case 'projects':res.projects=res.projects.concat(body.map(stripBullet).filter(Boolean));break;
   case 'ach':res.achievements=res.achievements.concat(body.map(stripBullet).filter(Boolean));break;
   case 'refs':res.refs=(res.refs?res.refs+'\n':'')+body.map(function(x){return x.trim()}).filter(Boolean).join('\n');break;
  }
 });
 res.exp=res.exp.slice(0,MAX_EXP);res.edu=res.edu.slice(0,MAX_EDU);
 res.tech=res.tech.slice(0,MAX_TECH);
 ['name','job','email','phone','address','summary','father','dob','cnic','marital','nationality','domicile','religion'].forEach(function(k){if(res[k])res.found.push(k)});
 if(res.exp.length)res.found.push('experience');if(res.edu.length)res.found.push('education');
 if(res.tech.length)res.found.push('skills');if(res.lang.length)res.found.push('languages');
 if(res.certs.length)res.found.push('certifications');if(res.projects.length)res.found.push('projects');
 return res;
}

/* Writes parsed values into a builder form object. Only fields that were found are changed. */
function applyParsed(form,p){
 ['name','job','email','phone','address','summary','father','dob','cnic','marital','nationality','domicile','religion'].forEach(function(k){if(p[k])form[k]=p[k]});
 function fill(list,pre,more){
  if(!list.length)return;
  form[pre+'1t']=list[0].t;form[pre+'1c']=list[0].c;form[pre+'1d']=list[0].d;
  var second=list[1]||{t:'',c:'',d:''};
  form[pre+'2t']=second.t;form[pre+'2c']=second.c;form[pre+'2d']=second.d;
  form[more]=list.slice(2).map(function(x){return {t:x.t,c:x.c,d:x.d}});
 }
 fill(p.exp,'exp','expMore');fill(p.edu,'edu','eduMore');
 if(p.tech.length)form.tech=p.tech.map(function(n){return {name:n,level:80}});
 if(p.soft.length)form.soft=p.soft.join(' | ');
 if(p.lang.length)form.lang=p.lang.join(' | ');
 if(p.certs.length)form.certs=p.certs.join('|');
 if(p.projects.length)form.projects=p.projects.join('|');
 if(p.achievements.length)form.achievements=p.achievements.join('\n');
 if(p.refs)form.refs=p.refs;
 return form;
}
function importSummary(p){
 var n=[];
 if(p.name)n.push('name');if(p.job)n.push('job title');if(p.email)n.push('email');if(p.phone)n.push('phone');
 if(p.exp.length)n.push(p.exp.length+' experience');if(p.edu.length)n.push(p.edu.length+' education');
 if(p.tech.length)n.push(p.tech.length+' skills');if(p.lang.length)n.push('languages');if(p.summary)n.push('summary');
 if(!n.length)return 'Nothing could be recognised. Paste the text with headings such as Experience, Education and Skills, or fill the form by hand.';
 return 'Imported: '+n.join(', ')+'. Please review every step before exporting.';
}
var api={parseResumeText:parseResumeText,applyParsed:applyParsed,importSummary:importSummary};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.ResumeImport=api;
})(typeof window!=='undefined'?window:this);

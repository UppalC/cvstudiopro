/* CV Studio Pro - ATS-style CV checker.
   Rule based, not AI, and not a real ATS. It runs entirely in the browser; nothing is sent anywhere.
   Pure function so it can be unit-tested in Node. Needs ResumeImport (js/resume-import.js). */
(function(root){
'use strict';
var BULLET=/^\s*(?:[•●▪■◦‣⁃∙·►➤✓✔*\-–—>])\s+/;
var STOP=('about above after again against also among and any are because been before being between both but can could did does doing done down during each either else ever every few for from further had has have having her here hers him his how into its itself just may might more most must need needs not now off once only other our out over own per same shall she should some such than that the their them then there these they this those through too under until upon very was were what when where which while who whom why will with within without would you your yours able ability applicant applicants apply applying candidate candidates company role roles position positions job jobs team teams work working works worker looking required requirements requirement preferred preferably responsibilities responsibility duties include includes including must strong good great excellent knowledge skills skill experience experienced years year plus etc well new join using use used based high ideal successful opportunity employer hiring seeking will want like make making take help helps support supports provide provides across both level time full part day days week weekly daily monthly').split(' ');
var STOPSET={};STOP.forEach(function(w){STOPSET[w]=1});

function words(t){return (String(t).toLowerCase().match(/[a-z0-9][a-z0-9+#.\-]*/g)||[])}
function add(list,id,status,title,detail){list.push({id:id,status:status,title:title,detail:detail})}
function keywordsOf(job){
 var f={},order=[];
 words(job).forEach(function(w){
  w=w.replace(/[.\-]+$/,'');
  if(w.length<3||/^\d+$/.test(w)||STOPSET[w])return;
  if(w.length<4&&!/^[a-z]{2,4}$/.test(w))return;
  if(!f[w]){f[w]=0;order.push(w)}f[w]++;
 });
 order.sort(function(a,b){return f[b]-f[a]||order.indexOf(a)-order.indexOf(b)});
 return order.slice(0,20);
}

function analyze(cvText,jobText){
 var out={empty:false,checks:[],passed:0,total:0,words:0,matched:[],missing:[]};
 var text=String(cvText==null?'':cvText).slice(0,60000);
 if(!text.replace(/\s/g,'')){out.empty=true;return out}
 var RI=root.ResumeImport||(typeof require==='function'?require('./resume-import.js'):null);
 var p=RI.parseResumeText(text),c=out.checks;
 var lines=text.replace(/\r\n?/g,'\n').split('\n');
 out.words=words(text).length;

 p.name?add(c,'name','pass','Your name is on the first line','Found: '+p.name+'.'):add(c,'name','warn','Put your full name on the first line','Recruiters and ATS software look for the name at the very top, on its own line.');
 p.email?add(c,'email','pass','Email address found','Found: '+p.email+'.'):add(c,'email','fail','No email address found','Add a simple email address as plain text (not inside an image).');
 p.phone?add(c,'phone','pass','Phone number found','Found: '+p.phone+'. Write it with the country code if you apply abroad.'):add(c,'phone','fail','No phone number found','Add a phone or WhatsApp number as plain text, for example +971 50 123 4567.');

 p.exp.length?add(c,'experience','pass','Work Experience section found',p.exp.length+' job'+(p.exp.length>1?'s':'')+' recognised.'):add(c,'experience','fail','No Work Experience section found','Use a clear heading such as "Experience" or "Work Experience". Freshers can use "Projects" and "Internship" but still need a heading.');
 p.edu.length?add(c,'education','pass','Education section found',p.edu.length+' entr'+(p.edu.length>1?'ies':'y')+' recognised.'):add(c,'education','fail','No Education section found','Add a heading called "Education" with your degree, institute and years.');
 p.tech.length?add(c,'skills','pass','Skills section found',p.tech.length+' skills recognised.'):add(c,'skills','fail','No Skills section found','Add a heading called "Skills" and list your skills separated by commas.');
 if(p.tech.length){
  if(p.tech.length<5)add(c,'skillcount','warn','Very few skills listed','Most CVs list between 6 and 15 relevant skills.');
  else if(p.tech.length>25)add(c,'skillcount','warn','Too many skills listed','Keep to the skills that match the job. A very long list looks unfocused.');
  else add(c,'skillcount','pass','A sensible number of skills','Between 5 and 25 skills.');
 }
 if(!p.summary)add(c,'summary','info','No summary found','A 2 to 3 line summary at the top helps, especially for experienced applicants. It is optional.');

 if(out.words<150)add(c,'length','warn','The CV is very short','Only about '+out.words+' words. Add more detail about what you did and achieved.');
 else if(out.words>1000)add(c,'length','warn','The CV is very long','About '+out.words+' words. Most employers read 1 to 2 pages; cut older or less relevant details.');
 else add(c,'length','pass','Length looks reasonable','About '+out.words+' words.');

 var bullets=lines.filter(function(l){return BULLET.test(l)}).map(function(l){return l.replace(BULLET,'').trim()});
 bullets.length>=3?add(c,'bullets','pass','Bullet points are used','Short bullets are easy for people and software to read.'):add(c,'bullets','warn','Use short bullet points for your duties','Start each bullet with an action word such as "Managed", "Prepared" or "Reduced".');
 var longB=bullets.filter(function(b){return b.split(/\s+/).length>35}).length;
 if(bullets.length){longB?add(c,'bulletlen','warn',longB+' bullet'+(longB>1?'s are':' is')+' too long','Keep each bullet to one or two lines (about 15 to 30 words).'):add(c,'bulletlen','pass','Bullets are a good length','No very long bullets.')}

 if(p.exp.length){
  var expLines=[];p.exp.forEach(function(e){String(e.d||'').split('\n').forEach(function(x){if(x.trim())expLines.push(x)})});
  var withNum=expLines.filter(function(x){return /\d/.test(x)}).length;
  withNum>=2?add(c,'numbers','pass','Results are backed by numbers',withNum+' lines contain figures.'):add(c,'numbers','warn','Add numbers to your achievements','Say how many, how much or how often, for example "Managed 200+ invoices per month".');
  var hasYear=p.exp.some(function(e){return /(?:19|20)\d{2}/.test((e.t||'')+' '+(e.c||'')+' '+(e.d||''))});
  hasYear?add(c,'dates','pass','Dates are present','Years were found in your experience.'):add(c,'dates','warn','Add dates to your jobs','Write the start and end year for every job, for example 2021 - Present.');
 }

 var cols=lines.filter(function(l){return /\S {3,}\S/.test(l)||/\t/.test(l)}).length,pipes=lines.filter(function(l){return (l.match(/\|/g)||[]).length>=3}).length;
 (cols>=5||pipes>=5)?add(c,'layout','warn','The text looks like it came from a table or columns','Some ATS software reads columns in the wrong order. A single-column layout is safer.'):add(c,'layout','pass','Single-column text','No sign of tables or columns.');
 var fp=lines.filter(function(l){return /^\s*(?:[•*\-]\s*)?I(?:\s|'m\s)/.test(l)}).length;
 if(fp>=3)add(c,'firstperson','warn','Many lines start with "I"','CVs read better without "I". Write "Managed a team of 5" instead of "I managed a team of 5".');
 else add(c,'firstperson','pass','No overuse of "I"','Lines do not start with "I".');

 if(jobText&&String(jobText).replace(/\s/g,'')){
  var kw=keywordsOf(String(jobText).slice(0,30000)),cvw={};words(text).forEach(function(w){cvw[w.replace(/[.\-]+$/,'')]=1});
  kw.forEach(function(k){(cvw[k]?out.matched:out.missing).push(k)});
  if(kw.length){
   var ratio=out.matched.length/kw.length;
   var st=ratio>=0.6?'pass':ratio>=0.3?'warn':'fail';
   add(c,'keywords',st,out.matched.length+' of '+kw.length+' main words from the job ad are in your CV',
    out.missing.length?'Missing: '+out.missing.join(', ')+'. Add the ones that are true for you, using the same wording as the ad.':'Great match with the wording of the ad.');
  }
 }
 c.forEach(function(x){if(x.status!=='info'){out.total++;if(x.status==='pass')out.passed++}});
 return out;
}
var api={analyze:analyze};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ATSChecker=api;
})(typeof window!=='undefined'?window:this);

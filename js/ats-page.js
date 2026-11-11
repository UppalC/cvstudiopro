/* Wires the ATS checker page. User text is only ever written with textContent (no HTML injection). Nothing is sent or stored. */
(function(){
 'use strict';
 var cv=document.getElementById('atsCv'),job=document.getElementById('atsJob'),btn=document.getElementById('atsGo'),clr=document.getElementById('atsClear'),out=document.getElementById('atsOut');
 if(!cv||!btn||!out||!window.ATSChecker)return;
 var TAG={pass:'Good',warn:'Improve',fail:'Missing',info:'Tip'};
 function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
 function show(r){
  out.textContent='';
  if(r.empty){out.appendChild(el('p','ats-msg','Please paste your CV text first.'));return}
  var s=el('div','ats-score',r.passed+' of '+r.total+' checks passed');
  s.appendChild(el('small','','This is a simple checklist, not a real ATS score. Fix the items marked Missing and Improve first.'));
  out.appendChild(s);
  var ul=el('ul','ats-list');
  r.checks.forEach(function(c){
   var li=el('li','ats-item ats-'+c.status),tag=el('span','ats-tag',TAG[c.status]||''),box=el('div');
   box.appendChild(el('b','',c.title));box.appendChild(el('span','d',c.detail));
   li.appendChild(tag);li.appendChild(box);ul.appendChild(li);
  });
  out.appendChild(ul);
  var a=el('p');a.appendChild(document.createTextNode('Ready to fix it? '));var l=el('a','','Open the CV builder');l.href='builder.html';a.appendChild(l);
  a.appendChild(document.createTextNode(' and use "Import old resume text" to start from this text.'));out.appendChild(a);
  out.setAttribute('tabindex','-1');out.focus({preventScroll:false});
 }
 btn.addEventListener('click',function(){show(window.ATSChecker.analyze(cv.value,job?job.value:''))});
 if(clr)clr.addEventListener('click',function(){cv.value='';if(job)job.value='';out.textContent='';cv.focus()});
})();

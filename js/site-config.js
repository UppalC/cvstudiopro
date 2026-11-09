/* CV Studio Pro: lightweight owner-controlled settings for static pages (site name, demo video).
   The big builder pages do the same inside app.js. Public data only, no secrets. */
(function(){
  var API='https://script.google.com/macros/s/AKfycbwR0RepXaL9xhnf2XXqbxnaJ3jx7g4ih7oxD3NhYMeHDWtUrsj_EojVlBgEKZqqc5M/exec';
  var KEY='cvStudioSettingsCache';
  function name(n){
    n=String(n||'').replace(/[<>]/g,'').trim().slice(0,40);if(!n)return;
    var parts=n.split(/\s+/),last=parts.length>1?parts.pop():'';
    document.querySelectorAll('.nav .brand').forEach(function(b){
      b.textContent='';b.appendChild(document.createTextNode(last?parts.join(' ')+' ':n));
      if(last){var sp=document.createElement('span');sp.textContent=last;b.appendChild(sp)}
    });
    document.querySelectorAll('.sf-brand b').forEach(function(b){b.textContent=n});
  }
  function embed(u){
    u=String(u||'').trim();var m;
    if((m=u.match(/^https:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([\w-]{11})(?:[&#]|$)/))||(m=u.match(/^https:\/\/youtu\.be\/([\w-]{11})(?:[?#]|$)/))||(m=u.match(/^https:\/\/(?:www\.)?youtube\.com\/(?:shorts|embed)\/([\w-]{11})(?:[?#]|$)/)))return 'https://www.youtube-nocookie.com/embed/'+m[1];
    if((m=u.match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]{10,})(?:[\/?#]|$)/)))return 'https://drive.google.com/file/d/'+m[1]+'/preview';
    return '';
  }
  function video(u){
    var box=document.getElementById('demoVideoBox');if(!box)return;
    var src=embed(u);
    if(!src){box.hidden=true;box.textContent='';box.removeAttribute('data-src');return}
    if(box.getAttribute('data-src')===src)return;
    box.setAttribute('data-src',src);box.textContent='';
    var h=document.createElement('h2');h.textContent='Watch: how to make a CV';
    var w=document.createElement('div');w.className='demo-frame';
    var f=document.createElement('iframe');f.src=src;f.title='CV Studio Pro demo video';f.loading='lazy';
    f.setAttribute('allow','fullscreen; picture-in-picture');f.setAttribute('allowfullscreen','');f.referrerPolicy='strict-origin-when-cross-origin';
    w.appendChild(f);box.appendChild(h);box.appendChild(w);box.hidden=false;
  }
  function apply(s){if(!s)return;try{name(s.site_name)}catch(e){}try{video(s.demo_video)}catch(e){}}
  var cache=null;try{cache=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}
  if(cache&&cache.s)apply(cache.s);
  if(cache&&cache.t&&Date.now()-cache.t<600000)return;      // fresh enough: no network call
  fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'getSettings'})})
    .then(function(r){return r.json()})
    .then(function(d){if(d&&d.valid&&d.settings){try{localStorage.setItem(KEY,JSON.stringify({t:Date.now(),s:d.settings}))}catch(e){}apply(d.settings)}})
    .catch(function(){});
})();

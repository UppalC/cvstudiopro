/* CV Studio Pro - cookie consent. Google Analytics loads ONLY after the visitor accepts. */
(function(){
  var GA_ID='G-P6MNCV79XR',KEY='cvStudioConsent',bar=null,loaded=false;
  function read(){try{var v=JSON.parse(localStorage.getItem(KEY)||'null');return v&&(v.a===true||v.a===false)?v.a:null}catch(e){return null}}
  function save(a){try{localStorage.setItem(KEY,JSON.stringify({a:a,t:Date.now()}))}catch(e){}}
  function loadGA(){
    if(loaded)return;loaded=true;window['ga-disable-'+GA_ID]=false;
    window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments)};
    window.gtag('js',new Date());window.gtag('config',GA_ID);
    var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(GA_ID);document.head.appendChild(s);
  }
  function stopGA(){
    window['ga-disable-'+GA_ID]=true;
    try{document.cookie.split(';').forEach(function(c){var n=c.split('=')[0].trim();if(n==='_ga'||n.indexOf('_ga_')===0||n==='_gid'||n==='_gat'){['',location.hostname,'.'+location.hostname].forEach(function(d){document.cookie=n+'=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'+(d?'; domain='+d:'')})}})}catch(e){}
  }
  function close(){if(bar&&bar.parentNode)bar.parentNode.removeChild(bar);bar=null}
  function choose(a){save(a);if(a)loadGA();else stopGA();close()}
  function show(){
    if(bar)return;
    bar=document.createElement('div');bar.className='cc-bar';bar.setAttribute('role','dialog');bar.setAttribute('aria-label','Cookie choice');
    bar.innerHTML='<div class="cc-text"><b>Cookies</b><p>We use essential storage so the builder works. With your permission we also use Google Analytics to understand which pages are useful. See our <a href="cookies.html">Cookie Policy</a>.</p></div><div class="cc-actions"><button type="button" class="cc-btn cc-no">Decline</button><button type="button" class="cc-btn cc-yes">Accept analytics</button></div>';
    document.body.appendChild(bar);
    bar.querySelector('.cc-yes').addEventListener('click',function(){choose(true)});
    bar.querySelector('.cc-no').addEventListener('click',function(){choose(false)});
    try{bar.querySelector('.cc-yes').focus({preventScroll:true})}catch(e){}
  }
  function init(){
    var c=read();if(c===true)loadGA();else if(c===null)show();
    document.addEventListener('click',function(e){var t=e.target&&e.target.closest&&e.target.closest('[data-cookie-settings]');if(t){e.preventDefault();show()}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

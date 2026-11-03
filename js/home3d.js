/* Home page hero: the card under the pointer (or tapped / focused) comes to the front; click opens it in the builder.
   Idle: cards take turns automatically. Pointer parallax tilt on hover devices. No data is collected. */
(function(){
 try{var n=document.getElementById('tplCount2');if(n&&typeof templates!=='undefined')n.textContent=templates.length}catch(e){}
 var hero=document.querySelector('.hero.home3d'),stage=hero&&hero.querySelector('.stage');
 if(!stage)return;
 var cards=[].slice.call(stage.querySelectorAll('.fan')),name=document.getElementById('fanName'),cur=-1,timer=0,paused=false;
 var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 var hover=window.matchMedia&&matchMedia('(hover: hover)').matches;
 cards.forEach(function(c,k){c.style.setProperty('--i',k)});
 function show(k){if(k===cur)return;cur=k;cards.forEach(function(c,j){c.classList.toggle('on',j===k)});if(name)name.textContent=cards[k].getAttribute('data-name')||''}
 function start(){if(reduce||timer)return;timer=setInterval(function(){if(!paused&&!document.hidden)show((cur+1)%cards.length)},3200)}
 show(2);start();
 cards.forEach(function(c,k){
    c.addEventListener('focus',function(){paused=true;show(k)});
 });
 var fan=hero.querySelector('.hero-fan');
 function nearest(x){var r=stage.getBoundingClientRect(),f=(x-r.left)/r.width*100,best=0,bd=1e9;for(var k=0;k<cards.length;k++){var d=Math.abs(f-(20+k*15.5));if(d<bd){bd=d;best=k}}return best}
 stage.addEventListener('click',function(e){var b=nearest(e.clientX);if(b!==cur){e.preventDefault();paused=true;show(b)}});
 fan.addEventListener('pointermove',function(e){if(e.pointerType!=='mouse')return;paused=true;show(nearest(e.clientX))});
 fan.addEventListener('pointerleave',function(){paused=false});
 if(reduce||!hover)return;
 var raf=0,nx=0,ny=0;
 function apply(){raf=0;stage.style.setProperty('--ry',(-8+nx*8).toFixed(2)+'deg');stage.style.setProperty('--rx',(5-ny*6).toFixed(2)+'deg')}
 hero.addEventListener('pointermove',function(e){var r=hero.getBoundingClientRect();nx=((e.clientX-r.left)/r.width-.5)*2;ny=((e.clientY-r.top)/r.height-.5)*2;if(!raf)raf=requestAnimationFrame(apply)});
 hero.addEventListener('pointerleave',function(){nx=0;ny=0;if(!raf)raf=requestAnimationFrame(apply)});
})();

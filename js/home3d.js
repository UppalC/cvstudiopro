/* Home page: pointer parallax for the 3D hero stage + live template count in the chip. No data is collected. */
(function(){
 try{var n=document.getElementById('tplCount2');if(n&&typeof templates!=='undefined')n.textContent=templates.length}catch(e){}
 var hero=document.querySelector('.hero.home3d'),stage=hero&&hero.querySelector('.stage');
 if(!stage||!window.matchMedia)return;
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||!window.matchMedia('(hover: hover)').matches)return;
 var raf=0,nx=0,ny=0;
 function apply(){raf=0;stage.style.setProperty('--ry',(-16+nx*14).toFixed(2)+'deg');stage.style.setProperty('--rx',(7-ny*10).toFixed(2)+'deg')}
 hero.addEventListener('pointermove',function(e){var r=hero.getBoundingClientRect();nx=((e.clientX-r.left)/r.width-.5)*2;ny=((e.clientY-r.top)/r.height-.5)*2;if(!raf)raf=requestAnimationFrame(apply)});
 hero.addEventListener('pointerleave',function(){nx=0;ny=0;if(!raf)raf=requestAnimationFrame(apply)});
})();

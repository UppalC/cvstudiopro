"""Guide page video: built-in video by default, YouTube link from admin wins, cleared link returns. Run: python3 tests/e2e_guide_video.py"""
import json,os,subprocess,sys,time
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT='8765';F=[];N=[0]
def ok(c,m):
    N[0]+=1
    if not c:F.append(m)
    print('ok  ' if c else 'FAIL',m)
S={}
def handler(route):
    route.fulfill(status=200,headers={'access-control-allow-origin':'*','content-type':'application/json'},body=json.dumps({'valid':True,'settings':S}))
srv=subprocess.Popen(['python3','-m','http.server',PORT,'-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
U=f'http://localhost:{PORT}/guide.html'
try:
 with sync_playwright() as p:
  br=p.chromium.launch()
  for lab,vp in [('phone',{'width':390,'height':800}),('desktop',{'width':1280,'height':720})]:
    cx=br.new_context(viewport=vp);pg=cx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('https://script.google.com/**',handler);pg.goto(U);pg.wait_for_timeout(800)
    ok(pg.is_visible('#demoVideoBox video'),lab+': built-in video shows when no YouTube link is set')
    ok(pg.get_attribute('#demoVideoBox video source','src')=='video/guide-video.mp4' and pg.get_attribute('#demoVideoBox track','src')=='video/guide-video.ur.vtt' and pg.get_attribute('#demoVideoBox track','srclang')=='ur','%s: video + Urdu subtitle track wired'%lab)
    ok(pg.evaluate("document.querySelector('#demoVideoBox video').controls")==True,lab+': has controls')
    ok(not pg.evaluate('document.documentElement.scrollWidth>innerWidth'),lab+': no sideways scroll')
    r=pg.request.get(U.replace('guide.html','video/guide-video.ur.vtt'));ok(r.status==200 and 'WEBVTT' in r.text(),lab+': subtitle file is served')
    r=pg.request.get(U.replace('guide.html','video/guide-video.mp4'));ok(r.status==200,lab+': video file is served')
    S['demo_video']='https://youtu.be/abcdefghijk';pg.evaluate("localStorage.clear()");pg.goto(U);pg.wait_for_timeout(800)
    ok(pg.is_visible('#demoVideoBox iframe') and not pg.query_selector('#demoVideoBox video') and 'youtube-nocookie.com/embed/abcdefghijk' in pg.get_attribute('#demoVideoBox iframe','src'),lab+': a YouTube link set in admin replaces the built-in video')
    S['demo_video']='';pg.evaluate("localStorage.clear()");pg.goto(U);pg.wait_for_timeout(800)
    ok(pg.is_visible('#demoVideoBox video'),lab+': clearing the link brings the built-in video back')
    ok(not errs,lab+': no JS errors '+';'.join(errs)[:100]);cx.close()
finally: srv.terminate()
print(f'\n{N[0]-len(F)}/{N[0]} passed');sys.exit(1 if F else 0)

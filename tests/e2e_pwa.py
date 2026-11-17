"""PWA test: installability, service worker, offline. Served under /cvstudiopro/ like GitHub Pages. Run from repo root: python3 tests/e2e_pwa.py"""
import json,os,subprocess,sys,time,tempfile
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT='8762';F=[];N=[0]
def ok(c,m):
    N[0]+=1
    if not c:F.append(m)
    print('ok  ' if c else 'FAIL',m)
site=tempfile.mkdtemp();os.symlink(ROOT,os.path.join(site,'cvstudiopro'))
srv=subprocess.Popen(['python3','-m','http.server',PORT,'-d',site],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
U=f'http://localhost:{PORT}/cvstudiopro/'
try:
 with sync_playwright() as p:
  br=p.chromium.launch();ctx=br.new_context(viewport={'width':390,'height':800});pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
  ext=[]
  pg.route('https://script.google.com/**',lambda r:(ext.append(r.request.url),r.fulfill(status=200,headers={'access-control-allow-origin':'*','content-type':'application/json'},body='{"valid":true}')))
  pg.goto(U+'builder.html');pg.wait_for_function("navigator.serviceWorker.ready.then(()=>true)",timeout=10000)
  pg.wait_for_function("navigator.serviceWorker.controller||true");pg.reload();pg.wait_for_timeout(800)
  ok(pg.evaluate("!!navigator.serviceWorker.controller"),'service worker controls the page after a reload')
  ok(pg.evaluate("navigator.serviceWorker.controller.scriptURL").endswith('/cvstudiopro/sw.js'),'worker lives at the site root of /cvstudiopro/')
  cdp=ctx.new_cdp_session(pg);r=cdp.send('Page.getInstallabilityErrors');ok(r.get('installabilityErrors')==[],'Chrome reports no installability errors '+json.dumps(r)[:150])
  mf=cdp.send('Page.getAppManifest');ok(not mf.get('errors') and mf['url'].endswith('manifest.webmanifest'),'manifest parses without errors '+json.dumps(mf.get('errors'))[:120])
  pg.goto(U+'templates.html');pg.wait_for_timeout(600);pg.goto(U+'admin.html');pg.wait_for_timeout(600);pg.goto(U+'builder.html');pg.wait_for_timeout(800)
  keys=pg.evaluate("caches.keys().then(async k=>{const o={};for(const n of k){o[n]=(await (await caches.open(n)).keys()).map(r=>new URL(r.url).pathname)}return o})")
  allp=[x for v in keys.values() for x in v]
  ok(any(x.endswith('/builder.html') for x in allp) and any(x.endswith('/js/app.js') for x in allp),'builder and app.js are cached '+str(len(allp))+' files')
  ok(not any('admin' in x for x in allp),'admin.html is never cached')
  ok(not any('script.google' in x for x in allp),'no Google Apps Script response cached')
  ok(len(keys)==1,'only one cache exists '+str(list(keys)))
  ctx.set_offline(True)
  pg.goto(U+'builder.html');pg.wait_for_timeout(1000)
  ok(pg.locator('text=Make your CV in 4 easy steps').count()>0 or pg.locator('.tpl-card').count()>5,'builder opens with no internet')
  pg.get_by_role('button',name='Start with my own details').click();pg.wait_for_timeout(300)
  pg.locator('.formpanel [placeholder^="e.g. Ali Raza"]').first.fill('Offline Test');pg.wait_for_timeout(300)
  ok('Offline Test' in pg.inner_text('#cvPreview'),'CV preview still updates offline')
  pg.goto(U+'templates.html');pg.wait_for_timeout(800)
  ok(pg.locator('h1').count()==1,'a page visited earlier also opens offline')
  try:pg.goto(U+'admin.html');gone=False
  except Exception:gone=True
  ok(gone,'admin is not served from cache offline (network only)')
  ctx.set_offline(False)
  # ---- admin app: separate installable app limited to admin.html ----
  ap=ctx.new_page();ap.route('https://script.google.com/**',lambda r:r.fulfill(status=200,headers={'access-control-allow-origin':'*','content-type':'application/json'},body='{"valid":false}'))
  ap.goto(U+'admin.html');ap.wait_for_timeout(1500);ap.reload();ap.wait_for_timeout(800)
  ac=ctx.new_cdp_session(ap);ar=ac.send('Page.getInstallabilityErrors');ok(ar.get('installabilityErrors')==[],'admin page is installable '+json.dumps(ar)[:150])
  am=ac.send('Page.getAppManifest');ok(am['url'].endswith('admin-manifest.webmanifest') and not am.get('errors'),'admin page uses the admin manifest')
  ok(json.loads(am['data'])['id'].endswith('admin.html') and json.loads(am['data'])['scope']=='./admin.html','admin app scope is only admin.html')
  ap.goto(U+'builder.html');ap.wait_for_timeout(500)
  ok(ap.evaluate("document.querySelector('link[rel=manifest]').href").endswith('/manifest.webmanifest'),'public pages still use the public manifest')
  ok(not errs,'no JavaScript errors '+';'.join(errs)[:120])
finally: srv.terminate()
print(f'\n{N[0]-len(F)}/{N[0]} passed');sys.exit(1 if F else 0)

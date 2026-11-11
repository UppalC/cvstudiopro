"""Admin page test with a fake backend (no Google needed). Run from repo root: python3 tests/e2e_admin.py"""
import json,os,subprocess,sys,time
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT='8761';F=[];N=[0]
def ok(c,m):
    N[0]+=1
    if not c:F.append(m)
    print('ok  ' if c else 'FAIL',m)
calls=[];MODE={'purge':'ok'}
def handler(route):
    try:b=json.loads(route.request.post_data or '{}')
    except Exception:b={}
    a=b.get('action');calls.append(b)
    r={'valid':True}
    if a=='verifyOwner':r={'valid':True,'token':'tok'}
    elif a=='getSettings':r={'valid':True,'settings':{'whatsapp':'923000000000'}}
    elif a=='getPayment':r={'valid':True,'slots':[],'note':''}
    elif a=='getOrders':r={'valid':True,'orders':[],'codesLeft':3}
    elif a=='purgeOldOrders':r={'valid':True,'purged':4,'months':12} if MODE['purge']=='ok' else {'valid':False,'error':'unknown_action'}
    route.fulfill(status=200,headers={'access-control-allow-origin':'*','content-type':'application/json'},body=json.dumps(r))
srv=subprocess.Popen(['python3','-m','http.server',PORT,'-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
try:
 with sync_playwright() as p:
  br=p.chromium.launch();ctx=br.new_context(viewport={'width':390,'height':800},has_touch=True,is_mobile=True);pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.route('https://script.google.com/**',handler)
  pg.goto(f'http://localhost:{PORT}/admin.html');pg.evaluate("sessionStorage.setItem('cvStudioOwnerVerified','1');sessionStorage.setItem('cvStudioOwnerToken','tok')")
  pg.goto(f'http://localhost:{PORT}/admin.html');pg.wait_for_selector('[data-tab=settings]',timeout=8000)
  pg.tap('[data-tab=settings]');pg.wait_for_timeout(300)
  ok(pg.is_visible('#purgeBtn'),'settings tab shows the old-data button')
  pg.once('dialog',lambda d:d.dismiss());n0=len(calls);pg.tap('#purgeBtn');pg.wait_for_timeout(300)
  ok(not [c for c in calls[n0:] if c.get('action')=='purgeOldOrders'],'cancel in the confirm box sends nothing')
  pg.once('dialog',lambda d:d.accept());pg.tap('#purgeBtn');pg.wait_for_timeout(600)
  sent=[c for c in calls if c.get('action')=='purgeOldOrders']
  ok(len(sent)==1 and sent[0]['months']==12 and sent[0]['token']=='tok' and 'password' not in sent[0],'accepting sends one request with 12 months and the session token only')
  ok('4 purane orders' in pg.inner_text('#purgeMsg'),'result message shows how many were erased')
  MODE['purge']='old';pg.once('dialog',lambda d:d.accept());pg.tap('#purgeBtn');pg.wait_for_timeout(500)
  ok('Server purana version' in pg.inner_text('#purgeMsg'),'old Apps Script gives a clear "update and redeploy" message')
  ok(not pg.evaluate('document.documentElement.scrollWidth>innerWidth'),'no sideways scrolling on a phone')
  ok(not errs,'no JavaScript errors '+';'.join(errs)[:120])
finally: srv.terminate()
print(f'\n{N[0]-len(F)}/{N[0]} passed');sys.exit(1 if F else 0)

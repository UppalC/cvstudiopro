"""Admin: Back works between tabs (installed-app case), login screen looks right, favicons. Run: python3 tests/e2e_admin_nav.py"""
import json,os,subprocess,sys,time
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT='8763';F=[];N=[0]
def ok(c,m):
    N[0]+=1
    if not c:F.append(m)
    print('ok  ' if c else 'FAIL',m)
def handler(route):
    try:b=json.loads(route.request.post_data or '{}')
    except Exception:b={}
    a=b.get('action');r={'valid':True}
    if a=='verifyOwner':r={'valid':True,'token':'tok'}
    elif a=='getSettings':r={'valid':True,'settings':{}}
    elif a=='getPayment':r={'valid':True,'slots':[],'note':''}
    elif a=='getOrders':r={'valid':True,'orders':[],'codesLeft':3}
    route.fulfill(status=200,headers={'access-control-allow-origin':'*','content-type':'application/json'},body=json.dumps(r))
srv=subprocess.Popen(['python3','-m','http.server',PORT,'-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
U=f'http://localhost:{PORT}/admin.html'
try:
 with sync_playwright() as p:
  br=p.chromium.launch()
  for lab,vp,mob in [('phone',{'width':390,'height':800},True),('desktop',{'width':1280,'height':720},False)]:
    ctx=br.new_context(viewport=vp,has_touch=mob,is_mobile=mob);pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('https://script.google.com/**',handler)
    # login screen
    pg.goto(U+'?source=pwa');pg.wait_for_selector('#ownerLogin',state='visible')
    ok(pg.is_visible('.lg-hero') and pg.is_visible('#ownerPassInput') and pg.is_visible('#ownerLoginBtn'),lab+': new login screen is shown')
    ok(not pg.evaluate('document.documentElement.scrollWidth>innerWidth'),lab+': login has no sideways scroll')
    ok(pg.evaluate("getComputedStyle(document.querySelector('.lg-hero')).backgroundImage").startswith('linear-gradient'),lab+': login uses the new teal look')
    ok('favicon-admin.svg?v=2' in pg.evaluate("document.querySelector('link[rel=icon]').href"),lab+': admin tab icon is the admin favicon')
    # login then navigate
    pg.fill('#ownerPassInput','x'*12);pg.click('#ownerLoginBtn');pg.wait_for_selector('[data-tab=settings]',timeout=8000)
    ok(not pg.is_visible('#backBtn'),lab+': no Back button on the first tab')
    pg.click('[data-tab=settings]');pg.wait_for_timeout(200)
    ok(pg.is_visible('#backBtn') and pg.evaluate('location.hash')=='#settings',lab+': Settings shows a Back button')
    pg.click('[data-tab=control]');pg.wait_for_timeout(200)
    pg.go_back();pg.wait_for_timeout(300)
    ok(pg.evaluate('location.hash')=='#settings' and pg.is_visible('#panelSettings'),lab+': browser/Android Back goes control -> settings')
    pg.click('#backBtn');pg.wait_for_timeout(300)
    ok(pg.evaluate('TAB')=='new' and not pg.is_visible('#backBtn'),lab+': Back button returns to first tab')
    ok(pg.evaluate("location.pathname.endsWith('admin.html')"),lab+': still on admin page')
    # opening directly on #settings, Back button must still work
    pg.evaluate("sessionStorage.setItem('cvStudioOwnerVerified','1');sessionStorage.setItem('cvStudioOwnerToken','tok')")
    pg.goto(U+'#settings');pg.wait_for_selector('#backBtn.on');pg.click('#backBtn');pg.wait_for_timeout(300)
    ok(pg.evaluate('TAB')=='new','%s: Back button works even when opened directly on Settings'%lab)
    ok(not errs,lab+': no JavaScript errors '+';'.join(errs)[:120]);ctx.close()
finally: srv.terminate()
print(f'\n{N[0]-len(F)}/{N[0]} passed');sys.exit(1 if F else 0)

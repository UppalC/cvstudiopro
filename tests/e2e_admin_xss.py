"""Security test: a customer can type anything into an order form, so the admin page must show it as plain text and never run it.
Run from the repo root: python3 tests/e2e_admin_xss.py"""
import json,os,subprocess,sys,time
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT='8761';F=[];N=[0]
def ok(c,m):
    N[0]+=1
    if not c:F.append(m)
    print('ok  ' if c else 'FAIL',m)
srv=subprocess.Popen(['python3','-m','http.server',PORT,'-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
P='<img src=x onerror="window.__xss=(window.__xss||0)+1">'
def order(i,st):return {'row':i+1,'timestamp':'2026-11-14T10:%02d:00.000Z'%i,'name':P+'N','whatsapp':P,'email':'"><svg onload=window.__xss=9>@x.com','template':P,'note':P+'<script>window.__xss=77</script>','status':st,'code':P,'updated':'','reminded':'','txn':P,'orderNo':'CV-'+P}
ORD=[order(2,'Pending'),order(3,'Approved'),order(4,'Completed')]
def h(route):
    b=json.loads(route.request.post_data or '{}');a=b.get('action');r={'valid':True}
    if a=='getOrders':r={'valid':True,'orders':ORD,'codesLeft':3}
    elif a=='getSettings':r={'valid':True,'settings':{'whatsapp':'923000000000'}}
    elif a=='getPayment':r={'valid':True,'slots':[],'note':''}
    route.fulfill(status=200,headers={'access-control-allow-origin':'*','content-type':'application/json'},body=json.dumps(r))
try:
 with sync_playwright() as pw:
  b=pw.chromium.launch()
  for lab,vp in [('desktop',{'width':1280,'height':800}),('phone',{'width':390,'height':800})]:
    cx=b.new_context(viewport=vp);pg=cx.new_page();pg.route('https://script.google.com/**',h)
    pg.goto(f'http://localhost:{PORT}/admin.html');pg.evaluate("sessionStorage.setItem('cvStudioOwnerVerified','1');sessionStorage.setItem('cvStudioOwnerToken','tok')")
    pg.goto(f'http://localhost:{PORT}/admin.html');pg.wait_for_timeout(2500)
    ok(pg.evaluate("document.getElementById('ordersList').innerText.includes('onerror')"),lab+': the malicious text is shown as plain text')
    ok(pg.evaluate("document.querySelectorAll('#ordersList img, #ordersList svg[onload], #ordersList script').length")==0,lab+': no image, svg or script element was created from order data')
    for tab in pg.locator('[data-tab]').all():
      try:tab.click(timeout=1000);pg.wait_for_timeout(300)
      except Exception:pass
    ok(not pg.evaluate("window.__xss||0"),lab+': no injected code ran in any tab')
    cx.close()
finally: srv.terminate()
print(f'\n{N[0]-len(F)}/{N[0]} passed');sys.exit(1 if F else 0)

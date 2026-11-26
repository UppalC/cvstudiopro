"""Admin: evidence save/download, HOLD badge and buttons, price line on the order card. Run: python3 tests/e2e_admin_evidence.py"""
import json,os,subprocess,sys,time,datetime
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT='8766';F=[];N=[0]
def ok(c,m):
    N[0]+=1
    if not c:F.append(m)
    print('ok  ' if c else 'FAIL',m)
calls=[];now=datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
ORD=[{'row':2,'timestamp':now,'name':'Ali','whatsapp':'0300','email':'a@b.co','template':'t5','note':'','status':'Completed','code':'CVPRO-AAAAAAAA','orderNo':'CV-1002','txn':'TX9','price':'Rs. 400 | offer on (was Rs. 500)','hold':False},
     {'row':3,'timestamp':now,'name':'Sara','whatsapp':'0301','email':'s@b.co','template':'t6','note':'','status':'Completed','code':'CVPRO-BBBBBBBB','orderNo':'CV-1003','txn':'TX10','price':'','hold':True}]
EV={'orderNo':'CV-1002','order':{'transactionId':'TX9','name':'Ali'},'code':{'code':'CVPRO-AAAAAAAA','used':True},'history':[{'event':'APPROVED'}]}
def handler(route):
    try:b=json.loads(route.request.post_data or '{}')
    except Exception:b={}
    calls.append(b);a=b.get('action');r={'valid':True}
    if a=='verifyOwner':r={'valid':True,'token':'tok'}
    elif a=='getSettings':r={'valid':True,'settings':{}}
    elif a=='getOrders':r={'valid':True,'orders':ORD,'codesLeft':5}
    elif a=='saveEvidence':r={'valid':True,'evidence':EV}
    elif a=='setHold':r={'valid':True,'hold':b.get('on')}
    route.fulfill(status=200,headers={'access-control-allow-origin':'*','content-type':'application/json'},body=json.dumps(r))
srv=subprocess.Popen(['python3','-m','http.server',PORT,'-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
U=f'http://localhost:{PORT}/admin.html'
try:
 with sync_playwright() as p:
  br=p.chromium.launch();cx=br.new_context(viewport={'width':390,'height':800},accept_downloads=True);pg=cx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.route('https://script.google.com/**',handler);pg.goto(U);pg.evaluate("sessionStorage.setItem('cvStudioOwnerVerified','1');sessionStorage.setItem('cvStudioOwnerToken','tok')");pg.goto(U)
  pg.wait_for_selector('[data-tab=done]',timeout=8000);pg.click('[data-tab=done]');pg.wait_for_selector('.ad-card',timeout=5000)
  txt=pg.inner_text('#ordersList')
  ok('Rs. 400 | offer on (was Rs. 500)' in txt,'card shows the price/offer the customer was shown')
  ok('HOLD: saboot mehfooz' in txt and pg.locator('.ad-hold').count()==1,'only the held order shows the HOLD badge')
  ok(pg.locator('[data-act=evidence]').count()==2,'every order has a "Saboot save + download" button')
  ok(pg.locator('[data-act=holdOn]').count()==1 and pg.locator('[data-act=holdOff]').count()==1,'held order offers "Hold hatayen", others offer "Hold"')
  with pg.expect_download() as dl:pg.locator('[data-act=evidence]').first.click()
  d=dl.value;path=d.path();data=json.load(open(path))
  ok(d.suggested_filename=='evidence-CV-1002.json' and data['order']['transactionId']=='TX9' and data['code']['used'] is True,'download is a JSON file with the order, Transaction ID and code usage')
  ok([c for c in calls if c.get('action')=='saveEvidence' and c.get('rowIndex') in (2,3) and c.get('token')=='tok' and 'password' not in c],'request carries the session token only')
  pg.locator('[data-act=holdOn]').first.click();pg.wait_for_timeout(400)
  ok([c for c in calls if c.get('action')=='setHold' and c.get('on') is True and c.get('rowIndex')==2],'Hold button sends setHold on=true')
  pg.locator('[data-act=holdOff]').first.click();pg.wait_for_timeout(400)
  ok([c for c in calls if c.get('action')=='setHold' and c.get('on') is False],'Hold hatayen sends setHold on=false')
  ok(not pg.evaluate('document.documentElement.scrollWidth>innerWidth'),'no sideways scroll on phone')
  ok(not errs,'no JS errors '+';'.join(errs)[:120])
finally: srv.terminate()
print(f'\n{N[0]-len(F)}/{N[0]} passed');sys.exit(1 if F else 0)

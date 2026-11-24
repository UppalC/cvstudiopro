"""Admin offer wizard + dashboard + builder banner. Run: python3 tests/e2e_admin_offers.py"""
import json,os,subprocess,sys,time,datetime
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT='8764';F=[];N=[0]
def ok(c,m):
    N[0]+=1
    if not c:F.append(m)
    print('ok  ' if c else 'FAIL',m)
saves=[];SET={}
now=datetime.datetime.now()
def ts(d):return (now-datetime.timedelta(days=d)).strftime('%Y-%m-%dT%H:%M:%S')
ORD=[{'row':2+i,'timestamp':ts(d),'name':'N%d'%i,'whatsapp':'0300','email':'a@b.co','template':'t1','note':'','status':s,'code':'','orderNo':'CVS-%d'%i} for i,(d,s) in enumerate([(0,'Pending'),(0,'Pending'),(3,'Completed'),(10,'Completed'),(40,'Cancelled')])]
def handler(route):
    try:b=json.loads(route.request.post_data or '{}')
    except Exception:b={}
    a=b.get('action');r={'valid':True}
    if a=='verifyOwner':r={'valid':True,'token':'tok'}
    elif a=='getSettings':r={'valid':True,'settings':SET}
    elif a=='getPayment':r={'valid':True,'slots':[],'note':''}
    elif a=='getOrders':r={'valid':True,'orders':ORD,'codesLeft':1}
    elif a=='saveSiteSettings':saves.append(b)
    route.fulfill(status=200,headers={'access-control-allow-origin':'*','content-type':'application/json'},body=json.dumps(r))
srv=subprocess.Popen(['python3','-m','http.server',PORT,'-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
U=f'http://localhost:{PORT}/'
try:
 with sync_playwright() as p:
  br=p.chromium.launch();ctx=br.new_context(viewport={'width':390,'height':800});pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.route('https://script.google.com/**',handler)
  pg.goto(U+'admin.html');pg.evaluate("sessionStorage.setItem('cvStudioOwnerVerified','1');sessionStorage.setItem('cvStudioOwnerToken','tok')")
  pg.goto(U+'admin.html');pg.wait_for_selector('#sumBox div',timeout=8000);pg.wait_for_timeout(500)
  txt=pg.inner_text('#sumBox')
  ok('2\nAaj ke orders' in txt,'dashboard: 2 orders today')
  ok('Pending (sab se purana' in txt and '2\nPending' in txt,'dashboard: 2 pending with age')
  ok('50%' in txt,'dashboard: completion rate counts only non-cancelled (2 of 4)')
  ok(pg.is_visible('#sumBox [data-gen]'),'dashboard: low codes shows the make-codes button')
  pg.click('[data-tab=settings]');pg.wait_for_timeout(300)
  ok('OFF' in pg.inner_text('#offerStatus'),'offer status says OFF at first')
  pg.check('#setOfferOn');pg.wait_for_timeout(200)
  t=pg.inner_text('#offerCheck');ok('line (text) khali' in t and 'price khali' in t,'ON with nothing filled shows errors')
  pg.click('[data-preset="7"]');pg.fill('#setPricePremium','Rs. 400');pg.check('#setShowPrices');pg.fill('#setPriceOld','Rs. 300');pg.wait_for_timeout(200)
  ok('bari honi chahiye' in pg.inner_text('#offerCheck'),'old price lower than new is blocked with a clear reason')
  pg.fill('#setPriceOld','Rs. 500');pg.wait_for_timeout(200)
  ok('tareekh nahi' in pg.inner_text('#offerCheck'),'old price without an end date is an error')
  pg.fill('#setOfferEnds',(now-datetime.timedelta(days=2)).strftime('%Y-%m-%d'));pg.wait_for_timeout(200)
  ok('guzar chuki' in pg.inner_text('#offerCheck') and 'bad' in pg.get_attribute('#offerStatus','class'),'past end date is an error and status turns red')
  pg.fill('#setPass','x'*12);pg.click('#setSaveBtn');pg.wait_for_timeout(500)
  ok(not saves and 'Save nahi hua' in pg.inner_text('#setMsg'),'Save is refused while the offer has errors (nothing sent)')
  pg.click('[data-endsin="7"]');pg.wait_for_timeout(200)
  ok('LIVE' in pg.inner_text('#offerStatus') and '20% OFF' in pg.inner_text('#offerCheck'),'7-day quick date makes it LIVE and shows 20% OFF')
  pg.check('#setFreeTrial');pg.wait_for_timeout(200)
  ok('confuse' in pg.inner_text('#offerCheck'),'offer + free trial together gives a warning')
  pg.uncheck('#setFreeTrial')
  pg.click('#setSaveBtn');pg.wait_for_timeout(700)
  v=(saves[0]['values'] if saves else {})
  ok(saves and v.get('offer_enabled')=='true' and v.get('price_old')=='Rs. 500' and v.get('price_premium')=='Rs. 400' and v.get('offer_ends'),'a complete offer saves all related fields together')
  pg.once('dialog',lambda d:d.accept());pg.click('#offerClear');pg.wait_for_timeout(200)
  ok(not pg.is_checked('#setOfferOn') and pg.input_value('#setPriceOld')=='' and pg.input_value('#setOfferEnds')=='','clear button empties every offer field')
  ok(not pg.evaluate('document.documentElement.scrollWidth>innerWidth'),'no sideways scroll on phone')
  ok(not errs,'no JS errors '+';'.join(errs)[:150])
  # builder shows the banner when an offer is live
  SET.update({'offer_enabled':'true','offer_text':'Launch offer','offer_badge':'LAUNCH','price_premium':'Rs. 400','price_old':'Rs. 500','show_prices':'true','offer_ends':(now+datetime.timedelta(days=5)).strftime('%Y-%m-%d')})
  pg2=ctx.new_page();pg2.route('https://script.google.com/**',handler);pg2.goto(U+'builder.html');pg2.wait_for_timeout(1500)
  ok(pg2.is_visible('#offerBanner .offer3d') and '20% OFF' in pg2.inner_text('#offerBanner'),'builder page shows the live offer with price and % OFF')
  SET['offer_ends']=(now-datetime.timedelta(days=1)).strftime('%Y-%m-%d');pg3=ctx.new_page();pg3.route('https://script.google.com/**',handler);pg3.goto(U+'builder.html');pg3.wait_for_timeout(1500)
  ok(pg3.inner_text('#offerBanner').strip()=='','expired offer shows no banner on builder')
finally: srv.terminate()
print(f'\n{N[0]-len(F)}/{N[0]} passed');sys.exit(1 if F else 0)

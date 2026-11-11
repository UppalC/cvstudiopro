"""Browser test for the ATS checker page. Run from repo root: python3 tests/e2e_ats.py  (needs playwright)"""
import os,subprocess,sys,time
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT='8751';F=[];N=[0]
def ok(c,m):
    N[0]+=1
    if not c:F.append(m)
    print('ok  ' if c else 'FAIL',m)
CV="""MUHAMMAD ALI KHAN
Accountant
Phone: +971 50 123 4567
Email: ali.khan@gmail.com

EXPERIENCE
Senior Accountant
ABC Traders, Dubai
2021 - Present
- Prepared monthly statements for 12 clients
- Reduced invoice errors by 30%
- Filed sales tax returns on time

EDUCATION
B.Com
University of the Punjab

SKILLS
Excel, Tally, QuickBooks, Payroll, Tax filing
"""
srv=subprocess.Popen(['python3','-m','http.server',PORT,'-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
try:
 with sync_playwright() as p:
  br=p.chromium.launch();pg=br.new_page(viewport={'width':390,'height':800});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto(f'http://localhost:{PORT}/ats-checker.html');pg.wait_for_timeout(500)
  pg.click('#atsGo');ok('Please paste' in pg.inner_text('#atsOut'),'empty click asks to paste the CV')
  pg.fill('#atsCv',CV);pg.click('#atsGo')
  ok(pg.locator('.ats-item').count()>=10,'results list shows many checks');ok(' of ' in pg.inner_text('.ats-score') and 'checks passed' in pg.inner_text('.ats-score'),'score line shown')
  ok(pg.locator('.ats-pass').count()>=7,'good CV gets mostly passes');ok(pg.locator('.ats-fail').count()==0,'good CV has no fails')
  pg.fill('#atsJob','Accountant needed: Tally, QuickBooks, payroll and VAT returns. VAT knowledge required. Welding not needed.');pg.click('#atsGo')
  t=pg.inner_text('#atsOut');ok('main words from the job ad' in t and 'vat' in t.lower(),'job ad keywords reported with missing word')
  pg.fill('#atsCv','<img src=x onerror="window.__x=1"><script>window.__x=1</script>\nBob');pg.fill('#atsJob','<b>hi</b>');pg.click('#atsGo');pg.wait_for_timeout(300)
  ok(pg.evaluate('window.__x')is None,'hostile text is not executed');ok(pg.locator('#atsOut img, #atsOut script').count()==0,'hostile text is not turned into HTML')
  pg.click('#atsClear');ok(pg.input_value('#atsCv')=='' and pg.inner_text('#atsOut').strip()=='','clear button empties everything')
  reqs=[];pg.on('request',lambda r:reqs.append(r.url));pg.fill('#atsCv',CV);pg.click('#atsGo');pg.wait_for_timeout(300)
  ok(not [u for u in reqs if 'localhost' not in u],'no data sent to any outside site while checking')
  ok(not pg.evaluate('document.documentElement.scrollWidth>innerWidth'),'no sideways scrolling on a 390px phone')
  pg.screenshot(path=os.path.join(os.environ.get('TMPDIR','/tmp'),'ats_phone.png'),full_page=True)
  ok(not errs,'no JavaScript errors '+';'.join(errs)[:150])
finally: srv.terminate()
print(f'\n{N[0]-len(F)}/{N[0]} passed');sys.exit(1 if F else 0)

"""Browser integration tests (Playwright + python-docx + LibreOffice).
Run from the repo root:  python3 tests/e2e_builder.py   (needs: pip install playwright python-docx; soffice, pdfimages)"""
import base64,io,os,re,subprocess,sys,tempfile,time,zipfile
from playwright.sync_api import sync_playwright
import docx
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'));PORT='8741'
TMP=tempfile.mkdtemp(prefix='cvtest');FAILS=[];N=[0]
def ok(c,msg):
    N[0]+=1
    if not c:FAILS.append(msg);print('FAIL',msg)
    else:print('ok  ',msg)
def png_b64():
    from PIL import Image
    im=Image.new('RGB',(300,400),(40,90,160));b=io.BytesIO();im.save(b,'JPEG');return 'data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode()
RESUME="""MUHAMMAD ALI KHAN
Accountant
Phone: +971 50 123 4567
Email: ali.khan@gmail.com

SUMMARY
Accountant with 5 years of experience.

EXPERIENCE
Senior Accountant
ABC Traders, Dubai
2021 - Present
- Prepared monthly statements
- Filed tax returns

Accounts Assistant
XYZ Mart
- Managed invoices

EDUCATION
B.Com
University of the Punjab

SKILLS
Excel, Tally, QuickBooks

LANGUAGES
Urdu, English
"""
srv=subprocess.Popen(['python3','-m','http.server',PORT,'-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
def export(pg,name):
    with pg.expect_download() as d: pg.evaluate("exportDocx()")
    p=os.path.join(TMP,name);d.value.save_as(p);return p
def pdf_of(p):
    subprocess.run(['soffice','--headless','--convert-to','pdf','--outdir',TMP,p],capture_output=True,timeout=120)
    return p[:-5]+'.pdf'
try:
 with sync_playwright() as pw:
  br=pw.chromium.launch();pg=br.new_page(accept_downloads=True);errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto(f'http://localhost:{PORT}/builder.html');pg.wait_for_timeout(600)
  # ---- IMPORT integration
  pg.evaluate("t=>{setField('form.pasteResume',t);importResume()}",RESUME);pg.wait_for_timeout(500)
  f=pg.evaluate("state.form")
  ok(f['name']=='Muhammad Ali Khan','import: name');ok(f['phone']=='+971 50 123 4567','import: Gulf phone')
  ok(f['email']=='ali.khan@gmail.com','import: email');ok(f['exp1t']=='Senior Accountant' and f['exp2t']=='Accounts Assistant','import: 2 experiences')
  ok(f['edu1t']=='B.Com','import: education');ok([t['name'] for t in f['tech']]==['Excel','Tally','QuickBooks'],'import: skills')
  ok('Imported:' in pg.inner_text('body'),'import: status message is visible (import box stays open)')
  pg.evaluate("setStep(1)");pg.wait_for_timeout(300)
  pg.evaluate("setTemplate('t2');refreshPreview()");pg.wait_for_timeout(500)
  ok('Muhammad Ali Khan' in pg.inner_text('#cvPreview'),'import: name shows in live preview')
  pg.evaluate("()=>{state.form.pasteResume='';importResume=importResume}")
  pg.once('dialog',lambda d:d.accept());pg.evaluate("setField('form.pasteResume','');importResume()")
  # ---- WORD with photo
  pg.evaluate("p=>{fillDemo();state.photo=p;setTemplate('t2');refreshPreview()}",png_b64());pg.wait_for_timeout(500)
  p=export(pg,'photo.docx');d=docx.Document(p)
  ok(len(d.inline_shapes)==1,'word: photo embedded (1 inline picture)');ok(d.tables and 'Ali Raza' in d.tables[0].cell(0,0).text,'word: name in header table')
  ok('word/media/photo.jpg' in zipfile.ZipFile(p).namelist(),'word: media part in package')
  pdf=pdf_of(p);ok(os.path.exists(pdf),'word: LibreOffice opens and converts file')
  pi=subprocess.run(['pdfimages','-list',pdf],capture_output=True,text=True).stdout
  ok(len(pi.strip().splitlines())>=3,'word: photo visible in converted PDF')
  # ---- WORD without photo, special chars, Urdu
  pg.evaluate("()=>{state.photo='';state.form.summary='R&D <b> \"q\" & more';state.form.name='محمد اکرام';state.form.summary+=' میں انجنیئر ہوں'}")
  p=export(pg,'urdu.docx');d=docx.Document(p);x=zipfile.ZipFile(p).read('word/document.xml').decode()
  ok(len(d.inline_shapes)==0 and not d.tables,'word: no photo -> no table/picture')
  ok('<w:bidi/>' in x and '<w:rtl/>' in x,'word: Urdu paragraphs are right-to-left')
  ok('R&amp;D &lt;b&gt;' in x,'word: XML special characters escaped')
  ok(os.path.exists(pdf_of(p)),'word: Urdu/special file converts')
  # ---- bad photo falls back
  pg.evaluate("()=>{state.photo='data:image/jpeg;base64,AAAA'}");p=export(pg,'badphoto.docx')
  ok(len(docx.Document(p).inline_shapes)==0,'word: broken photo falls back to no photo (no crash)')
  # ---- long CV
  pg.evaluate("()=>{fillDemo();state.form.exp1d=Array(40).fill('Handled daily work').join('\\n')}");p=export(pg,'long.docx')
  ok(len(docx.Document(p).paragraphs)>60,'word: long CV exports all lines')
  # ---- premium lock for guests
  pg.evaluate("()=>{fillDemo();setTemplate('t68');refreshPreview()}");pg.wait_for_timeout(300)
  got=[];pg.on('download',lambda d:got.append(1));pg.evaluate("exportDocx()");pg.wait_for_timeout(800)
  ok(not got,'word: premium template is blocked for guests (no download)')
  ok(not errs,'no JavaScript errors on the page: '+';'.join(errs)[:200])
finally: srv.terminate()
print(f'\n{N[0]-len(FAILS)}/{N[0]} passed');sys.exit(1 if FAILS else 0)

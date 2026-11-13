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
  # ---- real-user checks: fresh builder must not ship sample skills, and an empty photo box must not print
  fp=br.new_page();fp.goto(pg.url.split('?')[0]);fp.wait_for_timeout(700)
  ok(fp.evaluate("state.form.tech.length===0&&!state.form.soft&&!state.form.lang"),'fresh builder: no sample skills / soft skills / languages pre-filled');fp.close()
  pg.evaluate("()=>{state.form.name='Ahmed Raza';setTemplate('t21');refreshPreview()}");pg.wait_for_timeout(300)
  pg.emulate_media(media='print');ok(pg.evaluate("[...document.querySelectorAll('#cvPreview .cv-photo.ph-empty')].every(e=>getComputedStyle(e).display==='none')"),'no photo: "Profile Photo" box is hidden in print/PDF');pg.emulate_media(media='screen')
  # ---- Australian student style text imported through the real import box
  AU=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'fixtures_au_cv.txt'),encoding='utf8').read()
  pg.evaluate("()=>{state=blank();setTemplate('t21');state.photoPlacement='none';fullRenderKeepPosition()}");pg.wait_for_timeout(300)
  pg.evaluate("t=>{setField('form.pasteResume',t);importResume()}",AU);pg.wait_for_timeout(500)
  cvt=pg.inner_text('#cvPreview')
  ok('work availability (australia)' in cvt.lower() and 'Saturday' in cvt,'AU import: availability section shows in the CV')
  ok('Sales Assistant' in cvt and 'Metro Store' in cvt and 'Monash University' in cvt,'AU import: experience and education show in the CV')
  ok('Customer Service' in cvt and 'Microsoft Word' in cvt and 'Punjabi' in cvt,'AU import: skills and languages show in the CV')
  ok('Profile Photo' not in cvt,'AU import: photo switched off, no photo box')
  # ---- template picker (step 4): short list by category, filter chips, jump back to Download
  fp=br.new_page(viewport={'width':1366,'height':800});fp.goto(pg.url.split('?')[0]);fp.wait_for_timeout(700)
  fp.evaluate("()=>{fillDemo();setStep(4)}");fp.wait_for_timeout(400)
  fp.get_by_role('button',name='Change Template Anytime').first.click();fp.wait_for_timeout(300)
  n0=fp.locator('.formpanel .tpl-card').count();h0=fp.evaluate("document.querySelector('.formpanel').scrollHeight")
  ok(0<n0<=20 and h0<3500,f'picker: opens on the current category only ({n0} cards, panel {h0}px, was ~12900px)')
  fp.locator('.tpl-fchip',has_text='All').first.click();fp.wait_for_timeout(200)
  ok(fp.locator('.formpanel .tpl-card').count()==fp.evaluate("templates.length"),'picker: "All" chip shows every design')
  fp.locator('.tpl-fchip',has_text='Free').first.click();fp.wait_for_timeout(200)
  ok(fp.evaluate("[...document.querySelectorAll('.formpanel .tpl-card .tpl-tag')].every(x=>x.classList.contains('free'))")and fp.locator('.formpanel .tpl-card').count()>=1,'picker: "Free" chip shows only free designs')
  fp.locator('.formpanel .tpl-card').first.click();fp.wait_for_timeout(300)
  ok(fp.locator('.tpl-fchip[aria-pressed=true]').inner_text()=='Free','picker: filter stays after choosing a design')
  fp.locator('.tpl-foot .btn').click();fp.wait_for_timeout(800)
  ok(fp.evaluate("(()=>{const r=document.querySelector('.formpanel .formsec.dl').getBoundingClientRect();return r.top>=-5&&r.top<innerHeight*.6})()"),'picker: "Go to Download / Order" brings the Download box into view');fp.close()
  # ---- WORD exact design (one real .docx file with the page pictures inside)
  pg.evaluate("()=>{fillDemo();state.photo='';setTemplate('t21');refreshPreview()}");pg.wait_for_timeout(600)
  npages=pg.evaluate("document.querySelectorAll('#cvPreview .cvpage').length")
  with pg.expect_download() as d: pg.get_by_role('button',name='Word (exact design)').click() if pg.evaluate("state.step")==4 else pg.evaluate("exportWord()")
  dl=d.value;ok(dl.suggested_filename.endswith('_design.docx'),'design word: file name ends with _design.docx ('+dl.suggested_filename+')')
  p=os.path.join(TMP,'design.docx');dl.save_as(p);z=zipfile.ZipFile(p);names=z.namelist()
  ok(z.testzip() is None,'design word: zip is valid')
  ok(sum(1 for n in names if n.startswith('word/media/page'))==npages,f'design word: {npages} page picture(s) inside the same file')
  docx.Document(p);x=z.read('word/document.xml').decode();ok(x.count('<wp:anchor')==npages,'design word: one full-page picture per page, opens in python-docx')
  ok('w:left="0"' in x and 'w:top="0"' in x,'design word: zero page margins (picture fills the page)')
  from PIL import Image as _I
  im=_I.open(io.BytesIO(z.read('word/media/page1.jpg')));ok(im.size[0]>=1500 and abs(im.size[1]/im.size[0]-1.414)<0.03,f'design word: picture is full A4 size and not shrunk by preview zoom {im.size}')
  pdf=pdf_of(p);pc=subprocess.run(['pdfinfo',pdf],capture_output=True,text=True).stdout
  m=re.search(r'Pages:\s+(\d+)',pc);ok(m and int(m.group(1))==npages,f'design word: LibreOffice shows exactly {npages} page(s), no blank extra page ('+(m.group(1) if m else '?')+')')
  # ---- WORD editable keeps a coloured header band
  p=export(pg,'band.docx');x=zipfile.ZipFile(p).read('word/document.xml').decode()
  ok('<w:shd w:val="clear"' in x,'editable word: name/title/contact have a coloured band')
  ok(os.path.exists(pdf_of(p)),'editable word: still converts')
  # ---- premium lock for guests
  pg.evaluate("()=>{fillDemo();setTemplate('t68');refreshPreview()}");pg.wait_for_timeout(300)
  got=[];pg.on('download',lambda d:got.append(1));pg.evaluate("exportDocx()");pg.wait_for_timeout(800)
  ok(not got,'word: premium template is blocked for guests (no download)')
  ok(not errs,'no JavaScript errors on the page: '+';'.join(errs)[:200])
finally: srv.terminate()
print(f'\n{N[0]-len(FAILS)}/{N[0]} passed');sys.exit(1 if FAILS else 0)

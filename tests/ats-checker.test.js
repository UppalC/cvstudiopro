'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
global.ResumeImport=require('../js/resume-import.js');
const {analyze}=require('../js/ats-checker.js');
const GOOD=`MUHAMMAD ALI KHAN
Accountant
Phone: +971 50 123 4567
Email: ali.khan@gmail.com

SUMMARY
Accountant with 5 years of experience in bookkeeping, payroll and tax filing for small companies.

EXPERIENCE
Senior Accountant
ABC Traders, Dubai
2021 - Present
- Prepared monthly financial statements for 12 clients
- Reduced invoice errors by 30% with a weekly checklist
- Filed sales tax returns on time every month

Accounts Assistant
XYZ Mart
2018 - 2021
- Managed 200+ invoices per month
- Reconciled bank statements

EDUCATION
B.Com
University of the Punjab
2014 - 2018

SKILLS
Excel, Tally, QuickBooks, Payroll, Tax filing, Bookkeeping

LANGUAGES
Urdu, English
`;
const by=(r,id)=>r.checks.find(c=>c.id===id);
test('a well-formed CV passes the core checks',()=>{
 const r=analyze(GOOD);
 ['name','email','phone','experience','education','skills','bullets','numbers','dates'].forEach(id=>assert.equal(by(r,id).status,'pass',id));
 assert.ok(r.passed>=10);assert.equal(r.total,r.checks.filter(c=>c.status!=='info').length);
});
test('missing contact details and sections are flagged as fail',()=>{
 const r=analyze('Ahmed\n\nI like working hard and I am a good team player.');
 assert.equal(by(r,'email').status,'fail');assert.equal(by(r,'phone').status,'fail');
 assert.equal(by(r,'experience').status,'fail');assert.equal(by(r,'education').status,'fail');assert.equal(by(r,'skills').status,'fail');
});
test('empty input returns a single clear message and no score',()=>{
 const r=analyze('   ');assert.equal(r.empty,true);assert.equal(r.checks.length,0);assert.equal(analyze(null).empty,true);
});
test('very short and very long text get a length warning',()=>{
 assert.equal(by(analyze('A B\nab@x.com\n0300 1234567'),'length').status,'warn');
 assert.equal(by(analyze(GOOD+('word '.repeat(1200))),'length').status,'warn');
 assert.equal(by(analyze(GOOD+'\nReferences available on request. '.repeat(1)+'extra '.repeat(60)),'length').status,'pass');assert.equal(by(analyze(GOOD),'length').status,'warn');
});
test('long bullets and first-person openings are warned',()=>{
 const long='- '+Array(45).fill('word').join(' ');
 const r=analyze('A B\nab@x.com\n\nEXPERIENCE\nClerk\nCo\n'+long+'\n- Did stuff');
 assert.equal(by(r,'bulletlen').status,'warn');
 const r2=analyze(GOOD+'\nI am a hard worker\nI have good skills\nI love teamwork\n');assert.equal(by(r2,'firstperson').status,'warn');
});
test('no numbers in the experience gives a warning, numbers give a pass',()=>{
 const t='A B\nab@x.com\n\nEXPERIENCE\nClerk\nCo\n2020 - 2022\n- Handled files\n- Answered phones\n- Helped customers';
 assert.equal(by(analyze(t),'numbers').status,'warn');
});
test('table-like text with many columns is flagged',()=>{
 let t='A B\nab@x.com\n';for(let i=0;i<8;i++)t+=`Excel      Word      Tally      ${i}\n`;
 assert.equal(by(analyze(t),'layout').status,'warn');assert.equal(by(analyze(GOOD),'layout').status,'pass');
});
test('job ad keywords: matched and missing words are reported',()=>{
 const job='We need an accountant skilled in Tally, QuickBooks, payroll and VAT returns. VAT experience and payroll knowledge required. Tally preferred.';
 const r=analyze(GOOD,job);const k=by(r,'keywords');
 assert.ok(r.matched.includes('payroll')&&r.matched.includes('tally'));assert.ok(r.missing.includes('vat'));
 assert.ok(['pass','warn'].includes(k.status));assert.ok(!r.missing.includes('need')&&!r.missing.includes('required'));
 assert.equal(analyze(GOOD).checks.some(c=>c.id==='keywords'),false);
});
test('keywords check fails when almost nothing matches',()=>{
 const r=analyze(GOOD,'Looking for a welder with MIG welding, fabrication, blueprint reading and forklift licence. Welding certificate required. Fabrication shop.');
 assert.equal(by(r,'keywords').status,'fail');
});
test('hostile text is only analysed as text and never throws',()=>{
 assert.doesNotThrow(()=>analyze('<script>alert(1)</script>\n'+'x'.repeat(50000),'<img onerror=1>'));
});

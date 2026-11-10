'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseResumeText:P,applyParsed:A,importSummary:S}=require('../js/resume-import.js');

const PK=`MUHAMMAD ALI KHAN
Accountant
Phone: 0300-1234567
Email: ali.khan@gmail.com
Address: Lahore, Punjab, Pakistan

PROFESSIONAL SUMMARY
Accountant with 5 years of experience in bookkeeping and tax filing.
Careful and punctual.

WORK EXPERIENCE
Senior Accountant
ABC Traders, Lahore
2021 - Present
- Prepared monthly financial statements
- Filed sales tax returns

Accounts Assistant
XYZ Mart, Sargodha
2018 - 2021
• Managed invoices and payments

EDUCATION
B.Com
University of the Punjab
2014 - 2018

Intermediate (I.Com)
Govt College, Sargodha

TECHNICAL SKILLS
MS Excel, QuickBooks, Tally, Data Entry

SOFT SKILLS
Teamwork, Communication

LANGUAGES
Urdu (Native), English (Professional)

CERTIFICATIONS
- ICAP Foundation Course
- Advanced Excel

REFERENCES
Available on request

PERSONAL INFORMATION
Father's Name: Muhammad Aslam
Date of Birth: 12 March 1995
CNIC: 35202-1234567-1
Marital Status: Single
Nationality: Pakistani
`;
test('Pakistani resume: contact and header',()=>{
 const r=P(PK);
 assert.equal(r.name,'Muhammad Ali Khan');assert.equal(r.job,'Accountant');
 assert.equal(r.email,'ali.khan@gmail.com');assert.equal(r.phone,'0300-1234567');
 assert.equal(r.address,'Lahore, Punjab, Pakistan');
});
test('summary is joined and has no other sections in it',()=>{
 const r=P(PK);assert.match(r.summary,/^Accountant with 5 years/);assert.ok(!/ABC Traders/.test(r.summary));
});
test('experience entries: title, company+dates, bullets',()=>{
 const r=P(PK);assert.equal(r.exp.length,2);
 assert.equal(r.exp[0].t,'Senior Accountant');assert.equal(r.exp[0].c,'ABC Traders, Lahore | 2021 - Present');
 assert.equal(r.exp[0].d,'Prepared monthly financial statements\nFiled sales tax returns');
 assert.equal(r.exp[1].t,'Accounts Assistant');assert.equal(r.exp[1].d,'Managed invoices and payments');
});
test('education entries',()=>{
 const r=P(PK);assert.equal(r.edu.length,2);assert.equal(r.edu[0].t,'B.Com');
 assert.equal(r.edu[0].c,'University of the Punjab | 2014 - 2018');assert.equal(r.edu[1].t,'Intermediate (I.Com)');
});
test('skills, soft skills, languages, certificates',()=>{
 const r=P(PK);assert.deepEqual(r.tech,['MS Excel','QuickBooks','Tally','Data Entry']);
 assert.deepEqual(r.soft,['Teamwork','Communication']);
 assert.deepEqual(r.lang,['Urdu (Native)','English (Professional)']);
 assert.deepEqual(r.certs,['ICAP Foundation Course','Advanced Excel']);
});
test('labelled personal details; CNIC is never taken as a phone',()=>{
 const r=P(PK);assert.equal(r.father,'Muhammad Aslam');assert.equal(r.dob,'12 March 1995');
 assert.equal(r.cnic,'35202-1234567-1');assert.equal(r.marital,'Single');assert.equal(r.nationality,'Pakistani');
 assert.equal(r.phone,'0300-1234567');
});
test('Gulf phone numbers (+971, +966) are found',()=>{
 assert.equal(P('Sara Ahmed\nSales Executive\n+971 50 123 4567\nsara@mail.com').phone,'+971 50 123 4567');
 assert.equal(P('Omar Khan\nMobile: +966 55 123 4567').phone,'+966 55 123 4567');
});
test('dates and year ranges are not phones',()=>{
 const r=P('John Doe\njohn@x.com\n\nEXPERIENCE\nClerk\nABC\n2015 - 2019\n12/03/1998');assert.equal(r.phone,'');
});
test('no headings: no junk summary, name still found',()=>{
 const r=P('Ahmed Raza\nahmed@x.com\n03001234567');
 assert.equal(r.name,'Ahmed Raza');assert.equal(r.summary,'');assert.equal(r.exp.length,0);assert.equal(r.phone,'03001234567');
});
test('empty / whitespace input gives empty result and clear message',()=>{
 const r=P('  \n\n ');assert.equal(r.name,'');assert.equal(r.found.length,0);assert.match(S(r),/Nothing could be recognised/);
 assert.equal(P(null).name,'');assert.equal(P(undefined).email,'');
});
test('Windows line endings, odd bullets and heading colons',()=>{
 const t='Bilal Sheikh\r\nIT Support\r\n\r\nSkills:\r\n▪ Networking\r\n▪ Windows\r\n\r\nExperience:\r\nIT Technician\r\nCity PC Care\r\n* Fixed hardware\r\n';
 const r=P(t);assert.deepEqual(r.tech,['Networking','Windows']);assert.equal(r.exp[0].t,'IT Technician');assert.equal(r.exp[0].d,'Fixed hardware');
});
test('"Title at Company" on one line is split',()=>{
 const r=P('A B\n\nEXPERIENCE\nSales Manager at Gulf Trading LLC\n- Led team');
 assert.equal(r.exp[0].t,'Sales Manager');assert.equal(r.exp[0].c,'Gulf Trading LLC');
});
test('hobbies section does not leak into the previous section',()=>{
 const r=P('A B\n\nSKILLS\nExcel\n\nHOBBIES\nCricket, Reading');assert.deepEqual(r.tech,['Excel']);
});
test('experience is capped at 10, duplicates removed in skills',()=>{
 let t='A B\n\nEXPERIENCE\n';for(let i=0;i<14;i++)t+=`Job ${i}\nCo ${i}\n- did work\n\n`;
 assert.equal(P(t).exp.length,10);
 assert.deepEqual(P('A B\n\nSKILLS\nExcel, excel, Word').tech,['Excel','Word']);
});
test('applyParsed fills only found fields and maps entries to the form shape',()=>{
 const form={name:'Keep',job:'Old job',email:'',exp1t:'old',tech:[{name:'x',level:1}],soft:'old soft',lang:'old lang',expMore:[],eduMore:[]};
 A(form,P(PK));
 assert.equal(form.name,'Muhammad Ali Khan');assert.equal(form.exp1t,'Senior Accountant');assert.equal(form.exp2t,'Accounts Assistant');
 assert.deepEqual(form.expMore,[]);assert.equal(form.edu1t,'B.Com');assert.equal(form.tech.length,4);assert.equal(form.tech[0].level,80);
 assert.equal(form.certs,'ICAP Foundation Course|Advanced Excel');assert.equal(form.lang,'Urdu (Native) | English (Professional)');
 const f2={name:'Keep',job:'Keep job',summary:'Keep sum'};A(f2,P('\n'));assert.equal(f2.name,'Keep');assert.equal(f2.summary,'Keep sum');
});
test('3+ experiences go to expMore',()=>{
 let t='A B\n\nEXPERIENCE\n';for(let i=0;i<4;i++)t+=`Job ${i}\nCo ${i}\n- w\n\n`;
 const f={};A(f,P(t));assert.equal(f.expMore.length,2);assert.equal(f.expMore[0].t,'Job 2');
});
test('hostile input stays plain text (no HTML interpretation in parser)',()=>{
 const r=P('<img src=x onerror=alert(1)>\nJohn\n\nSUMMARY\n<script>alert(1)</script>');
 assert.equal(typeof r.summary,'string');assert.ok(r.summary.includes('<script>'));
});

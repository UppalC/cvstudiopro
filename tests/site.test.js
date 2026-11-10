'use strict';
/* Site-wide checks (no install needed): node --test tests/site.test.js */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const pages=fs.readdirSync(ROOT).filter(f=>f.endsWith('.html'));
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
test('every local link, script, image and stylesheet in the pages exists',()=>{
 const miss=[];
 pages.forEach(f=>{
  const s=read(f).replace(/<script[^>]*>[\s\S]*?<\/script>/g,m=>m.replace(/[\s\S]*/,m.match(/^<script[^>]*>/)[0]));
  (s.match(/(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)||[]).forEach(x=>{
   const u=x.replace(/^(?:href|src)="/,'').replace(/[?#"].*$/,'');
   if(!u||/^(https?:|\/\/|mailto:|tel:|data:|javascript:)/.test(u)||u.includes("'"))return;
   if(!fs.existsSync(path.join(ROOT,u)))miss.push(f+' -> '+u);
  });
 });
 assert.deepEqual(miss,[]);
});
test('sitemap lists only existing pages, and no admin page',()=>{
 const sm=fs.readFileSync(path.join(ROOT,'sitemap.xml'),'utf8');
 const urls=[...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
 assert.ok(urls.length>=20);
 urls.forEach(u=>{const f=u.replace(/^https:\/\/uppalc\.github\.io\/cvstudiopro\//,'')||'index.html';assert.ok(fs.existsSync(path.join(ROOT,f)),u);assert.ok(!/admin/.test(u),u)});
});
test('public pages have title, description, canonical; admin is noindex',()=>{
 pages.filter(f=>!['admin.html','404.html'].includes(f)).forEach(f=>{
  const s=read(f);assert.match(s,/<title>[^<]{10,}<\/title>/,f+' title');
  assert.match(s,/<meta name="description" content="[^"]{60,}"/,f+' description');assert.match(s,/rel="canonical"/,f+' canonical');
 });
 assert.match(read('admin.html'),/noindex/);assert.match(read('robots.txt'),/Disallow: \/admin\.html/);
});
test('privacy policy: numbered sections 1..N in order and covers the countries we serve',()=>{
 const s=read('privacy.html'),nums=[...s.matchAll(/<h2>(\d+)\./g)].map(m=>+m[1]);
 assert.deepEqual(nums,nums.map((_,i)=>i+1));
 ['Pakistan','India','Saudi Arabia','United Arab Emirates','Qatar','Digital Personal Data Protection Act','12 months','outside Pakistan'].forEach(w=>assert.ok(s.includes(w),w));
});
test('terms: numbered sections in order and service-area clause present',()=>{
 const s=read('terms.html'),nums=[...s.matchAll(/<h2>(\d+)\./g)].map(m=>+m[1]);
 assert.deepEqual(nums,nums.map((_,i)=>i+1));assert.match(s,/Where the service is offered/);
});
test('no secrets or private keys in shipped files',()=>{
 const bad=/(AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|password\s*[:=]\s*['"][^'"\s]{6,}['"])/;
 const files=pages.concat(['js/app.js','js/site-config.js','js/consent.js','js/resume-import.js']);
 files.forEach(f=>assert.ok(!bad.test(read(f)),f));
});
test('every public page has complete Open Graph and Twitter tags with an absolute image that exists',()=>{
 pages.filter(f=>!['admin.html','404.html'].includes(f)).forEach(f=>{
  const s=read(f);
  ['og:title','og:description','og:url','og:image','og:type','og:site_name','twitter:card','twitter:image'].forEach(t=>assert.ok(s.includes('"'+t+'"'),f+' '+t));
  const img=s.match(/property="og:image" content="([^"]+)"/)[1];
  assert.match(img,/^https:\/\//,f);assert.ok(fs.existsSync(path.join(ROOT,img.replace(/^https:\/\/uppalc\.github\.io\/cvstudiopro\//,''))),f+' image file');
 });
});
test('llms.txt: starts with an H1, has a summary, and every link points to an existing page',()=>{
 const t=fs.readFileSync(path.join(ROOT,'llms.txt'),'utf8');
 assert.match(t,/^# [^\n]+\n\n> /);
 const links=[...t.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map(m=>m[1]);assert.ok(links.length>=15);
 links.forEach(u=>assert.ok(fs.existsSync(path.join(ROOT,u.replace(/^https:\/\/uppalc\.github\.io\/cvstudiopro\//,'')||'index.html')),u));
});

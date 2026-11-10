'use strict';
// ZENZX JOKI ELITE - server (Node 18+, tanpa dependency)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {get:blobGet,put:blobPut}=require('@vercel/blob');
const ON_VERCEL=!!process.env.VERCEL, BLOB_PATH='zenzx/db.json';
const PORT=+process.env.PORT||3000;
const DATA_DIR=process.env.DATA_DIR||path.join(__dirname,'data');
const PUB=path.join(__dirname,'public');
const DB_FILE=path.join(DATA_DIR,'db.json');

/* ---------- katalog (harga bawaan, bisa diubah dari admin) ---------- */
const JKP=[{id:'jk-1',d:1,name:'Joki 1 hari',price:100},{id:'jk-2',d:2,name:'Joki 2 hari',price:200},{id:'jk-3',d:3,name:'Joki 3 hari',price:300},{id:'jk-4',d:4,name:'Joki 4 hari',price:400},{id:'jk-5',d:5,name:'Joki 5 hari',price:500},{id:'jk-30',d:30,name:'Paket Joki Bulanan',price:3000}];
const JKA=[{n:'+1 Hari',price:500,d:1},{n:'Video Facecam',price:2000,d:0},{n:'Prioritas Antrean',price:20000,d:0}];

/* ---------- database JSON ---------- */
const hashPw=(pw,salt)=>crypto.scryptSync(String(pw),salt,32).toString('hex');
function freshDb(){const salt=crypto.randomBytes(16).toString('hex');return{secret:crypto.randomBytes(32).toString('hex'),
 admin:{user:'admin',salt,hash:hashPw('admin@2026',salt),pv:1},
 site:{},maint:{},settings:{txShow:'paid',payMinutes:30,siteUrl:''},
 gateway:{mode:'manual',createUrl:'',method:'POST',apiKey:'',
  headers:'{"Content-Type":"application/json","Authorization":"Bearer {{api_key}}"}',bodyType:'json',
  body:'{"order_id":"{{order_id}}","amount":{{amount}},"callback_url":"{{callback_url}}"}',
  map:{qrString:'',qrImage:'',checkoutUrl:'',ref:'',expires:''},
  hook:{tokenMode:'none',tokenName:'',tokenValue:'',orderIdPath:'order_id',statusPath:'status',paidValues:'paid,success,settlement,completed',amountPath:''},
  verify:{on:false,url:'',method:'GET',path:'status',paid:'paid,success,settlement,completed'}},
 prices:{p:{},a:{},dp:{},da:{}},orders:[]}}
let db;
let dirty=false,st=null,initPromise=null,persistPromise=Promise.resolve();
async function load(){
 let stored=null;
 try{
  if(ON_VERCEL){const item=await blobGet(BLOB_PATH,{access:'private'});if(item){const chunks=[];for await(const chunk of item.stream)chunks.push(Buffer.from(chunk));stored=JSON.parse(Buffer.concat(chunks).toString('utf8'))}}
  else stored=JSON.parse(fs.readFileSync(DB_FILE,'utf8'));
 }catch(e){if(e.code!=='blob_not_found'&&e.name!=='BlobNotFoundError'&&e.code!=='ENOENT')console.error('[db] load:',e.message)}
 const d=freshDb();db=stored||d;
 for(const k of Object.keys(d)){if(db[k]===undefined)db[k]=d[k];else if(d[k]&&typeof d[k]==='object'&&!Array.isArray(d[k]))db[k]=Object.assign({},d[k],db[k])}
 db.gateway.map=Object.assign({},d.gateway.map,db.gateway.map);db.gateway.hook=Object.assign({},d.gateway.hook,db.gateway.hook);db.gateway.verify=Object.assign({},d.gateway.verify,db.gateway.verify);
 dirty=true;await persistDb();
}
function ensureLoaded(){if(!initPromise)initPromise=load();return initPromise}
const save=()=>{dirty=true;clearTimeout(st);st=setTimeout(()=>{persistDb().catch(e=>console.error('[db] save:',e.message))},120)};
function saveNow(){dirty=true;return persistDb()}
function persistDb(){if(!dirty||!db)return persistPromise;const snapshot=JSON.stringify(db);dirty=false;persistPromise=persistPromise.then(async()=>{
 if(ON_VERCEL)await blobPut(BLOB_PATH,snapshot,{access:'private',allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});
 else{fs.mkdirSync(DATA_DIR,{recursive:true});const t=DB_FILE+'.tmp';fs.writeFileSync(t,snapshot);fs.renameSync(t,DB_FILE)}
 }).catch(e=>{dirty=true;console.error('[db] persist:',e.message);throw e});return persistPromise}
['SIGINT','SIGTERM'].forEach(s=>process.on(s,()=>{saveNow().finally(()=>process.exit(0))}));

/* ---------- util ---------- */
const eff=(b,d)=>{if(!d||!d.v)return b;const cut=d.t==='pct'?Math.round(b*d.v/100):d.v;return Math.max(0,b-cut)};
const pkgs=()=>JKP.map(p=>{const base=db.prices.p[p.id]||p.price,price=eff(base,db.prices.dp[p.id]);return{id:p.id,d:p.d,name:p.name,base,price,disc:db.prices.dp[p.id]||null}});
const adds=()=>JKA.map((a,i)=>{const base=db.prices.a[i]||a.price,price=eff(base,db.prices.da[i]);return{i,n:a.n,d:a.d,base,price,disc:db.prices.da[i]||null}});
const clean=(s,n)=>String(s==null?'':s).replace(/[\u0000-\u0008\u000b-\u001f\u007f<>]/g,'').trim().slice(0,n||200);
const cleanL=(s,n)=>String(s==null?'':s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g,'').replace(/\r/g,'').trim().slice(0,n||2000);
const normWa=v=>{let d=String(v||'').replace(/\D/g,'');if(d.startsWith('0'))d='62'+d.slice(1);else if(d.startsWith('8'))d='62'+d;return d};
const maskWa=w=>{let d=String(w||'').replace(/\D/g,'');if(d.startsWith('62'))d='0'+d.slice(2);return d.length>3?'*'.repeat(d.length-3)+d.slice(-3):d};
const maskName=n=>{n=String(n||'');return n.length<=1?n:n[0]+'*'.repeat(Math.min(6,n.length-1))};
const maskId=id=>String(id).length>2?String(id).slice(0,6)+'*'.repeat(String(id).length-8)+String(id).slice(-2):id;
const L='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const newId=()=>{let id,t=0;do{const r=n=>crypto.randomInt(n);id='ZENZX-'+L[r(26)]+L[r(26)]+String(r(10000)).padStart(4,'0')}while(db.orders.some(o=>o.id===id)&&++t<5000);return id};
const eq=(a,b)=>{a=Buffer.from(String(a));b=Buffer.from(String(b));return a.length===b.length&&crypto.timingSafeEqual(a,b)};
const getPath=(o,p)=>{if(!p)return undefined;return String(p).replace(/\[(\d+)\]/g,'.$1').split('.').filter(Boolean).reduce((x,k)=>x==null?undefined:x[k],o)};
const jesc=v=>JSON.stringify(String(v)).slice(1,-1);
const fill=(s,v,mode)=>String(s).replace(/\{\{(\w+)\}\}/g,(m,k)=>v[k]===undefined?'':(mode==='form'?encodeURIComponent(v[k]):jesc(v[k])));
const rl=new Map();
function limit(ip,key,max,ms){const k=ip+'|'+key,n=Date.now();let a=(rl.get(k)||[]).filter(t=>n-t<ms);if(a.length>=max){rl.set(k,a);return false}a.push(n);rl.set(k,a);return true}
setInterval(()=>{const n=Date.now();for(const[k,a]of rl){if(!a.length||n-a[a.length-1]>3600e3)rl.delete(k)}},600e3).unref();

/* ---------- token admin (HMAC, tahan restart) ---------- */
const b64=b=>Buffer.from(b).toString('base64url');
function mkToken(){const p=b64(JSON.stringify({u:db.admin.user,pv:db.admin.pv,exp:Date.now()+7*864e5}));return p+'.'+crypto.createHmac('sha256',db.secret).update(p).digest('base64url')}
function okToken(t){try{const[p,s]=String(t).split('.');const sig=crypto.createHmac('sha256',db.secret).update(p).digest('base64url');if(!eq(s,sig))return false;const o=JSON.parse(Buffer.from(p,'base64url').toString());return o.exp>Date.now()&&o.pv===db.admin.pv&&o.u===db.admin.user}catch(e){return false}}

/* ---------- order ---------- */
function tickExpire(){const n=Date.now();db.orders.forEach(o=>{if(o.st==='unpaid'&&o.exp&&n>o.exp){o.st='expired'}});}
setInterval(()=>{tickExpire();const cut=Date.now()-3*864e5;const b=db.orders.length;db.orders=db.orders.filter(o=>!(o.st==='expired'&&o.t<cut));if(b!==db.orders.length)save()},60e3).unref();
const payInfo=o=>o.st==='unpaid'?Object.assign({mode:db.gateway.mode,exp:o.exp},o.gw||{}):null;
const pubOrder=(o,mask)=>({id:o.id,t:o.t,pn:o.pn,days:o.days,add:o.addNames,price:o.total,st:o.st,tp:o.tp||0,td:o.td||0,buyer:mask?maskName(o.name):o.name,wa:mask?maskWa(o.wa):o.wa,pay:payInfo(o)});
const adminOrder=o=>Object.assign(pubOrder(o,false),{note:o.note||'',manual:!!o.manual,mismatch:!!o.mismatch,ref:(o.gw&&o.gw.ref)||''});
function markPaid(o,manual){if(o.st==='pending'||o.st==='done')return false;o.st='pending';o.tp=Date.now();if(manual)o.manual=true;save();return true}

/* ---------- gateway ---------- */
function baseUrl(req){if(db.settings.siteUrl)return db.settings.siteUrl.replace(/\/+$/,'');const h=req.headers['x-forwarded-host']||req.headers.host,p=req.headers['x-forwarded-proto']||'http';return p.split(',')[0]+'://'+h}
async function gwFetch(url,method,headers,body,timeout){const ac=new AbortController(),t=setTimeout(()=>ac.abort(),timeout||15000);try{const r=await fetch(url,{method,headers,body:method==='GET'?undefined:body,signal:ac.signal});const tx=await r.text();let j=null;try{j=JSON.parse(tx)}catch(e){}return{ok:r.ok,status:r.status,json:j,text:tx}}finally{clearTimeout(t)}}
async function gwCreate(o,req){const g=db.gateway;
 if(g.mode!=='gateway')return{mode:'manual',qrImage:'qris.jpg'};
 if(!g.createUrl||!g.apiKey)throw new Error('Gateway belum diisi lengkap di admin.');
 const v={order_id:o.id,amount:o.total,callback_url:baseUrl(req)+'/api/webhook/gateway',api_key:g.apiKey,name:o.name,wa:o.wa,desc:o.pn};
 let headers;try{headers=JSON.parse(fill(g.headers||'{}',v))}catch(e){throw new Error('Format header gateway salah (harus JSON).')}
 let body=fill(g.body,v,g.bodyType==='form'?'form':'json');
 if(g.bodyType!=='form'){try{JSON.parse(body)}catch(e){throw new Error('Template body gateway bukan JSON valid.')}}
 else headers['Content-Type']=headers['Content-Type']||'application/x-www-form-urlencoded';
 const r=await gwFetch(g.createUrl,g.method==='GET'?'GET':'POST',headers,body);
 if(!r.json){console.error('[gateway] respon bukan JSON',r.status,r.text.slice(0,300));throw new Error('Respon gateway tidak terbaca.')}
 const m=g.map,pick=p=>{const x=getPath(r.json,p);return x==null||x===''?'':String(x)};
 const out={mode:'gateway',qrString:pick(m.qrString),qrImage:pick(m.qrImage),checkoutUrl:pick(m.checkoutUrl),ref:pick(m.ref)};
 if(!out.qrString&&!out.qrImage&&!out.checkoutUrl){console.error('[gateway] tidak ada QR di respon',r.status,JSON.stringify(r.json).slice(0,400));throw new Error('Gateway tidak mengembalikan QRIS. Cek pengaturan mapping & API key di admin.')}
 const ex=getPath(r.json,m.expires);let exp=0;if(ex!=null&&ex!==''){const n=+ex;exp=!isNaN(n)?(n>1e12?n:n>1e9?n*1000:0):(Date.parse(ex)||0)}
 out.exp=exp;return out}
async function gwVerify(orderIdVal,ref){const vf=db.gateway.verify;if(!vf.on||!vf.url)return null;
 const v={order_id:orderIdVal,ref:ref||orderIdVal,api_key:db.gateway.apiKey};
 let headers;try{headers=JSON.parse(fill(db.gateway.headers||'{}',v))}catch(e){return false}
 try{const r=await gwFetch(fill(vf.url,v,'form'),vf.method==='POST'?'POST':'GET',headers,'{}');if(!r.json)return false;
  const s=String(getPath(r.json,vf.path)||'').toLowerCase();return vf.paid.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(s)}catch(e){return false}}

/* ---------- http helpers ---------- */
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json'};
const send=(res,code,obj,extra)=>{const b=JSON.stringify(obj);res.writeHead(code,Object.assign({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},extra||{}));res.end(b)};
const readBody=(req,max)=>new Promise((ok,no)=>{let n=0;const c=[];req.on('data',d=>{n+=d.length;if(n>(max||65536)){no(new Error('too big'));req.destroy()}else c.push(d)});req.on('end',()=>ok(Buffer.concat(c).toString()));req.on('error',no)});
const ipOf=req=>String((req.headers['x-forwarded-for']||req.socket.remoteAddress||'')).split(',')[0].trim();
const isAdmin=req=>{const a=req.headers.authorization||'';return a.startsWith('Bearer ')&&okToken(a.slice(7))};

/* ---------- konfigurasi publik ---------- */
function publicCfg(){const P=pkgs(),A=adds();const jkpr={p:{},po:{},a:[],ao:[]};P.forEach(p=>{jkpr.p[p.id]=p.price;jkpr.po[p.id]=p.base});A.forEach(a=>{jkpr.a[a.i]=a.price;jkpr.ao[a.i]=a.base});return{site:db.site,maint:db.maint,jkpr,gw:db.gateway.mode}}
function indexHtml(){let h=fs.readFileSync(path.join(PUB,'index.html'),'utf8');const j=JSON.stringify(publicCfg()).replace(/</g,'\\u003c');h=h.replace('/*__CFG__*/null',j);if(db.site.name)h=h.replace(/<title>[^<]*<\/title>/,'<title>'+db.site.name.replace(/[<>&]/g,'')+'</title>');return h}

/* ---------- router ---------- */
async function api(req,res,url){const ip=ipOf(req),m=req.method,p=url.pathname;
 let body={};if(m==='POST'||m==='PUT'){
  if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))body=req.body;
  else{let raw='';try{raw=await readBody(req)}catch(e){return send(res,413,{error:'Data terlalu besar'})}
   const ct=req.headers['content-type']||'';if(raw){try{body=ct.includes('x-www-form-urlencoded')?Object.fromEntries(new URLSearchParams(raw)):JSON.parse(raw)}catch(e){try{body=Object.fromEntries(new URLSearchParams(raw))}catch(x){body={}}}}}
 }
 tickExpire();
 /* ---- publik ---- */
 if(p==='/api/config'&&m==='GET')return send(res,200,publicCfg());
 if(p==='/api/feed'&&m==='GET'){return send(res,200,db.orders.filter(o=>o.st==='pending'||o.st==='done').sort((a,b)=>b.tp-a.tp).slice(0,5).map(o=>({t:o.tp,k:'Joki',n:o.pn,pr:o.total,i:(o.name||'P')[0]})))}
 if(p==='/api/success'&&m==='GET'){const only=db.settings.txShow==='done'?['done']:['pending','done'];return send(res,200,db.orders.filter(o=>only.includes(o.st)).sort((a,b)=>(b.tp||0)-(a.tp||0)).slice(0,50).map(o=>({id:maskId(o.id),wa:maskWa(o.wa),price:o.total,t:o.tp||o.t})))}
 if(p==='/api/orders'&&m==='POST'){
  if(!limit(ip,'ord',8,60e3))return send(res,429,{error:'Terlalu banyak percobaan, tunggu sebentar.'});
  if(db.maint['svc:jk'])return send(res,503,{error:'Layanan sedang diperbaiki.'});
  const pk=pkgs().find(x=>x.id===body.pk);if(!pk)return send(res,400,{error:'Paket tidak ditemukan.'});
  const name=clean(body.name,40),wa=normWa(body.wa);if(name.length<2)return send(res,400,{error:'Isi nama (Store/JB).'});if(!/^62\d{8,13}$/.test(wa))return send(res,400,{error:'Nomor WhatsApp tidak valid.'});
  const idx=[...new Set((Array.isArray(body.add)?body.add:[]).map(Number))].filter(i=>Number.isInteger(i)&&i>=0&&i<JKA.length),A=adds();
  const sel=idx.map(i=>A[i]),total=pk.price+sel.reduce((s,a)=>s+a.price,0),days=pk.d+sel.reduce((s,a)=>s+a.d,0);
  if(!(total>=100))return send(res,400,{error:'Total tidak valid.'});
  const o={id:newId(),pk:pk.id,pn:pk.name,days,addNames:sel.map(a=>a.n),total,name,wa,note:cleanL(body.note,600),st:'unpaid',t:Date.now()};
  o.exp=o.t+(+db.settings.payMinutes||30)*60000;
  try{o.gw=await gwCreate(o,req);if(o.gw.exp)o.exp=o.gw.exp}catch(e){console.error('[order]',e.message);return send(res,502,{error:'Pembayaran belum bisa dibuat: '+e.message+' Hubungi admin.'})}
  db.orders.push(o);save();return send(res,200,pubOrder(o,false))}
 let mm;
 if((mm=/^\/api\/orders\/([A-Za-z0-9-]{6,20})$/.exec(p))&&m==='GET'){if(!limit(ip,'look',40,60e3))return send(res,429,{error:'Terlalu banyak permintaan.'});const o=db.orders.find(x=>x.id===mm[1].toUpperCase());if(!o)return send(res,404,{error:'Pesanan tidak ditemukan.'});return send(res,200,pubOrder(o,true))}
 if(p==='/api/orders/status'&&m==='POST'){if(!limit(ip,'batch',30,60e3))return send(res,429,{error:'Terlalu banyak permintaan.'});const out={};(Array.isArray(body.ids)?body.ids:[]).slice(0,30).forEach(id=>{const o=db.orders.find(x=>x.id===String(id).toUpperCase());if(o)out[o.id]=pubOrder(o,true)});return send(res,200,out)}
 /* ---- webhook gateway ---- */
 if(p==='/api/webhook/gateway'&&(m==='POST'||m==='GET')){const g=db.gateway,h=g.hook;
  if(m==='GET')body=Object.fromEntries(url.searchParams);
  const hasToken=h.tokenMode!=='none'&&h.tokenValue,hasVerify=g.verify.on&&g.verify.url;
  if(!hasToken&&!hasVerify){console.error('[webhook] ditolak: belum ada token/verifikasi di admin');return send(res,403,{error:'forbidden'})}
  if(hasToken){let got='';if(h.tokenMode==='header')got=req.headers[String(h.tokenName).toLowerCase()]||'';else if(h.tokenMode==='query')got=url.searchParams.get(h.tokenName)||'';else got=String(getPath(body,h.tokenName)||'');if(!eq(got,h.tokenValue)){console.error('[webhook] token salah');return send(res,403,{error:'forbidden'})}}
  const idv=String(getPath(body,h.orderIdPath)||''),sv=String(getPath(body,h.statusPath)||'').toLowerCase();
  const o=db.orders.find(x=>x.id===idv||(x.gw&&x.gw.ref&&x.gw.ref===idv));if(!o)return send(res,200,{ok:true,note:'order tidak dikenal'});
  const paidVals=h.paidValues.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!paidVals.includes(sv))return send(res,200,{ok:true,note:'bukan status lunas'});
  if(h.amountPath){const a=Number(getPath(body,h.amountPath));if(!isNaN(a)&&a!==o.total){o.mismatch=true;save();console.error('[webhook] nominal beda',o.id,a,o.total);return send(res,200,{ok:true,note:'nominal tidak cocok'})}}
  if(hasVerify){const ok=await gwVerify(o.id,o.gw&&o.gw.ref);if(!ok){console.error('[webhook] verifikasi ke gateway gagal',o.id);return send(res,200,{ok:true,note:'belum terverifikasi'})}}
  markPaid(o,false);return send(res,200,{ok:true})}
 /* ---- admin ---- */
 if(p==='/api/admin/login'&&m==='POST'){if(!limit(ip,'login',6,10*60e3))return send(res,429,{error:'Terlalu banyak percobaan. Coba lagi 10 menit.'});
  const okU=eq(String(body.user||''),db.admin.user),okP=eq(hashPw(String(body.pass||''),db.admin.salt),db.admin.hash);
  if(!(okU&&okP))return send(res,401,{error:'Username atau password salah.'});return send(res,200,{token:mkToken(),user:db.admin.user})}
 if(p.startsWith('/api/admin/')){if(!isAdmin(req))return send(res,401,{error:'Belum login.'});
  if(p==='/api/admin/me')return send(res,200,{user:db.admin.user});
  if(p==='/api/admin/orders'&&m==='GET'){const l=db.orders.slice().sort((a,b)=>b.t-a.t).slice(0,500).map(adminOrder);const c={};db.orders.forEach(o=>c[o.st]=(c[o.st]||0)+1);return send(res,200,{orders:l,counts:c})}
  if((mm=/^\/api\/admin\/orders\/([A-Z0-9-]+)$/.exec(p))&&m==='POST'){const o=db.orders.find(x=>x.id===mm[1]);if(!o)return send(res,404,{error:'Tidak ditemukan'});const a=body.a;
   if(a==='done'){if(o.st!=='pending')return send(res,400,{error:'Hanya pesanan pending yang bisa diselesaikan.'});o.st='done';o.td=Date.now()}
   else if(a==='undone'){if(o.st!=='done')return send(res,400,{error:'Bukan pesanan selesai.'});o.st='pending';delete o.td}
   else if(a==='paid'){if(o.st==='pending'||o.st==='done')return send(res,400,{error:'Sudah dibayar.'});markPaid(o,true)}
   else if(a==='invalid'){o.st='invalid'}
   else if(a==='delete'){db.orders=db.orders.filter(x=>x!==o)}
   else return send(res,400,{error:'Aksi tidak dikenal'});
   save();return send(res,200,{ok:true,order:a==='delete'?null:adminOrder(o)})}
  if(p==='/api/admin/settings'&&m==='GET'){const g=db.gateway,sec=g.apiKey?'••••'+g.apiKey.slice(-4):'';return send(res,200,{adminUser:db.admin.user,site:db.site,maint:db.maint,settings:db.settings,callbackUrl:baseUrl(req)+'/api/webhook/gateway',prices:{pk:pkgs(),ad:adds()},gateway:Object.assign({},g,{apiKey:'',apiKeyHint:sec,hook:Object.assign({},g.hook,{tokenValue:'',tokenHint:g.hook.tokenValue?'••••'+g.hook.tokenValue.slice(-3):''})})})}
  if(p==='/api/admin/site'&&m==='PUT'){const s={};['name','heroTitle','heroEm','heroSub','marquee','footer1','footer2','footer3','ver','waChannel'].forEach(k=>{const v=cleanL(body[k],400);if(v)s[k]=v});const wa=String(body.wa||'').replace(/\D/g,'');if(wa)s.wa=wa;db.site=s;
   const tx=body.txShow==='done'?'done':'paid';db.settings.txShow=tx;const pm=Math.round(+body.payMinutes);if(pm>=5&&pm<=180)db.settings.payMinutes=pm;save();return send(res,200,{ok:true})}
  if(p==='/api/admin/maint'&&m==='PUT'){db.maint['svc:jk']=!!body.jk;save();return send(res,200,{ok:true})}
  if(p==='/api/admin/prices'&&m==='PUT'){const np={p:{},a:{},dp:{},da:{}};
   const chk=(base,d,label)=>{base=Math.round(+base);if(!(base>=100&&base<=1e7))return label+': harga dasar harus Rp100 - Rp10.000.000.';let dd=null;if(d&&+d.v>0){dd={t:d.t==='nom'?'nom':'pct',v:Math.round(+d.v)};if(dd.t==='pct'&&dd.v>95)return label+': diskon maks 95%.'}
    if(!(eff(base,dd)>=100))return label+': harga setelah diskon minimal Rp100.';return{base,dd}};
   for(const p0 of JKP){const r=chk((body.p||{})[p0.id],(body.dp||{})[p0.id],p0.name);if(typeof r==='string')return send(res,400,{error:r});np.p[p0.id]=r.base;if(r.dd)np.dp[p0.id]=r.dd}
   for(let i=0;i<JKA.length;i++){const r=chk((body.a||{})[i],(body.da||{})[i],JKA[i].n);if(typeof r==='string')return send(res,400,{error:r});np.a[i]=r.base;if(r.dd)np.da[i]=r.dd}
   db.prices=np;save();return send(res,200,{ok:true})}
  if(p==='/api/admin/gateway'&&m==='PUT'){const g=db.gateway,n=Object.assign({},g);
   n.mode=body.mode==='gateway'?'gateway':'manual';n.createUrl=clean(body.createUrl,500);n.method=body.method==='GET'?'GET':'POST';if(clean(body.apiKey,300))n.apiKey=clean(body.apiKey,300);
   n.headers=cleanL(body.headers,1000)||g.headers;n.bodyType=body.bodyType==='form'?'form':'json';n.body=cleanL(body.body,2000);
   const mp=body.map||{};n.map={};['qrString','qrImage','checkoutUrl','ref','expires'].forEach(k=>n.map[k]=clean(mp[k],100));
   const hk=body.hook||{};n.hook=Object.assign({},g.hook);n.hook.tokenMode=['header','body','query'].includes(hk.tokenMode)?hk.tokenMode:'none';n.hook.tokenName=clean(hk.tokenName,60);if(clean(hk.tokenValue,200))n.hook.tokenValue=clean(hk.tokenValue,200);
   n.hook.orderIdPath=clean(hk.orderIdPath,100)||'order_id';n.hook.statusPath=clean(hk.statusPath,100)||'status';n.hook.paidValues=clean(hk.paidValues,200)||'paid';n.hook.amountPath=clean(hk.amountPath,100);
   const vf=body.verify||{};n.verify={on:!!vf.on,url:clean(vf.url,500),method:vf.method==='POST'?'POST':'GET',path:clean(vf.path,100)||'status',paid:clean(vf.paid,200)||'paid'};
   const su=clean(body.siteUrl,200);if(su&&!/^https?:\/\/[^\s]+$/.test(su))return send(res,400,{error:'URL website harus diawali http:// atau https://'});db.settings.siteUrl=su;
   if(n.mode==='gateway'){if(!n.createUrl||!n.apiKey)return send(res,400,{error:'Mode otomatis butuh URL create + API key.'});if(!(n.hook.tokenMode!=='none'&&n.hook.tokenValue)&&!(n.verify.on&&n.verify.url))return send(res,400,{error:'Demi keamanan, isi token webhook ATAU aktifkan verifikasi ke server gateway. Tanpa itu siapa pun bisa memalsukan pembayaran.'});if(!n.map.qrString&&!n.map.qrImage&&!n.map.checkoutUrl)return send(res,400,{error:'Isi minimal satu mapping: QR string / QR image / link bayar.'})}
   db.gateway=n;save();return send(res,200,{ok:true})}
  if(p==='/api/admin/password'&&m==='POST'){if(!limit(ip,'pw',6,10*60e3))return send(res,429,{error:'Terlalu banyak percobaan.'});
   if(!eq(hashPw(String(body.cur||''),db.admin.salt),db.admin.hash))return send(res,400,{error:'Password lama salah.'});
   const nu=clean(body.user,30)||db.admin.user,np=String(body.pass||'');if(!/^[A-Za-z0-9_.-]{3,30}$/.test(nu))return send(res,400,{error:'Username 3-30 karakter (huruf, angka, _ . -).'});if(np.length<8)return send(res,400,{error:'Password baru minimal 8 karakter.'});
   const salt=crypto.randomBytes(16).toString('hex');db.admin={user:nu,salt,hash:hashPw(np,salt),pv:db.admin.pv+1};save();return send(res,200,{ok:true,token:mkToken(),user:nu})}
  return send(res,404,{error:'Tidak ada'})}
 return send(res,404,{error:'Tidak ada'})}

async function handler(req,res){
 try{await ensureLoaded();const url=new URL(req.url,'https://vercel.local');
  const routedPath=url.searchParams.get('__vercel_path');if(routedPath){url.searchParams.delete('__vercel_path');url.pathname=decodeURIComponent(routedPath)}
  if(url.pathname.startsWith('/api/')){await api(req,res,url);await persistDb();return}
  let f=decodeURIComponent(url.pathname);if(f==='/'||f==='/index.html'){res.writeHead(200,{'Content-Type':MIME['.html'],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(indexHtml());return}
  const fp=path.join(PUB,path.normalize(f).replace(/^(\.\.[\/\\])+/,''));if(!fp.startsWith(PUB+path.sep)||!fs.existsSync(fp)||!fs.statSync(fp).isFile()){res.writeHead(404);res.end('Not found');return}
  res.writeHead(200,{'Content-Type':MIME[path.extname(fp).toLowerCase()]||'application/octet-stream','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'});fs.createReadStream(fp).pipe(res);
 }catch(e){console.error(e);try{send(res,500,{error:ON_VERCEL?'Database Vercel belum siap. Pastikan Vercel Blob private terhubung dan BLOB_READ_WRITE_TOKEN tersedia.':'Server error'})}catch(x){}}
}
if(require.main===module){http.createServer(handler).listen(PORT,'0.0.0.0',()=>console.log('ZENZX jalan di port '+PORT));}
module.exports=handler;

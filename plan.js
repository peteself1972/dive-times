/* OnPanel: Dive plan.
   Pre-dive planning (dive information card, depth sketch, checks, bailout, OBG and O2 minimums, Drager tubes, PDF)
   driven by a company RULES PROFILE that the user loads or types in on the phone.
   No company's rules ship with the app: profiles live in this phone's storage only.
   Loaded after the main script; uses its globals (state, save, render, esc, clock, toast, ring, fired). */
(function(){
'use strict';
const PKEY='diveTimes.plan';

/* ---------- blank rules profile: every number the plan uses, nothing preset ---------- */
const BLANK={v:1,name:'',notes:'',
  pp:{diver:{min:null,opt:null,max:null},bell:{min:null,opt:null,max:null},obg:{min:null,opt1:null,opt2:null,max:null}},
  co2:{mbar:null,shortMbar:null},
  bailout:{type:'cobra',minPer10m:null,rate:null,regLoss:null,fillPct:null,cobraFloor:null},
  obg:{minutes:null,rate:null,men:null,residual:null},
  o2:{lpm:null,hours:null,men:null,residual:null},
  standoff:{ok:null,min:null},
  drop:{green:null,amber:null,bellAtm:null},
  envelope:{diveMin:null,diveMax:null,storMin:null,storMax:null,heatFrom:null},
  reclaim:{suction:null},
  tubes:[],
  refs:{pp:'',co2:'',bailout:'',obg:'',o2:'',standoff:'',drop:'',envelope:'',exc:'',cobra:'',tubes:''},
  tables:{exc:[],cobraMix:[],cobraP:[],cobraDur:[]}};
const clone=o=>JSON.parse(JSON.stringify(o));
function deepMerge(base,over){if(Array.isArray(base))return Array.isArray(over)?over:base;
  if(base&&typeof base==='object'){const r={};for(const k of Object.keys(base))r[k]=deepMerge(base[k],over?over[k]:undefined);
    if(over&&typeof over==='object')for(const k of Object.keys(over))if(!(k in r))r[k]=over[k];return r}
  return over===undefined?base:over}
const normProfile=p=>deepMerge(clone(BLANK),p||{});

/* ---------- plan storage (separate from the timer state) ---------- */
const DEFJOB={name:'',diver:'',dmin:'',bell:'',storage:'',sm:'',off:'',structure:'',seabed:'',umb:'',bovol:'',bop:'',
  banks:[{name:'Bank 1',v:'',p:''},{name:'Bank 2',v:'',p:''},{name:'Bank 3',v:''+'',p:''}],o2:{v:'',p:''},bankMix:['','',''],cobraP:['','','']};
let P={profiles:{},active:'',job:clone(DEFJOB),reading:null};
try{const s=JSON.parse(localStorage.getItem(PKEY));if(s&&typeof s==='object')P={...P,...s}}catch(e){}
P.job=deepMerge(clone(DEFJOB),P.job);if(!Array.isArray(P.job.banks)||!P.job.banks.length)P.job.banks=clone(DEFJOB.banks);
for(const id in P.profiles)P.profiles[id]=normProfile(P.profiles[id]);
function psave(){try{localStorage.setItem(PKEY,JSON.stringify(P))}catch(e){toast('Could not save the dive plan on this phone')}}
const R=()=>P.profiles[P.active]||null;

/* ---------- helpers ---------- */
const num=v=>{if(v===''||v==null)return null;const x=parseFloat(String(v).replace(',','.'));return isFinite(x)?x:null};
const has=(...a)=>a.every(x=>x!=null&&isFinite(x));
const abs=d=>d/10+1;
const f1=x=>(Math.round(x*10)/10).toFixed(1),f2=x=>(Math.round(x*100)/100).toFixed(2);
const ref=k=>{const r=R();return r&&r.refs&&r.refs[k]?' ('+r.refs[k]+')':''};

/* ---------- tables ---------- */
function excRow(D){const r=R();if(!r)return null;const t=r.tables.exc;for(const row of t)if(row[0]===D)return row;return null}
function excEnv(st,dmax,dmin){const r=R();if(!r||!r.tables.exc.length)return{lvl:'warn',title:'No excursion table loaded',msg:'Load one under Rules › Tables to check excursions.'};
  st=Math.round(st);const D=Math.round(Math.max(st,dmax??st)),S=Math.round(Math.min(st,dmin??st));
  if(D===st&&S===st)return{lvl:'ok',type:'none',title:'At storage depth, no excursion',msg:''};
  const row=excRow(D);if(!row)return{lvl:'warn',title:`${D} msw is not in the loaded excursion table`,msg:'Check the table by hand.'};
  const ss=row[1],es=row[4],type=D>st&&S<st?'Combined up/down':D>st?'Downward':'Upward';
  const what=type==='Downward'?`${D} msw from storage ${st}`:type==='Upward'?`up to ${S} msw from storage ${st}`:`${S} to ${D} msw, storage ${st}`;
  if(S>=ss)return{lvl:'ok',type,title:`${type} excursion OK: ${what} msw`,msg:`Standard envelope for ${D} msw: ${ss} to ${D} msw.${ref('exc')}`,ss,es};
  if(S>=es)return{lvl:'warn',type,title:`EXTENDED ${type.toLowerCase()} excursion: ${what} msw`,msg:`Extended envelope ${es} to ${D} msw; standard limit ${ss} msw. Follow your extended excursion approvals.${ref('exc')}`,ss,es};
  return{lvl:'bad',type,title:`OUTSIDE BOTH EXCURSION LIMITS: ${what} msw`,msg:`Standard ${ss}, extended ${es} msw for deepest ${D} msw. STOP and check the excursion table.${ref('exc')}`,ss,es}}
function cobraLimits(d){const r=R();if(!r||!r.tables.cobraMix.length||d==null)return null;const t=[...r.tables.cobraMix].sort((a,b)=>a[0]-b[0]);
  if(d<t[0][0]||d>t[t.length-1][0])return null;const lo=t.filter(x=>x[0]<=d).pop(),hi=t.find(x=>x[0]>=d);
  return{min:Math.max(lo[1],hi[1]),max:Math.min(lo[3],hi[3])}}
function cobraRow(d){const r=R();if(!r||!r.tables.cobraDur.length)return null;const rows=[...r.tables.cobraDur].sort((a,b)=>a[0]-b[0]);
  const want=Math.ceil(d/10)*10;return rows.find(x=>x[0]>=want)||null}
function cobraDur(d,press){const r=R(),row=cobraRow(d);if(!row||press==null)return null;const Ps=r.tables.cobraP;if(press<Ps[0])return 0;
  const i=Ps.filter(x=>x<=press).length-1;return row[1+Math.min(i,Ps.length-1)]}
function cobraMinPress(d,need){const r=R(),row=cobraRow(d);if(!row||need==null)return null;const Ps=r.tables.cobraP;
  for(let i=0;i<Ps.length;i++)if(row[1+i]>=need)return Ps[i];return Infinity}

/* ---------- the numbers ---------- */
function nums(){const r=R(),J=P.job,n=k=>num(J[k]);
  const d=n('diver'),dmin=n('dmin'),b=n('bell'),st=n('storage'),sm=n('sm'),off=n('off')??0,str=n('structure'),sb=n('seabed'),umb=n('umb');
  const cl=b!=null?+(b+off).toFixed(1):null;const Pd=d!=null?abs(d):null,Pb=b!=null?abs(b):null;
  const N={r,d,dmin,b,st,sm,off,cl,str,sb,umb,P:Pd,B:Pb};
  if(!r)return N;
  const pp=r.pp,pct=(x,Pa)=>has(x)&&Pa?+(x/Pa*100).toFixed(2):null;
  N.dv=Pd?[['max',pp.diver.max],['optimum',pp.diver.opt],['min',pp.diver.min]].filter(x=>has(x[1])).map(([l,x])=>[x,l,pct(x,Pd)]):[];
  N.bl=Pb?[['max',pp.bell.max],['optimum',pp.bell.opt],['min',pp.bell.min]].filter(x=>has(x[1])).map(([l,x])=>[x,l,pct(x,Pb)]):[];
  if(has(r.co2.mbar)){N.dco2=Pd?Math.floor(r.co2.mbar*1000/Pd):null;N.bco2=Pb?Math.floor(r.co2.mbar*1000/Pb):null}
  const o=pp.obg;if(Pb&&has(o.min,o.max)){N.obg={min:pct(o.min,Pb),opt1:has(o.opt1)?pct(o.opt1,Pb):null,opt2:has(o.opt2)?pct(o.opt2,Pb):null,max:pct(o.max,Pb),
    maxDrop:sb!=null?pct(o.max,abs(sb)):null}}
  // bailout
  const bo=r.bailout;N.need=umb!=null&&has(bo.minPer10m)?umb/10*bo.minPer10m:null;
  if(bo.type==='cobra'){const lim=d!=null?cobraLimits(d):null,limB=b!=null?cobraLimits(b):null;
    N.cobraWin=lim&&limB?{min:Math.max(lim.min,limB.min),max:Math.min(lim.max,limB.max)}:lim;
    if(d!=null){const m=cobraMinPress(d,N.need||0);N.cobraMin=m==null?null:Math.max(m,bo.cobraFloor||0)}}
  const bovol=n('bovol'),bop=n('bop');
  if(bo.type!=='cobra'&&d!=null&&has(bovol,bop,bo.rate,bo.regLoss,bo.fillPct)){const f=1-bo.fillPct/100,avail=bop*f-bo.regLoss-Pd;
    N.std={vol:bovol,fill:bop,avail,dur:avail>0?avail*bovol/(bo.rate*Pd):0,minP:N.need!=null?(bo.rate*Pd*N.need/bovol+bo.regLoss+Pd)/f:null}}
  // reclaim
  if(Pb)N.rec={abs:Pb,bpr:Pb-1,psi:(Pb-1)*14.5,suc:has(r.reclaim.suction)?r.reclaim.suction:null};
  // OBG and O2 minimums
  const g=r.obg,deps=[d,b].filter(x=>x!=null);
  if(deps.length&&has(g.minutes,g.rate,g.residual)){const D=Math.max(...deps),Pa=abs(D),need=g.rate*g.minutes*Pa;
    N.obgReq={D,P:Pa,need,total:has(g.men)?+(g.men*need/1000).toFixed(1):null,rows:J.banks.map((bk,i)=>{const v=num(bk.v);
      const min=v?Math.ceil(need/v+Pa+g.residual):null;return{i,name:bk.name||('Bank '+(i+1)),v,min}})}}
  const q=r.o2,ov=num(J.o2.v);const odep=b!=null?b:d;
  if(ov&&odep!=null&&has(q.lpm,q.hours,q.men,q.residual)){const min=Math.ceil(q.men*q.lpm*60*q.hours/ov+abs(odep)+q.residual);N.o2r={v:ov,depth:odep,min}}
  return N}

/* ---------- checks ---------- */
function checks(N){const r=N.r,out=[];if(!r)return out;const{d,b,st,cl,str,sb,B}=N;
  if(st!=null&&(d!=null||N.dmin!=null)){const c=excEnv(st,d!=null?Math.max(d,b||0):st,N.dmin!=null?Math.min(N.dmin,b||Infinity):(b||st));if(c&&c.type!=='none')out.push([c.lvl,'Divers'+(b!=null?' and bell':'')+': '+c.title+'. '+c.msg])}
  if(st!=null&&b!=null){const c=excEnv(st,b,b);if(c&&c.type&&c.type!=='none')out.push([c.lvl,`Bell ${b} msw from storage ${st} msw (bellman is an excursion diver too): ${c.title}`])}
  const so=r.standoff;
  const sOut=(gap,what)=>{if(!has(so.ok,so.min))return;out.push([gap>=so.ok?'ok':gap>=so.min?'warn':'bad',
    gap>=so.ok?`Clump is ${gap} m above the ${what}`:gap>=so.min?`REDUCED STANDOFF: clump only ${gap} m above the ${what}. Reduced standoff controls apply.${ref('standoff')}`
    :`STOP: clump ${gap<0?'is below the '+what:'only '+gap+' m above the '+what}. Minimum ${so.min} m.${ref('standoff')}`])};
  if(cl!=null&&str!=null)sOut(+(str-cl).toFixed(1),'structure');
  if(cl!=null&&sb!=null)sOut(+(sb-cl).toFixed(1),'seabed');
  const dr=r.drop;if(b!=null&&sb!=null&&B&&has(dr.green,dr.amber)){const Ps=abs(sb),loss=(1-B/Ps)*100,lvl=loss<=dr.green?'ok':loss<=dr.amber?'warn':'bad';
    const pp=has(dr.bellAtm)?dr.bellAtm*Ps/B:null,mx=r.pp.bell.max;
    out.push([lvl,`If the bell dropped from ${b} to the seabed at ${sb} msw: bubble volume loss ${loss.toFixed(0)}%${lvl==='bad'?' (RED: bottom door closed for launch and recovery)':''}.`+(pp!=null?` Bell atmosphere at ${dr.bellAtm} bar would read ${f2(pp)} bar at the seabed${has(mx)&&pp>mx?', above the '+mx+' max':''}.`:'')+ref('drop')])}
  const e=r.envelope;
  if(d!=null&&has(e.diveMin,e.diveMax)&&(d<e.diveMin||d>e.diveMax))out.push(['bad',`Diving depth outside the ${e.diveMin} to ${e.diveMax} msw envelope${ref('envelope')}`]);
  if(st!=null&&has(e.storMin,e.storMax)&&(st<e.storMin||st>e.storMax))out.push(['bad',`Storage outside the ${e.storMin} to ${e.storMax} msw envelope${ref('envelope')}`]);
  if(d!=null&&has(e.heatFrom)&&d>=e.heatFrom)out.push(['warn',`${e.heatFrom} msw or deeper: diver gas heating required${ref('envelope')}`]);
  return out}

/* ---------- missing rules: say what is not set rather than guess ---------- */
function gaps(){const r=R();if(!r)return['No rules profile loaded'];const g=[];
  const need=(ok,label)=>{if(!ok)g.push(label)};
  need(has(r.pp.diver.min,r.pp.diver.max),'Diver ppO2 limits');need(has(r.pp.bell.min,r.pp.bell.max),'Bell ppO2 limits');need(has(r.pp.obg.min,r.pp.obg.max),'Onboard gas ppO2 limits');
  need(has(r.co2.mbar),'CO2 limit');need(has(r.bailout.minPer10m),'Bailout minutes per 10 m');need(has(r.obg.minutes,r.obg.rate,r.obg.residual),'OBG minimum rule');
  need(has(r.o2.lpm,r.o2.hours,r.o2.men,r.o2.residual),'Bell O2 reserve rule');need(has(r.standoff.ok,r.standoff.min),'Standoff distances');
  need(r.tables.exc.length,'Excursion table');if(r.bailout.type==='cobra')need(r.tables.cobraDur.length&&r.tables.cobraP.length,'COBRA duration table'),need(r.tables.cobraMix.length,'COBRA gas mix table');
  return g}

/* ---------- sketch ---------- */
function sketch(N){const{st,sm,b,cl,str,sb}=N;if([st,sm,b,cl,str,sb].every(x=>x==null))return'<p class="hint">Enter the depths and the sketch draws itself.</p>';
  const W=560,H=430,v=x=>x!=null?x+' m':'– m';let g='';const T=(x,y,t,o='',sz=19,c='#111')=>`<text x="${x}" y="${y}" font-family="system-ui,sans-serif" font-size="${sz}" font-weight="700" fill="${c}" ${o}>${esc(t)}</text>`;
  g+=T(30,52,'STORAGE '+v(st),'text-decoration="underline"',22);
  g+=`<line x1="120" y1="90" x2="120" y2="190" stroke="#111" stroke-width="3"/><rect x="108" y="190" width="24" height="30" fill="none" stroke="#111" stroke-width="3"/><line x1="120" y1="220" x2="120" y2="232" stroke="#111" stroke-width="3"/>`+T(145,212,v(sm)+' S/M');
  g+=`<circle cx="360" cy="130" r="40" fill="none" stroke="#111" stroke-width="3"/>`+T(360,137,v(b),'text-anchor="middle"')+T(412,96,'BELL');
  g+=`<line x1="335" y1="166" x2="310" y2="230" stroke="#111" stroke-width="3"/><line x1="385" y1="166" x2="410" y2="230" stroke="#111" stroke-width="3"/><line x1="290" y1="230" x2="430" y2="230" stroke="#111" stroke-width="6"/>`+T(440,224,'CLUMP')+T(440,248,v(cl));
  g+=`<rect x="80" y="300" width="100" height="100" fill="none" stroke="#111" stroke-width="3"/><line x1="80" y1="300" x2="180" y2="400" stroke="#111" stroke-width="2"/><line x1="180" y1="300" x2="80" y2="400" stroke="#111" stroke-width="2"/>`+T(190,330,v(str))+T(190,354,'STRUCTURE','',16);
  const gap=cl!=null&&str!=null?(+(str-cl).toFixed(1))+' m':'',bad=cl!=null&&str!=null&&str<=cl;
  g+=`<line x1="180" y1="300" x2="270" y2="300" stroke="#c00" stroke-width="2" stroke-dasharray="7 5"/><line x1="245" y1="230" x2="290" y2="230" stroke="#c00" stroke-width="2" stroke-dasharray="7 5"/><line x1="265" y1="236" x2="265" y2="294" stroke="#c00" stroke-width="3"/><polygon points="265,230 259,240 271,240" fill="#c00"/><polygon points="265,300 259,290 271,290" fill="#c00"/>`+T(276,274,bad?'CHECK':gap,'',19,'#c00');
  g+=`<path d="M10 405 q 35 -8 70 0 t 70 0 t 70 0 t 70 0 t 70 0 t 70 0 t 70 0 t 70 0" fill="none" stroke="#111" stroke-width="3"/>`+T(545,428,'SEABED '+v(sb),'text-anchor="end"',22);
  g+=`<line x1="360" y1="240" x2="360" y2="395" stroke="#111" stroke-width="3"/><polygon points="360,232 353,246 367,246" fill="#111"/><polygon points="360,403 353,389 367,389" fill="#111"/>`+T(372,330,cl!=null&&sb!=null?(+(sb-cl).toFixed(1))+' m':'','',24);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;background:#fff;border-radius:10px;display:block" role="img" aria-label="Depth sketch">${g}</svg>`}

/* ---------- UI: the plan panel ---------- */
let view='plan';
const sec=document.createElement('section');sec.id='plan';sec.hidden=true;sec.setAttribute('role','dialog');sec.setAttribute('aria-modal','true');document.body.appendChild(sec);
const css=document.createElement('style');css.textContent=`
#plan{position:fixed;inset:0;z-index:5;background:var(--bg);overflow-y:auto;padding-inline:16px;padding-block:calc(var(--barh,64px) + 8px) 120px}
#plan .set input,#plan .set select{width:6.5em;background:var(--raise);border:1px solid var(--line);border-radius:8px;padding:8px;text-align:right;font-variant-numeric:tabular-nums;min-height:44px}
#plan .set input.wide,#plan .set select{width:11em;text-align:left}
#plan .set{padding:6px 0}
.pl-tabs{display:flex;gap:8px;flex-wrap:wrap}
.pl-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:2px solid var(--fg);border-radius:10px;overflow:hidden}
.pl-grid div{padding:8px 10px;border-bottom:1px solid var(--line);font-family:var(--f-display);font-weight:600;font-size:1.25rem;font-variant-numeric:tabular-nums;display:flex;justify-content:space-between;gap:8px}
.pl-grid div:nth-child(odd){border-right:1px solid var(--line)}
.pl-grid .h{background:var(--raise);font-weight:700;color:var(--accent)}
.pl-grid .lbl{color:var(--muted);font-size:.85rem;font-family:var(--f-body);font-weight:600;align-self:center}
.pl-grid .opt{background:var(--ok-bg)}
.pl-chk{display:grid;gap:8px}
.pl-chk div{border-radius:8px;padding:8px 10px;border:1px solid var(--line);border-left:6px solid var(--line);background:var(--panel);font-size:.95rem}
.pl-chk .ok{border-left-color:var(--ok)}.pl-chk .warn{border-left-color:var(--warn)}.pl-chk .bad{border-left-color:var(--crit);background:var(--over-bg)}
.pl-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.pl-k{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)}
.pl-k:last-child{border-bottom:none}.pl-k b{font-family:var(--f-display);font-size:1.2rem;font-variant-numeric:tabular-nums}
.pl-k.low b{color:var(--crit)}
#plan textarea{width:100%;min-height:110px;background:var(--raise);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;font-size:.85rem;color:var(--fg)}
.pl-warnbox{border:2px solid var(--warn);border-radius:10px;padding:10px 12px;color:var(--fg)}
.pl-warnbox b{color:var(--warn)}
#cardview{position:fixed;inset:0;z-index:5;background:var(--bg);display:flex;flex-direction:column;padding-top:var(--barh,64px)}
#cardview .cvbar{display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--line)}
#cardview .cvbar b{flex:1;font-family:var(--f-display);text-transform:uppercase;letter-spacing:.05em}
#cardview .cvbody{position:relative;flex:1;overflow:auto;padding:12px 16px calc(24px + env(safe-area-inset-bottom,0px));-webkit-overflow-scrolling:touch}
#cardview canvas{display:block;width:100%;height:auto;background:#fff;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,.35)}
#cardview.zoom canvas{width:250%;max-width:none}
#cardview .hint{text-align:center;margin-top:8px}
#plan .pl-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)}
#plan .pl-row:last-child{border-bottom:none}
#plan .pl-row label{font-weight:600;color:var(--fg);font-size:1rem;line-height:1.2}
#plan .pl-row label small{display:block;font-weight:400;color:var(--muted);font-size:.8rem;margin-top:2px}
#plan .pl-in{position:relative;display:inline-block}
#plan .pl-in input{width:7.6em;min-height:48px;background:var(--raise);border:1px solid var(--line);border-radius:10px;padding:8px 3.1em 8px 10px;text-align:right;font-family:var(--f-display);font-weight:600;font-size:1.3rem;font-variant-numeric:tabular-nums;color:var(--fg)}
#plan .pl-in input.txt{width:11em;padding-right:10px;text-align:left;font-family:var(--f-body);font-size:1rem;font-weight:500}
#plan .pl-in i{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-style:normal;font-size:.8rem;color:var(--muted);pointer-events:none}
#plan .pl-in input:placeholder-shown{border-color:var(--accent);border-style:dashed}
#plan .pl-row.opt .pl-in input:placeholder-shown{border-color:var(--line);border-style:solid}
#plan .pl-w{grid-column:1/-1;font-size:.88rem;font-weight:600;color:var(--warn)}
#plan .pl-w:empty{display:none}
#plan .pl-row.flag .pl-in input{border-color:var(--warn)}
.pl-status{position:sticky;top:0;z-index:2;border-radius:12px;padding:10px 12px;border:2px solid var(--accent);background:var(--panel);display:grid;gap:8px;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.pl-status.done{border-color:var(--ok)}
.pl-status .st{font-family:var(--f-display);font-weight:700;font-size:1.1rem;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
.pl-status .pl-vsum .chipbtn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:62%}
.pl-status.done .st{color:var(--ok)}
.pl-status .miss{display:flex;flex-wrap:wrap;gap:6px}
.pl-status .miss button{min-height:36px}
.pl-vsum{display:flex;align-items:center;gap:10px;justify-content:space-between}
.pl-vsum span{color:var(--fg);font-variant-numeric:tabular-nums}
.pl-step{font-family:var(--f-display);font-weight:700;color:var(--accent);margin-right:6px}
#plancard summary .cvq{margin-left:auto;margin-right:12px;font-family:var(--f-body);text-transform:none;letter-spacing:0;font-size:.85rem}`;
document.head.appendChild(css);

function open(v){view=v||'plan';paint();sec.hidden=false;sec.scrollTop=0;document.body.style.overflow='hidden'}
function close(){sec.hidden=true;document.body.style.overflow='';summary();if(typeof tick==='function')tick()}
const field=(k,label,unit='msw',ph='')=>`<label for="pj-${k}">${label}${unit?' <span class="hint" style="display:inline">'+unit+'</span>':''}</label><input id="pj-${k}" data-pj="${k}" inputmode="decimal" placeholder="${ph}" value="${esc(P.job[k]??'')}">`;

function paint(){if(sec.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select'))return paintOut();
  const r=R();
  const head=`<div class="dhead"><button class="back" data-pa="close">‹ Back</button><h2>${view==='rules'?'Rules':'Dive plan'}</h2></div>
   <div class="pl-tabs"><button class="chipbtn" data-pa="v-plan" aria-pressed="${view==='plan'}">Plan</button><button class="chipbtn" data-pa="v-rules" aria-pressed="${view==='rules'}">Rules</button>
   <span class="hint" style="align-self:center">${r?'Rules: <b>'+esc(r.name)+'</b>':'No rules loaded'}</span></div>`;
  sec.innerHTML=`<div class="dwrap">${head}${view==='rules'?rulesHtml():planHtml()}</div>`;paintOut()}

/* ---------- input form: vessel set-up (once) + job depths in water-column order ---------- */
let vEdit=false;
// [key, label, sub-hint, unit, required]
const VFIELDS=()=>{const r=R(),f=[['off','Clump hangs below bell','Distance from the bell to the clump weight','m',1],['umb','Max excursion umbilical','Longest umbilical the divers will have out','m',1]];
  if(r&&r.bailout.type!=='cobra')f.push(['bovol','Bailout cylinder floodable volume','','L',1],['bop','Bailout cylinder fill pressure','','bar',1]);return f};
const JFIELDS=[['storage','Storage depth','Chamber storage depth','msw',1],['sm','Short mark (S/M)','','msw',1],['bell','Bell depth','Fills the Depth box on the main screen','msw',1],
  ['diver','Divers deepest','Deepest the divers will work','msw',1],['dmin','Divers shallowest','Optional: only if they work shallower than storage','msw',0],
  ['structure','Structure top','Top of the structure or asset','msw',1],['seabed','Seabed','','msw',1]];
const filled=k=>num(P.job[k])!=null;
function missing(){const out=[];const J=P.job;
  J.banks.forEach((bk,i)=>{if(num(bk.v)==null)out.push({k:'pb-'+i+'v',l:(bk.name||'Bank '+(i+1))+' volume',v:1})});
  if(num(J.o2.v)==null)out.push({k:'po-v',l:'O2 cylinder volume',v:1});
  VFIELDS().forEach(f=>{if(f[4]&&!filled(f[0]))out.push({k:'pj-'+f[0],l:f[1],v:1})});
  JFIELDS.forEach(f=>{if(f[4]&&!filled(f[0]))out.push({k:'pj-'+f[0],l:f[1]})});return out}
const vesselDone=()=>!missing().some(m=>m.v);
const inRow=(id,data,label,sub,unit,val,req,ph='')=>`<div class="pl-row${req?'':' opt'}" data-row="${id}"><label for="${id}">${label}${sub?`<small>${sub}</small>`:''}</label>
  <span class="pl-in"><input id="${id}" ${data} inputmode="decimal" enterkeyhint="next" autocomplete="off" placeholder="${ph||(req?'enter':'optional')}" value="${esc(val??'')}"><i>${unit}</i></span><div class="pl-w" data-w="${id}"></div></div>`;
function vesselHtml(){const J=P.job;
  if(vesselDone()&&!vEdit){const banks=J.banks.map(b=>num(b.v)).join(' / ');
    return `<div class="box" style="padding:10px 14px"><div class="pl-vsum"><div><h3 style="margin-top:0"><span class="pl-step">1</span>Vessel set-up ✓</h3>
      <span>${J.banks.length} banks ${banks} L · O2 ${num(J.o2.v)} L · clump ${num(J.off)} m · umbilical ${num(J.umb)} m</span></div><button class="chipbtn" data-pa="vedit">Edit</button></div></div>`}
  return `<div class="box"><h3><span class="pl-step">1</span>Vessel set-up</h3><p class="hint">Fill in once for the vessel. It stays set for every job.</p>
    ${J.banks.map((bk,i)=>inRow('pb-'+i+'v',`data-pb="${i}.v"`,esc(bk.name||'Bank '+(i+1))+' volume',i===0?'OBG bank floodable volume':'','L',bk.v,1)).join('')}
    <div class="actions" style="margin:6px 0"><button class="chipbtn" data-pa="addbank">+ Add bank</button>${J.banks.length>1?'<button class="chipbtn" data-pa="delbank">Remove last bank</button>':''}</div>
    ${inRow('po-v','data-po="v"','O2 cylinder volume','Bell onboard O2','L',J.o2.v,1)}
    ${VFIELDS().map(f=>inRow('pj-'+f[0],`data-pj="${f[0]}"`,f[1],f[2],f[3],P.job[f[0]],f[4])).join('')}
    ${vesselDone()?'<div class="actions"><button class="act alt" data-pa="vdone">Done</button></div>':''}</div>`}
function planHtml(){const r=R();
  if(!r)return `<div class="pl-warnbox"><b>No rules loaded.</b> The plan needs your company's limits. Go to <b>Rules</b> to load your profile file or make one.</div>`;
  const J=P.job;
  return `<div class="pl-status" id="pl-status"></div>
   ${vesselHtml()}
   <div class="box"><h3><span class="pl-step">2</span>This job · top to bottom</h3>
    <div class="pl-row opt"><label for="pj-name">Job / location<small>Fills Location on the main screen if empty</small></label><span class="pl-in"><input id="pj-name" class="txt" data-pj="name" enterkeyhint="next" autocomplete="off" placeholder="optional" value="${esc(J.name)}"></span><div class="pl-w"></div></div>
    ${JFIELDS.map(f=>inRow('pj-'+f[0],`data-pj="${f[0]}"`,f[1],f[2],f[3],J[f[0]],f[4])).join('')}
    <div id="pl-sketch" style="margin-top:10px"></div>
    <div class="actions" style="margin-top:10px"><button class="act ghost" data-pa="newjob">New job (clear depths)</button></div></div>
   <div id="pl-out"></div>`}
/* live parts that change as you type, without redrawing the boxes you are typing in */
function paintLive(){const st=sec.querySelector('#pl-status');if(!st)return;const N=nums(),r=N.r,m=missing();
  const sk=sec.querySelector('#pl-sketch');if(sk)sk.innerHTML=sketch(N);
  const w={},put=(k,t)=>{if(!w[k])w[k]=t};const{d,dmin,b,st:s,cl,str,sb}=N,e=r&&r.envelope;
  if(s!=null&&e&&has(e.storMin,e.storMax)&&(s<e.storMin||s>e.storMax))put('pj-storage',`Outside the ${e.storMin} to ${e.storMax} msw storage range in your rules`);
  if(d!=null&&e&&has(e.diveMin,e.diveMax)&&(d<e.diveMin||d>e.diveMax))put('pj-diver',`Outside the ${e.diveMin} to ${e.diveMax} msw diving range in your rules`);
  if(d!=null&&dmin!=null&&dmin>d)put('pj-dmin','Shallowest is deeper than deepest');
  if(dmin!=null&&s!=null&&dmin>=s)put('pj-dmin','Only needed if shallower than storage, leave blank');
  if(sb!=null&&cl!=null&&sb<=cl)put('pj-seabed',`Seabed is not below the clump (${cl} msw)`);
  if(sb!=null&&d!=null&&d>sb)put('pj-diver','Deeper than the seabed');
  if(sb!=null&&str!=null&&str>sb)put('pj-structure','Structure top is deeper than the seabed');
  if(str!=null&&cl!=null&&str<=cl)put('pj-structure',`Clump (${cl} msw) would be at or below the structure top`);
  if(b!=null&&s!=null&&Math.abs(b-s)>60)put('pj-bell','Check: bell is more than 60 m from storage');
  if(num(P.job.off)!=null&&num(P.job.off)>15)put('pj-off','Check: this is the gap to the clump, not the clump depth');
  sec.querySelectorAll('[data-w]').forEach(el=>{const t=w[el.dataset.w]||'';if(el.textContent!==t)el.textContent=t;el.closest('.pl-row').classList.toggle('flag',!!t)});
  // status strip: one line so it never hides the box you are typing in
  const wk=Object.keys(w);
  if(m.length){st.className='pl-status';st.innerHTML=`<div class="pl-vsum"><span class="st">${m.length} to fill</span><button class="chipbtn" data-pa="goto" data-k="${m[0].k}">Next: ${esc(m[0].l)} ›</button></div>`}
  else if(wk.length){st.className='pl-status';st.style.borderColor='var(--warn)';st.innerHTML=`<div class="pl-vsum"><span class="st" style="color:var(--warn)">${wk.length} to check</span><button class="chipbtn" data-pa="goto" data-k="${wk[0]}">Show ›</button></div>`}
  else{st.className='pl-status done';st.innerHTML=`<div class="st">Card complete ✓</div><div class="actions"><button class="act" data-pa="viewcard">View card</button><button class="act ghost" data-pa="pdf">Share PDF</button></div>`}
  if(!wk.length||m.length)st.style.borderColor=''}

function paintOut(){const el=sec.querySelector('#pl-out');if(!el)return;const N=nums(),r=N.r;if(!r){el.innerHTML='';return}
  const g=gaps();let h='';
  if(g.length)h+=`<div class="pl-warnbox"><b>Not set in "${esc(r.name)}":</b> ${g.map(esc).join(', ')}. Those parts are left blank rather than guessed.</div>`;
  const col=(title,depth,rows,co2,extra)=>`<div class="h">${title}<span>${depth!=null?depth+' msw':'–'}</span></div><div class="h" style="justify-content:flex-end">O2 %</div>`
    +rows.map(([x,l,o])=>`<div class="${l==='optimum'?'opt':''}"><span class="lbl">ppO2 ${l}</span>${x}</div><div class="${l==='optimum'?'opt':''}" style="justify-content:flex-end">${o??'–'} %</div>`).join('')
    +`<div><span class="lbl">CO2 max</span></div><div style="justify-content:flex-end">${co2!=null?co2+' ppm':'–'}</div>`+extra;
  const dEx=N.r.bailout.type==='cobra'?`<div><span class="lbl">COBRA min</span></div><div style="justify-content:flex-end">${N.cobraMin!=null?(isFinite(N.cobraMin)?N.cobraMin+' bar':'not achievable'):'–'}</div><div><span class="lbl">COBRA O2</span></div><div style="justify-content:flex-end">${N.cobraWin?N.cobraWin.min+'–'+N.cobraWin.max+' %':'–'}</div>`
    :`<div><span class="lbl">Bailout min</span></div><div style="justify-content:flex-end">${N.std&&N.std.minP!=null?Math.ceil(N.std.minP)+' bar':'–'}</div>`;
  const win=N.obg?(N.obg.maxDrop!=null?Math.min(N.obg.max,N.obg.maxDrop):N.obg.max):null;
  const bEx=`<div><span class="lbl">OBG O2 min</span></div><div style="justify-content:flex-end">${N.obg?N.obg.min+' %':'–'}</div><div><span class="lbl">OBG window</span></div><div style="justify-content:flex-end">${N.obg?N.obg.min+'–'+win+' %':'–'}</div>`;
  h+=`<div class="box" style="padding:10px"><h3>Dive information card${P.job.name?' · '+esc(P.job.name):''}</h3>
    <div class="pl-two"><div class="pl-grid">${col('DIVERS',N.d,N.dv||[],N.dco2,dEx)}</div><div class="pl-grid">${col('BELL',N.b,N.bl||[],N.bco2,bEx)}</div></div>
    <p class="hint" style="margin-top:8px">O2 % = ppO2 ÷ absolute pressure (depth ÷ 10 + 1). CO2 max = ${has(r.co2.mbar)?r.co2.mbar+' mbar':'limit'} ÷ absolute pressure.${ref('pp')}</p></div>`;
  // bailout
  {let b='';if(N.need!=null)b+=`<div class="pl-k"><span>Required bailout (${N.umb} m umbilical)</span><b>${f1(N.need)} min</b></div>`;
   if(r.bailout.type==='cobra'&&N.cobraMin!=null)b+=`<div class="pl-k"><span>COBRA min charge</span><b>${isFinite(N.cobraMin)?N.cobraMin+' bar':'not achievable'}</b></div>`;
   if(N.std)b+=`<div class="pl-k"><span>Open circuit ${N.std.vol} L at ${N.std.fill} bar</span><b>${f1(N.std.dur)} min</b></div>`+(N.std.minP!=null?`<div class="pl-k"><span>Open circuit min pressure</span><b>${Math.ceil(N.std.minP)} bar</b></div>`:'');
   h+=`<div class="box" style="padding:10px"><h3>Bailout${esc(ref('bailout'))}</h3>${b||'<p class="hint">Enter diver depth and umbilical length.</p>'}</div>`}
  // reclaim + OBG
  {const q=N.obgReq,o=N.o2r;
   h+=`<div class="pl-two"><div class="box" style="padding:10px"><h3>Reclaim setup</h3>${N.rec?`<div class="pl-k"><span>BPR setting</span><b>${f1(N.rec.bpr)} bar / ${f1(N.rec.psi)} psi</b></div><div class="pl-k"><span>Pressure abs</span><b>${f1(N.rec.abs)} bar</b></div>${N.rec.suc!=null?`<div class="pl-k"><span>Suction</span><b>${N.rec.suc} inHg</b></div>`:''}`:'<p class="hint">Enter the bell depth.</p>'}</div>
    <div class="box" style="padding:10px"><h3>OBG minimum${q?' ('+q.D+' msw)':''}</h3>${q?q.rows.map(x=>`<div class="pl-k"><span>${esc(x.name)}${x.v?' ('+x.v+' L)':''}</span><b>${x.min!=null?x.min+' bar':'–'}</b></div>`).join('')
      +(q.total!=null?`<div class="pl-k"><span>Total needed (${r.obg.men} men)</span><b>${q.total} m³</b></div>`:''):'<p class="hint">Enter depths.</p>'}
      ${o?`<div class="pl-k"><span>Bell O2 reserve min</span><b>${o.min} bar</b></div>`:''}</div></div>`}
  // tubes
  if(r.tubes.length)h+=`<div class="box" style="padding:10px"><h3>Bell Dräger tubes${esc(ref('tubes'))}</h3>${r.tubes.map(t=>`<div class="pl-k ${t.kind==='any'?'low':''}"><span>${esc(t.name)}<span class="hint" style="display:block">${esc(t.range||'')}</span></span><b>${t.kind==='mbar'&&has(t.max)?(t.max/10)+' % scale':'ANY reading'}</b></div>`).join('')}
    <p class="hint">Tubes read surface equivalent: scale % ÷ 100 = partial pressure in bar at any depth, so the maximum reading does not change with depth.</p></div>`;
  // checks + sketch
  const ck=checks(N);
  h+=`<div class="box" style="padding:10px"><h3>Checks</h3><div class="pl-chk">${ck.length?ck.map(([l,t])=>`<div class="${l}">${esc(t)}</div>`).join(''):'<p class="hint">Enter storage, bell and diver depths.</p>'}</div></div>
   <div class="actions"><button class="act" data-pa="viewcard">View card</button><button class="act ghost" data-pa="pdf">Share PDF</button></div>
   <p class="hint">Backup aid only. Check every figure against your controlling procedures before relying on it.</p>`;
  el.innerHTML=h;paintLive()}

/* ---------- UI: rules ---------- */
const RF=[ // [path,label,unit]
 ['pp.diver.min','Diver ppO2 min','bar'],['pp.diver.opt','Diver ppO2 optimum','bar'],['pp.diver.max','Diver ppO2 max','bar'],
 ['pp.bell.min','Bell atmosphere ppO2 min','bar'],['pp.bell.opt','Bell atmosphere ppO2 optimum','bar'],['pp.bell.max','Bell atmosphere ppO2 max','bar'],
 ['pp.obg.min','Onboard gas ppO2 min','bar'],['pp.obg.opt1','Onboard gas optimum from','bar'],['pp.obg.opt2','Onboard gas optimum to','bar'],['pp.obg.max','Onboard gas ppO2 max','bar'],
 ['co2.mbar','CO2 max','mbar'],['co2.shortMbar','CO2 short-period max','mbar'],
 ['bailout.minPer10m','Bailout per 10 m umbilical','min'],['bailout.rate','Bailout breathing rate','L/min'],['bailout.regLoss','Bailout regulator loss','bar'],['bailout.fillPct','Bailout fill margin','%'],['bailout.cobraFloor','COBRA minimum charge','bar'],
 ['obg.minutes','OBG duration per man','min'],['obg.rate','OBG breathing rate','L/min'],['obg.men','Men on OBG','men'],['obg.residual','OBG residual over ambient','bar'],
 ['o2.lpm','O2 metabolic use per man','L/min'],['o2.hours','O2 reserve duration','h'],['o2.men','Men in bell for O2','men'],['o2.residual','O2 residual over ambient','bar'],
 ['standoff.ok','Normal standoff','m'],['standoff.min','Minimum standoff','m'],
 ['drop.green','Bell drop: bubble loss OK up to','%'],['drop.amber','Bell drop: bubble loss amber up to','%'],['drop.bellAtm','Bell atmosphere ppO2 for drop check','bar'],
 ['envelope.diveMin','Diving depth min','msw'],['envelope.diveMax','Diving depth max','msw'],['envelope.storMin','Storage min','msw'],['envelope.storMax','Storage max','msw'],['envelope.heatFrom','Gas heating from','msw'],
 ['reclaim.suction','Reclaim suction','inHg']];
const getp=(o,p)=>p.split('.').reduce((a,k)=>a==null?a:a[k],o);
const setp=(o,p,v)=>{const k=p.split('.');const last=k.pop();k.reduce((a,x)=>a[x],o)[last]=v};
function rulesHtml(){const r=R(),ids=Object.keys(P.profiles);
  let h=`<div class="box"><h3>Profiles</h3><div class="set"><label for="pr-act">Active rules</label><select id="pr-act" data-pa="act">${ids.length?'':'<option value="">none</option>'}${ids.map(id=>`<option value="${esc(id)}" ${id===P.active?'selected':''}>${esc(P.profiles[id].name||id)}</option>`).join('')}</select></div>
   <div class="actions"><button class="act alt" data-pa="import">Load profile file</button><button class="act ghost" data-pa="new">New blank</button>${r?'<button class="act ghost" data-pa="copy">Copy</button><button class="act ghost" data-pa="export">Save / share file</button><button class="act ghost" data-pa="del">Delete</button>':''}</div>
   <input type="file" id="pr-file" accept=".json,application/json" hidden>
   <p class="hint">Profiles are kept on this phone only. Load your company file once, or build one here. Nothing here is shared with anyone else using the app.</p></div>`;
  if(!r)return h;
  h+=`<div class="box"><h3>Name</h3><div class="set"><label for="pr-name">Profile name</label><input id="pr-name" class="wide" data-pr="name" value="${esc(r.name)}"></div></div>
   <div class="box"><h3>Limits</h3><div class="set">${RF.map(([p,l,u])=>`<label for="rf-${p}">${l} <span class="hint" style="display:inline">${u}</span></label><input id="rf-${p}" data-rf="${p}" inputmode="decimal" value="${getp(r,p)??''}">`).join('')}
    <label for="rf-btype">Bailout type</label><select id="rf-btype" data-pr="bailout.type"><option value="cobra" ${r.bailout.type==='cobra'?'selected':''}>COBRA (tables)</option><option value="standard" ${r.bailout.type==='standard'?'selected':''}>Open circuit</option></select></div>
    <p class="hint">Leave a box empty if your company has no such rule. That check is then skipped and listed as not set.</p></div>
   <div class="box"><h3>Rule references</h3><div class="set">${Object.keys(BLANK.refs).map(k=>`<label for="rr-${k}">${k}</label><input id="rr-${k}" class="wide" data-rr="${k}" value="${esc(r.refs[k]||'')}" placeholder="e.g. procedure s.4.1">`).join('')}</div></div>
   <div class="box"><h3>Tables</h3>
    ${tbl('exc','Excursion table',r.tables.exc.length,'7 columns per row: deepest working depth, standard shallowest, standard min O2 %, standard max O2 %, extended shallowest, extended min O2 %, extended max O2 %.')}
    ${tbl('cobraMix','COBRA gas mix',r.tables.cobraMix.length,'4 columns per row: depth msw, min O2 %, optimum O2 %, max O2 %.')}
    ${tbl('cobraDur','COBRA durations',r.tables.cobraDur.length,'First row: the charge pressures in bar (first cell blank or "depth"). Then one row per depth: depth msw, then minutes at each pressure.')}
    <p class="hint">Copy the rows from Excel or Google Sheets and paste. Every row is checked before it is accepted.</p></div>
   <div class="box"><h3>Dräger tubes</h3><textarea id="pr-tubes" data-pa="tubes" placeholder="One tube per line:  name | range | max mbar (blank = any reading counts)">${esc(r.tubes.map(t=>[t.name,t.range||'',t.kind==='mbar'?t.max:''].join(' | ')).join('\n'))}</textarea>
    <div class="actions"><button class="act alt" data-pa="savetubes">Save tubes</button></div></div>`;
  return h}
const tbl=(k,label,n,help)=>`<div style="margin:10px 0"><b>${label}</b> <span class="hint" style="display:inline">${n?n+' rows loaded':'none loaded'}</span>
  <p class="hint">${help}</p><textarea data-tbl="${k}" placeholder="Paste here"></textarea><div class="actions"><button class="act alt" data-pa="tbl" data-k="${k}">Load ${label.toLowerCase()}</button>${n?`<button class="act ghost" data-pa="tblclear" data-k="${k}">Clear</button>`:''}</div></div>`;
function parseRows(txt){return txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(l=>l.split(/\t|,|;|\s{2,}|\s+/).map(c=>c.replace(/msw|%|bar|min/gi,'').trim()).filter(c=>c!==''))}
function loadTable(k,txt){const r=R(),rows=parseRows(txt);if(!rows.length)return 'Nothing pasted';
  if(k==='cobraDur'){const Ps=rows[0].filter(c=>!isNaN(+c)).map(Number);const body=rows.slice(1).map(x=>x.map(Number));
    if(Ps.length<2)return 'First row must list the charge pressures';
    for(const [i,x] of body.entries())if(x.length!==Ps.length+1||x.some(v=>!isFinite(v)))return `Row ${i+2} needs a depth plus ${Ps.length} durations`;
    r.tables.cobraP=Ps;r.tables.cobraDur=body;return null}
  const w=k==='exc'?7:4;const body=rows.map(x=>x.map(Number));
  for(const [i,x] of body.entries())if(x.length!==w||x.some(v=>!isFinite(v)))return `Row ${i+1} needs ${w} numbers: "${rows[i].join(' ')}"`;
  const ds=body.map(x=>x[0]);if(new Set(ds).size!==ds.length)return 'A depth appears twice';
  r.tables[k]=body.sort((a,b)=>a[0]-b[0]);return null}

/* ---------- import / export ---------- */
function addProfile(p){p=normProfile(p);let id=(p.name||'Profile').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'profile';
  let n=id,i=2;while(P.profiles[n])n=id+'-'+(i++);P.profiles[n]=p;P.active=n;psave();return n}
function importText(txt){let p;try{p=JSON.parse(txt)}catch(e){toast('That file is not an OnPanel profile');return}
  if(!p||p.v!==1||!p.pp||!p.tables){toast('That file is not an OnPanel profile');return}addProfile(p);paint();toast('Loaded: '+(p.name||'profile'))}
async function exportProfile(){const r=R();if(!r)return;const name=(r.name||'profile').replace(/[^\w\- ]+/g,'')+'.divetimes-rules.json';
  const blob=new Blob([JSON.stringify(r,null,1)],{type:'application/json'});const file=new File([blob],name,{type:'application/json'});
  try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:r.name});return}}catch(e){if(e&&e.name==='AbortError')return}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000)}

/* ---------- PDF dive information card (A4 portrait) ---------- */
function loadPdfLib(){return window.jspdf?Promise.resolve():new Promise((res,rej)=>{const s=document.createElement('script');s.src='jspdf.umd.min.js';s.onload=res;s.onerror=()=>rej(new Error('PDF tool not available'));document.head.appendChild(s)})}
async function makeCard(){await loadPdfLib();const N=nums(),r=N.r;const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});
  const PW=210,M=15,CW=PW-2*M,BLUE=[26,95,180],RED=[200,0,0],BLK=[0,0,0],GREY=[110,110,110];
  const col=c=>doc.setTextColor(...c),font=(st,sz)=>{doc.setFont('helvetica',st);doc.setFontSize(sz)};
  const sect=(y,t)=>{font('bold',10);col(GREY);doc.text(t.toUpperCase(),M,y);doc.setDrawColor(190,190,190);doc.setLineWidth(.3);doc.line(M,y+1.5,PW-M,y+1.5);col(BLK);doc.setDrawColor(0,0,0)};
  font('bold',22);col(BLK);doc.text('Dive information card',M,22);font('normal',10);col(GREY);
  doc.text([P.job.name||null,r.name?'Rules: '+r.name:null,new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})].filter(Boolean).join('   ·   '),M,29);col(BLK);
  doc.setLineWidth(.8);doc.line(M,33,PW-M,33);
  let y=40;sect(y,'Diver and bell gas');y+=4;const ws=CW/4,rh=9.5;
  const rows=[['DIVERS',N.d!=null?N.d+' msw':'-','BELL',N.b!=null?N.b+' msw':'-']];
  for(let i=0;i<3;i++){const a=N.dv[i],b=N.bl[i];rows.push([a?a[0].toFixed(1)+' '+a[1]:'',a?a[2]+' %':'',b?b[0].toFixed(1)+' '+b[1]:'',b?b[2]+' %':''])}
  rows.push(['CO2 MAX',N.dco2!=null?N.dco2+' ppm':'-','CO2 MAX',N.bco2!=null?N.bco2+' ppm':'-']);
  const win=N.obg?(N.obg.maxDrop!=null?Math.min(N.obg.max,N.obg.maxDrop):N.obg.max):null;
  if(r.bailout.type==='cobra'){rows.push(['COBRA min',N.cobraMin!=null?(isFinite(N.cobraMin)?N.cobraMin+' bar':'n/a'):'-','OBG O2 min',N.obg?N.obg.min+' %':'-']);
    rows.push(['COBRA O2',N.cobraWin?N.cobraWin.min+' to '+N.cobraWin.max+' %':'-','OBG window',N.obg?N.obg.min+' to '+win+' %':'-'])}
  else{rows.push(['Bailout min',N.std&&N.std.minP!=null?Math.ceil(N.std.minP)+' bar':'-','OBG O2 min',N.obg?N.obg.min+' %':'-']);rows.push(['','','OBG window',N.obg?N.obg.min+' to '+win+' %':'-'])}
  rows.forEach((rw,ri)=>{let x=M;const head=ri===0;rw.forEach((c,i)=>{if(head){doc.setFillColor(232,239,248);doc.rect(x,y,ws,rh,'F')}else if(i%2===1&&/optimum/.test(rw[i-1])){doc.setFillColor(225,242,230);doc.rect(x,y,ws,rh,'F')}
    doc.setDrawColor(0,0,0);doc.setLineWidth(head?.6:.3);doc.rect(x,y,ws,rh);const lab=i%2===0;font('bold',head?14:(lab?11:13));
    col(head&&lab?BLUE:(lab&&/max|min|CO2|COBRA|OBG|Bailout/.test(c)&&!/optimum/.test(c)?RED:BLK));doc.text(c,x+ws/2,y+rh/2+1.6,{align:'center'});x+=ws});y+=rh});
  doc.setLineWidth(.9);doc.rect(M,y-rh*rows.length,CW,rh*rows.length);
  font('normal',7.5);col(GREY);doc.text('O2 % = ppO2 / (depth/10 + 1). CO2 max = limit / absolute pressure.'+ref('pp'),M,y+4,{maxWidth:CW});col(BLK);
  y+=14;sect(y,'Depths (schematic, not to scale)');y+=1;
  {const sc=0.2,SW=560*sc,X=M+(CW-SW)/2,Y=y-4,v=x=>x!=null?x+' m':'- m';
   const T=(x,yy,t,o={})=>{font('bold',(o.sz||10)*1.3);doc.text(t,X+x*sc,Y+yy*sc,o.al?{align:o.al}:undefined)};const Ln=(a,b,c,d,w=.8)=>{doc.setLineWidth(w);doc.line(X+a*sc,Y+b*sc,X+c*sc,Y+d*sc)};
   T(20,52,'STORAGE '+v(N.st),{sz:11});Ln(120,90,120,190);doc.rect(X+108*sc,Y+190*sc,24*sc,30*sc);Ln(120,220,120,232);T(145,212,v(N.sm)+' S/M',{sz:9});
   doc.circle(X+360*sc,Y+130*sc,40*sc);T(360,137,v(N.b),{al:'center',sz:9});T(415,95,'BELL',{sz:9});Ln(335,166,310,230);Ln(385,166,410,230);Ln(290,230,430,230,1.6);T(440,224,'CLUMP',{sz:9});T(440,250,v(N.cl),{sz:9});
   doc.rect(X+80*sc,Y+300*sc,100*sc,100*sc);Ln(80,300,180,400,.4);Ln(180,300,80,400,.4);T(190,330,v(N.str),{sz:9});T(190,356,'STRUCTURE',{sz:7});
   doc.setDrawColor(...RED);col(RED);Ln(180,300,270,300,.5);Ln(245,230,290,230,.5);Ln(265,232,265,298,1);T(276,274,N.cl!=null&&N.str!=null?(N.str<=N.cl?'CHECK':(+(N.str-N.cl).toFixed(1))+' m'):'',{sz:9});doc.setDrawColor(0,0,0);col(BLK);
   Ln(10,405,550,405,1.2);T(550,428,'SEABED '+v(N.sb),{al:'right',sz:11});Ln(360,236,360,399);T(372,330,N.cl!=null&&N.sb!=null?(+(N.sb-N.cl).toFixed(1))+' m':'',{sz:11});y=Y+430*sc+7}
  {const gap=6,bw=(CW-gap)/2,bh=37;
   const box=(x,title,lines)=>{doc.setDrawColor(...BLUE);doc.setLineWidth(.6);doc.rect(x,y,bw,bh);doc.setFillColor(...BLUE);doc.rect(x,y,bw,8,'F');font('bold',10.5);doc.setTextColor(255,255,255);doc.text(title,x+3,y+5.6);
     lines.forEach((l,i)=>{font('normal',11);col(l[2]||BLK);doc.text(l[0],x+3,y+15+i*6.5);font('bold',12);doc.text(l[1],x+bw-3,y+15+i*6.5,{align:'right'})});col(BLK);doc.setDrawColor(0,0,0)};
   const R2=N.rec,Q=N.obgReq,O=N.o2r;
   box(M,'RECLAIM SETUP'+(N.b!=null?'  (bell '+N.b+' msw)':''),R2?[['BPR setting',f1(R2.bpr)+' bar / '+f1(R2.psi)+' psi'],['Pressure abs',f1(R2.abs)+' bar']].concat(R2.suc!=null?[['Suction',R2.suc+' inHg']]:[]):[['Enter the bell depth','']]);
   box(M+bw+gap,'OBG MINIMUM'+(Q?'  ('+Q.D+' msw)':''),Q?Q.rows.slice(0,3).map(x=>[x.name+(x.v?'  ('+x.v+' L)':''),(x.min!=null?x.min+' bar':'-'),BLK]).concat(O?[['Bell O2 reserve min',O.min+' bar',BLK]]:[]):[['Enter the depths','']]);
   y+=bh+4}
  if(r.tubes.length){const th=24,cw=CW/Math.min(4,r.tubes.length);doc.setDrawColor(...RED);doc.setLineWidth(.6);doc.rect(M,y,CW,th);doc.setFillColor(...RED);doc.rect(M,y,CW,6.5,'F');font('bold',10);doc.setTextColor(255,255,255);
   doc.text('BELL DRÄGER TUBES  (scale reads surface equivalent; same max at any depth)',M+3,y+4.6);
   r.tubes.slice(0,4).forEach((t,i)=>{const x=M+i*cw+2.5,any=t.kind!=='mbar';if(i){doc.setDrawColor(220,220,220);doc.line(M+i*cw,y+8,M+i*cw,y+th-1.5)}font('bold',8.5);col(BLK);doc.text(t.name.slice(0,26),x,y+11);
     font('bold',10);col(any?RED:BLK);doc.text(any?'ANY reading':(t.max/10)+' % max',x,y+16);font('normal',7);col(GREY);doc.text(any?'= contaminated':'scale reading',x,y+20)});col(BLK);doc.setDrawColor(0,0,0);y+=th+4}
  font('normal',7.5);col(GREY);doc.text('Backup aid only. Check every figure against your controlling procedures.',M,y);
  const name='dive-info-card'+(P.job.diver?'-divers-'+P.job.diver+'m-bell-'+P.job.bell+'m':'')+'.pdf',blob=doc.output('blob');
  return{blob,name,file:new File([blob],name,{type:'application/pdf'})}}
async function shareCard(c){
  try{if(navigator.canShare&&navigator.canShare({files:[c.file]})){await navigator.share({files:[c.file],title:'Dive information card'});return}}catch(e){if(e&&e.name==='AbortError')return}
  const a=document.createElement('a');a.href=URL.createObjectURL(c.blob);a.download=c.name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000);toast('Card saved to Downloads')}
async function pdf(btn){try{btn&&(btn.disabled=true);await shareCard(await makeCard())}
  catch(e){toast("Couldn't make the PDF: "+(e&&e.message||'error'))}finally{btn&&(btn.disabled=false)}}

/* ---------- on-screen card viewer: the same PDF page, drawn by pdf.js ---------- */
let pdfjsLib=null,cvCard=null;
async function loadViewer(){if(!pdfjsLib){pdfjsLib=await import('./pdfjs/pdf.mjs');pdfjsLib.GlobalWorkerOptions.workerSrc=new URL('pdfjs/pdf.worker.mjs',document.baseURI).href}return pdfjsLib}
const cv=document.createElement('section');cv.id='cardview';cv.hidden=true;cv.setAttribute('role','dialog');cv.setAttribute('aria-modal','true');
cv.innerHTML='<div class="cvbar"><b>Dive information card</b><button class="chipbtn" data-pa="cvshare">Share PDF</button><button class="chipbtn" data-pa="cvclose">Close</button></div><div class="cvbody"><canvas id="cvcanvas" aria-label="Dive information card"></canvas><p class="hint" id="cvhint">Tap the card to zoom in or out.</p></div>';
document.body.appendChild(cv);
async function viewCard(btn){try{btn&&(btn.disabled=true);if(!R()){toast('Load your rules first');return}
  const c=await makeCard(),lib=await loadViewer();cvCard=c;
  const doc=await lib.getDocument({data:new Uint8Array(await c.blob.arrayBuffer())}).promise,page=await doc.getPage(1);
  const base=page.getViewport({scale:1}),dpr=window.devicePixelRatio||1,target=Math.min(2400,Math.round(window.innerWidth*dpr*2.5)),vp=page.getViewport({scale:target/base.width});
  const can=cv.querySelector('#cvcanvas');can.width=Math.round(vp.width);can.height=Math.round(vp.height);
  await page.render({canvasContext:can.getContext('2d'),viewport:vp}).promise;doc.destroy();
  cv.classList.remove('zoom');cv.hidden=false;cv.querySelector('.cvbody').scrollTo(0,0);document.body.style.overflow='hidden'}
  catch(e){toast("Couldn't show the card: "+(e&&e.message||'error'))}finally{btn&&(btn.disabled=false)}}
function closeCard(){cv.hidden=true;if(sec.hidden)document.body.style.overflow=''}
cv.addEventListener('click',e=>{if(e.target.id!=='cvcanvas')return;const body=cv.querySelector('.cvbody'),can=e.target,r=can.getBoundingClientRect(),fx=(e.clientX-r.left)/r.width,fy=(e.clientY-r.top)/r.height;
  cv.classList.toggle('zoom');if(cv.classList.contains('zoom')){body.scrollLeft=fx*can.offsetWidth-body.clientWidth/2;body.scrollTop=can.offsetTop+fy*can.offsetHeight-body.clientHeight/2}});

/* ---------- link to the main app ---------- */
function linkMain(){const b=num(P.job.bell);let ch=false;
  if(b!=null&&state.info.depth!==String(b)){state.info.depth=String(b);ch=true}
  if(P.job.name&&!state.info.loc){state.info.loc=P.job.name;ch=true}
  if(ch){save();if(typeof renderInfo==='function')renderInfo()}}

/* summary card on the main screen */
const card=document.createElement('details');card.className='card';card.id='plancard';
card.innerHTML='<summary><span>Dive plan</span><button class="chipbtn cvq" data-pa="viewcard">Info card</button></summary><div id="plansum"></div><div class="actions"><button class="act" data-pa="open">Open dive plan</button><button class="act ghost" data-pa="openrules">Rules</button></div>';
const anchor=document.getElementById('settings');anchor.parentNode.insertBefore(card,anchor);
function summary(){const el=document.getElementById('plansum');if(!el)return;const r=R();
  if(!r){el.innerHTML='<p class="hint">No rules loaded yet. Open Rules to load your company profile file.</p>';return}
  const N=nums(),ck=checks(N),bad=ck.filter(c=>c[0]==='bad').length,warn=ck.filter(c=>c[0]==='warn').length;
  el.innerHTML=`<p class="hint">Rules: <b>${esc(r.name)}</b>${N.b!=null?` · bell ${N.b} msw`:''}${N.d!=null?` · divers ${N.d} msw`:''}${N.st!=null?` · storage ${N.st} msw`:''}</p>`
   +(ck.length?`<p class="hint" style="color:${bad?'var(--crit)':warn?'var(--warn)':'var(--ok)'};font-weight:600">${bad?bad+' check'+(bad>1?'s':'')+' failing':warn?warn+' to watch':'All checks OK'}</p>`:'')}

/* diver and bell detail additions */
window.DP={
  detailBox(who){const r=R();if(!r)return'';const N=nums();
    if(who==='bell')return'';
    if(N.d==null&&N.need==null)return'';const lines=[];
    if(N.need!=null)lines.push(['Required bailout',f1(N.need)+' min']);
    if(r.bailout.type==='cobra'&&N.cobraMin!=null)lines.push(['COBRA min charge',isFinite(N.cobraMin)?N.cobraMin+' bar':'not achievable']);
    if(N.cobraWin)lines.push(['COBRA O2',N.cobraWin.min+'–'+N.cobraWin.max+' %']);
    if(N.std&&N.std.minP!=null)lines.push(['Open circuit min',Math.ceil(N.std.minP)+' bar']);
    if(N.umb!=null)lines.push(['Max umbilical',N.umb+' m']);
    return lines.length?`<div class="box"><h3>Bailout · dive plan</h3><dl>${lines.map(([a,b])=>`<div class="row"><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl></div>`:''},
  open};

/* ---------- events ---------- */
document.addEventListener('click',async e=>{const b=e.target.closest('[data-pa]');if(!b)return;const a=b.dataset.pa;
  if(a==='open'){open('plan');return}if(a==='openrules'){open('rules');return}if(a==='close'){close();return}
  if(a==='v-plan'||a==='v-rules'){view=a.slice(2);paint();return}
  if(a==='pdf'){pdf(b);return}
  if(a==='viewcard'){e.preventDefault();viewCard(b);return}
  if(a==='cvshare'){if(cvCard)shareCard(cvCard);return}
  if(a==='cvclose'){closeCard();return}
  if(a==='vedit'){vEdit=true;paint();return}
  if(a==='vdone'){vEdit=false;paint();return}
  if(a==='goto'){const k=b.dataset.k;if(!sec.querySelector('#'+k)){vEdit=true;paint()}const el=sec.querySelector('#'+k);if(el){el.scrollIntoView({block:'center',behavior:'smooth'});setTimeout(()=>el.focus({preventScroll:true}),250)}return}
  if(a==='newjob'){if(!confirm2(b,'Tap again to clear depths'))return;['storage','sm','bell','diver','dmin','structure','seabed'].forEach(k=>P.job[k]='');psave();linkMain();paint();summary();toast('Depths cleared. Vessel set-up kept.');return}
  if(a==='addbank'){P.job.banks.push({name:'Bank '+(P.job.banks.length+1),v:'',p:''});psave();paint();return}
  if(a==='delbank'){if(!confirm2(b,'Tap again'))return;P.job.banks.pop();psave();paint();return}
  if(a==='import'){sec.querySelector('#pr-file').click();return}
  if(a==='new'){addProfile({name:'New rules'});paint();return}
  if(a==='copy'){const r=R();addProfile({...clone(r),name:r.name+' copy'});paint();toast('Copied');return}
  if(a==='del'){if(!confirm2(b,'Tap again to delete'))return;delete P.profiles[P.active];P.active=Object.keys(P.profiles)[0]||'';psave();paint();summary();return}
  if(a==='export'){exportProfile();return}
  if(a==='tbl'){const k=b.dataset.k,ta=sec.querySelector(`[data-tbl="${k}"]`),err=loadTable(k,ta.value);if(err){toast(err);return}psave();paint();toast('Table loaded');return}
  if(a==='tblclear'){if(!confirm2(b,'Tap again'))return;const k=b.dataset.k,r=R();if(k==='cobraDur'){r.tables.cobraDur=[];r.tables.cobraP=[]}else r.tables[k]=[];psave();paint();return}
  if(a==='savetubes'){const r=R(),lines=sec.querySelector('#pr-tubes').value.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    r.tubes=lines.map(l=>{const[n,rg,mx]=l.split('|').map(x=>(x||'').trim());const m=num(mx);return m!=null?{name:n,range:rg,kind:'mbar',max:m}:{name:n,range:rg,kind:'any'}});psave();paint();toast('Tubes saved');return}
},true);
sec.addEventListener('change',e=>{const el=e.target;
  if(el.id==='pr-file'){const f=el.files&&el.files[0];if(!f)return;f.text().then(importText);el.value='';return}
  if(el.dataset.pa==='act'){P.active=el.value;psave();paint();summary();return}
  if(el.dataset.pr){const r=R();setp(r,el.dataset.pr,el.value);psave();if(el.dataset.pr==='name')summary();return}
  if(el.dataset.rf){const r=R(),v=el.value.trim();const n=v===''?null:num(v);if(v!==''&&n==null){toast('Numbers only');el.value=getp(r,el.dataset.rf)??'';return}setp(r,el.dataset.rf,n);psave();return}
  if(el.dataset.rr){R().refs[el.dataset.rr]=el.value.trim();psave();return}});
sec.addEventListener('input',e=>{const el=e.target;
  if(el.dataset.pj){P.job[el.dataset.pj]=el.value.trim();psave();linkMain();paintOut();summary();return}
  if(el.dataset.pb){const[i,k]=el.dataset.pb.split('.');P.job.banks[+i][k]=el.value.trim();if(k==='p')P.job.pTime=Date.now();psave();paintOut();summary();return}
  if(el.dataset.po){P.job.o2[el.dataset.po]=el.value.trim();if(el.dataset.po==='p')P.job.pTime=Date.now();psave();paintOut();summary();return}
  if(el.dataset.pc){P.job.cobraP[+el.dataset.pc]=el.value.trim();psave();paintOut();return}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!sec.hidden)close()});
// keyboard Next steps through the boxes in screen order
sec.addEventListener('keydown',e=>{if(e.key!=='Enter'||!e.target.matches('.pl-in input'))return;e.preventDefault();
  const all=[...sec.querySelectorAll('.pl-in input')],i=all.indexOf(e.target),nx=all[i+1];if(nx){nx.focus();nx.scrollIntoView({block:'center',behavior:'smooth'})}else e.target.blur()});
// leaving a box: refold vessel set-up once complete, refresh labels
sec.addEventListener('focusout',()=>setTimeout(()=>{if(sec.hidden||sec.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select'))return;
  if(view==='plan'&&!vEdit&&vesselDone()&&sec.querySelector('[data-pb]'))paint()},0));

summary();
})();

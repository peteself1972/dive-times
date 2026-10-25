/* OnPanel: version, "What's changed" and "Report a problem".
   Shared by the Sat (index.html) and Air (air.html) screens. Self-contained: it only reads this phone's saved
   OnPanel data (never changes it) and adds a line at the foot of the page.
   CHANGES: newest first. The newest v must match the VERSION number in sw.js (tests/run.py checks this).
   kind: 'timing'    = changes how times, schedules, limits or alarms are worked out (re-check before relying on it)
         'behaviour' = changes what a tap or button does
         'display'   = look and layout only, numbers unchanged
         'feature'   = something new that does not change existing timings */
(function(){
'use strict';
const CHANGES=[
  {v:55,date:'25 Oct 2026',kind:'feature',text:'Version number, this list of changes, and a Report a problem button at the foot of each screen.'},
  {v:54,date:'25 Oct 2026',kind:'display',text:'Air: the action button on each tile is full width, as on Sat.'},
  {v:53,date:'24 Oct 2026',kind:'display',text:'Header: OnPanel and the clock on the top line; Sat/Air, Test alarm and Screen on underneath.'},
  {v:52,date:'24 Oct 2026',kind:'display',text:'Sat: the tap button is full width on its own, two thirds when Finish is beside it.'},
  {v:51,date:'24 Oct 2026',kind:'display',text:'Sat: the coloured left edge of each tile drains as its countdown runs down (fills up while a diver is back in the bell). Numbers and alarms unchanged.'},
  {v:50,date:'24 Oct 2026',kind:'display',text:'Sat: bell tile in normal colours again.'},
  {v:49,date:'24 Oct 2026',kind:'behaviour',text:'Only the button at the foot of a tile stamps a time (tapping elsewhere does nothing; hold still opens details). Sat: the bell tile moves below the divers while locked off and back to the top when locked on or finished; buttons ignore taps for 0.7 s after it moves.'},
  {v:48,date:'22 Oct 2026',kind:'timing',text:'Air screen added: air and nitrox timer with stops, SurDO₂ oxygen periods and alarms. Tables, limits and timings come from your rules profile. Checked against the previous Air Dive Times timer: 102,820 table lookups and 127 dive states identical.'},
  {v:47,date:'21 Oct 2026',kind:'feature',text:'Dive plan: clearer layout for filling in the dive information card.'}
];
const KIND={timing:['Timing','#c8321c'],behaviour:['Behaviour','#a96a00'],display:['Display','#55666e'],feature:['New','#1f6f98']};
const V=CHANGES[0].v,SCREEN=/air\.html$/.test(location.pathname)?'Air':'Sat',SEEN='onpanel.seenVersion';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const get=k=>{try{return localStorage.getItem(k)}catch(e){return null}},put=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
const read=k=>{try{return JSON.parse(get(k))}catch(e){return null}};

/* ---------- styles (uses the page's own colour tokens) ---------- */
const css=document.createElement('style');css.textContent=`
.sp-line{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:.85rem;color:var(--muted);margin:0}
.sp-line .chipbtn{min-height:36px}
.sp-new{display:flex;align-items:center;gap:10px;border:1px solid var(--accent);color:var(--fg);background:var(--panel);border-radius:10px;padding:8px 12px;font-weight:600;max-width:560px;margin:8px auto 0}
.sp-new.t{border-color:var(--crit)}
.sp-new span{flex:1}
.sp-new button{border:1px solid currentColor;background:transparent;color:inherit;border-radius:8px;padding:4px 10px;cursor:pointer;font:inherit}
#sp-dlg{position:fixed;inset:0;z-index:30;background:var(--bg);overflow-y:auto;padding:16px 16px 120px}
#sp-dlg .w{max-width:560px;margin:0 auto;display:grid;gap:14px}
#sp-dlg h2{font-family:var(--f-display);font-weight:700;font-size:1.5rem;letter-spacing:.05em;text-transform:uppercase;margin:0;flex:1}
#sp-dlg .hd{display:flex;align-items:center;gap:10px}
#sp-dlg .it{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:grid;gap:4px}
#sp-dlg .it b{font-family:var(--f-display);letter-spacing:.04em}
#sp-dlg .k{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff;border-radius:6px;padding:1px 7px;margin-left:6px;vertical-align:.1em}
#sp-dlg textarea{width:100%;min-height:120px;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:10px;font:inherit}
#sp-dlg pre{white-space:pre-wrap;background:var(--raise);border:1px solid var(--line);border-radius:10px;padding:10px;font-size:.82rem;margin:0}
#sp-dlg .btns{display:flex;gap:8px;flex-wrap:wrap}
#sp-dlg .btns button{flex:1 1 140px;min-height:50px;border-radius:10px;border:none;background:var(--accent);color:var(--accent-ink);font-family:var(--f-display);font-weight:700;font-size:1.1rem;letter-spacing:.05em;text-transform:uppercase;cursor:pointer}
#sp-dlg .btns button.alt{background:var(--raise);color:var(--fg);border:1px solid var(--line)}`;
document.head.appendChild(css);

/* ---------- foot line ---------- */
const line=document.createElement('p');line.className='sp-line';
line.innerHTML=`<span>OnPanel v${V}</span><button class="chipbtn" type="button" data-sp="changes">What's changed</button><button class="chipbtn" type="button" data-sp="report">Report a problem</button>`;
(document.querySelector('main')||document.body).appendChild(line);

/* ---------- updated banner: once per new version, red edge if timing changed ---------- */
const seen=parseInt(get(SEEN),10);
if(!seen)put(SEEN,String(V));          // first use on this phone: nothing to announce
else if(seen<V){const fresh=CHANGES.filter(c=>c.v>seen),timing=fresh.some(c=>c.kind==='timing'),beh=fresh.some(c=>c.kind==='behaviour');
  const b=document.createElement('div');b.className='sp-new'+(timing?' t':'');b.setAttribute('role','status');
  b.innerHTML=`<span>Updated to v${V}.${timing?' Timing has changed: read before relying on it.':beh?' A button works differently.':''}</span><button type="button" data-sp="changes">What's changed</button><button type="button" data-sp="seen" aria-label="Dismiss">OK</button>`;
  const bar=document.getElementById('bar');(bar||document.body).appendChild(b)}

/* ---------- dialogs ---------- */
let dlg=null;
function open(html){close();dlg=document.createElement('section');dlg.id='sp-dlg';dlg.setAttribute('role','dialog');dlg.setAttribute('aria-modal','true');
  dlg.innerHTML=`<div class="w">${html}</div>`;document.body.appendChild(dlg);document.body.style.overflow='hidden';dlg.scrollTop=0}
function close(){if(dlg){dlg.remove();dlg=null;document.body.style.overflow=''}}
const head=t=>`<div class="hd"><h2>${t}</h2><button class="chipbtn" type="button" data-sp="close">Close</button></div>`;

function changesHtml(){return head("What's changed")+`<p class="hint" style="margin:0">Newest first. <b>Timing</b> means how times, stops or alarms are worked out has changed: re-check it before relying on it.</p>`+
  CHANGES.map(c=>{const[k,col]=KIND[c.kind]||[c.kind,'#55666e'];return `<div class="it"><div><b>v${c.v}</b> · ${esc(c.date)}<span class="k" style="background:${col}">${k}</span></div><div>${esc(c.text)}</div></div>`}).join('')}

/* report: what the person types, plus a summary of what the app was doing (no names, no rules data) */
const pad=n=>String(n).padStart(2,'0'),hm=t=>{const d=new Date(t);return pad(d.getHours())+':'+pad(d.getMinutes())};
function stateSummary(){const out=[];
  if(SCREEN==='Sat'){const s=read('diveTimes.v2');if(!s)return 'No Sat data on this phone.';
    out.push('Bell: '+((s.bell||[]).slice(-6).map(e=>e.type+' '+hm(e.t)+(e.fin?' (finished)':'')).join(', ')||'not started'));
    for(const d of s.divers||[])if(d.ev&&d.ev.length)out.push(d.id+': '+d.ev.slice(-6).map(e=>e.type+' '+hm(e.t)+(e.fin?' (finished)':'')).join(', '));
    const st=s.settings||{};out.push(`Limits: bell ${st.bell} min, break due ${st.breakDue}, min break ${st.minBreak}, max in water ${st.maxWater}, warn ${st.warn}/${st.crit}`)}
  else{const s=read('onpanel.air.v1');if(!s)return 'No Air data on this phone.';const p=s.plan||{};
    out.push(`Plan: depth ${p.depth||'-'} m, ${p.gas==='nx'?'nitrox '+(p.o2||'?')+'%':'air'}, ${p.method}, version ${p.mode}, next-table rule ${s.settings&&s.settings.strict?'on':'off'}`);
    for(const d of s.divers||[])if(d.ev&&d.ev.length)out.push(d.id+(d.depth?' ('+d.depth+' m)':'')+': '+d.ev.slice(-8).map(e=>e.type+(e.depth!=null?e.depth:'')+' '+hm(e.t)).join(', '))}
  const pl=read('diveTimes.plan'),r=pl&&pl.profiles&&pl.profiles[pl.active];out.push('Rules profile: '+(r?(r.name||pl.active):'none'));
  return out.join('\n')}
function reportText(what){const now=new Date();
  return `OnPanel problem report\nVersion: v${V} · ${SCREEN} screen\nWhen: ${now.toLocaleString('en-GB')}\nPhone: ${navigator.userAgent.replace(/\s*\(KHTML.*$/,'')}\n\nWhat happened:\n${what||'(not filled in)'}\n\nWhat the app had at the time:\n${stateSummary()}`}
function reportHtml(){return head('Report a problem')+`<p class="hint" style="margin:0">Say what you saw and what you expected. The app adds its version and the times on screen (no names, no company tables), then you send it to whoever gave you OnPanel.</p>
  <textarea id="sp-what" placeholder="e.g. Diver 2 break due showed 14:20 but should have been 14:35 after a 20 min break"></textarea>
  <details><summary class="hint">What gets sent</summary><pre id="sp-pre">${esc(reportText(''))}</pre></details>
  <div class="btns"><button type="button" data-sp="send">Send</button><button type="button" class="alt" data-sp="copy">Copy</button></div>`}

async function send(copyOnly){const txt=reportText((document.getElementById('sp-what')||{}).value||'');
  if(!copyOnly&&navigator.share){try{await navigator.share({title:'OnPanel problem report',text:txt});return}catch(e){if(e&&e.name==='AbortError')return}}
  try{await navigator.clipboard.writeText(txt);flash('Copied. Paste it into a message or email.')}
  catch(e){const pre=document.getElementById('sp-pre');if(pre){pre.closest('details').open=true;const r=document.createRange();r.selectNodeContents(pre);const s=getSelection();s.removeAllRanges();s.addRange(r)}flash('Selected: use Copy from the menu')}}
function flash(m){if(typeof window.toast==='function'){try{window.toast(m);return}catch(e){}}const t=document.getElementById('toast');if(t){t.textContent=m;t.hidden=false;setTimeout(()=>t.hidden=true,3500)}}

document.addEventListener('click',e=>{const b=e.target.closest('[data-sp]');if(!b)return;const a=b.dataset.sp;
  if(a==='changes'){put(SEEN,String(V));document.querySelectorAll('.sp-new').forEach(x=>x.remove());open(changesHtml());return}
  if(a==='seen'){put(SEEN,String(V));b.closest('.sp-new').remove();return}
  if(a==='report'){open(reportHtml());return}
  if(a==='close'){close();return}
  if(a==='send'){send(false);return}
  if(a==='copy'){send(true);return}});
document.addEventListener('input',e=>{if(e.target.id==='sp-what'){const pre=document.getElementById('sp-pre');if(pre)pre.textContent=reportText(e.target.value)}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&dlg)close()});
window.OnPanelVersion=V;
})();

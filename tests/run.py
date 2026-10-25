"""OnPanel regression checks.

Runs both screens in a headless browser and records what the timing logic produces for a fixed set of
inputs, then compares with tests/golden.json. Any difference means timing, schedules, limits or alarm
states have changed and must be explained before release.

  python3 tests/run.py            check against golden.json (exit 1 on any difference)
  python3 tests/run.py --update   rewrite golden.json (only after the change has been checked and is intended)

Uses tests/fixture-profile.json: synthetic tables with made-up numbers. TEST DATA ONLY - NOT FOR DIVING.
No company's real tables are ever stored in this repository.
Needs: pip install playwright (with a Chromium browser available).
"""
import json, os, re, sys, threading, http.server, socketserver, functools

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(ROOT, 'tests')
GOLD = os.path.join(HERE, 'golden.json')
PROFILE = json.load(open(os.path.join(HERE, 'fixture-profile.json')))

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Quiet, directory=ROOT)
    s = socketserver.TCPServer(('127.0.0.1', 0), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, s.server_address[1]

def version_check():
    sw = open(os.path.join(ROOT, 'sw.js')).read()
    sp = open(os.path.join(ROOT, 'support.js')).read()
    v1 = int(re.search(r"VERSION = 'dive-times-v(\d+)'", sw).group(1))
    v2 = int(re.search(r"\{v:(\d+),", sp).group(1))
    return {'sw': v1, 'changes': v2, 'match': v1 == v2}

# ---- Air: every table lookup across methods, gases, depths and bottom times, with and without the next-table rule
AIR_GRID = r'''(()=>{const out=[];for(const strict of[true,false]){S().strict=strict;
 for(const method of['nostop','inwater','surdo2'])for(const [gas,o2] of[['air',''],['nx','32'],['nx','36'],['nx','40'],['nx','28']]){
  const p=P();p.method=method;p.gas=gas;p.o2=o2;p.mode='B';
  for(let d=5;d<=42;d+=1){const g=gasInfo(d);
   for(const bt of[0,1,10,25,45,60,90,120,200,300]){const L=lookup(d,bt);
    out.push([strict,method,gas,o2,d,bt,L.err||null,L.err?null:[L.td,L.idx,L.bt===Infinity?'inf':L.bt,L.asc,L.tot,L.stops,L.o2??null,L.si??null,L.pdi??null,L.rep??null],g.err||null,g.warn||null,g.ead??null])}}}}
 out.push(['limits',hseLimit(18),hseLimit(45),nsLimitA(12),nsLimitA(50)]);return out})()'''

# ---- Air: stamped dives, checked at several moments after each stamp (schedule, O2 timing, next action, tile text)
AIR_DIVES = r'''(()=>{const M=60000,t0=Date.UTC(2026,0,5,8,0,13),out=[];
 const runs=[
  {method:'surdo2',gas:'air',o2:'',depth:'20',ev:[['ls',0],['ad',2],['lb',60],['as',62,9],['lv',64,9],['su',66],['c12',70.5],['air',70.5+20],['o2',70.5+25],['ca',70.5+40],['cs',70.5+45]]},
  {method:'inwater',gas:'nx',o2:'36',depth:'18',ev:[['ls',0],['ad',1.5],['lb',105],['as',107,6],['lv',110,6],['as',110.5,3],['lv',122,3],['su',123]]},
  {method:'nostop',gas:'air',o2:'',depth:'15',ev:[['ls',0],['ad',1],['lb',40],['su',42]]},
  {method:'surdo2',gas:'air',o2:'',depth:'25',ev:[['ls',0],['lb',40],['su',45],['c12',50.2]]}];
 for(const r of runs){const p=P();p.method=r.method;p.gas=r.gas;p.o2=r.o2;p.depth=r.depth;p.mode='B';
  const d=D('d1');d.ev=[];d.depth='';
  for(let i=0;i<r.ev.length;i++){const [type,m,dep]=r.ev[i];const e={type,t:t0+m*M};if(dep!=null)e.depth=dep;d.ev.push(e);
   for(const dt of[0,0.5,1,3,7]){const now=e.t+dt*M;if(i+1<r.ev.length&&now>t0+r.ev[i+1][1]*M)continue;
    const sc=sched(d,now);const o=['c12','o2','air','ca'].includes(type)?o2calc(d,sc,now):null;
    paintTile('d1',now);const tile=document.querySelector('.tile[data-tile="d1"]');
    out.push([r.method,type,dt,sc.bt??null,sc.err||null,sc.stops,sc.o2??null,(sc.notes||[]).map(n=>n.t),nextAct(d,now),o&&[o.on,o.left,o.breakAt??null,o.endAt],stopInfo(d,sc,now),tile.className,tile.innerText.replace(/\s+/g,' ')])}}}
 return out})()'''

# ---- Air with no rules profile: version A only, stops entered by hand
AIR_NOPROFILE = r'''(()=>{const M=60000,t0=Date.UTC(2026,0,5,8,0,13),out=[];const p=P();p.depth='22';p.gas='nx';p.o2='32';p.method='inwater';
 out.push(['mode',p.mode,document.querySelector('#seg-mode [data-mode="B"]').disabled,gasInfo(22)]);
 const d=D('d1');d.ev=[{type:'ls',t:t0},{type:'ad',t:t0+2*M},{type:'lb',t:t0+50*M}];d.stopsA={6:'4',3:'8'};
 for(const dt of[0,1,5]){const now=t0+(50+dt)*M,sc=sched(d,now);paintTile('d1',now);out.push([dt,sc.stops,sc.asc,nextAct(d,now),document.querySelector('.tile[data-tile="d1"]').innerText.replace(/\s+/g,' ')])}
 return out})()'''

# ---- Sat: bell run and divers through lock-off, in water, breaks back in the bell, finish
SAT_RUN = r'''(()=>{const M=60000,t0=Date.UTC(2026,0,5,8,0,0),out=[];S().diver3=true;
 state.bell=[];state.divers.forEach(d=>d.ev=[]);render();
 const steps=[['bell','off',0],['d1','in',5],['d2','in',8],['d1','bell',200],['d1','in',230],['d2','bell',250],['d2','in',258],['d3','in',260],
   ['d1','bell',470],['d2','bell',475],['d3','bell',480],['bell','on',490]];
 const ev=w=>w==='bell'?state.bell:state.divers.find(d=>d.id===w).ev;
 const snap=(label,now)=>{const b=bcalc(now);const row={label,bell:{phase:b.phase,due:b.due??null,run:b.run??null}};
   for(const d of people()){const c=dcalc(d,now);row[d.id]={phase:c.phase,water:c.water??null,bellT:c.bellT??null,breaks:c.breaks??null,breakDue:c.breakDue??null,dueBack:c.dueBack??null,primary:c.primary||null,visitOk:c.visitOk??null}}
   ['bell',...people().map(d=>d.id)].forEach(w=>paintTile(w,now));
   row.tiles=[...document.querySelectorAll('#tiles .tile')].map(t=>[t.dataset.tile,t.className.replace(' pressing',''),t.style.getPropertyValue('--g'),t.innerText.replace(/\s+/g,' ')]);
   out.push(row)};
 for(const [w,type,m] of steps){ev(w).push({type,t:t0+m*M});for(const dt of[0,10,31,60])snap(`${w} ${type} +${dt}`,t0+(m+dt)*M)}
 // finish the divers and the run
 for(const d of people()){const e=d.ev;if(e.length)e[e.length-1].fin=true}
 state.bell[state.bell.length-1].fin=true;snap('all finished',t0+500*M);
 return out})()'''

def run():
    from playwright.sync_api import sync_playwright
    srv, port = serve(); base = f'http://127.0.0.1:{port}/'
    res = {'version': version_check()}
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        def page(url, init=None):
            c = b.new_context(timezone_id='UTC', locale='en-GB', viewport={'width': 390, 'height': 900}, service_workers='block')
            c.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/.*'), lambda r: r.abort())
            pg = c.new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            if init: pg.add_init_script(init)
            pg.goto(url); pg.wait_for_timeout(300)
            return c, pg, errs
        init = "try{localStorage.setItem('diveTimes.plan',JSON.stringify({profiles:{t:%s},active:'t'}))}catch(e){}" % json.dumps(PROFILE)
        c, pg, errs = page(base + 'air.html', init)
        res['air_grid'] = pg.evaluate(AIR_GRID); res['air_dives'] = pg.evaluate(AIR_DIVES); res['air_errors'] = errs; c.close()
        c, pg, errs = page(base + 'air.html')
        res['air_noprofile'] = pg.evaluate(AIR_NOPROFILE); res['air_noprofile_errors'] = errs; c.close()
        c, pg, errs = page(base)
        res['sat_run'] = pg.evaluate(SAT_RUN); res['sat_errors'] = errs; c.close()
        b.close()
    srv.shutdown()
    return res

def main():
    res = run(); upd = '--update' in sys.argv
    problems = []
    if not res['version']['match']: problems.append(f"Version mismatch: sw.js v{res['version']['sw']} but support.js lists v{res['version']['changes']}")
    for k in ('air_errors', 'air_noprofile_errors', 'sat_errors'):
        if res[k]: problems.append(f'{k}: {res[k]}')
    body = {k: v for k, v in res.items() if k != 'version'}
    counts = {k: len(v) for k, v in body.items() if isinstance(v, list)}
    if upd:
        json.dump(body, open(GOLD, 'w'), ensure_ascii=False, separators=(',', ':'))
        print('golden.json updated:', counts)
    else:
        gold = json.load(open(GOLD))
        for k in ('air_grid', 'air_dives', 'air_noprofile', 'sat_run'):
            a, n = gold.get(k, []), body[k]
            diffs = [i for i in range(max(len(a), len(n))) if i >= len(a) or i >= len(n) or json.dumps(a[i], ensure_ascii=False) != json.dumps(n[i], ensure_ascii=False)]
            if diffs:
                problems.append(f'{k}: {len(diffs)} of {len(n)} results differ')
                for i in diffs[:3]:
                    problems.append(f'  was: {json.dumps(a[i], ensure_ascii=False)[:400] if i < len(a) else "-"}')
                    problems.append(f'  now: {json.dumps(n[i], ensure_ascii=False)[:400] if i < len(n) else "-"}')
        print('checked:', counts)
    print(f"version: sw v{res['version']['sw']}, changes v{res['version']['changes']}")
    if problems:
        print('PROBLEMS:'); print('\n'.join(problems)); sys.exit(1)
    print('ALL OK')

if __name__ == '__main__':
    main()

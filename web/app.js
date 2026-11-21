import seed from './seed.json' with { type: 'json' };
import problemCatalog from './problem-library.json' with { type: 'json' };
const STORE='careersprint-sessions-v1';
const REVIEW_STORE='careersprint-problem-reviews-v1';
let problemReviews={};
const RESOURCE_FIELDS=['resourceUrl','resourceLabel','resourceNote','resourceKind'];
function mergeStudyPlan(existing){
  const existingIds=new Set(existing.map(s=>String(s.id)));
  const merged=existing.map(s=>{const template=seed.find(t=>String(t.id)===String(s.id));return template?{...s,...Object.fromEntries(RESOURCE_FIELDS.filter(k=>template[k]).map(k=>[k,s[k]||template[k]]))}:s});
  // Only add the new design drills to avoid restoring legacy sessions a user intentionally deleted.
  return [...merged,...seed.filter(s=>s.type==='System design'&&!existingIds.has(String(s.id)))];
}
function validResource(url){try{const parsed=new URL(url);return parsed.protocol==='https:'&&['www.hackerrank.com','learn.microsoft.com','leetcode.com'].includes(parsed.hostname)}catch{return false}}
function resourceLink(s){return validResource(s.resourceUrl)?`<a class="resource-link" href="${escapeHTML(s.resourceUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeHTML(s.resourceNote||'')}">${escapeHTML(s.resourceKind==='hackerrank'?'Solve on HackerRank ↗':'Architecture reference ↗')}</a>`:''}
const validStatuses=['Not started','In progress','Completed','Skipped'];
const $=id=>document.getElementById(id);
const localDate=d=>new Date(`${d}T12:00:00`);
const isoDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const fmt=(d,opts={month:'short',day:'numeric'})=>localDate(d).toLocaleDateString('en-US',opts);
const today=isoDate(new Date());
function normalize(s,i=0){return {id:String(s.id||`custom-${Date.now()}-${i}`),date:/^\d{4}-\d\d-\d\d$/.test(s.date)?s.date:today,week:Math.max(1,Number(s.week)||1),type:String(s.type||'Other'),title:String(s.title||'Untitled session'),description:String(s.description||''),start:String(s.start||'20:30'),end:String(s.end||'21:45'),status:validStatuses.includes(s.status)?s.status:'Not started',minutes:s.minutes===''||s.minutes==null?'':Math.max(0,Number(s.minutes)||0),confidence:s.confidence===''||s.confidence==null?'':Math.min(5,Math.max(1,Number(s.confidence)||1)),notes:String(s.notes||''),resourceUrl:validResource(s.resourceUrl)?s.resourceUrl:'',resourceLabel:String(s.resourceLabel||''),resourceNote:String(s.resourceNote||''),resourceKind:String(s.resourceKind||'')};}
let sessions=[];try{const raw=JSON.parse(localStorage.getItem(STORE));sessions=mergeStudyPlan(Array.isArray(raw)?raw:seed).map(normalize)}catch{sessions=seed.map(normalize)}
localStorage.setItem(STORE,JSON.stringify(sessions));
let cloudMode=false, cloudReady=false, cloudEtag=null, dirty=false, saving=false, cloudBlocked=false;
const indicator=document.querySelector('.save-indicator');
function displaySync(text, issue=false){indicator.textContent=(issue?'⚠ ':'● ')+text;indicator.title=issue?'Check connection; export a JSON backup before refreshing.':'';indicator.style.color=issue?'#b45309':'';}
async function cloudFetch(){const r=await fetch('/api/progress',{cache:'no-store'});if(!r.ok)throw Error('Cloud load failed: HTTP '+r.status);cloudEtag=r.headers.get('etag');return await r.json()}
async function cloudInit(){
  cloudMode=!['localhost','127.0.0.1'].includes(location.hostname);
  if(!cloudMode){problemReviews=loadLocalProblemReviews();cloudReady=true;displaySync('Local preview only');render();return}
  displaySync('Connecting to Azure…');
  try{
    const response=await fetch('/.auth/me',{cache:'no-store'});const auth=await response.json();
    if(!auth.clientPrincipal){location.assign('/.auth/login/aad?post_login_redirect_uri=/');return}
    const name=auth.clientPrincipal.userDetails||'Account';
    document.querySelector('.avatar').textContent=name.slice(0,2).toUpperCase();
    document.querySelector('#accountName').textContent=name;
    const doc=await cloudFetch();
    problemReviews=normalizeProblemReviews(doc.problemReviews);
    if(Array.isArray(doc.sessions)){sessions=mergeStudyPlan(doc.sessions).map(normalize);if(sessions.length!==doc.sessions.length)dirty=true;}
    else {
      const local=JSON.parse(localStorage.getItem(STORE)||'null');
      const localReviews=loadLocalProblemReviews();
      const migrate=Array.isArray(local)&&local.some(s=>s.status!=='Not started'||s.notes||s.minutes)||Object.keys(localReviews).length>0;
      const migrateLocal=migrate&&confirm('Existing progress was found in this browser. Import it into your new cloud account?');
      sessions=mergeStudyPlan(migrateLocal?local:seed).map(normalize);
      if(migrateLocal)problemReviews=localReviews;
      dirty=true;
    }
    cloudReady=true;render();
    if(dirty)queueSync();else displaySync('Saved in Azure');
  }catch(e){console.error(e);cloudBlocked=true;displaySync('Cloud unavailable · edits disabled',true);alert('Could not load cloud data. Your cloud data was NOT overwritten. Please refresh later or check Azure API configuration.');document.querySelectorAll('#addBtn,#calendarAddBtn,#sessionsAddBtn').forEach(b=>b.disabled=true);render()}
}
async function queueSync(){
  if(!cloudMode||!cloudReady||cloudBlocked||saving)return;
  saving=true;
  try{
    while(dirty){
      dirty=false;displaySync('Saving to Azure…');
      const snapshot=JSON.stringify({sessions:sessions.map(s=>({...s,minutes:s.minutes===''?null:s.minutes,confidence:s.confidence===''?null:s.confidence})),problemReviews:Object.values(problemReviews)});
      const r=await fetch('/api/progress',{method:'PUT',headers:{'Content-Type':'application/json',...(cloudEtag?{'If-Match':cloudEtag}:{})},body:snapshot});
      if(!r.ok){let data={};try{data=await r.json()}catch{};throw Error(data.error||('Save failed: HTTP '+r.status))}
      cloudEtag=r.headers.get('etag');displaySync('Saved in Azure');
    }
  }catch(e){dirty=true;cloudBlocked=true;displaySync('Unsaved changes · export backup',true);alert('Cloud sync stopped: '+e.message+'\nExport a JSON backup now. Refresh only after your backup is saved.');}
  finally{saving=false}
}

let view='overview',month=new Date(2026,10,1),selectedDate=today;
function save(){
  if(cloudMode&&!cloudReady){alert('Cloud is still loading. Please retry.');return}
  if(cloudBlocked){alert('Cloud sync is unavailable. Export a JSON backup before making additional changes.');return}
  localStorage.setItem(STORE,JSON.stringify(sessions));
  localStorage.setItem(REVIEW_STORE,JSON.stringify(Object.values(problemReviews)));
  if(cloudMode){dirty=true;queueSync()}render()
}
function sorted(){return [...sessions].sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start))}
function currentWeek(){const first=localDate('2026-11-23'),now=localDate(today);return Math.max(1,Math.min(12,Math.floor((now-first)/86400000/7)+1))}
const badge=s=>`<span class="badge ${s.toLowerCase().replaceAll(' ','-')}">${escapeHTML(s)}</span>`;
function escapeHTML(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function weekDates(w){const d=localDate('2026-11-23');d.setDate(d.getDate()+(w-1)*7);const end=new Date(d);end.setDate(end.getDate()+6);return `${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`}
function metrics(){const complete=sessions.filter(s=>s.status==='Completed');const rated=sessions.filter(s=>s.confidence!=='');return {complete:complete.length,total:sessions.length,hours:sessions.reduce((a,s)=>a+(Number(s.minutes)||0),0)/60,confidence:rated.length?(rated.reduce((a,s)=>a+Number(s.confidence),0)/rated.length):null,pct:sessions.length?Math.round(complete.length/sessions.length*100):0}}
function setView(v){view=v;document.querySelectorAll('.view').forEach(el=>el.classList.add('hidden'));$(v+'View').classList.remove('hidden');document.querySelectorAll('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.view===v));$('pageCrumb').textContent=v.charAt(0).toUpperCase()+v.slice(1);document.querySelector('.sidebar').classList.remove('open');render();window.scrollTo({top:0,behavior:'smooth'})}
function render(){const m=metrics(),w=currentWeek();$('statCompleted').innerHTML=`${m.complete} <small>/ ${m.total}</small>`;$('statHours').innerHTML=`${Number(m.hours.toFixed(1))} <small>hrs</small>`;$('statWeek').innerHTML=`${w} <small>/ 12</small>`;$('statWeekDates').textContent=weekDates(w);$('statConfidence').innerHTML=`${m.confidence===null?'—':m.confidence.toFixed(1)} <small>/ 5</small>`;$('heroPct').textContent=m.pct+'%';$('heroFill').style.width=m.pct+'%';$('heroMini').textContent=`${m.complete} of ${m.total} sessions completed`;$('heroTitle').textContent=m.pct===100?'You did it. Keep building!':m.complete?'Look how far you’ve come.':"You're building something great.";
 const next=sorted().filter(s=>s.status!=='Completed'&&s.status!=='Skipped'&&s.date>=today).slice(0,3);const fallback=sorted().filter(s=>s.status!=='Completed'&&s.status!=='Skipped').slice(0,3);
 $('upNext').innerHTML=(next.length?next:fallback).map(s=>`<div class="upnext-item" data-edit="${escapeHTML(s.id)}"><div class="date-chip"><small>${fmt(s.date,{month:'short'}).toUpperCase()}</small>${localDate(s.date).getDate()}</div><div><div class="session-name">${escapeHTML(s.title)}</div><div class="session-sub">${escapeHTML(s.type)} · ${escapeHTML(s.start)} – ${escapeHTML(s.end)}</div>${resourceLink(s)}</div><span class="arrow">›</span></div>`).join('')||'<div class="empty">No upcoming sessions. Add one to get started.</div>';
 const week=sessions.filter(s=>s.week===w).sort((a,b)=>a.date.localeCompare(b.date)),done=week.filter(s=>s.status==='Completed').length;$('weekTag').textContent=`Week ${w}`;$('weeklyTasks').innerHTML=week.map(s=>`<div class="weekly-line" data-edit="${escapeHTML(s.id)}"><span class="check-circle ${s.status==='Completed'?'checked':''}">${s.status==='Completed'?'✓':''}</span><b>${escapeHTML(s.title)}</b><small>${fmt(s.date,{weekday:'short'})}</small></div>`).join('')+`<div class="week-summary"><b>${done} of ${week.length} sessions complete this week</b><div class="mini-progress"><div style="width:${week.length?done/week.length*100:0}%"></div></div></div>`;
 renderCalendar();renderSessions();renderInsights();renderProblemLibrary();}
function renderCalendar(){const label=month.toLocaleDateString('en-US',{month:'long',year:'numeric'});$('monthLabel').textContent=label;const year=month.getFullYear(),mo=month.getMonth(),start=new Date(year,mo,1),offset=start.getDay(),n=new Date(year,mo+1,0).getDate();let html=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div class="calendar-day-name">${x}</div>`).join('');const cells=Math.ceil((offset+n)/7)*7;for(let i=0;i<cells;i++){const d=new Date(year,mo,i-offset+1),key=isoDate(d),events=sessions.filter(s=>s.date===key),outside=d.getMonth()!==mo;html+=`<div class="calendar-cell ${outside?'outside':''} ${key===selectedDate?'selected':''}" data-date="${key}"><span class="day-num ${key===today?'today-dot':''}">${d.getDate()}</span>${events.slice(0,2).map(s=>`<div class="cal-event ${s.status==='Completed'?'done':''}" title="${escapeHTML(s.title)}">${escapeHTML(s.title)}</div>`).join('')}${events.length>2?`<div class="cal-event">+${events.length-2} more</div>`:''}</div>`}$('calendarGrid').innerHTML=html;const picked=sessions.filter(s=>s.date===selectedDate);$('calendarDetail').innerHTML=`<h3>${fmt(selectedDate,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</h3>`+(picked.length?picked.map(s=>`<div class="calendar-detail-item" data-edit="${escapeHTML(s.id)}"><div><b>${escapeHTML(s.title)}</b><div class="session-sub">${escapeHTML(s.start)}–${escapeHTML(s.end)} · ${escapeHTML(s.type)}</div>${resourceLink(s)}</div>${badge(s.status)}</div>`).join(''):'<div class="empty">No sessions scheduled for this day.</div>')}
function renderSessions(){const wf=$('weekFilter'),wfPrev=wf.value,wks=[...new Set(sessions.map(s=>s.week))].sort((a,b)=>a-b);wf.innerHTML='<option value="all">All weeks</option>'+wks.map(w=>`<option value="${w}">Week ${w}</option>`).join('');wf.value=wks.some(w=>String(w)===wfPrev)?wfPrev:'all';const q=$('searchInput').value.toLowerCase().trim(),st=$('statusFilter').value;const rows=sorted().filter(s=>(wf.value==='all'||String(s.week)===wf.value)&&(st==='all'||s.status===st)&&(!q||`${s.title} ${s.description} ${s.notes}`.toLowerCase().includes(q)));$('sessionsBody').innerHTML=rows.map(s=>`<tr><td>${escapeHTML(s.title)}<small>Week ${s.week} · ${escapeHTML(s.start)}–${escapeHTML(s.end)}</small>${resourceLink(s)}</td><td>${fmt(s.date,{month:'short',day:'numeric',year:'numeric'})}</td><td>${escapeHTML(s.type)}</td><td>${badge(s.status)}</td><td>${s.confidence===''?'—':'★ '+s.confidence+'/5'}</td><td><button class="edit-link" data-edit="${escapeHTML(s.id)}">Edit →</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">No matching sessions</td></tr>';$('tableFooter').textContent=`Showing ${rows.length} of ${sessions.length} sessions`}
function renderInsights(){const m=metrics();$('insightCompletion').textContent=m.pct+'%';$('insightTime').innerHTML=`${Number(m.hours.toFixed(1))} <small>hrs</small>`;$('insightConfidence').textContent=m.confidence===null?'—':m.confidence.toFixed(1)+'/5';$('insightRemaining').textContent=sessions.filter(s=>s.status!=='Completed').length;$('weekBars').innerHTML=Array.from({length:12},(_,i)=>{const w=i+1,arr=sessions.filter(s=>s.week===w),d=arr.filter(s=>s.status==='Completed').length,p=arr.length?Math.round(d/arr.length*100):0;return `<div class="bar-row"><div class="bar-top"><b>Week ${w}</b><span>${d}/${arr.length} sessions · ${p}%</span></div><div class="bar-bg"><div class="bar-fill" style="width:${p}%"></div></div></div>`}).join('');const types=[...new Set(sessions.map(s=>s.type))];$('typeBars').innerHTML=types.map(t=>{const arr=sessions.filter(s=>s.type===t),d=arr.filter(s=>s.status==='Completed').length,p=arr.length?Math.round(d/arr.length*100):0;return `<div class="bar-row"><div class="bar-top"><b>${escapeHTML(t)}</b><span>${d}/${arr.length} done</span></div><div class="bar-bg"><div class="bar-fill alt" style="width:${p}%"></div></div></div>`}).join('')}
function openSession(id){const s=sessions.find(x=>x.id===id),fresh=!s;const cur=s||{id:'',title:'',date:today,week:currentWeek(),start:'20:30',end:'21:45',type:'Coding + concept',description:'',status:'Not started',minutes:'',confidence:'',notes:'',resourceUrl:'',resourceLabel:'',resourceNote:'',resourceKind:''};$('modalTitle').textContent=fresh?'Add new session':'Edit session';for(const [key,field] of Object.entries({id:'sessionId',title:'editTitle',date:'editDate',week:'editWeek',start:'editStart',end:'editEnd',type:'editType',description:'editDescription',status:'editStatus',minutes:'editMinutes',confidence:'editConfidence',notes:'editNotes'}))$(field).value=cur[key];$('resourcePanel').classList.toggle('hidden',!validResource(cur.resourceUrl));$('resourceAnchor').href=validResource(cur.resourceUrl)?cur.resourceUrl:'#';$('resourceAnchor').textContent=cur.resourceLabel||'Open reference ↗';$('resourceNote').textContent=cur.resourceNote||'';$('deleteSession').classList.toggle('hidden',fresh);$('sessionModal').classList.remove('hidden');$('editTitle').focus()}
function closeSession(){$('sessionModal').classList.add('hidden')}
function download(name,mime,text){const blob=new Blob([text],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function csvEscape(x){return '"'+String(x??'').replaceAll('"','""')+'"'}
function exportCSV(){const fields=[['date','Date'],['week','Week'],['title','Session'],['type','Category'],['start','Start'],['end','End'],['status','Status'],['minutes','Actual Minutes'],['confidence','Confidence (1-5)'],['description','Planned Work'],['notes','Notes / Mistakes'],['resourceUrl','Reference URL']];const content='\ufeff'+fields.map(x=>csvEscape(x[1])).join(',')+'\r\n'+sorted().map(s=>fields.map(([k])=>csvEscape(s[k])).join(',')).join('\r\n');download('CareerSprint_Progress.csv','text/csv;charset=utf-8',content)}
function exportJSON(){download('CareerSprint_Backup.json','application/json',JSON.stringify({version:1,exportedAt:new Date().toISOString(),sessions,problemReviews:Object.values(problemReviews)},null,2))}
function icsEscape(s){return String(s??'').replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(',','\\,').replaceAll(';','\\;')}
function fold(s){const chunks=[];while(s.length>70){chunks.push(s.slice(0,70));s=' '+s.slice(70)}chunks.push(s);return chunks.join('\r\n')}
function exportICS(){const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'').replace('Z','Z');let lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CareerSprint//Interview Prep//EN','CALSCALE:GREGORIAN','X-WR-CALNAME:CareerSprint Interview Prep'];for(const s of sorted()){const dt=x=>s.date.replaceAll('-','')+'T'+x.replace(':','')+'00';lines.push('BEGIN:VEVENT',`UID:${s.id.replace(/[^a-zA-Z0-9-]/g,'')}@careersprint.local`,`DTSTAMP:${stamp}`,`DTSTART;TZID=America/Los_Angeles:${dt(s.start)}`,`DTEND;TZID=America/Los_Angeles:${dt(s.end)}`,`SUMMARY:${icsEscape(s.title)}`,`DESCRIPTION:${icsEscape(s.description+'\nReference: '+(s.resourceUrl||'None')+'\nStatus: '+s.status+'\nNotes: '+s.notes)}`,'BEGIN:VALARM','TRIGGER:-PT15M','ACTION:DISPLAY','DESCRIPTION:CareerSprint study session','END:VALARM','END:VEVENT')}lines.push('END:VCALENDAR');download('CareerSprint_Outlook_Calendar.ics','text/calendar;charset=utf-8',lines.map(fold).join('\r\n')+'\r\n')}
function dataOpen(){$('dataModal').classList.remove('hidden');$('importMsg').textContent=''}
function dataClose(){$('dataModal').classList.add('hidden')}
document.addEventListener('click',e=>{const problemAction=e.target.closest('[data-problem-action]');if(problemAction){handleProblemAction(problemAction.dataset.problemAction,problemAction.dataset.problemId);return}if(e.target.closest('a.resource-link'))return;const nav=e.target.closest('[data-view]');if(nav){setView(nav.dataset.view);return}const edit=e.target.closest('[data-edit]');if(edit){openSession(edit.dataset.edit);return}const day=e.target.closest('[data-date]');if(day){selectedDate=day.dataset.date;const d=localDate(selectedDate);month=new Date(d.getFullYear(),d.getMonth(),1);renderCalendar()}});
document.querySelectorAll('#addBtn,#calendarAddBtn,#sessionsAddBtn').forEach(el=>el.onclick=()=>openSession(''));
$('mobileMenu').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
$('closeModal').onclick=$('cancelModal').onclick=closeSession;$('sessionModal').onclick=e=>{if(e.target===$('sessionModal'))closeSession()};
$('sessionForm').onsubmit=e=>{e.preventDefault();if(cloudBlocked||!cloudReady){alert('Cloud data is not ready.');return}const id=$('sessionId').value;const previous=sessions.find(x=>x.id===id);const s=normalize({id:id||`custom-${Date.now()}`,title:$('editTitle').value,date:$('editDate').value,week:$('editWeek').value,start:$('editStart').value,end:$('editEnd').value,type:$('editType').value,description:$('editDescription').value,status:$('editStatus').value,minutes:$('editMinutes').value,confidence:$('editConfidence').value,notes:$('editNotes').value,...(previous?Object.fromEntries(RESOURCE_FIELDS.map(k=>[k,previous[k]])): {})});if(s.end<=s.start){alert('End time must be after start time.');return}const i=sessions.findIndex(x=>x.id===id);if(i<0)sessions.push(s);else sessions[i]=s;closeSession();save()};
$('deleteSession').onclick=()=>{if(cloudBlocked||!cloudReady){alert('Cloud data is not ready.');return}const id=$('sessionId').value;if(confirm('Delete this session permanently?')){sessions=sessions.filter(s=>s.id!==id);closeSession();save()}};
$('prevMonth').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);renderCalendar()};$('nextMonth').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);renderCalendar()};$('todayBtn').onclick=()=>{const d=localDate(today);month=new Date(d.getFullYear(),d.getMonth(),1);selectedDate=today;renderCalendar()};
$('searchInput').oninput=renderSessions;$('weekFilter').onchange=renderSessions;$('statusFilter').onchange=renderSessions;
$('dataBtn').onclick=$('footerBackup').onclick=dataOpen;$('closeData').onclick=dataClose;$('dataModal').onclick=e=>{if(e.target===$('dataModal'))dataClose()};
$('exportJSON').onclick=exportJSON;$('exportCSV').onclick=$('insightsExportBtn').onclick=exportCSV;$('exportICS').onclick=exportICS;
$('importJSON').onchange=async e=>{if(cloudBlocked||!cloudReady){alert('Cloud data is not ready.');return}const file=e.target.files[0];if(!file)return;try{const content=JSON.parse(await file.text()),arr=Array.isArray(content)?content:content.sessions;if(!Array.isArray(arr)||!arr.every(s=>s&&typeof s==='object'&&s.date&&s.title))throw Error('Not a valid CareerSprint backup.');if(!confirm(`Replace your ${sessions.length} sessions with ${arr.length} imported sessions? Export a backup first if needed.`))return;sessions=mergeStudyPlan(arr).map(normalize);problemReviews=normalizeProblemReviews(content.problemReviews);save();$('importMsg').textContent=`Imported ${sessions.length} sessions successfully.`}catch(err){$('importMsg').textContent='Import failed: '+err.message}finally{e.target.value=''}};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSession();dataClose()}});
initializeProblemLibrary();
cloudInit();

function loadLocalProblemReviews(){try{return normalizeProblemReviews(JSON.parse(localStorage.getItem(REVIEW_STORE)||'[]'))}catch{return {}}}
function normalizeProblemReviews(raw){const rows=Array.isArray(raw)?raw:[];const allowed=new Set(problemCatalog.map(p=>p.id));return Object.fromEntries(rows.filter(r=>r&&allowed.has(String(r.problemId))).map(r=>[String(r.problemId),{problemId:String(r.problemId),attempts:Math.min(10000,Math.max(0,Number(r.attempts)||0)),lastReviewed:/^\d{4}-\d\d-\d\d$/.test(r.lastReviewed||'')?r.lastReviewed:null,nextReview:/^\d{4}-\d\d-\d\d$/.test(r.nextReview||'')?r.nextReview:null,confidence:r.confidence===''||r.confidence==null?null:Math.min(5,Math.max(1,Number(r.confidence)||1))}]))}
function initializeProblemLibrary(){
  const nav=document.querySelector('.sidebar nav'),button=document.createElement('button');
  button.className='nav-link';button.dataset.view='library';button.innerHTML='<span aria-hidden="true">⌕</span> Problem library';nav.append(button);
  const section=document.createElement('section');section.className='view hidden';section.id='libraryView';
  section.innerHTML='<div class="page-heading condensed"><div><div class="eyebrow">PRACTICE WITH INTENTION</div><h1>Problem <em>library.</em></h1><p>Build pattern fluency, then revisit problems on a spaced schedule.</p></div></div><div class="library-stats" id="libraryStats"></div><div class="library-layout"><section class="library-main panel"><div class="panel-head"><div><div class="eyebrow">CURATED PRACTICE</div><h3>Problems by pattern</h3></div></div><p class="pattern-summary">Filter by difficulty or algorithm pattern. Add problems to your queue when you want to schedule a revisit.</p><div class="library-toolbar"><input id="problemSearch" type="search" placeholder="Search problems or patterns" aria-label="Search problem library"><select id="problemDifficulty" aria-label="Filter by difficulty"><option value="all">All difficulties</option><option>Easy</option><option>Medium</option><option>Hard</option></select><select id="problemPattern" aria-label="Filter by algorithm pattern"><option value="all">All patterns</option></select></div><div class="problem-grid" id="problemGrid"></div></section><aside class="panel review-panel"><div class="panel-head"><div><div class="eyebrow">SPACED REPETITION</div><h3>Revision queue</h3></div><span class="small-pill" id="reviewDueCount">0 due</span></div><p class="pattern-summary">Rate confidence after each review. Stronger recalls get a longer interval.</p><div class="review-list" id="reviewList"></div></aside></div>';
  $('main').append(section);
  const patterns=[...new Set(problemCatalog.map(p=>p.pattern))].sort((a,b)=>a.localeCompare(b));
  $('problemPattern').innerHTML+='<option>'+patterns.map(p=>escapeHTML(p)).join('</option><option>')+'</option>';
  $('problemSearch').oninput=renderProblemLibrary;$('problemDifficulty').onchange=renderProblemLibrary;$('problemPattern').onchange=renderProblemLibrary;
}
function renderProblemLibrary(){
  if(!$('problemGrid'))return;
  const queued=Object.values(problemReviews).filter(r=>r.nextReview),due=queued.filter(r=>r.nextReview<=today).length;
  $('libraryStats').innerHTML=`<div class="library-stat"><b>${problemCatalog.length}</b> curated problems</div><div class="library-stat"><b>${queued.length}</b> in revision queue</div><div class="library-stat"><b>${due}</b> due today</div>`;
  $('reviewDueCount').textContent=`${due} due`;
  const query=$('problemSearch').value.toLowerCase().trim(),difficulty=$('problemDifficulty').value,pattern=$('problemPattern').value;
  const visible=problemCatalog.filter(p=>(difficulty==='all'||p.difficulty===difficulty)&&(pattern==='all'||p.pattern===pattern)&&(!query||`${p.title} ${p.pattern} ${p.description}`.toLowerCase().includes(query)));
  $('problemGrid').innerHTML=visible.map(p=>{const review=problemReviews[p.id],dueLabel=review?.nextReview?` · Next ${fmt(review.nextReview,{month:'short',day:'numeric'})}`:'';return `<article class="problem-card"><div class="problem-card-top"><span class="difficulty ${p.difficulty.toLowerCase()}">${p.difficulty}</span>${review?'<span class="queue-tag">In queue</span>':''}</div><h3>${escapeHTML(p.title)}</h3><div class="problem-meta"><span class="pattern-tag">${escapeHTML(p.pattern)}</span><span>~${p.minutes} min</span>${review?`<span>${review.attempts} review${review.attempts===1?'':'s'}${dueLabel}</span>`:''}</div><p>${escapeHTML(p.description)}</p><div class="problem-actions"><button class="queue-toggle ${review?'active':''}" data-problem-action="toggle" data-problem-id="${p.id}" aria-pressed="${Boolean(review)}">${review?'Remove from queue':'＋ Add to review'}</button><a class="problem-link" href="${escapeHTML(p.url)}" target="_blank" rel="noopener noreferrer">Open problem ↗</a></div></article>`}).join('')||'<div class="empty">No problems match these filters.</div>';
  $('reviewList').innerHTML=queued.sort((a,b)=>(a.nextReview||'').localeCompare(b.nextReview||'')).map(r=>{const p=problemCatalog.find(x=>x.id===r.problemId);if(!p)return '';const isDue=!r.nextReview||r.nextReview<=today;return `<article class="review-item"><h4>${escapeHTML(p.title)}</h4><small>${escapeHTML(p.pattern)} · ${isDue?'Due now':`Due ${fmt(r.nextReview,{month:'short',day:'numeric'})}`} · ${r.attempts} review${r.attempts===1?'':'s'}</small><div class="review-row"><label><select data-review-confidence="${p.id}" aria-label="Confidence after reviewing ${escapeHTML(p.title)}"><option value="3">3 · Okay</option><option value="1">1 · Hard</option><option value="2">2 · Shaky</option><option value="4">4 · Good</option><option value="5">5 · Easy</option></select></label><button data-problem-action="review" data-problem-id="${p.id}">Reviewed</button><button data-problem-action="toggle" data-problem-id="${p.id}" aria-label="Remove ${escapeHTML(p.title)} from revision queue">×</button></div></article>`}).join('')||'<div class="review-empty">Your queue is clear. Add a problem from the library when you want to schedule a revisit.</div>';
}
function handleProblemAction(action,id){
  if(!problemCatalog.some(p=>p.id===id))return;
  if(action==='toggle'){if(problemReviews[id])delete problemReviews[id];else problemReviews[id]={problemId:id,attempts:0,lastReviewed:null,nextReview:today,confidence:null};}
  else if(action==='review'&&problemReviews[id]){const confidence=Number(document.querySelector(`[data-review-confidence="${id}"]`)?.value||3),interval={1:1,2:3,3:7,4:14,5:30}[confidence],next=localDate(today);next.setDate(next.getDate()+interval);problemReviews[id]={...problemReviews[id],attempts:problemReviews[id].attempts+1,lastReviewed:today,nextReview:isoDate(next),confidence};}
  save();
}

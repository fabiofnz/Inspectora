(()=>{"use strict";
// Nur geteilte Website-Chrome: Mobil-Menü und Header-Scroll.
// (Das frühere Objektaufnahme-/Maßnahmenplaner-Tool wurde entfernt.)
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];

// Mobil-Menü öffnen/schließen
const menuToggle=$("#menuToggle"),siteNav=$("#siteNav");
if(menuToggle&&siteNav){
  menuToggle.addEventListener("click",()=>{
    const open=siteNav.classList.toggle("open");
    menuToggle.classList.toggle("active",open);
    menuToggle.setAttribute("aria-expanded",String(open));
    document.body.classList.toggle("menu-open",open);
  });
  $$("#siteNav a").forEach(a=>a.addEventListener("click",()=>{
    siteNav.classList.remove("open");
    menuToggle.classList.remove("active");
    document.body.classList.remove("menu-open");
  }));
}

// Header-Schatten beim Scrollen
function initHeaderScroll(){
  const header=document.querySelector(".site-header");
  if(!header)return;
  const update=()=>header.classList.toggle("scrolled",window.scrollY>24);
  update();
  window.addEventListener("scroll",update,{passive:true});
}
initHeaderScroll();
})();

(()=>{"use strict";
// Eigenständiges WEG-Versammlungsprotokoll-Tool. Vollständig unabhängig von den anderen Tools:
// eigener Storage, eigener State, eigene DOM-Referenzen, keine geteilten Funktionen oder IDs.
const WEG_STORAGE_KEY="inspectora_weg_protocols_v1",WEG_DRAFT_KEY="inspectora_weg_draft_v1";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const today=()=>new Date().toISOString().slice(0,10);
const fmt=v=>v?new Intl.DateTimeFormat("de-DE").format(new Date(v+"T12:00:00")):"Nicht angegeben";

const emptyWegTop=()=>({id:"",title:"",notes:"",motion:"",yes:0,no:0,abstain:0,resultMode:""});
const emptyWegProtocol=()=>({id:"",name:"",status:"Entwurf",date:today(),location:"",chair:"",ownersPresent:"",ownersRepresented:"",quorumStatus:"",quorumNote:"",tops:[],createdAt:"",updatedAt:"",draftText:""});

function wegTopId(){return`WTOP-${Date.now()}-${Math.random().toString(16).slice(2,7)}`}
function wegResult(top){return top.resultMode||((Number(top.yes)||0)>(Number(top.no)||0)?"Angenommen":"Abgelehnt")}

let wegProtocols=[];
try{
  wegProtocols=JSON.parse(localStorage.getItem(WEG_STORAGE_KEY)||"[]");
  if(!Array.isArray(wegProtocols))wegProtocols=[];
}catch{wegProtocols=[]}

const wegState={step:1,current:emptyWegProtocol(),protocols:wegProtocols,deleteTarget:null};

const wegRefs={
  toast:$("#toast"),
  name:$("#wegName"),date:$("#wegDate"),location:$("#wegLocation"),chair:$("#wegChair"),
  ownersPresent:$("#wegOwnersPresent"),ownersRepresented:$("#wegOwnersRepresented"),
  quorumStatus:$("#wegQuorumStatus"),quorumNote:$("#wegQuorumNote"),
  tool:$("#wegTool"),
  topTitle:$("#wegTopTitle"),topNotes:$("#wegTopNotes"),topMotion:$("#wegTopMotion"),
  topYes:$("#wegTopYes"),topNo:$("#wegTopNo"),topAbstain:$("#wegTopAbstain"),topResultMode:$("#wegTopResultMode"),
  editingTopId:$("#wegEditingTopId"),topForm:$("#wegTopForm"),resetTopButton:$("#resetWegTopButton"),
  topList:$("#wegTopList"),topCount:$("#wegTopCount"),
  reportName:$("#wegReportName"),reportMeta:$("#wegReportMeta"),reportId:$("#wegReportId"),
  reportPresent:$("#wegReportPresent"),reportRepresented:$("#wegReportRepresented"),
  reportTopTotal:$("#wegReportTopTotal"),reportRejectedTotal:$("#wegReportRejectedTotal"),
  reportDetails:$("#wegReportDetails"),reportTops:$("#wegReportTops"),
  search:$("#wegSearch"),statusFilter:$("#wegStatusFilter"),list:$("#wegList"),
  totalCount:$("#wegTotalCount"),draftCount:$("#wegDraftCount"),topsCount:$("#wegTopsCount"),rejectedCount:$("#wegRejectedCount"),
  draft:$("#wegProtocolDraft"),
  confirmModal:$("#wegConfirmModal"),confirmDeleteButton:$("#wegConfirmDeleteButton")
};

function wegToast(msg){if(!wegRefs.toast)return;wegRefs.toast.textContent=msg;wegRefs.toast.classList.add("show");clearTimeout(wegToast.t);wegToast.t=setTimeout(()=>wegRefs.toast.classList.remove("show"),2600)}

function wegPersist(){
  try{localStorage.setItem(WEG_STORAGE_KEY,JSON.stringify(wegState.protocols));return true}
  catch{wegToast("Speicher voll – bitte ältere Protokolle löschen und erneut speichern.");return false}
}
function wegSaveDraft(){wegSyncForm();try{localStorage.setItem(WEG_DRAFT_KEY,JSON.stringify(wegState.current))}catch{}}

function wegProtocolId(){
  const y=new Date().getFullYear();
  const nums=wegState.protocols.map(p=>Number(String(p.id).split("-").pop())).filter(Number.isFinite);
  return`WEG-${y}-${String((nums.length?Math.max(...nums):0)+1).padStart(3,"0")}`;
}

function wegGoTool(){wegRefs.tool?.scrollIntoView({behavior:"smooth",block:"start"})}

function wegSetStep(n){
  wegState.step=Number(n);
  $$('.weg-step').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===wegState.step));
  $$('.weg-panel').forEach(p=>p.classList.toggle('active',Number(p.dataset.panel)===wegState.step));
  if(wegState.step===3){wegSyncForm();wegRenderReport();if(wegRefs.draft&&!wegRefs.draft.value.trim()){wegRefs.draft.value=wegGenerateText();wegState.current.draftText=wegRefs.draft.value;}}
  wegSaveDraft();
}

function wegValidate(n){
  if(Number(n)===1){
    wegSyncForm();
    if(!wegState.current.name){wegToast("Bitte eine WEG-/Objektbezeichnung eintragen.");wegRefs.name.focus();return false}
    if(!wegState.current.date){wegToast("Bitte das Datum der Versammlung eintragen.");wegRefs.date.focus();return false}
    if(!wegState.current.chair){wegToast("Bitte den Versammlungsleiter eintragen.");wegRefs.chair.focus();return false}
  }
  return true;
}

function wegSyncForm(){
  Object.assign(wegState.current,{
    name:wegRefs.name.value.trim(),date:wegRefs.date.value,location:wegRefs.location.value.trim(),
    chair:wegRefs.chair.value.trim(),ownersPresent:wegRefs.ownersPresent.value,ownersRepresented:wegRefs.ownersRepresented.value,
    quorumStatus:wegRefs.quorumStatus.value,quorumNote:wegRefs.quorumNote.value.trim()
  });
  if(wegRefs.draft)wegState.current.draftText=wegRefs.draft.value;
}

function wegSyncState(){
  wegRefs.name.value=wegState.current.name||"";
  wegRefs.date.value=wegState.current.date||today();
  wegRefs.location.value=wegState.current.location||"";
  wegRefs.chair.value=wegState.current.chair||"";
  wegRefs.ownersPresent.value=wegState.current.ownersPresent||"";
  wegRefs.ownersRepresented.value=wegState.current.ownersRepresented||"";
  wegRefs.quorumStatus.value=wegState.current.quorumStatus||"";
  wegRefs.quorumNote.value=wegState.current.quorumNote||"";
  if(wegRefs.draft)wegRefs.draft.value=wegState.current.draftText||"";
  wegRenderTops();
  wegRenderReport();
}

function wegResetTopForm(){
  wegRefs.topForm.reset();
  wegRefs.editingTopId.value="";
}

function wegTopFromForm(){
  return{
    id:wegRefs.editingTopId.value||wegTopId(),
    title:wegRefs.topTitle.value.trim(),
    notes:wegRefs.topNotes.value.trim(),
    motion:wegRefs.topMotion.value.trim(),
    yes:Number(wegRefs.topYes.value)||0,
    no:Number(wegRefs.topNo.value)||0,
    abstain:Number(wegRefs.topAbstain.value)||0,
    resultMode:wegRefs.topResultMode.value
  };
}

function wegRenderTops(){
  const tops=wegState.current.tops;
  wegRefs.topCount.textContent=`${tops.length} ${tops.length===1?"TOP":"TOPs"}`;
  if(!tops.length){
    wegRefs.topList.innerHTML=`<div class="empty-state"><strong>Noch keine TOPs</strong><p>Erfasse links den ersten Tagesordnungspunkt.</p></div>`;
    return;
  }
  wegRefs.topList.innerHTML=tops.map((t,i)=>{
    const result=wegResult(t),cls=result==="Angenommen"?"low":"high";
    return`<article class="finding-card"><div class="finding-card-top"><div><span class="finding-area">TOP ${i+1}</span><h4>${esc(t.title)}</h4></div><span class="priority-label ${cls}">${esc(result)}</span></div>${t.motion?`<p><strong>Beschlussantrag:</strong> ${esc(t.motion)}</p>`:""}<div class="finding-meta"><span>Ja: ${t.yes}</span><span>Nein: ${t.no}</span><span>Enthaltungen: ${t.abstain}</span></div><div class="finding-card-actions"><button type="button" data-edit-top="${esc(t.id)}">Bearbeiten</button><button type="button" data-delete-top="${esc(t.id)}">Löschen</button></div></article>`;
  }).join("");
}

function wegEditTop(id){
  const t=wegState.current.tops.find(x=>x.id===id);
  if(!t)return;
  wegRefs.topTitle.value=t.title;
  wegRefs.topNotes.value=t.notes;
  wegRefs.topMotion.value=t.motion;
  wegRefs.topYes.value=t.yes;
  wegRefs.topNo.value=t.no;
  wegRefs.topAbstain.value=t.abstain;
  wegRefs.topResultMode.value=t.resultMode;
  wegRefs.editingTopId.value=t.id;
  wegRefs.topTitle.focus();
}

function wegDeleteTop(id){
  wegState.current.tops=wegState.current.tops.filter(t=>t.id!==id);
  wegRenderTops();
  wegRenderReport();
  wegSaveDraft();
  wegToast("TOP gelöscht.");
}

function wegRenderReport(){
  const p=wegState.current,tops=p.tops,rejected=tops.filter(t=>wegResult(t)==="Abgelehnt").length;
  wegRefs.reportName.textContent=p.name||"Neues Versammlungsprotokoll";
  wegRefs.reportMeta.textContent=[p.date?fmt(p.date):"",p.location].filter(Boolean).join(" · ")||"Noch keine Versammlungsdaten eingetragen";
  wegRefs.reportId.textContent=p.id||"Entwurf";
  wegRefs.reportPresent.textContent=p.ownersPresent||0;
  wegRefs.reportRepresented.textContent=p.ownersRepresented||0;
  wegRefs.reportTopTotal.textContent=tops.length;
  wegRefs.reportRejectedTotal.textContent=rejected;

  const details=[
    ["Versammlungsleiter",p.chair],
    ["Ort",p.location],
    ["Datum",p.date?fmt(p.date):""],
    ["Anwesende Eigentümer",p.ownersPresent],
    ["Vertretene Eigentümer",p.ownersRepresented],
    ["Beschlussfähigkeit",p.quorumStatus],
    ["Angaben zur Beschlussfähigkeit",p.quorumNote]
  ].filter(([,v])=>v);
  wegRefs.reportDetails.innerHTML=details.length
    ?details.map(([l,v])=>`<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join("")
    :`<div><dt>Hinweis</dt><dd>Noch keine Angaben vorhanden.</dd></div>`;

  wegRefs.reportTops.innerHTML=tops.length
    ?tops.map((t,i)=>{
      const result=wegResult(t);
      return`<article class="report-finding"><div class="report-finding-aside"><strong>TOP ${i+1}</strong><span>${esc(result)}</span></div><div class="report-finding-main"><h5>${esc(t.title)}</h5>${t.notes?`<p>${esc(t.notes)}</p>`:""}${t.motion?`<p><strong>Beschlussantrag:</strong> ${esc(t.motion)}</p>`:""}<dl><div><dt>Ja-Stimmen</dt><dd>${t.yes}</dd></div><div><dt>Nein-Stimmen</dt><dd>${t.no}</dd></div><div><dt>Enthaltungen</dt><dd>${t.abstain}</dd></div></dl></div></article>`;
    }).join("")
    :`<div class="empty-state compact"><strong>Noch keine TOPs</strong><p>Erfasste Tagesordnungspunkte erscheinen hier automatisch.</p></div>`;
}

function wegSaveCurrent(){
  wegSyncForm();
  if(!wegValidate(1))return false;
  const now=new Date().toISOString();
  if(!wegState.current.id){wegState.current.id=wegProtocolId();wegState.current.createdAt=now}
  wegState.current.updatedAt=now;
  const i=wegState.protocols.findIndex(p=>p.id===wegState.current.id),copy=JSON.parse(JSON.stringify(wegState.current));
  if(i>=0)wegState.protocols[i]=copy;else wegState.protocols.unshift(copy);
  if(!wegPersist())return false;
  localStorage.setItem(WEG_DRAFT_KEY,JSON.stringify(wegState.current));
  wegRenderList();
  wegRenderReport();
  wegToast(`Protokoll ${wegState.current.id} gespeichert.`);
  return true;
}

function wegNewProtocol(confirmReset=true){
  const has=wegState.current.name||wegState.current.tops.length;
  if(confirmReset&&has&&!window.confirm("Aktuellen Entwurf verwerfen und ein neues Protokoll beginnen?"))return;
  wegState.current=emptyWegProtocol();
  wegSyncState();
  wegResetTopForm();
  wegSetStep(1);
  localStorage.removeItem(WEG_DRAFT_KEY);
  wegGoTool();
  wegToast("Neues Protokoll gestartet.");
}

function wegOpenProtocol(id){
  const p=wegState.protocols.find(x=>x.id===id);
  if(!p)return;
  wegState.current=JSON.parse(JSON.stringify(p));
  wegSyncState();
  wegSetStep(1);
  localStorage.setItem(WEG_DRAFT_KEY,JSON.stringify(wegState.current));
  wegGoTool();
  wegToast(`${id} geöffnet.`);
}

function wegDuplicateProtocol(id){
  const p=wegState.protocols.find(x=>x.id===id);
  if(!p)return;
  const c=JSON.parse(JSON.stringify(p));
  c.id=wegProtocolId();
  c.name+=` – Kopie`;
  c.status="Entwurf";
  c.createdAt=c.updatedAt=new Date().toISOString();
  c.tops=c.tops.map(t=>({...t,id:wegTopId()}));
  wegState.protocols.unshift(c);
  wegPersist();
  wegRenderList();
  wegToast(`Protokoll als ${c.id} dupliziert.`);
}

function wegRequestDelete(id){
  wegState.deleteTarget=id;
  wegRefs.confirmModal.classList.add("open");
  wegRefs.confirmModal.setAttribute("aria-hidden","false");
  document.body.classList.add("modal-open");
}

function wegCloseModal(){
  wegState.deleteTarget=null;
  wegRefs.confirmModal.classList.remove("open");
  wegRefs.confirmModal.setAttribute("aria-hidden","true");
  document.body.classList.remove("modal-open");
}

function wegConfirmDelete(){
  if(!wegState.deleteTarget)return;
  wegState.protocols=wegState.protocols.filter(p=>p.id!==wegState.deleteTarget);
  if(wegState.current.id===wegState.deleteTarget){
    wegState.current=emptyWegProtocol();
    wegSyncState();
    localStorage.removeItem(WEG_DRAFT_KEY);
  }
  wegPersist();
  wegRenderList();
  wegCloseModal();
  wegToast("Protokoll gelöscht.");
}

function wegChangeStatus(id,status){
  const p=wegState.protocols.find(x=>x.id===id);
  if(!p)return;
  p.status=status;
  p.updatedAt=new Date().toISOString();
  if(wegState.current.id===id)wegState.current.status=status;
  wegPersist();
  wegRenderList();
  wegToast(`Status auf „${status}“ gesetzt.`);
}

function wegRenderList(){
  const q=wegRefs.search.value.trim().toLowerCase(),status=wegRefs.statusFilter.value;
  const filtered=wegState.protocols.filter(p=>[p.id,p.name,p.location,p.chair].join(" ").toLowerCase().includes(q)&&(status==="Alle"||p.status===status));
  const allTops=wegState.protocols.flatMap(p=>p.tops||[]);
  wegRefs.totalCount.textContent=wegState.protocols.length;
  wegRefs.draftCount.textContent=wegState.protocols.filter(p=>p.status==="Entwurf").length;
  wegRefs.topsCount.textContent=allTops.length;
  wegRefs.rejectedCount.textContent=allTops.filter(t=>wegResult(t)==="Abgelehnt").length;

  if(!filtered.length){
    wegRefs.list.innerHTML=`<div class="empty-state large"><strong>${wegState.protocols.length?"Keine passenden Protokolle gefunden":"Noch keine Protokolle gespeichert"}</strong><p>${wegState.protocols.length?"Passe Suche oder Filter an.":"Starte oben ein neues Versammlungsprotokoll."}</p>${wegState.protocols.length?"":`<button class="button primary" id="wegDynamicEmptyStartButton" type="button">Erstes Protokoll anlegen</button>`}</div>`;
    $("#wegDynamicEmptyStartButton")?.addEventListener("click",()=>wegNewProtocol(false));
    return;
  }

  wegRefs.list.innerHTML=filtered.map(p=>{
    const rejected=(p.tops||[]).filter(t=>wegResult(t)==="Abgelehnt").length;
    return`<article class="project-card"><div class="project-card-top"><div><span class="project-id">${esc(p.id)}</span><h3>${esc(p.name)}</h3><p>${esc([p.date?fmt(p.date):"",p.location].filter(Boolean).join(" · ")||"Keine weiteren Angaben")}</p></div><span class="status-badge">${esc(p.status)}</span></div><div class="project-card-meta"><div><span>TOPs</span><strong>${p.tops?.length||0}</strong></div><div><span>Abgelehnt</span><strong>${rejected}</strong></div><div><span>Anwesend</span><strong>${p.ownersPresent||0}</strong></div></div><div class="project-card-actions"><button type="button" data-open-weg="${esc(p.id)}">Öffnen</button><button type="button" data-duplicate-weg="${esc(p.id)}">Duplizieren</button><select data-status-weg="${esc(p.id)}" aria-label="Protokollstatus ändern">${["Entwurf","Abgeschlossen"].map(o=>`<option ${p.status===o?"selected":""}>${o}</option>`).join("")}</select><button type="button" data-delete-weg="${esc(p.id)}">Löschen</button></div></article>`;
  }).join("");
}

function wegGenerateText(){
  wegSyncForm();
  const p=wegState.current;
  const present=Number(p.ownersPresent)||0;
  const represented=Number(p.ownersRepresented)||0;
  const total=present+represented;
  const out=[];

  out.push("Protokoll der Eigentümerversammlung");
  out.push(p.name||"[WEG-Bezeichnung eintragen]");
  out.push("");

  let intro=`Die Eigentümerversammlung der ${p.name||"[WEG-Bezeichnung]"} fand am ${p.date?fmt(p.date):"[Datum]"}`;
  if(p.location)intro+=` in ${p.location}`;
  intro+=` statt. Den Vorsitz der Versammlung führte ${p.chair||"[Versammlungsleiter]"}.`;
  out.push(intro);
  out.push("");

  if(total>0){
    let s=`Es waren ${present} Eigentümer persönlich anwesend`;
    if(represented>0)s+=`, ${represented} ${represented===1?"war":"waren"} durch Vollmacht vertreten`;
    s+=`. Insgesamt nahmen damit ${total} Eigentümer an der Versammlung teil.`;
    out.push(s);
  } else {
    out.push("[Angaben zu anwesenden und vertretenen Eigentümern ergänzen]");
  }

  if(p.quorumStatus==="Beschlussfähig"){
    out.push(`Der Versammlungsleiter stellte die Beschlussfähigkeit der Versammlung fest.${p.quorumNote?" "+p.quorumNote:""}`);
  } else if(p.quorumStatus==="Nicht beschlussfähig"){
    out.push(`Der Versammlungsleiter stellte fest, dass die Versammlung nicht beschlussfähig ist.${p.quorumNote?" "+p.quorumNote:""}`);
  } else if(p.quorumStatus==="Teilweise beschlussfähig"){
    out.push(`Der Versammlungsleiter wies darauf hin, dass die Versammlung nur teilweise beschlussfähig ist.${p.quorumNote?" "+p.quorumNote:""}`);
  } else if(p.quorumNote){
    out.push(p.quorumNote);
  }
  out.push("");

  if(!p.tops.length){
    out.push("[Tagesordnungspunkte werden nach der Erfassung in Schritt 2 hier eingesetzt]");
    out.push("");
  } else {
    p.tops.forEach((t,i)=>{
      const result=wegResult(t);
      const yes=Number(t.yes)||0;
      const no=Number(t.no)||0;
      const abstain=Number(t.abstain)||0;
      const ja=yes===1?"1 Ja-Stimme":`${yes} Ja-Stimmen`;
      const nein=no===1?"1 Nein-Stimme":`${no} Nein-Stimmen`;
      const enth=abstain===1?"1 Enthaltung":`${abstain} Enthaltungen`;
      out.push(`TOP ${i+1}: ${t.title||"[Ohne Titel]"}`);
      out.push("");
      if(t.notes){
        out.push(`Im Rahmen der Erörterung wurden folgende Aspekte besprochen: ${t.notes}.`);
        out.push("");
      }
      if(t.motion){
        out.push("Beschlussantrag:");
        out.push(t.motion);
        out.push("");
      }
      if(result==="Angenommen"){
        out.push(`Der Beschluss wurde mit ${ja}, ${nein} und ${enth} angenommen.`);
      } else {
        out.push(`Der Antrag wurde mit ${nein} gegen ${ja} bei ${enth} abgelehnt.`);
      }
      out.push("");
    });
  }

  out.push("Da keine weiteren Tagesordnungspunkte vorlagen, schloss der Versammlungsleiter die Versammlung.");
  out.push("");
  out.push("");
  out.push("___________________________          ___________________________");
  out.push(`${p.chair||"[Versammlungsleiter]"}                   [Protokollführer]`);
  out.push("");
  out.push("─────────────────────────────────────────────────────────────────────────");
  out.push("Hinweis: Dieser Text ist ein automatisch erstellter Entwurf. Die fachliche und formale Verantwortung für Richtigkeit, Vollständigkeit und Form liegt beim Verwalter bzw. Versammlungsleiter.");
  return out.join("\n");
}

async function wegGenerateWithAI(){
  const button=$("#aiGenerateWegButton");
  if(!wegRefs.draft||!button)return;
  wegSyncForm();
  if(wegRefs.draft.value.trim()&&!window.confirm("Protokolltext mit KI neu formulieren? Manuelle Änderungen gehen dabei verloren."))return;

  const originalLabel=button.textContent;
  button.disabled=true;
  button.textContent="Wird formuliert…";

  try{
    const response=await fetch("/.netlify/functions/generate-protokoll",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(wegState.current)
    });
    let data=null;
    try{data=await response.json()}catch{}
    if(!response.ok||!data?.text){
      wegToast(data?.error||"KI-Formulierung fehlgeschlagen – bitte erneut versuchen oder Text manuell bearbeiten.");
      return;
    }
    wegRefs.draft.value=data.text;
    wegState.current.draftText=data.text;
    wegSaveDraft();
    wegToast("Protokolltext mit KI formuliert.");
  }catch{
    wegToast("KI-Formulierung fehlgeschlagen – bitte Internetverbindung prüfen und erneut versuchen.");
  }finally{
    button.disabled=false;
    button.textContent=originalLabel;
  }
}

function wegProtocolText(){
  wegSyncForm();
  const p=wegState.current;
  const lines=[
    `Protokoll der Eigentümerversammlung`,
    `${p.name||"WEG"} (${p.id||"Entwurf"})`,
    `Datum: ${p.date?fmt(p.date):"Nicht angegeben"}    Ort: ${p.location||"Nicht angegeben"}`,
    `Versammlungsleiter: ${p.chair||"Nicht angegeben"}`,
    `Anwesende Eigentümer: ${p.ownersPresent||0}    Vertretene Eigentümer: ${p.ownersRepresented||0}`,
    `Beschlussfähigkeit: ${p.quorumStatus||"Nicht angegeben"}${p.quorumNote?` – ${p.quorumNote}`:""}`,
    ""
  ];
  p.tops.forEach((t,i)=>{
    lines.push(`TOP ${i+1}: ${t.title}`);
    if(t.notes)lines.push(`  Diskussion: ${t.notes}`);
    if(t.motion)lines.push(`  Beschlussantrag: ${t.motion}`);
    lines.push(`  Abstimmung – Ja: ${t.yes}, Nein: ${t.no}, Enthaltungen: ${t.abstain} – Ergebnis: ${wegResult(t)}`);
    lines.push("");
  });
  lines.push("Hinweis: Dieses Protokoll ist ein automatisch erstellter Entwurf. Die fachliche und formale Verantwortung für Richtigkeit, Vollständigkeit und Form liegt beim Verwalter bzw. Versammlungsleiter.");
  return lines.join("\n");
}

function wegCopyText(){
  const text=wegRefs.draft&&wegRefs.draft.value.trim()?wegRefs.draft.value:wegGenerateText();
  navigator.clipboard.writeText(text)
    .then(()=>wegToast("Protokolltext kopiert."))
    .catch(()=>wegToast("Kopieren wurde vom Browser nicht erlaubt."));
}

function wegGeneratePdf(){
  if(typeof window.jspdf==="undefined"){
    wegToast("PDF-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen.");
    return;
  }
  wegSyncForm();
  const p=wegState.current;
  const draftText=(wegRefs.draft&&wegRefs.draft.value.trim())?wegRefs.draft.value:wegGenerateText();
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"mm",format:"a4"});
  const pageW=doc.internal.pageSize.getWidth();
  const pageH=doc.internal.pageSize.getHeight();
  const marginX=16,contentW=pageW-marginX*2,headerH=24,footerH=16;
  let pageNum=1,cursorY=0;

  function drawHeader(){
    doc.setFillColor(36,87,214);
    doc.roundedRect(marginX,8,9,9,2,2,"F");
    doc.setTextColor(255,255,255);
    doc.setFont("helvetica","bold");
    doc.setFontSize(11);
    doc.text("I",marginX+4.5,14.3,{align:"center"});
    doc.setTextColor(16,32,57);
    doc.setFontSize(13);
    doc.text("Inspectora",marginX+13,13.5);
    doc.setFont("helvetica","normal");
    doc.setFontSize(8);
    doc.setTextColor(100,110,130);
    doc.text(p.name||"Versammlungsprotokoll",marginX+13,18);
    doc.text(`Protokoll-ID: ${p.id||"Entwurf"}`,pageW-marginX,11,{align:"right"});
    doc.text(`Seite ${pageNum}`,pageW-marginX,16,{align:"right"});
    doc.setDrawColor(220,228,238);
    doc.line(marginX,headerH,pageW-marginX,headerH);
  }

  function drawFooter(){
    doc.setDrawColor(220,228,238);
    doc.line(marginX,pageH-footerH,pageW-marginX,pageH-footerH);
    doc.setFont("helvetica","normal");
    doc.setFontSize(7);
    doc.setTextColor(140,150,165);
    const lines=doc.splitTextToSize("ENTWURF – Die fachliche und formale Verantwortung für Richtigkeit, Vollständigkeit und Form liegt beim Verwalter bzw. Versammlungsleiter.",contentW);
    lines.forEach((line,i)=>doc.text(line,marginX,pageH-11+i*3.4));
  }

  function newPage(){
    drawFooter();
    doc.addPage();
    pageNum++;
    drawHeader();
    cursorY=headerH+8;
  }

  function ensureSpace(h){
    if(cursorY+h>pageH-footerH-4)newPage();
  }

  drawHeader();
  cursorY=headerH+10;

  const rawLines=draftText.split("\n");
  const lineH=4.6;
  let firstNonEmpty=true;

  rawLines.forEach(rawLine=>{
    const trimmed=rawLine.trimEnd();
    if(!trimmed){cursorY+=2.5;return;}

    if(/^Hinweis:/.test(trimmed)||/^─{3,}/.test(trimmed)){
      ensureSpace(lineH+1);
      doc.setFont("helvetica","italic");
      doc.setFontSize(7.5);
      doc.setTextColor(130,140,155);
      const segs=doc.splitTextToSize(trimmed,contentW);
      segs.forEach((l,li)=>doc.text(l,marginX,cursorY+li*lineH));
      cursorY+=segs.length*lineH+1;
      return;
    }

    if(/^_{3,}/.test(trimmed)){
      ensureSpace(lineH+2);
      doc.setFont("helvetica","normal");
      doc.setFontSize(8.5);
      doc.setTextColor(90,100,115);
      doc.text(trimmed,marginX,cursorY);
      cursorY+=lineH+2;
      return;
    }

    if(firstNonEmpty){
      firstNonEmpty=false;
      ensureSpace(12);
      doc.setFont("helvetica","bold");
      doc.setFontSize(15);
      doc.setTextColor(16,32,57);
      const segs=doc.splitTextToSize(trimmed,contentW);
      segs.forEach((l,li)=>doc.text(l,marginX,cursorY+li*6.4));
      cursorY+=segs.length*6.4+3;
      return;
    }

    if(/^TOP \d+:/i.test(trimmed)){
      ensureSpace(16);
      cursorY+=3;
      doc.setDrawColor(215,225,238);
      doc.line(marginX,cursorY-2,marginX+contentW,cursorY-2);
      doc.setFont("helvetica","bold");
      doc.setFontSize(10.5);
      doc.setTextColor(16,32,57);
      const segs=doc.splitTextToSize(trimmed,contentW);
      segs.forEach((l,li)=>doc.text(l,marginX,cursorY+li*5));
      cursorY+=segs.length*5+2;
      return;
    }

    if(/^Beschlussantrag:/.test(trimmed)){
      ensureSpace(lineH+1);
      doc.setFont("helvetica","bold");
      doc.setFontSize(9);
      doc.setTextColor(40,50,70);
      doc.text("Beschlussantrag:",marginX,cursorY);
      cursorY+=lineH+0.5;
      return;
    }

    ensureSpace(lineH+1);
    doc.setFont("helvetica","normal");
    doc.setFontSize(9);
    doc.setTextColor(35,45,62);
    const segs=doc.splitTextToSize(trimmed,contentW);
    segs.forEach((l,li)=>doc.text(l,marginX,cursorY+li*lineH));
    cursorY+=segs.length*lineH+0.6;
  });

  drawFooter();
  doc.save(`Inspectora-WEG-${p.id||"Entwurf"}-${today()}.pdf`);
  wegToast("PDF wurde erstellt.");
}

function wegBind(){
  $$('.weg-step').forEach(b=>b.addEventListener("click",()=>wegSetStep(b.dataset.step)));
  $$('.weg-next').forEach(b=>b.addEventListener("click",()=>{if(wegValidate(wegState.step))wegSetStep(b.dataset.next)}));
  $$('.weg-prev').forEach(b=>b.addEventListener("click",()=>wegSetStep(b.dataset.previous)));

  $("#newWegButton")?.addEventListener("click",()=>wegNewProtocol(true));
  $("#saveWegButton")?.addEventListener("click",wegSaveCurrent);
  $("#finishAndSaveWegButton")?.addEventListener("click",()=>{if(wegSaveCurrent())$("#wegProjekte")?.scrollIntoView({behavior:"smooth"})});

  wegRefs.topForm.addEventListener("submit",e=>{
    e.preventDefault();
    const t=wegTopFromForm();
    if(!t.title){wegToast("Bitte einen Titel für den TOP eintragen.");return}
    const i=wegState.current.tops.findIndex(x=>x.id===t.id);
    if(i>=0){wegState.current.tops[i]=t;wegToast("TOP aktualisiert.")}
    else{wegState.current.tops.push(t);wegToast("TOP übernommen.")}
    wegResetTopForm();
    wegRenderTops();
    wegRenderReport();
    wegSaveDraft();
  });
  wegRefs.resetTopButton.addEventListener("click",wegResetTopForm);
  wegRefs.topList.addEventListener("click",e=>{
    const ed=e.target.closest("[data-edit-top]"),de=e.target.closest("[data-delete-top]");
    if(ed)wegEditTop(ed.dataset.editTop);
    if(de)wegDeleteTop(de.dataset.deleteTop);
  });

  $("#printWegButton")?.addEventListener("click",wegGeneratePdf);
  $("#copyWegButton")?.addEventListener("click",wegCopyText);
  $("#regenerateWegButton")?.addEventListener("click",()=>{
    if(!wegRefs.draft)return;
    if(wegRefs.draft.value.trim()&&!window.confirm("Protokolltext neu generieren? Manuelle Änderungen gehen dabei verloren."))return;
    wegRefs.draft.value=wegGenerateText();
    wegState.current.draftText=wegRefs.draft.value;
    wegSaveDraft();
  });
  $("#aiGenerateWegButton")?.addEventListener("click",wegGenerateWithAI);
  if(wegRefs.draft){
    wegRefs.draft.addEventListener("input",()=>{
      wegState.current.draftText=wegRefs.draft.value;
      wegSaveDraft();
    });
  }

  wegRefs.search.addEventListener("input",wegRenderList);
  wegRefs.statusFilter.addEventListener("change",wegRenderList);
  wegRefs.list.addEventListener("click",e=>{
    const o=e.target.closest("[data-open-weg]"),u=e.target.closest("[data-duplicate-weg]"),d=e.target.closest("[data-delete-weg]");
    if(o)wegOpenProtocol(o.dataset.openWeg);
    if(u)wegDuplicateProtocol(u.dataset.duplicateWeg);
    if(d)wegRequestDelete(d.dataset.deleteWeg);
  });
  wegRefs.list.addEventListener("change",e=>{
    const s=e.target.closest("[data-status-weg]");
    if(s)wegChangeStatus(s.dataset.statusWeg,s.value);
  });
  $("#wegEmptyStartButton")?.addEventListener("click",()=>wegNewProtocol(false));

  $$('[data-close-weg-modal]').forEach(x=>x.addEventListener("click",wegCloseModal));
  wegRefs.confirmDeleteButton.addEventListener("click",wegConfirmDelete);

  [wegRefs.name,wegRefs.date,wegRefs.location,wegRefs.chair,wegRefs.ownersPresent,wegRefs.ownersRepresented,wegRefs.quorumStatus,wegRefs.quorumNote].forEach(el=>{
    el.addEventListener("input",wegSaveDraft);
    el.addEventListener("change",wegSaveDraft);
  });
}

function wegInit(){
  if(!wegRefs.tool)return;
  wegBind();
  try{
    const d=JSON.parse(localStorage.getItem(WEG_DRAFT_KEY)||"null");
    if(d&&typeof d==="object"){
      wegState.current={...emptyWegProtocol(),...d};
      localStorage.setItem(WEG_DRAFT_KEY,JSON.stringify(wegState.current));
    }
  }catch{}
  wegSyncState();
  wegRenderList();
  wegSetStep(1);
}
wegInit();
})();


/* ── Eigenständiger WEG-Einladungs-Generator ─────────────────── */
// Vollständig unabhängig von den anderen Tools: eigener Storage, eigener State,
// eigene DOM-Referenzen, keine geteilten Funktionen oder IDs.
(()=>{"use strict";
const INV_STORAGE_KEY="inspectora_invitations_v1",INV_DRAFT_KEY="inspectora_invitation_draft_v1";
const LADUNGSFRIST_MIN_DAYS=21;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const today=()=>new Date().toISOString().slice(0,10);
const fmt=v=>v?new Intl.DateTimeFormat("de-DE").format(new Date(v+"T12:00:00")):"Nicht angegeben";

const emptyInvTop=()=>({id:"",title:"",notes:""});
const emptyInvitation=()=>({id:"",name:"",status:"Entwurf",type:"Ordentliche Eigentümerversammlung",date:"",time:"",location:"",host:"",sendDate:today(),tops:[],createdAt:"",updatedAt:"",draftText:""});

function invTopId(){return`ITOP-${Date.now()}-${Math.random().toString(16).slice(2,7)}`}

function invFristInfo(sendDate,meetingDate){
  if(!meetingDate)return{days:null,level:"unknown"};
  const send=sendDate||today();
  const days=Math.round((new Date(meetingDate+"T00:00:00")-new Date(send+"T00:00:00"))/86400000);
  if(!Number.isFinite(days))return{days:null,level:"unknown"};
  if(days<0)return{days,level:"bad"};
  if(days<LADUNGSFRIST_MIN_DAYS)return{days,level:"warn"};
  return{days,level:"ok"};
}

let invitations=[];
try{
  invitations=JSON.parse(localStorage.getItem(INV_STORAGE_KEY)||"[]");
  if(!Array.isArray(invitations))invitations=[];
}catch{invitations=[]}

const invState={step:1,current:emptyInvitation(),invitations,deleteTarget:null};

const invRefs={
  toast:$("#toast"),
  name:$("#invName"),type:$("#invType"),host:$("#invHost"),date:$("#invDate"),time:$("#invTime"),
  location:$("#invLocation"),sendDate:$("#invSendDate"),
  fristBox:$("#invFristCheck"),fristTitle:$("#invFristTitle"),fristText:$("#invFristText"),
  tool:$("#invTool"),
  topTitle:$("#invTopTitle"),topNotes:$("#invTopNotes"),
  editingTopId:$("#invEditingTopId"),topForm:$("#invTopForm"),resetTopButton:$("#resetInvTopButton"),
  topList:$("#invTopList"),topCount:$("#invTopCount"),
  reportName:$("#invReportName"),reportMeta:$("#invReportMeta"),reportId:$("#invReportId"),
  reportTopTotal:$("#invReportTopTotal"),reportDays:$("#invReportDays"),
  reportFristStatus:$("#invReportFristStatus"),reportType:$("#invReportType"),
  reportDetails:$("#invReportDetails"),reportTops:$("#invReportTops"),
  search:$("#invSearch"),statusFilter:$("#invStatusFilter"),list:$("#invList"),
  totalCount:$("#invTotalCount"),draftCount:$("#invDraftCount"),topsCount:$("#invTopsCount"),fristWarnCount:$("#invFristWarnCount"),
  draft:$("#invDraft"),
  confirmModal:$("#invConfirmModal"),confirmDeleteButton:$("#invConfirmDeleteButton")
};

function invToast(msg){if(!invRefs.toast)return;invRefs.toast.textContent=msg;invRefs.toast.classList.add("show");clearTimeout(invToast.t);invToast.t=setTimeout(()=>invRefs.toast.classList.remove("show"),2600)}

function invPersist(){
  try{localStorage.setItem(INV_STORAGE_KEY,JSON.stringify(invState.invitations));return true}
  catch{invToast("Speicher voll – bitte ältere Einladungen löschen und erneut speichern.");return false}
}
function invSaveDraft(){invSyncForm();try{localStorage.setItem(INV_DRAFT_KEY,JSON.stringify(invState.current))}catch{}}

function invInvitationId(){
  const y=new Date().getFullYear();
  const nums=invState.invitations.map(p=>Number(String(p.id).split("-").pop())).filter(Number.isFinite);
  return`INV-${y}-${String((nums.length?Math.max(...nums):0)+1).padStart(3,"0")}`;
}

function invGoTool(){invRefs.tool?.scrollIntoView({behavior:"smooth",block:"start"})}

function invSetStep(n){
  invState.step=Number(n);
  $$('.inv-step').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===invState.step));
  $$('.inv-panel').forEach(p=>p.classList.toggle('active',Number(p.dataset.panel)===invState.step));
  if(invState.step===3){invSyncForm();invRenderReport();if(invRefs.draft&&!invRefs.draft.value.trim()){invRefs.draft.value=invGenerateText();invState.current.draftText=invRefs.draft.value;}}
  invSaveDraft();
}

function invValidate(n){
  if(Number(n)===1){
    invSyncForm();
    if(!invState.current.name){invToast("Bitte eine WEG-/Objektbezeichnung eintragen.");invRefs.name.focus();return false}
    if(!invState.current.date){invToast("Bitte das Datum der Versammlung eintragen.");invRefs.date.focus();return false}
    if(!invState.current.host){invToast("Bitte den Verwalter/Einladenden eintragen.");invRefs.host.focus();return false}
  }
  return true;
}

function invSyncForm(){
  Object.assign(invState.current,{
    name:invRefs.name.value.trim(),type:invRefs.type.value,host:invRefs.host.value.trim(),
    date:invRefs.date.value,time:invRefs.time.value,location:invRefs.location.value.trim(),
    sendDate:invRefs.sendDate.value
  });
  if(invRefs.draft)invState.current.draftText=invRefs.draft.value;
  invRenderFristCheck();
}

function invSyncState(){
  invRefs.name.value=invState.current.name||"";
  invRefs.type.value=invState.current.type||"Ordentliche Eigentümerversammlung";
  invRefs.host.value=invState.current.host||"";
  invRefs.date.value=invState.current.date||"";
  invRefs.time.value=invState.current.time||"";
  invRefs.location.value=invState.current.location||"";
  invRefs.sendDate.value=invState.current.sendDate||today();
  if(invRefs.draft)invRefs.draft.value=invState.current.draftText||"";
  invRenderFristCheck();
  invRenderTops();
  invRenderReport();
}

function invRenderFristCheck(){
  const{date,sendDate}=invState.current;
  const info=invFristInfo(sendDate,date);
  invRefs.fristBox.classList.remove("inv-frist-ok","inv-frist-warn","inv-frist-bad");
  if(info.level==="unknown"){
    invRefs.fristTitle.textContent="Ladungsfrist-Hinweis";
    invRefs.fristText.textContent="Bitte Versammlungsdatum eingeben, um die Ladungsfrist zu prüfen.";
    return;
  }
  if(info.level==="bad"){
    invRefs.fristBox.classList.add("inv-frist-bad");
    invRefs.fristTitle.textContent="Datum prüfen";
    invRefs.fristText.textContent="Das Versammlungsdatum liegt vor dem geplanten Versanddatum – bitte Angaben prüfen.";
    return;
  }
  if(info.level==="warn"){
    invRefs.fristBox.classList.add("inv-frist-warn");
    invRefs.fristTitle.textContent="Ladungsfrist knapp oder unterschritten";
    invRefs.fristText.textContent=`Nur ${info.days} ${info.days===1?"Tag":"Tage"} zwischen geplantem Versand und Versammlung – die häufig übliche gesetzliche Mindestfrist von drei Wochen (21 Tagen) wird voraussichtlich unterschritten.`;
    return;
  }
  invRefs.fristBox.classList.add("inv-frist-ok");
  invRefs.fristTitle.textContent="Ladungsfrist eingehalten";
  invRefs.fristText.textContent=`${info.days} Tage zwischen geplantem Versand und Versammlung (empfohlene Mindestfrist: 21 Tage / drei Wochen).`;
}

function invResetTopForm(){
  invRefs.topForm.reset();
  invRefs.editingTopId.value="";
}

function invTopFromForm(){
  return{
    id:invRefs.editingTopId.value||invTopId(),
    title:invRefs.topTitle.value.trim(),
    notes:invRefs.topNotes.value.trim()
  };
}

function invRenderTops(){
  const tops=invState.current.tops;
  invRefs.topCount.textContent=`${tops.length} ${tops.length===1?"TOP":"TOPs"}`;
  if(!tops.length){
    invRefs.topList.innerHTML=`<div class="empty-state"><strong>Noch keine TOPs</strong><p>Erfasse links den ersten Tagesordnungspunkt.</p></div>`;
    return;
  }
  invRefs.topList.innerHTML=tops.map((t,i)=>
    `<article class="finding-card"><div class="finding-card-top"><div><span class="finding-area">TOP ${i+1}</span><h4>${esc(t.title)}</h4></div></div>${t.notes?`<p>${esc(t.notes)}</p>`:""}<div class="finding-card-actions"><button type="button" data-edit-top="${esc(t.id)}">Bearbeiten</button><button type="button" data-delete-top="${esc(t.id)}">Löschen</button></div></article>`
  ).join("");
}

function invEditTop(id){
  const t=invState.current.tops.find(x=>x.id===id);
  if(!t)return;
  invRefs.topTitle.value=t.title;
  invRefs.topNotes.value=t.notes;
  invRefs.editingTopId.value=t.id;
  invRefs.topTitle.focus();
}

function invDeleteTop(id){
  invState.current.tops=invState.current.tops.filter(t=>t.id!==id);
  invRenderTops();
  invRenderReport();
  invSaveDraft();
  invToast("TOP gelöscht.");
}

function invRenderReport(){
  const p=invState.current,tops=p.tops;
  const info=invFristInfo(p.sendDate,p.date);
  invRefs.reportName.textContent=p.name||"Neue Einladung";
  invRefs.reportMeta.textContent=[p.date?fmt(p.date):"",p.time,p.location].filter(Boolean).join(" · ")||"Noch keine Versammlungsdaten eingetragen";
  invRefs.reportId.textContent=p.id||"Entwurf";
  invRefs.reportTopTotal.textContent=tops.length;
  invRefs.reportDays.textContent=info.days===null?"–":info.days;
  invRefs.reportFristStatus.textContent=info.level==="ok"?"Eingehalten":info.level==="warn"?"Knapp/unterschritten":info.level==="bad"?"Datum prüfen":"Unbekannt";
  invRefs.reportType.textContent=/außerordentlich/i.test(p.type||"")?"Außerordentlich":"Ordentlich";

  const details=[
    ["Verwalter / Einladender",p.host],
    ["Art der Versammlung",p.type],
    ["Datum",p.date?fmt(p.date):""],
    ["Uhrzeit",p.time],
    ["Ort",p.location],
    ["Geplantes Versanddatum",p.sendDate?fmt(p.sendDate):""],
    ["Ladungsfrist-Hinweis",invRefs.fristText.textContent]
  ].filter(([,v])=>v);
  invRefs.reportDetails.innerHTML=details.length
    ?details.map(([l,v])=>`<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join("")
    :`<div><dt>Hinweis</dt><dd>Noch keine Angaben vorhanden.</dd></div>`;

  invRefs.reportTops.innerHTML=tops.length
    ?tops.map((t,i)=>`<article class="report-finding"><div class="report-finding-aside"><strong>TOP ${i+1}</strong></div><div class="report-finding-main"><h5>${esc(t.title)}</h5>${t.notes?`<p>${esc(t.notes)}</p>`:""}</div></article>`).join("")
    :`<div class="empty-state compact"><strong>Noch keine TOPs</strong><p>Erfasste Tagesordnungspunkte erscheinen hier automatisch.</p></div>`;
}

function invSaveCurrent(){
  invSyncForm();
  if(!invValidate(1))return false;
  const now=new Date().toISOString();
  if(!invState.current.id){invState.current.id=invInvitationId();invState.current.createdAt=now}
  invState.current.updatedAt=now;
  const i=invState.invitations.findIndex(p=>p.id===invState.current.id),copy=JSON.parse(JSON.stringify(invState.current));
  if(i>=0)invState.invitations[i]=copy;else invState.invitations.unshift(copy);
  if(!invPersist())return false;
  localStorage.setItem(INV_DRAFT_KEY,JSON.stringify(invState.current));
  invRenderList();
  invRenderReport();
  invToast(`Einladung ${invState.current.id} gespeichert.`);
  return true;
}

function invNewInvitation(confirmReset=true){
  const has=invState.current.name||invState.current.tops.length;
  if(confirmReset&&has&&!window.confirm("Aktuellen Entwurf verwerfen und eine neue Einladung beginnen?"))return;
  invState.current=emptyInvitation();
  invSyncState();
  invResetTopForm();
  invSetStep(1);
  localStorage.removeItem(INV_DRAFT_KEY);
  invGoTool();
  invToast("Neue Einladung gestartet.");
}

function invOpenInvitation(id){
  const p=invState.invitations.find(x=>x.id===id);
  if(!p)return;
  invState.current=JSON.parse(JSON.stringify(p));
  invSyncState();
  invSetStep(1);
  localStorage.setItem(INV_DRAFT_KEY,JSON.stringify(invState.current));
  invGoTool();
  invToast(`${id} geöffnet.`);
}

function invDuplicateInvitation(id){
  const p=invState.invitations.find(x=>x.id===id);
  if(!p)return;
  const c=JSON.parse(JSON.stringify(p));
  c.id=invInvitationId();
  c.name+=` – Kopie`;
  c.status="Entwurf";
  c.createdAt=c.updatedAt=new Date().toISOString();
  c.tops=c.tops.map(t=>({...t,id:invTopId()}));
  invState.invitations.unshift(c);
  invPersist();
  invRenderList();
  invToast(`Einladung als ${c.id} dupliziert.`);
}

function invRequestDelete(id){
  invState.deleteTarget=id;
  invRefs.confirmModal.classList.add("open");
  invRefs.confirmModal.setAttribute("aria-hidden","false");
  document.body.classList.add("modal-open");
}

function invCloseModal(){
  invState.deleteTarget=null;
  invRefs.confirmModal.classList.remove("open");
  invRefs.confirmModal.setAttribute("aria-hidden","true");
  document.body.classList.remove("modal-open");
}

function invConfirmDelete(){
  if(!invState.deleteTarget)return;
  invState.invitations=invState.invitations.filter(p=>p.id!==invState.deleteTarget);
  if(invState.current.id===invState.deleteTarget){
    invState.current=emptyInvitation();
    invSyncState();
    localStorage.removeItem(INV_DRAFT_KEY);
  }
  invPersist();
  invRenderList();
  invCloseModal();
  invToast("Einladung gelöscht.");
}

function invChangeStatus(id,status){
  const p=invState.invitations.find(x=>x.id===id);
  if(!p)return;
  p.status=status;
  p.updatedAt=new Date().toISOString();
  if(invState.current.id===id)invState.current.status=status;
  invPersist();
  invRenderList();
  invToast(`Status auf „${status}“ gesetzt.`);
}

function invRenderList(){
  const q=invRefs.search.value.trim().toLowerCase(),status=invRefs.statusFilter.value;
  const filtered=invState.invitations.filter(p=>[p.id,p.name,p.location,p.host].join(" ").toLowerCase().includes(q)&&(status==="Alle"||p.status===status));
  const allTops=invState.invitations.flatMap(p=>p.tops||[]);
  const warnCount=invState.invitations.filter(p=>{const lvl=invFristInfo(p.sendDate,p.date).level;return lvl==="warn"||lvl==="bad"}).length;
  invRefs.totalCount.textContent=invState.invitations.length;
  invRefs.draftCount.textContent=invState.invitations.filter(p=>p.status==="Entwurf").length;
  invRefs.topsCount.textContent=allTops.length;
  invRefs.fristWarnCount.textContent=warnCount;

  if(!filtered.length){
    invRefs.list.innerHTML=`<div class="empty-state large"><strong>${invState.invitations.length?"Keine passenden Einladungen gefunden":"Noch keine Einladungen gespeichert"}</strong><p>${invState.invitations.length?"Passe Suche oder Filter an.":"Starte oben eine neue Versammlungseinladung."}</p>${invState.invitations.length?"":`<button class="button primary" id="invDynamicEmptyStartButton" type="button">Erste Einladung anlegen</button>`}</div>`;
    $("#invDynamicEmptyStartButton")?.addEventListener("click",()=>invNewInvitation(false));
    return;
  }

  invRefs.list.innerHTML=filtered.map(p=>{
    const info=invFristInfo(p.sendDate,p.date);
    const fristLabel=info.level==="ok"?"Frist ok":info.level==="warn"?"Frist knapp":info.level==="bad"?"Datum prüfen":"Frist unbekannt";
    return`<article class="project-card"><div class="project-card-top"><div><span class="project-id">${esc(p.id)}</span><h3>${esc(p.name)}</h3><p>${esc([p.date?fmt(p.date):"",p.location].filter(Boolean).join(" · ")||"Keine weiteren Angaben")}</p></div><span class="status-badge">${esc(p.status)}</span></div><div class="project-card-meta"><div><span>TOPs</span><strong>${p.tops?.length||0}</strong></div><div><span>Tage bis Termin</span><strong>${info.days===null?"–":info.days}</strong></div><div><span>${esc(fristLabel)}</span><strong>&nbsp;</strong></div></div><div class="project-card-actions"><button type="button" data-open-inv="${esc(p.id)}">Öffnen</button><button type="button" data-duplicate-inv="${esc(p.id)}">Duplizieren</button><select data-status-inv="${esc(p.id)}" aria-label="Einladungsstatus ändern">${["Entwurf","Versendet","Abgeschlossen"].map(o=>`<option ${p.status===o?"selected":""}>${o}</option>`).join("")}</select><button type="button" data-delete-inv="${esc(p.id)}">Löschen</button></div></article>`;
  }).join("");
}

function invGenerateText(){
  invSyncForm();
  const p=invState.current;
  const info=invFristInfo(p.sendDate,p.date);
  const isAusserordentlich=/außerordentlich/i.test(p.type||"");
  const out=[];

  out.push(`Einladung zur ${isAusserordentlich?"außerordentlichen":"ordentlichen"} Eigentümerversammlung`);
  out.push(p.name||"[WEG-Bezeichnung eintragen]");
  out.push("");
  out.push("Sehr geehrte Damen und Herren,");
  out.push("");

  let intro=`hiermit laden wir Sie herzlich zur ${isAusserordentlich?"außerordentlichen":"ordentlichen"} Eigentümerversammlung der ${p.name||"[WEG-Bezeichnung]"} ein.`;
  out.push(intro);
  out.push("");

  let details=`Termin: ${p.date?fmt(p.date):"[Datum]"}${p.time?`, ${p.time} Uhr`:""}`;
  out.push(details);
  out.push(`Ort: ${p.location||"[Ort eintragen]"}`);
  out.push("");

  if(!p.tops.length){
    out.push("Tagesordnung:");
    out.push("[Tagesordnungspunkte werden nach der Erfassung in Schritt 2 hier eingesetzt]");
    out.push("");
  } else {
    out.push("Tagesordnung:");
    out.push("");
    p.tops.forEach((t,i)=>{
      out.push(`TOP ${i+1}: ${t.title||"[Ohne Titel]"}`);
      if(t.notes)out.push(t.notes);
      out.push("");
    });
  }

  out.push("Vertretung und Vollmacht: Falls Sie an der Versammlung nicht persönlich teilnehmen können, können Sie sich durch eine bevollmächtigte Person vertreten lassen. Wir empfehlen, hierfür eine schriftliche Vollmacht mitzugeben bzw. vorab einzureichen.");
  out.push("");

  if(info.level==="warn"||info.level==="bad"){
    out.push(`Hinweis zur Ladungsfrist: ${invRefs.fristText.textContent}`);
    out.push("");
  }

  out.push("Mit freundlichen Grüßen");
  out.push("");
  out.push(p.host||"[Verwalter/Einladender]");
  out.push("");
  out.push("─────────────────────────────────────────────────────────────────────────");
  out.push("Hinweis: Automatisch erstellter Entwurf, unverbindlich und ohne Gewähr. Rechtliche Verantwortung liegt beim Verwalter/Einladenden.");
  return out.join("\n");
}

function invCopyText(){
  const text=invRefs.draft&&invRefs.draft.value.trim()?invRefs.draft.value:invGenerateText();
  navigator.clipboard.writeText(text)
    .then(()=>invToast("Einladungstext kopiert."))
    .catch(()=>invToast("Kopieren wurde vom Browser nicht erlaubt."));
}

function invGeneratePdf(){
  if(typeof window.jspdf==="undefined"){
    invToast("PDF-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen.");
    return;
  }
  invSyncForm();
  const p=invState.current;
  const draftText=(invRefs.draft&&invRefs.draft.value.trim())?invRefs.draft.value:invGenerateText();
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"mm",format:"a4"});
  const pageW=doc.internal.pageSize.getWidth();
  const pageH=doc.internal.pageSize.getHeight();
  const marginX=16,contentW=pageW-marginX*2,headerH=24,footerH=16;
  let pageNum=1,cursorY=0;

  function drawHeader(){
    doc.setFillColor(36,87,214);
    doc.roundedRect(marginX,8,9,9,2,2,"F");
    doc.setTextColor(255,255,255);
    doc.setFont("helvetica","bold");
    doc.setFontSize(11);
    doc.text("I",marginX+4.5,14.3,{align:"center"});
    doc.setTextColor(16,32,57);
    doc.setFontSize(13);
    doc.text("Inspectora",marginX+13,13.5);
    doc.setFont("helvetica","normal");
    doc.setFontSize(8);
    doc.setTextColor(100,110,130);
    doc.text(p.name||"Versammlungseinladung",marginX+13,18);
    doc.text(`Einladungs-ID: ${p.id||"Entwurf"}`,pageW-marginX,11,{align:"right"});
    doc.text(`Seite ${pageNum}`,pageW-marginX,16,{align:"right"});
    doc.setDrawColor(220,228,238);
    doc.line(marginX,headerH,pageW-marginX,headerH);
  }

  function drawFooter(){
    doc.setDrawColor(220,228,238);
    doc.line(marginX,pageH-footerH,pageW-marginX,pageH-footerH);
    doc.setFont("helvetica","normal");
    doc.setFontSize(7);
    doc.setTextColor(140,150,165);
    const lines=doc.splitTextToSize("ENTWURF – Automatisch erstellt, unverbindlich und ohne Gewähr. Rechtliche Verantwortung liegt beim Verwalter/Einladenden.",contentW);
    lines.forEach((line,i)=>doc.text(line,marginX,pageH-11+i*3.4));
  }

  function newPage(){
    drawFooter();
    doc.addPage();
    pageNum++;
    drawHeader();
    cursorY=headerH+8;
  }

  function ensureSpace(h){
    if(cursorY+h>pageH-footerH-4)newPage();
  }

  drawHeader();
  cursorY=headerH+10;

  const rawLines=draftText.split("\n");
  const lineH=4.6;
  let firstNonEmpty=true;

  rawLines.forEach(rawLine=>{
    const trimmed=rawLine.trimEnd();
    if(!trimmed){cursorY+=2.5;return;}

    if(/^Hinweis:/.test(trimmed)||/^─{3,}/.test(trimmed)){
      ensureSpace(lineH+1);
      doc.setFont("helvetica","italic");
      doc.setFontSize(7.5);
      doc.setTextColor(130,140,155);
      const segs=doc.splitTextToSize(trimmed,contentW);
      segs.forEach((l,li)=>doc.text(l,marginX,cursorY+li*lineH));
      cursorY+=segs.length*lineH+1;
      return;
    }

    if(firstNonEmpty){
      firstNonEmpty=false;
      ensureSpace(12);
      doc.setFont("helvetica","bold");
      doc.setFontSize(15);
      doc.setTextColor(16,32,57);
      const segs=doc.splitTextToSize(trimmed,contentW);
      segs.forEach((l,li)=>doc.text(l,marginX,cursorY+li*6.4));
      cursorY+=segs.length*6.4+3;
      return;
    }

    if(/^TOP \d+:/i.test(trimmed)){
      ensureSpace(16);
      cursorY+=3;
      doc.setDrawColor(215,225,238);
      doc.line(marginX,cursorY-2,marginX+contentW,cursorY-2);
      doc.setFont("helvetica","bold");
      doc.setFontSize(10.5);
      doc.setTextColor(16,32,57);
      const segs=doc.splitTextToSize(trimmed,contentW);
      segs.forEach((l,li)=>doc.text(l,marginX,cursorY+li*5));
      cursorY+=segs.length*5+2;
      return;
    }

    ensureSpace(lineH+1);
    doc.setFont("helvetica","normal");
    doc.setFontSize(9);
    doc.setTextColor(35,45,62);
    const segs=doc.splitTextToSize(trimmed,contentW);
    segs.forEach((l,li)=>doc.text(l,marginX,cursorY+li*lineH));
    cursorY+=segs.length*lineH+0.6;
  });

  drawFooter();
  doc.save(`Inspectora-Einladung-${p.id||"Entwurf"}-${today()}.pdf`);
  invToast("PDF wurde erstellt.");
}

function invBind(){
  $$('.inv-step').forEach(b=>b.addEventListener("click",()=>invSetStep(b.dataset.step)));
  $$('.inv-next').forEach(b=>b.addEventListener("click",()=>{if(invValidate(invState.step))invSetStep(b.dataset.next)}));
  $$('.inv-prev').forEach(b=>b.addEventListener("click",()=>invSetStep(b.dataset.previous)));

  $("#newInvButton")?.addEventListener("click",()=>invNewInvitation(true));
  $("#saveInvButton")?.addEventListener("click",invSaveCurrent);
  $("#finishAndSaveInvButton")?.addEventListener("click",()=>{if(invSaveCurrent())$("#invProjekte")?.scrollIntoView({behavior:"smooth"})});

  invRefs.topForm.addEventListener("submit",e=>{
    e.preventDefault();
    const t=invTopFromForm();
    if(!t.title){invToast("Bitte einen Titel für den TOP eintragen.");return}
    const i=invState.current.tops.findIndex(x=>x.id===t.id);
    if(i>=0){invState.current.tops[i]=t;invToast("TOP aktualisiert.")}
    else{invState.current.tops.push(t);invToast("TOP übernommen.")}
    invResetTopForm();
    invRenderTops();
    invRenderReport();
    invSaveDraft();
  });
  invRefs.resetTopButton.addEventListener("click",invResetTopForm);
  invRefs.topList.addEventListener("click",e=>{
    const ed=e.target.closest("[data-edit-top]"),de=e.target.closest("[data-delete-top]");
    if(ed)invEditTop(ed.dataset.editTop);
    if(de)invDeleteTop(de.dataset.deleteTop);
  });

  $("#printInvButton")?.addEventListener("click",invGeneratePdf);
  $("#copyInvButton")?.addEventListener("click",invCopyText);
  $("#regenerateInvButton")?.addEventListener("click",()=>{
    if(!invRefs.draft)return;
    if(invRefs.draft.value.trim()&&!window.confirm("Einladungstext neu generieren? Manuelle Änderungen gehen dabei verloren."))return;
    invRefs.draft.value=invGenerateText();
    invState.current.draftText=invRefs.draft.value;
    invSaveDraft();
  });
  if(invRefs.draft){
    invRefs.draft.addEventListener("input",()=>{
      invState.current.draftText=invRefs.draft.value;
      invSaveDraft();
    });
  }

  invRefs.search.addEventListener("input",invRenderList);
  invRefs.statusFilter.addEventListener("change",invRenderList);
  invRefs.list.addEventListener("click",e=>{
    const o=e.target.closest("[data-open-inv]"),u=e.target.closest("[data-duplicate-inv]"),d=e.target.closest("[data-delete-inv]");
    if(o)invOpenInvitation(o.dataset.openInv);
    if(u)invDuplicateInvitation(u.dataset.duplicateInv);
    if(d)invRequestDelete(d.dataset.deleteInv);
  });
  invRefs.list.addEventListener("change",e=>{
    const s=e.target.closest("[data-status-inv]");
    if(s)invChangeStatus(s.dataset.statusInv,s.value);
  });
  $("#invEmptyStartButton")?.addEventListener("click",()=>invNewInvitation(false));

  $$('[data-close-inv-modal]').forEach(x=>x.addEventListener("click",invCloseModal));
  invRefs.confirmDeleteButton.addEventListener("click",invConfirmDelete);

  [invRefs.name,invRefs.type,invRefs.host,invRefs.date,invRefs.time,invRefs.location,invRefs.sendDate].forEach(el=>{
    el.addEventListener("input",invSaveDraft);
    el.addEventListener("change",invSaveDraft);
  });
}

function invInit(){
  if(!invRefs.tool)return;
  invBind();
  try{
    const d=JSON.parse(localStorage.getItem(INV_DRAFT_KEY)||"null");
    if(d&&typeof d==="object"){
      invState.current={...emptyInvitation(),...d};
      localStorage.setItem(INV_DRAFT_KEY,JSON.stringify(invState.current));
    }
  }catch{}
  invSyncState();
  invRenderList();
  invSetStep(1);
}
invInit();
})();


/* ── V7 WOW-Effekte: Scroll Reveal + Zahlen-Counter ─────────── */
(function () {
  "use strict";

  /* Scroll Reveal via IntersectionObserver */
  var revealEls = document.querySelectorAll(".reveal, .reveal-stagger");
  if (revealEls.length) {
    if ("IntersectionObserver" in window) {
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            obs.unobserve(entry.target);
          }
        });
      }, { rootMargin: "0px 0px -80px 0px", threshold: 0.08 });
      revealEls.forEach(function (el) { obs.observe(el); });
    } else {
      revealEls.forEach(function (el) { el.classList.add("in-view"); });
    }
  }

})();

/* ── Hausgeld- & Wirtschaftsplan-Rechner ─────────────────────── */
(function () {
  'use strict';

  const HG_STORAGE_KEY = 'inspectora_hg_plans_v1';
  const HG_DRAFT_KEY   = 'inspectora_hg_draft_v1';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const today = () => new Date().toISOString().slice(0, 10);
  const fmt   = v => v ? new Intl.DateTimeFormat('de-DE').format(new Date(v + 'T12:00:00')) : '';

  const emptyHgPlan = () => ({
    id: '', name: '', status: 'Entwurf',
    year: new Date().getFullYear(), meaDenominator: 1000,
    manager: '', units: [], costs: [],
    createdAt: '', updatedAt: ''
  });

  let hgPlansArr = [];
  try {
    hgPlansArr = JSON.parse(localStorage.getItem(HG_STORAGE_KEY) || '[]');
    if (!Array.isArray(hgPlansArr)) hgPlansArr = [];
  } catch { hgPlansArr = []; }

  const hgState = {
    step: 1,
    current: emptyHgPlan(),
    plans: hgPlansArr,
    deleteTarget: null,
    view: 'year',
    costHint: null
  };

  // ── Utilities ─────────────────────────────────────────────────
  function hgToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(hgToast._t);
    hgToast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function hgPersist() {
    try { localStorage.setItem(HG_STORAGE_KEY, JSON.stringify(hgState.plans)); return true; }
    catch { hgToast('Speicher voll – bitte ältere Pläne löschen.'); return false; }
  }

  function hgSaveDraft() {
    try { localStorage.setItem(HG_DRAFT_KEY, JSON.stringify(hgState.current)); } catch {}
  }

  function hgPlanId() {
    const y = new Date().getFullYear();
    const nums = hgState.plans.map(p => Number(String(p.id).split('-').pop())).filter(Number.isFinite);
    return `HG-${y}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
  }

  let _hgUnitSeq = 0, _hgCostSeq = 0;
  function hgUnitId() { return `HGU-${Date.now()}-${++_hgUnitSeq}`; }
  function hgCostId() { return `HGC-${Date.now()}-${++_hgCostSeq}`; }

  function hgFmt(cents) {
    return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }
  function hgFmtN(v, dec = 2) {
    return (parseFloat(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function hgCellFmt(cents) {
    return hgState.view === 'month'
      ? (cents / 1200).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
      : hgFmt(cents);
  }
  function hgKeyLabel(key) {
    return key === 'area' ? 'Fläche (m²)' : key === 'equal' ? 'Einheiten' : 'MEA';
  }

  // ── Distribution: Largest-Remainder, cent-exact ───────────────
  function hgDistribute(totalCents, weights) {
    const totalW = weights.reduce((a, b) => a + b, 0);
    if (!totalW) return weights.map(() => 0);
    const raw     = weights.map(w => totalCents * w / totalW);
    const floored = raw.map(Math.floor);
    let rem = totalCents - floored.reduce((a, b) => a + b, 0);
    const byFrac = raw.map((v, i) => [i, v - floored[i]]).sort((a, b) => b[1] - a[1]);
    const result = [...floored];
    for (let k = 0; k < rem; k++) result[byFrac[k][0]]++;
    return result;
  }

  function hgCalculate() {
    const { units, costs } = hgState.current;
    if (!units.length || !costs.length) return [];
    const n = units.length, m = costs.length;
    const matrix = Array.from({ length: n }, () => new Array(m).fill(0));
    costs.forEach((cost, j) => {
      const totalCents = Math.round((parseFloat(cost.amount) || 0) * 100);
      if (!totalCents) return;
      let weights;
      if      (cost.key === 'area')  weights = units.map(u => parseFloat(u.area) || 0);
      else if (cost.key === 'equal') weights = units.map(() => 1);
      else                           weights = units.map(u => parseFloat(u.mea)  || 0);
      const dist = hgDistribute(totalCents, weights);
      for (let i = 0; i < n; i++) matrix[i][j] = dist[i];
    });
    return matrix;
  }

  // ── Step management ───────────────────────────────────────────
  function hgSetStep(n) {
    hgState.step = Number(n);
    $$('.hg-step').forEach(b => b.classList.toggle('active', Number(b.dataset.step) === hgState.step));
    $$('.hg-panel').forEach(p => p.classList.toggle('active', Number(p.dataset.panel) === hgState.step));
    if (hgState.step === 4) { hgSyncForm(); hgRenderResult(); }
    hgSaveDraft();
  }

  function hgValidate(step) {
    hgSyncForm();
    const p = hgState.current;
    if (Number(step) === 1) {
      if (!p.name)            { hgToast('Bitte eine WEG-Bezeichnung eintragen.');   return false; }
      if (!p.year)            { hgToast('Bitte ein Wirtschaftsjahr eintragen.');      return false; }
      if (!p.meaDenominator)  { hgToast('Bitte den MEA-Gesamtnenner eintragen.');   return false; }
    }
    if (Number(step) === 2 && !p.units.length) { hgToast('Bitte mindestens eine Einheit erfassen.');        return false; }
    if (Number(step) === 3 && !p.costs.length) { hgToast('Bitte mindestens eine Kostenposition erfassen.'); return false; }
    return true;
  }

  // ── Form sync ─────────────────────────────────────────────────
  function hgSyncForm() {
    Object.assign(hgState.current, {
      name:           ($('#hgName')?.value || '').trim(),
      year:           parseInt($('#hgYear')?.value || '') || new Date().getFullYear(),
      manager:        ($('#hgManager')?.value || '').trim(),
      meaDenominator: parseFloat($('#hgMeaDenominator')?.value || '') || 1000,
      status:         $('#hgStatus')?.value || 'Entwurf'
    });
  }

  function hgSyncState() {
    const p = hgState.current;
    const set = (id, val) => { const el = $(`#${id}`); if (el) el.value = val; };
    set('hgName',           p.name            || '');
    set('hgYear',           p.year            || new Date().getFullYear());
    set('hgManager',        p.manager         || '');
    set('hgMeaDenominator', p.meaDenominator  || 1000);
    set('hgStatus',         p.status          || 'Entwurf');
    hgRenderUnits();
    hgMeaCheckRender();
    hgRenderCosts();
  }

  // ── Units ─────────────────────────────────────────────────────
  function hgUnitFromForm() {
    const existingId = $('#hgEditingUnitId')?.value;
    return {
      id:    existingId || hgUnitId(),
      label: ($('#hgUnitLabel')?.value || '').trim(),
      owner: ($('#hgUnitOwner')?.value || '').trim(),
      mea:   $('#hgUnitMea')?.value  || '',
      area:  $('#hgUnitArea')?.value || ''
    };
  }

  function hgResetUnitForm() {
    ['hgUnitLabel','hgUnitOwner','hgUnitMea','hgUnitArea','hgEditingUnitId']
      .forEach(id => { const el = $(`#${id}`); if (el) el.value = ''; });
  }

  function hgRenderUnits() {
    const el = $('#hgUnitList');
    if (!el) return;
    const units = hgState.current.units;
    const n = units.length;
    const countEl = $('#hgUnitCount');
    if (countEl) countEl.textContent = `${n} ${n === 1 ? 'Einheit' : 'Einheiten'}`;
    if (!n) {
      el.innerHTML = '<div class="empty-state"><strong>Noch keine Einheiten</strong><p>Erfasse links die erste Wohneinheit.</p></div>';
      return;
    }
    el.innerHTML = units.map((u, i) => `
      <article class="finding-card">
        <div class="finding-card-top">
          <div>
            <span class="finding-area">Einheit ${i + 1}</span>
            <h4>${esc(u.label)}</h4>
            ${u.owner ? `<p style="margin-top:2px;font-size:11px;color:var(--muted)">${esc(u.owner)}</p>` : ''}
          </div>
          <span class="hg-key-badge mea">MEA&thinsp;${hgFmtN(u.mea, 3)}</span>
        </div>
        <div class="finding-meta">
          <span>Fläche: ${hgFmtN(u.area)}&thinsp;m²</span>
        </div>
        <div class="finding-card-actions">
          <button type="button" data-edit-unit="${esc(u.id)}">Bearbeiten</button>
          ${i > 0       ? `<button type="button" data-move-unit="${esc(u.id)}" data-dir="up">↑</button>` : ''}
          ${i < n - 1   ? `<button type="button" data-move-unit="${esc(u.id)}" data-dir="down">↓</button>` : ''}
          <button type="button" data-delete-unit="${esc(u.id)}">Löschen</button>
        </div>
      </article>`).join('');
  }

  function hgMeaCheckRender() {
    const el = $('#hgMeaCheck');
    if (!el) return;
    const units = hgState.current.units;
    if (!units.length) { el.innerHTML = ''; el.className = 'hg-mea-check'; return; }
    const sum = units.reduce((s, u) => s + (parseFloat(u.mea) || 0), 0);
    const den = hgState.current.meaDenominator || 1000;
    const ok  = Math.abs(sum - den) < 0.001;
    el.className = `hg-mea-check ${ok ? 'hg-mea-ok' : 'hg-mea-warn'}`;
    el.innerHTML = `${ok ? '✓' : '⚠'}&thinsp;MEA-Summe: <strong>${hgFmtN(sum, 3)}</strong> von <strong>${den}</strong>&nbsp;${ok ? '(vollständig erfasst)' : '(Differenz: ' + hgFmtN(den - sum, 3) + ')'}`;
  }

  function hgEditUnit(id) {
    const u = hgState.current.units.find(x => x.id === id);
    if (!u) return;
    const set = (f, v) => { const el = $(`#${f}`); if (el) el.value = v; };
    set('hgUnitLabel', u.label); set('hgUnitOwner', u.owner);
    set('hgUnitMea', u.mea);    set('hgUnitArea', u.area);
    set('hgEditingUnitId', u.id);
    $('#hgUnitLabel')?.focus();
  }

  function hgDeleteUnit(id) {
    hgState.current.units = hgState.current.units.filter(u => u.id !== id);
    hgRenderUnits(); hgMeaCheckRender(); hgSaveDraft();
    hgToast('Einheit gelöscht.');
  }

  function hgMoveUnit(id, dir) {
    const arr = hgState.current.units;
    const i = arr.findIndex(u => u.id === id);
    if (i < 0) return;
    if (dir === 'up'   && i > 0)             [arr[i-1], arr[i]]   = [arr[i], arr[i-1]];
    if (dir === 'down' && i < arr.length - 1) [arr[i],  arr[i+1]] = [arr[i+1], arr[i]];
    hgRenderUnits(); hgMeaCheckRender(); hgSaveDraft();
  }

  // ── Costs ─────────────────────────────────────────────────────
  function hgCostFromForm() {
    const existingId = $('#hgEditingCostId')?.value;
    return {
      id:     existingId || hgCostId(),
      label:  ($('#hgCostLabel')?.value  || '').trim(),
      amount: $('#hgCostAmount')?.value  || '',
      key:    $('#hgCostKey')?.value     || 'mea'
    };
  }

  function hgResetCostForm() {
    ['hgCostLabel','hgCostAmount','hgEditingCostId'].forEach(id => { const el = $(`#${id}`); if (el) el.value = ''; });
    const keyEl = $('#hgCostKey'); if (keyEl) keyEl.value = 'mea';
    hgState.costHint = null;
    hgRenderCostHint();
  }

  function hgRenderCostHint() {
    const el = $('#hgCostHint');
    if (!el) return;
    const h = hgState.costHint;
    if (h === 'heizung') {
      el.className   = 'hg-hint-box hg-hint-warn';
      el.style.display = '';
      el.innerHTML = '<strong>Orientierungshinweis – unverbindlich, keine Rechtsberatung:</strong> Bei Heizkosten und Warmwasserkosten können gesetzliche Pflichten zur verbrauchsabhängigen Abrechnung bestehen (vgl. § 7, § 8 HeizkostenV). Wird die Verbrauchserfassung unterlassen, kann ein Kürzungsrecht entstehen (§ 9a HeizkostenV). Der gewählte Schlüssel gilt nur für den Wirtschaftsplan-Vorschuss – die Abrechnung folgt eigenen Regeln. Bitte fachlich prüfen.';
    } else if (h === 'ruecklage') {
      el.className   = 'hg-hint-box';
      el.style.display = '';
      el.innerHTML = '<strong>Orientierungshinweis – unverbindlich, keine Rechtsberatung:</strong> Für die Erhaltungsrücklage können gesetzliche Mindestanforderungen und Beschlüsse der Eigentümerversammlung maßgeblich sein (vgl. § 19 Abs. 2 Nr. 4 WEG). Die angemessene Höhe ist individuell zu ermitteln. Bitte fachlich prüfen.';
    } else {
      el.innerHTML = '';
      el.style.display = 'none';
    }
  }

  function hgRenderCosts() {
    const el = $('#hgCostList');
    if (!el) return;
    const costs = hgState.current.costs;
    const countEl = $('#hgCostCount');
    if (countEl) countEl.textContent = `${costs.length} ${costs.length === 1 ? 'Position' : 'Positionen'}`;
    if (!costs.length) {
      el.innerHTML = '<div class="empty-state"><strong>Noch keine Positionen</strong><p>Wähle oben eine Vorlage oder trage eine eigene Position ein.</p></div>';
      return;
    }
    const total = costs.reduce((s, c) => s + Math.round((parseFloat(c.amount) || 0) * 100), 0);
    el.innerHTML = costs.map(c => `
      <article class="finding-card">
        <div class="finding-card-top">
          <div>
            <span class="hg-key-badge ${esc(c.key)}">${esc(hgKeyLabel(c.key))}</span>
            <h4 style="margin-top:5px">${esc(c.label)}</h4>
          </div>
          <strong style="font-size:14px;color:var(--primary)">${hgFmt(Math.round((parseFloat(c.amount) || 0) * 100))}</strong>
        </div>
        <div class="finding-meta">
          <span>Je Monat: ${hgFmt(Math.round(Math.round((parseFloat(c.amount) || 0) * 100) / 12))}</span>
        </div>
        <div class="finding-card-actions">
          <button type="button" data-edit-cost="${esc(c.id)}">Bearbeiten</button>
          <button type="button" data-delete-cost="${esc(c.id)}">Löschen</button>
        </div>
      </article>`).join('') +
      `<div style="padding:10px 0;font-size:11px;font-weight:700;color:var(--text);text-align:right">
         Gesamt: ${hgFmt(total)}/Jahr &nbsp;·&nbsp; ${hgFmt(Math.round(total / 12))}/Monat
       </div>`;
  }

  function hgEditCost(id) {
    const c = hgState.current.costs.find(x => x.id === id);
    if (!c) return;
    const set = (f, v) => { const el = $(`#${f}`); if (el) el.value = v; };
    set('hgCostLabel', c.label); set('hgCostAmount', c.amount);
    set('hgCostKey', c.key);     set('hgEditingCostId', c.id);
    hgState.costHint = null; hgRenderCostHint();
    $('#hgCostLabel')?.focus();
  }

  function hgDeleteCost(id) {
    hgState.current.costs = hgState.current.costs.filter(c => c.id !== id);
    hgRenderCosts(); hgSaveDraft();
    hgToast('Position gelöscht.');
  }

  // ── Result ────────────────────────────────────────────────────
  function hgToggleView(v) {
    hgState.view = v;
    $('#hgViewYear')?.classList.toggle('active',  v === 'year');
    $('#hgViewMonth')?.classList.toggle('active', v === 'month');
    hgRenderResult();
  }

  function hgRenderResult() {
    const el = $('#hgResultArea');
    if (!el) return;
    const p = hgState.current;
    if (!p.units.length || !p.costs.length) {
      el.innerHTML = '<div class="empty-state compact" style="margin-top:20px"><strong>Keine Daten</strong><p>Bitte zuerst Einheiten (Schritt 2) und Kostenpositionen (Schritt 3) erfassen.</p></div>';
      return;
    }
    const matrix     = hgCalculate();
    const unitTotals = p.units.map((u, i) => matrix[i].reduce((a, b) => a + b, 0));
    const grandTotal = unitTotals.reduce((a, b) => a + b, 0);
    const isMonth    = hgState.view === 'month';

    const summHtml = `<div class="hg-summary-grid">
      <article><span>Jahreskosten gesamt</span><strong>${hgFmt(grandTotal)}</strong></article>
      <article><span>Monatliche Gesamtkosten</span><strong>${hgFmt(Math.round(grandTotal / 12))}</strong></article>
      <article><span>Ø Hausgeld / Einheit / Monat</span><strong>${p.units.length ? hgFmt(Math.round(grandTotal / 12 / p.units.length)) : '–'}</strong></article>
    </div>`;

    const headCols = `<th>Einheit / Eigentümer</th><th>MEA</th><th>m²</th>` +
      p.costs.map(c => `<th>${esc(c.label)}<br><span class="hg-key-badge ${esc(c.key)}">${esc(hgKeyLabel(c.key))}</span></th>`).join('') +
      `<th class="hg-col-total">${isMonth ? 'HG/Monat' : 'HG/Jahr'}</th>`;

    const bodyRows = p.units.map((u, i) => `<tr>
      <td><strong>${esc(u.label)}</strong>${u.owner ? `<br><small style="color:var(--muted)">${esc(u.owner)}</small>` : ''}</td>
      <td>${hgFmtN(u.mea, 3)}</td>
      <td>${hgFmtN(u.area)}</td>
      ${matrix[i].map(cents => `<td>${hgCellFmt(cents)}</td>`).join('')}
      <td class="hg-col-total">${hgCellFmt(unitTotals[i])}</td>
    </tr>`).join('');

    const footCells = p.costs.map((c, j) => {
      const cTot = Math.round((parseFloat(c.amount) || 0) * 100);
      const dTot = matrix.reduce((s, row) => s + row[j], 0);
      const ok   = cTot === dTot;
      return `<td class="${ok ? 'hg-check-ok' : 'hg-check-warn'}">${hgCellFmt(cTot)}&nbsp;${ok ? '✓' : '⚠'}</td>`;
    }).join('');

    const meaSum  = p.units.reduce((s, u) => s + (parseFloat(u.mea)  || 0), 0);
    const areaSum = p.units.reduce((s, u) => s + (parseFloat(u.area) || 0), 0);
    const footRow = `<tr>
      <td><strong>Summe / Check</strong></td>
      <td>${hgFmtN(meaSum, 3)}</td>
      <td>${hgFmtN(areaSum)}</td>
      ${footCells}
      <td class="hg-col-total"><strong>${hgCellFmt(grandTotal)}</strong></td>
    </tr>`;

    el.innerHTML = summHtml + `
      <div class="hg-table-wrap">
        <table class="hg-table">
          <thead><tr>${headCols}</tr></thead>
          <tbody>${bodyRows}</tbody>
          <tfoot>${footRow}</tfoot>
        </table>
      </div>
      <p class="hg-result-note">✓ = Rundungsprüfung bestanden &nbsp;·&nbsp; ⚠ = Abweichung durch Rundung (Cent-Differenz möglich)</p>`;
  }

  // ── Copy as text ──────────────────────────────────────────────
  function hgCopyText() {
    hgSyncForm();
    const p = hgState.current;
    if (!p.units.length || !p.costs.length) { hgToast('Keine Daten vorhanden.'); return; }
    const matrix     = hgCalculate();
    const unitTotals = p.units.map((u, i) => matrix[i].reduce((a, b) => a + b, 0));
    const grandTotal = unitTotals.reduce((a, b) => a + b, 0);
    const lines = [
      `Hausgeld- & Wirtschaftsplan – ${p.name}`,
      `Wirtschaftsjahr ${p.year}${p.manager ? ' · Verwalter: ' + p.manager : ''}`,
      `Status: ${p.status} · MEA-Nenner: ${p.meaDenominator}`,
      '',
      'Kostenpositionen:',
      ...p.costs.map(c => `  ${c.label}: ${hgFmt(Math.round((parseFloat(c.amount) || 0) * 100))} (${hgKeyLabel(c.key)})`),
      `  ― Gesamtkosten/Jahr: ${hgFmt(grandTotal)}`,
      '',
      'Hausgeld je Einheit:',
      ...p.units.map((u, i) => `  ${u.label}${u.owner ? ' (' + u.owner + ')' : ''}: ${hgFmt(unitTotals[i])}/Jahr  ·  ${hgFmt(Math.round(unitTotals[i] / 12))}/Monat`),
      '',
      'Unverbindliche Orientierung – keine Rechtsberatung. Bitte fachlich prüfen.',
      `Erstellt mit Inspectora am ${fmt(today())}`
    ];
    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => hgToast('Text kopiert.'))
      .catch(() => hgToast('Kopieren wurde vom Browser blockiert.'));
  }

  // ── PDF export ────────────────────────────────────────────────
  function hgGeneratePdf() {
    if (typeof window.jspdf === 'undefined') { hgToast('PDF-Bibliothek nicht geladen. Bitte Seite neu laden.'); return; }
    hgSyncForm();
    const p = hgState.current;
    if (!p.units.length || !p.costs.length) { hgToast('Bitte zuerst Einheiten und Kostenpositionen erfassen.'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const ML = 20, MR = 20, MT = 24, MB = 22;
    const CW = 210 - ML - MR;
    let y = MT;

    const matrix     = hgCalculate();
    const unitTotals = p.units.map((u, i) => matrix[i].reduce((a, b) => a + b, 0));
    const grandTotal = unitTotals.reduce((a, b) => a + b, 0);

    const drawFooter = () => {
      doc.setFontSize(7); doc.setTextColor(160, 160, 160);
      doc.text(`Inspectora · Hausgeld- & Wirtschaftsplan-Rechner · Seite ${doc.getCurrentPageInfo().pageNumber}  ·  Unverbindliche Orientierung – keine Rechtsberatung.`, ML, 292);
      doc.setTextColor(0, 0, 0);
    };

    const checkPage = (needed) => {
      if (y + needed > 297 - MB) { drawFooter(); doc.addPage(); y = MT; }
    };

    // Header
    doc.setFillColor(36, 87, 214); doc.roundedRect(ML, y, CW, 22, 4, 4, 'F');
    doc.setFontSize(14); doc.setTextColor(255, 255, 255); doc.setFont(undefined, 'bold');
    doc.text('Inspectora', ML + 8, y + 9);
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    doc.text('Hausgeld- & Wirtschaftsplan-Rechner', ML + 8, y + 16);
    doc.text(`Stand: ${fmt(today())}`, ML + CW - 8, y + 16, { align: 'right' });
    doc.setTextColor(0, 0, 0); y += 28;

    // WEG info
    doc.setFontSize(18); doc.setFont(undefined, 'bold'); doc.text(p.name || 'Wirtschaftsplan', ML, y); y += 7;
    doc.setFontSize(8.5); doc.setFont(undefined, 'normal'); doc.setTextColor(100, 100, 100);
    doc.text([`Wirtschaftsjahr ${p.year}`, p.manager ? `Verwalter: ${p.manager}` : '', `Status: ${p.status}`, `MEA-Nenner: ${p.meaDenominator}`].filter(Boolean).join('  ·  '), ML, y);
    doc.setTextColor(0, 0, 0); y += 7;
    doc.setDrawColor(220, 220, 220); doc.line(ML, y, ML + CW, y); y += 7;

    // Summary boxes
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.text('Zusammenfassung', ML, y); y += 5;
    const bW = CW / 3 - 2;
    [['Jahreskosten gesamt', hgFmt(grandTotal)], ['Einheiten', String(p.units.length)], ['Kostenpositionen', String(p.costs.length)]].forEach((item, k) => {
      const bx = ML + k * (bW + 3);
      doc.setFillColor(240, 244, 252); doc.roundedRect(bx, y, bW, 14, 2, 2, 'F');
      doc.setFontSize(7); doc.setFont(undefined, 'normal'); doc.setTextColor(110, 110, 110); doc.text(item[0], bx + 4, y + 5);
      doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(0, 0, 0); doc.text(item[1], bx + 4, y + 12);
    }); y += 20;

    // Kostenpositionen table
    checkPage(20);
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.text('Kostenpositionen', ML, y); y += 5;
    const cC = [CW * 0.50, CW * 0.28, CW * 0.22];
    doc.setFillColor(225, 232, 248); doc.rect(ML, y, CW, 7, 'F');
    doc.setFontSize(7.5); doc.setFont(undefined, 'bold');
    ['Bezeichnung', 'Jahresbetrag', 'Schlüssel'].forEach((h, k) => doc.text(h, ML + cC.slice(0,k).reduce((a,b)=>a+b,0) + 2, y + 5));
    doc.setFont(undefined, 'normal'); y += 7;
    p.costs.forEach((c, idx) => {
      checkPage(8);
      if (idx % 2 === 0) { doc.setFillColor(248, 250, 253); doc.rect(ML, y, CW, 7, 'F'); }
      doc.setFontSize(7.5);
      doc.text(c.label || '', ML + 2, y + 5, { maxWidth: cC[0] - 4 });
      doc.text(hgFmt(Math.round((parseFloat(c.amount) || 0) * 100)), ML + cC[0] + 2, y + 5);
      doc.text(hgKeyLabel(c.key), ML + cC[0] + cC[1] + 2, y + 5);
      y += 7;
    });
    doc.setFillColor(210, 220, 244); doc.rect(ML, y, CW, 7, 'F');
    doc.setFont(undefined, 'bold'); doc.setFontSize(7.5);
    doc.text('Gesamtkosten / Jahr', ML + 2, y + 5);
    doc.text(hgFmt(grandTotal), ML + cC[0] + 2, y + 5);
    doc.setFont(undefined, 'normal'); y += 12;

    // Hausgeld je Einheit table
    checkPage(20);
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.text('Hausgeld je Einheit', ML, y); y += 5;
    const uC = [CW*0.29, CW*0.23, CW*0.11, CW*0.11, CW*0.14, CW*0.12];
    const uCx = k => ML + uC.slice(0,k).reduce((a,b)=>a+b,0) + 2;
    doc.setFillColor(225, 232, 248); doc.rect(ML, y, CW, 7, 'F');
    doc.setFontSize(7); doc.setFont(undefined, 'bold');
    ['Einheit','Eigentümer','MEA','m²','HG/Jahr','HG/Monat'].forEach((h, k) => doc.text(h, uCx(k), y + 5));
    doc.setFont(undefined, 'normal'); y += 7;
    p.units.forEach((u, i) => {
      checkPage(9);
      if (i % 2 === 0) { doc.setFillColor(248, 250, 253); doc.rect(ML, y, CW, 8, 'F'); }
      doc.setFontSize(7);
      doc.text(u.label || '', uCx(0), y + 5, { maxWidth: uC[0] - 4 });
      doc.text(u.owner || '–',  uCx(1), y + 5, { maxWidth: uC[1] - 4 });
      doc.text(hgFmtN(u.mea, 0),  uCx(2), y + 5);
      doc.text(hgFmtN(u.area),    uCx(3), y + 5);
      doc.setFont(undefined, 'bold'); doc.text(hgFmt(unitTotals[i]), uCx(4), y + 5);
      doc.setFont(undefined, 'normal'); doc.text(hgFmt(Math.round(unitTotals[i] / 12)), uCx(5), y + 5);
      y += 8;
    }); y += 5;

    // Disclaimer
    checkPage(28);
    doc.setFillColor(255, 244, 218); doc.roundedRect(ML, y, CW, 26, 3, 3, 'F');
    doc.setFontSize(7.5); doc.setFont(undefined, 'bold'); doc.setTextColor(92, 55, 0);
    doc.text('Unverbindliche Orientierung – keine Rechtsberatung:', ML + 4, y + 7);
    doc.setFont(undefined, 'normal');
    doc.text(doc.splitTextToSize('Diese Berechnung ist ein automatisch erstellter Entwurf ohne Gewähr. Sie ersetzt keine fachliche, steuerliche oder rechtliche Prüfung. Die Verantwortung für Richtigkeit und Vollständigkeit liegt beim Verwalter.', CW - 8), ML + 4, y + 13);
    doc.setTextColor(0, 0, 0); y += 30;

    // Signatures
    checkPage(18);
    doc.setFontSize(8);
    doc.text('______________________________', ML, y);
    doc.text('______________________________', ML + CW / 2, y);
    y += 5; doc.setFontSize(7); doc.setTextColor(100, 100, 100);
    doc.text(p.manager || 'Verwalter', ML, y);
    doc.text('Datum / Unterschrift', ML + CW / 2, y);
    doc.setTextColor(0, 0, 0);

    drawFooter();
    doc.save(`Inspectora-Hausgeld-${p.id || 'Entwurf'}-${today()}.pdf`);
    hgToast('PDF wurde erstellt.');
  }

  // ── Plan management ───────────────────────────────────────────
  function hgSaveCurrent() {
    hgSyncForm();
    if (!hgValidate(1)) return false;
    const now = new Date().toISOString();
    if (!hgState.current.id) {
      hgState.current.id        = hgPlanId();
      hgState.current.createdAt = now;
    }
    hgState.current.updatedAt = now;
    const copy = JSON.parse(JSON.stringify(hgState.current));
    const i = hgState.plans.findIndex(x => x.id === hgState.current.id);
    if (i >= 0) hgState.plans[i] = copy; else hgState.plans.unshift(copy);
    if (!hgPersist()) return false;
    hgSaveDraft(); hgRenderList();
    hgToast(`Wirtschaftsplan ${hgState.current.id} gespeichert.`);
    return true;
  }

  function hgNewPlan(confirmReset) {
    const has = hgState.current.name || hgState.current.units.length || hgState.current.costs.length;
    if (confirmReset && has && !window.confirm('Aktuellen Entwurf verwerfen und neuen Wirtschaftsplan beginnen?')) return;
    hgState.current = emptyHgPlan();
    hgSyncState(); hgResetUnitForm(); hgResetCostForm();
    localStorage.removeItem(HG_DRAFT_KEY);
    hgSetStep(1);
    $('#hgTool')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    hgToast('Neuer Wirtschaftsplan gestartet.');
  }

  function hgOpenPlan(id) {
    const p = hgState.plans.find(x => x.id === id);
    if (!p) return;
    hgState.current = JSON.parse(JSON.stringify(p));
    hgSyncState(); hgSaveDraft();
    hgSetStep(1);
    $('#hgTool')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    hgToast(`${id} geöffnet.`);
  }

  function hgDuplicatePlan(id) {
    const p = hgState.plans.find(x => x.id === id);
    if (!p) return;
    const c = JSON.parse(JSON.stringify(p));
    c.id = hgPlanId(); c.name += ' – Kopie'; c.status = 'Entwurf';
    c.createdAt = c.updatedAt = new Date().toISOString();
    hgState.plans.unshift(c); hgPersist(); hgRenderList();
    hgToast(`Dupliziert als ${c.id}.`);
  }

  function hgRequestDelete(id) {
    hgState.deleteTarget = id;
    const modal = $('#hgConfirmModal');
    if (modal) { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); }
    document.body.classList.add('modal-open');
  }

  function hgCloseModal() {
    hgState.deleteTarget = null;
    const modal = $('#hgConfirmModal');
    if (modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
    document.body.classList.remove('modal-open');
  }

  function hgConfirmDelete() {
    if (!hgState.deleteTarget) return;
    hgState.plans = hgState.plans.filter(x => x.id !== hgState.deleteTarget);
    if (hgState.current.id === hgState.deleteTarget) {
      hgState.current = emptyHgPlan(); hgSyncState();
      localStorage.removeItem(HG_DRAFT_KEY);
    }
    hgPersist(); hgRenderList(); hgCloseModal();
    hgToast('Wirtschaftsplan gelöscht.');
  }

  function hgChangeStatus(id, status) {
    const p = hgState.plans.find(x => x.id === id);
    if (!p) return;
    p.status = status; p.updatedAt = new Date().toISOString();
    if (hgState.current.id === id) hgState.current.status = status;
    hgPersist(); hgRenderList();
    hgToast(`Status auf „${status}“ gesetzt.`);
  }

  function hgRenderList() {
    const q      = ($('#hgSearch')?.value || '').trim().toLowerCase();
    const status = $('#hgStatusFilter')?.value || 'Alle';
    const plans  = hgState.plans;
    const filtered = plans.filter(p =>
      [p.id, p.name, p.manager].join(' ').toLowerCase().includes(q) &&
      (status === 'Alle' || p.status === status)
    );
    const setN = (id, v) => { const el = $(`#${id}`); if (el) el.textContent = v; };
    setN('hgTotalCount',       plans.length);
    setN('hgDraftCount',       plans.filter(p => p.status === 'Entwurf').length);
    setN('hgGenehmigtCount',   plans.filter(p => p.status === 'Genehmigt').length);
    setN('hgBeschlossenCount', plans.filter(p => p.status === 'Beschlossen').length);
    const listEl = $('#hgList');
    if (!listEl) return;
    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty-state large">
        <strong>${plans.length ? 'Keine passenden Pläne' : 'Noch keine Wirtschaftspläne gespeichert'}</strong>
        <p>${plans.length ? 'Passe Suche oder Filter an.' : 'Starte oben einen neuen Wirtschaftsplan.'}</p>
        ${plans.length ? '' : '<button class="button primary" id="hgDynEmptyBtn" type="button">Ersten Plan anlegen</button>'}
      </div>`;
      $('#hgDynEmptyBtn')?.addEventListener('click', () => hgNewPlan(false));
      return;
    }
    listEl.innerHTML = filtered.map(p => {
      const total = (p.costs || []).reduce((s, c) => s + Math.round((parseFloat(c.amount) || 0) * 100), 0);
      return `<article class="project-card">
        <div class="project-card-top">
          <div>
            <span class="project-id">${esc(p.id)}</span>
            <h3>${esc(p.name)}</h3>
            <p>${esc(String(p.year))} · ${p.manager ? esc(p.manager) : 'Kein Verwalter'} · MEA-Nenner: ${esc(String(p.meaDenominator))}</p>
          </div>
          <span class="status-badge">${esc(p.status)}</span>
        </div>
        <div class="project-card-meta">
          <div><span>Einheiten</span><strong>${(p.units || []).length}</strong></div>
          <div><span>Kosten/Jahr</span><strong>${hgFmt(total)}</strong></div>
          <div><span>Kosten/Monat</span><strong>${hgFmt(Math.round(total / 12))}</strong></div>
        </div>
        <div class="project-card-actions">
          <button type="button" data-open-hg="${esc(p.id)}">Öffnen</button>
          <button type="button" data-duplicate-hg="${esc(p.id)}">Duplizieren</button>
          <select data-status-hg="${esc(p.id)}" aria-label="Status ändern">
            ${['Entwurf','Genehmigt','Beschlossen'].map(o => `<option ${p.status===o?'selected':''}>${o}</option>`).join('')}
          </select>
          <button type="button" data-delete-hg="${esc(p.id)}">Löschen</button>
        </div>
      </article>`;
    }).join('');
  }

  // ── Demo data ─────────────────────────────────────────────────
  function hgLoadDemo() {
    if ((hgState.current.units.length || hgState.current.costs.length) &&
      !window.confirm('Demo-Daten laden? Bisherige Einheiten und Positionen werden ersetzt.')) return;
    hgState.current.units = [
      { id: hgUnitId(), label: 'Whg. 1, EG links',  owner: 'Anna Muster',  mea: '250', area: '62.00' },
      { id: hgUnitId(), label: 'Whg. 2, EG rechts', owner: 'Klaus Schmidt', mea: '250', area: '65.50' },
      { id: hgUnitId(), label: 'Whg. 3, OG links',  owner: 'Maria Fischer', mea: '250', area: '62.00' },
      { id: hgUnitId(), label: 'Whg. 4, OG rechts', owner: 'Hans Müller',  mea: '250', area: '68.50' }
    ];
    hgState.current.costs = [
      { id: hgCostId(), label: 'Hausmeisterdienst',    amount: '2400.00', key: 'equal' },
      { id: hgCostId(), label: 'Treppenhausreinigung', amount: '1440.00', key: 'equal' },
      { id: hgCostId(), label: 'Allgemeinstrom',       amount:  '480.00', key: 'mea'   },
      { id: hgCostId(), label: 'Gebäudeversicherung',  amount: '1200.00', key: 'mea'   },
      { id: hgCostId(), label: 'Verwaltervergütung',   amount: '2400.00', key: 'mea'   },
      { id: hgCostId(), label: 'Erhaltungsrücklage',   amount: '2000.00', key: 'mea'   }
    ];
    if (!hgState.current.name) hgState.current.name = 'WEG Musterhaus – Demo';
    if (!hgState.current.year) hgState.current.year = new Date().getFullYear();
    hgState.current.meaDenominator = 1000;
    hgRenderUnits(); hgMeaCheckRender(); hgRenderCosts(); hgSaveDraft();
    hgToast('Demo-Daten geladen.');
  }

  // ── Event binding ─────────────────────────────────────────────
  function hgBind() {
    $$('.hg-step').forEach(b => b.addEventListener('click', () => hgSetStep(b.dataset.step)));
    $$('.hg-next').forEach(b => b.addEventListener('click', () => { if (hgValidate(hgState.step)) hgSetStep(b.dataset.next); }));
    $$('.hg-prev').forEach(b => b.addEventListener('click', () => hgSetStep(b.dataset.previous)));

    $('#newHgButton')?.addEventListener('click', () => hgNewPlan(true));
    $('#saveHgButton')?.addEventListener('click', hgSaveCurrent);
    $('#hgSaveFromResultButton')?.addEventListener('click', () => { if (hgSaveCurrent()) $('#hgProjekte')?.scrollIntoView({ behavior: 'smooth' }); });

    ['hgName','hgYear','hgManager','hgMeaDenominator','hgStatus'].forEach(id => {
      const el = $(`#${id}`);
      el?.addEventListener('input',  () => { hgSyncForm(); hgSaveDraft(); });
      el?.addEventListener('change', () => { hgSyncForm(); hgSaveDraft(); });
    });

    $('#hgUnitForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const u = hgUnitFromForm();
      if (!u.label)                               { hgToast('Bitte eine Bezeichnung eintragen.');  return; }
      if (!u.mea  || isNaN(parseFloat(u.mea)))   { hgToast('Bitte den MEA-Zähler eintragen.'); return; }
      if (!u.area || isNaN(parseFloat(u.area)))   { hgToast('Bitte die Wohnfläche eintragen.'); return; }
      const idx = hgState.current.units.findIndex(x => x.id === u.id);
      if (idx >= 0) { hgState.current.units[idx] = u; hgToast('Einheit aktualisiert.'); }
      else          { hgState.current.units.push(u);  hgToast('Einheit übernommen.'); }
      hgResetUnitForm(); hgRenderUnits(); hgMeaCheckRender(); hgSaveDraft();
    });
    $('#hgResetUnitButton')?.addEventListener('click', hgResetUnitForm);
    $('#hgUnitList')?.addEventListener('click', e => {
      const ed = e.target.closest('[data-edit-unit]');
      const de = e.target.closest('[data-delete-unit]');
      const mu = e.target.closest('[data-move-unit]');
      if (ed) hgEditUnit(ed.dataset.editUnit);
      if (de) hgDeleteUnit(de.dataset.deleteUnit);
      if (mu) hgMoveUnit(mu.dataset.moveUnit, mu.dataset.dir);
    });
    $('#hgDemoButton')?.addEventListener('click', hgLoadDemo);

    $('#hgQuickGrid')?.addEventListener('click', e => {
      const b = e.target.closest('.hg-quick-btn');
      if (!b) return;
      const labelEl = $('#hgCostLabel'), keyEl = $('#hgCostKey');
      if (labelEl) labelEl.value = b.dataset.label;
      if (keyEl)   keyEl.value   = b.dataset.key;
      hgState.costHint = b.dataset.hint || null;
      hgRenderCostHint();
      $('#hgCostAmount')?.focus();
    });

    $('#hgCostForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const c = hgCostFromForm();
      if (!c.label) { hgToast('Bitte eine Bezeichnung eintragen.'); return; }
      if (!c.amount || isNaN(parseFloat(c.amount)) || parseFloat(c.amount) <= 0) { hgToast('Bitte einen gültigen Betrag eintragen.'); return; }
      const idx = hgState.current.costs.findIndex(x => x.id === c.id);
      if (idx >= 0) { hgState.current.costs[idx] = c; hgToast('Position aktualisiert.'); }
      else          { hgState.current.costs.push(c);  hgToast('Position übernommen.'); }
      hgResetCostForm(); hgRenderCosts(); hgSaveDraft();
    });
    $('#hgResetCostButton')?.addEventListener('click', hgResetCostForm);
    $('#hgCostList')?.addEventListener('click', e => {
      const ed = e.target.closest('[data-edit-cost]');
      const de = e.target.closest('[data-delete-cost]');
      if (ed) hgEditCost(ed.dataset.editCost);
      if (de) hgDeleteCost(de.dataset.deleteCost);
    });

    $('#hgViewYear')?.addEventListener('click',  () => hgToggleView('year'));
    $('#hgViewMonth')?.addEventListener('click', () => hgToggleView('month'));
    $('#hgCopyButton')?.addEventListener('click', hgCopyText);
    $('#hgPdfButton')?.addEventListener('click',  hgGeneratePdf);

    $('#hgSearch')?.addEventListener('input', hgRenderList);
    $('#hgStatusFilter')?.addEventListener('change', hgRenderList);
    $('#hgList')?.addEventListener('click', e => {
      const o = e.target.closest('[data-open-hg]');
      const u = e.target.closest('[data-duplicate-hg]');
      const d = e.target.closest('[data-delete-hg]');
      if (o) hgOpenPlan(o.dataset.openHg);
      if (u) hgDuplicatePlan(u.dataset.duplicateHg);
      if (d) hgRequestDelete(d.dataset.deleteHg);
    });
    $('#hgList')?.addEventListener('change', e => {
      const s = e.target.closest('[data-status-hg]');
      if (s) hgChangeStatus(s.dataset.statusHg, s.value);
    });
    $('#hgEmptyStartButton')?.addEventListener('click', () => hgNewPlan(false));

    $$('[data-close-hg-modal]').forEach(x => x.addEventListener('click', hgCloseModal));
    $('#hgConfirmDeleteButton')?.addEventListener('click', hgConfirmDelete);
  }

  // ── Init ──────────────────────────────────────────────────────
  function hgInit() {
    if (!$('#hgTool')) return;
    hgBind();
    try {
      const d = JSON.parse(localStorage.getItem(HG_DRAFT_KEY) || 'null');
      if (d && typeof d === 'object') {
        hgState.current = { ...emptyHgPlan(), ...d };
        if (!Array.isArray(hgState.current.units)) hgState.current.units = [];
        if (!Array.isArray(hgState.current.costs)) hgState.current.costs = [];
      }
    } catch {}
    hgSyncState();
    hgRenderList();
    hgSetStep(hgState.step || 1);
    const hintEl = $('#hgCostHint'); if (hintEl) hintEl.style.display = 'none';
  }

  hgInit();

})();

/* ── Gruppierte Navigation: Dropdowns + aktiver Bereich ─────────── */
// Vollständig unabhängig von den Tool-Modulen oben: nur Navigations-Verhalten,
// keine Tool-Funktionen oder geteilten IDs.
(()=>{"use strict";
const groups=[...document.querySelectorAll('[data-nav-group]')];
if(!groups.length)return;

function closeGroup(g){
  g.classList.remove('open');
  const trigger=g.querySelector('[data-nav-toggle]');
  if(trigger)trigger.setAttribute('aria-expanded','false');
}
function closeAllGroups(except){
  groups.forEach(g=>{if(g!==except)closeGroup(g)});
}
function toggleGroup(g){
  const wasOpen=g.classList.contains('open');
  closeAllGroups(g);
  g.classList.toggle('open',!wasOpen);
  const trigger=g.querySelector('[data-nav-toggle]');
  if(trigger)trigger.setAttribute('aria-expanded',String(!wasOpen));
}

groups.forEach(g=>{
  const trigger=g.querySelector('[data-nav-toggle]');
  if(!trigger)return;
  trigger.addEventListener('click',e=>{
    e.stopPropagation();
    toggleGroup(g);
  });
});

document.addEventListener('click',e=>{
  if(!e.target.closest('[data-nav-group]'))closeAllGroups();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeAllGroups();
});
document.querySelectorAll('.nav-panel a').forEach(a=>a.addEventListener('click',()=>closeAllGroups()));
document.getElementById('menuToggle')?.addEventListener('click',()=>closeAllGroups());

/* Aktiven Bereich im Menü hervorheben */
const navTargets=[...document.querySelectorAll('[data-nav-sections]')];
if(navTargets.length&&'IntersectionObserver' in window){
  const sectionMap=new Map();
  navTargets.forEach(el=>{
    (el.dataset.navSections||'').split(/\s+/).filter(Boolean).forEach(id=>{
      if(!sectionMap.has(id))sectionMap.set(id,[]);
      sectionMap.get(id).push(el);
    });
  });
  const sections=[...sectionMap.keys()].map(id=>document.getElementById(id)).filter(Boolean);
  let currentId=null;
  function setCurrent(id){
    if(id===currentId)return;
    currentId=id;
    navTargets.forEach(el=>el.classList.remove('nav-current'));
    (sectionMap.get(id)||[]).forEach(el=>el.classList.add('nav-current'));
  }
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting)setCurrent(entry.target.id);
    });
  },{rootMargin:'-40% 0px -55% 0px',threshold:0});
  sections.forEach(s=>observer.observe(s));
}
})();

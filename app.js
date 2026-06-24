(()=>{"use strict";const STORAGE_KEY="inspectora_projects_v2",DRAFT_KEY="inspectora_current_draft_v2",MAX_PHOTOS_PER_FINDING=4,PHOTO_MAX_DIMENSION=1600,PHOTO_QUALITY=.7;const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const fixBrokenText=value=>{
  if(typeof value!=="string")return value;
  const replacements=[
    ["ÃŸ","ß"],["Ã¤","ä"],["Ã¶","ö"],["Ã¼","ü"],["Ã„","Ä"],["Ã–","Ö"],["Ãœ","Ü"],
    ["Â·","·"],["Â "," "],["â€“","–"],["â€”","—"],["â€ž","„"],["â€œ","“"],["â€˜","‘"],["â€™","’"],
    ["â€¦","…"],["Â©","©"],["Ã©","é"]
  ];
  let result=value;
  for(const [broken,correct] of replacements)result=result.split(broken).join(correct);
  return result;
};
const repairStoredData=value=>{
  if(Array.isArray(value))return value.map(repairStoredData);
  if(value&&typeof value==="object"){
    const repaired={};
    for(const [key,item] of Object.entries(value))repaired[key]=repairStoredData(item);
    return repaired;
  }
  return fixBrokenText(value);
};
const today=()=>new Date().toISOString().slice(0,10);const fmt=v=>v?new Intl.DateTimeFormat("de-DE").format(new Date(v+"T12:00:00")):"Nicht angegeben";const emptyProject=()=>({id:"",name:"",status:"Entwurf",objectType:"",inspectionReason:"",street:"",postalCode:"",city:"",unit:"",inspectionDate:today(),inspectorName:"",projectNote:"",areas:[],findings:[],createdAt:"",updatedAt:""});let projects=[];try{projects=repairStoredData(JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"));if(!Array.isArray(projects))projects=[];projects=projects.map(p=>({...p,findings:(p.findings||[]).map(f=>{const{photoNames,...rest}=f;return{...rest,photos:Array.isArray(f.photos)?f.photos:[]}})}));localStorage.setItem(STORAGE_KEY,JSON.stringify(projects))}catch{projects=[]}const state={step:1,current:emptyProject(),projects,deleteTarget:null,currentPhotos:[]};const refs={menuToggle:$("#menuToggle"),siteNav:$("#siteNav"),toast:$("#toast"),confirmModal:$("#confirmModal"),confirmDeleteButton:$("#confirmDeleteButton"),tool:$("#tool"),projectName:$("#projectName"),objectType:$("#objectType"),inspectionReason:$("#inspectionReason"),street:$("#street"),postalCode:$("#postalCode"),city:$("#city"),unit:$("#unit"),inspectionDate:$("#inspectionDate"),inspectorName:$("#inspectorName"),projectNote:$("#projectNote"),areaCount:$("#areaCount"),selectedAreas:$("#selectedAreas"),customAreaInput:$("#customAreaInput"),addCustomAreaButton:$("#addCustomAreaButton"),findingArea:$("#findingArea"),findingCategory:$("#findingCategory"),findingDescription:$("#findingDescription"),findingPriority:$("#findingPriority"),findingStatus:$("#findingStatus"),findingMeasure:$("#findingMeasure"),findingResponsible:$("#findingResponsible"),findingDeadline:$("#findingDeadline"),findingInternalNote:$("#findingInternalNote"),findingPhotos:$("#findingPhotos"),findingPhotoPreview:$("#findingPhotoPreview"),editingFindingId:$("#editingFindingId"),findingForm:$("#findingForm"),resetFindingButton:$("#resetFindingButton"),findingFilter:$("#findingFilter"),findingList:$("#findingList"),findingCount:$("#findingCount"),reportProjectName:$("#reportProjectName"),reportObjectMeta:$("#reportObjectMeta"),reportProjectId:$("#reportProjectId"),reportAreaTotal:$("#reportAreaTotal"),reportFindingTotal:$("#reportFindingTotal"),reportHighTotal:$("#reportHighTotal"),reportDoneTotal:$("#reportDoneTotal"),reportDetails:$("#reportDetails"),reportAreas:$("#reportAreas"),reportFindings:$("#reportFindings"),projectSearch:$("#projectSearch"),projectStatusFilter:$("#projectStatusFilter"),projectList:$("#projectList"),totalProjects:$("#totalProjects"),activeProjects:$("#activeProjects"),openFindings:$("#openFindings"),highFindings:$("#highFindings")};
function toast(msg){refs.toast.textContent=msg;refs.toast.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>refs.toast.classList.remove("show"),2600)}function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state.projects));return true}catch{toast("Speicher voll – bitte Bilder verkleinern oder entfernen und erneut speichern.");return false}}function saveDraft(){syncForm();try{localStorage.setItem(DRAFT_KEY,JSON.stringify(state.current))}catch{}}function projectId(){const y=new Date().getFullYear();const nums=state.projects.map(p=>Number(String(p.id).split("-").pop())).filter(Number.isFinite);return`IN-${y}-${String((nums.length?Math.max(...nums):0)+1).padStart(3,"0")}`}function findingId(){return`F-${Date.now()}-${Math.random().toString(16).slice(2,7)}`}function goTool(){refs.tool.scrollIntoView({behavior:"smooth",block:"start"})}
function setStep(n){state.step=Number(n);$$('.tool-step').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===state.step));$$('.tool-panel').forEach(p=>p.classList.toggle('active',Number(p.dataset.panel)===state.step));if(state.step===4){syncForm();renderReport()}saveDraft()}function validate(n){if(Number(n)===1){syncForm();if(!state.current.name){toast("Bitte einen Projektnamen eintragen.");refs.projectName.focus();return false}if(!state.current.objectType){toast("Bitte eine Objektart ausw\u00e4hlen.");return false}if(!state.current.inspectionReason){toast("Bitte den Anlass ausw\u00e4hlen.");return false}}if(Number(n)===2&&!state.current.areas.length){toast("Bitte mindestens einen Bereich ausw\u00e4hlen.");return false}return true}
function syncForm(){Object.assign(state.current,{name:refs.projectName.value.trim(),objectType:refs.objectType.value,inspectionReason:refs.inspectionReason.value,street:refs.street.value.trim(),postalCode:refs.postalCode.value.trim(),city:refs.city.value.trim(),unit:refs.unit.value.trim(),inspectionDate:refs.inspectionDate.value,inspectorName:refs.inspectorName.value.trim(),projectNote:refs.projectNote.value.trim()})}function syncState(){refs.projectName.value=state.current.name||"";refs.objectType.value=state.current.objectType||"";refs.inspectionReason.value=state.current.inspectionReason||"";refs.street.value=state.current.street||"";refs.postalCode.value=state.current.postalCode||"";refs.city.value=state.current.city||"";refs.unit.value=state.current.unit||"";refs.inspectionDate.value=state.current.inspectionDate||today();refs.inspectorName.value=state.current.inspectorName||"";refs.projectNote.value=state.current.projectNote||"";state.currentPhotos=[];renderPhotoPreview();renderAreas();renderFindings();renderReport()}
function addArea(name){const clean=name.trim();if(!clean)return;if(state.current.areas.some(a=>a.toLowerCase()===clean.toLowerCase())){toast("Dieser Bereich ist bereits enthalten.");return}state.current.areas.push(clean);renderAreas();saveDraft()}function removeArea(name){if(state.current.findings.some(f=>f.area===name)){toast("Der Bereich wird noch von einer Feststellung verwendet.");return}state.current.areas=state.current.areas.filter(a=>a!==name);renderAreas();saveDraft()}function renderAreas(){refs.areaCount.textContent=`${state.current.areas.length} ${state.current.areas.length===1?"Bereich":"Bereiche"}`;$$('#quickAreaGrid button').forEach(b=>b.classList.toggle('selected',state.current.areas.includes(b.dataset.area)));refs.selectedAreas.innerHTML=state.current.areas.length?state.current.areas.map(a=>`<span class="area-chip">${esc(a)}<button type="button" data-remove-area="${esc(a)}" aria-label="${esc(a)} entfernen">\u00d7</button></span>`).join(""):`<div class="empty-state compact"><strong>Noch keine Bereiche ausgew\u00e4hlt</strong><p>W\u00e4hle oben die passenden Bereiche aus.</p></div>`;refs.findingArea.innerHTML=state.current.areas.length?`<option value="">Bereich ausw\u00e4hlen</option>${state.current.areas.map(a=>`<option>${esc(a)}</option>`).join("")}`:`<option value="">Bitte zuerst Bereiche anlegen</option>`}
function resetFinding(){refs.findingForm.reset();refs.findingPriority.value="Mittel";refs.findingStatus.value="Offen";refs.editingFindingId.value="";state.currentPhotos=[];renderPhotoPreview()}function findingFromForm(){return{id:refs.editingFindingId.value||findingId(),area:refs.findingArea.value,category:refs.findingCategory.value,description:refs.findingDescription.value.trim(),priority:refs.findingPriority.value,status:refs.findingStatus.value,measure:refs.findingMeasure.value.trim(),responsible:refs.findingResponsible.value.trim(),deadline:refs.findingDeadline.value,internalNote:refs.findingInternalNote.value.trim(),photos:[...state.currentPhotos]}}function renderFindings(){refs.findingCount.textContent=`${state.current.findings.length} ${state.current.findings.length===1?"Feststellung":"Feststellungen"}`;const filter=refs.findingFilter.value;const list=state.current.findings.filter(f=>filter==="Alle"||f.priority===filter);if(!list.length){refs.findingList.innerHTML=`<div class="empty-state"><strong>${state.current.findings.length?"Keine passenden Punkte":"Noch keine Feststellungen"}</strong><p>${state.current.findings.length?"Passe den Filter an.":"Erfasse links den ersten Punkt."}</p></div>`;return}refs.findingList.innerHTML=list.map(f=>{const c=f.priority==="Hoch"?"high":f.priority==="Mittel"?"medium":"low";return`<article class="finding-card"><div class="finding-card-top"><div><span class="finding-area">${esc(f.area)}</span><h4>${esc(f.description)}</h4></div><span class="priority-label ${c}">${esc(f.priority)}</span></div>${f.measure?`<p><strong>Ma\u00dfnahme:</strong> ${esc(f.measure)}</p>`:""}<div class="finding-meta"><span>${esc(f.category)}</span><span>${esc(f.status)}</span>${f.responsible?`<span>${esc(f.responsible)}</span>`:""}${f.deadline?`<span>Frist: ${fmt(f.deadline)}</span>`:""}${f.photos?.length?`<span>${f.photos.length} Bild${f.photos.length===1?"":"er"}</span>`:""}</div><div class="finding-card-actions"><button type="button" data-edit-finding="${esc(f.id)}">Bearbeiten</button><button type="button" data-delete-finding="${esc(f.id)}">L\u00f6schen</button></div></article>`}).join("")}
function editFinding(id){const f=state.current.findings.find(x=>x.id===id);if(!f)return;refs.findingArea.value=f.area;refs.findingCategory.value=f.category;refs.findingDescription.value=f.description;refs.findingPriority.value=f.priority;refs.findingStatus.value=f.status;refs.findingMeasure.value=f.measure;refs.findingResponsible.value=f.responsible;refs.findingDeadline.value=f.deadline;refs.findingInternalNote.value=f.internalNote;refs.editingFindingId.value=f.id;state.currentPhotos=(f.photos||[]).map(photo=>({...photo}));renderPhotoPreview();refs.findingDescription.focus()}function deleteFinding(id){state.current.findings=state.current.findings.filter(f=>f.id!==id);renderFindings();renderReport();saveDraft();toast("Feststellung gel\u00f6scht.")}
function renderReport(){const p=state.current,loc=[p.street,[p.postalCode,p.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),high=p.findings.filter(f=>f.priority==="Hoch").length,done=p.findings.filter(f=>f.status==="Erledigt").length;refs.reportProjectName.textContent=p.name||"Neues Objektprojekt";refs.reportObjectMeta.textContent=[p.objectType,loc,p.unit].filter(Boolean).join(" \u00b7 ")||"Noch keine Objektdaten eingetragen";refs.reportProjectId.textContent=p.id||"Entwurf";refs.reportAreaTotal.textContent=p.areas.length;refs.reportFindingTotal.textContent=p.findings.length;refs.reportHighTotal.textContent=high;refs.reportDoneTotal.textContent=done;const details=[["Objektart",p.objectType],["Anlass",p.inspectionReason],["Adresse",loc],["Einheit / Geb\u00e4udeteil",p.unit],["Aufnahmedatum",p.inspectionDate?fmt(p.inspectionDate):""],["Bearbeitende Person",p.inspectorName],["Ausgangslage",p.projectNote]].filter(([,v])=>v);refs.reportDetails.innerHTML=details.length?details.map(([l,v])=>`<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join(""):`<div><dt>Hinweis</dt><dd>Noch keine Angaben vorhanden.</dd></div>`;refs.reportAreas.innerHTML=p.areas.length?p.areas.map(a=>`<span>${esc(a)}</span>`).join(""):`<span>Noch keine Bereiche ausgew\u00e4hlt</span>`;refs.reportFindings.innerHTML=p.findings.length?p.findings.map(f=>`<article class="report-finding"><div class="report-finding-aside"><strong>${esc(f.area)}</strong><span>${esc(f.priority)} \u00b7 ${esc(f.status)}</span></div><div class="report-finding-main"><h5>${esc(f.description)}</h5>${f.measure?`<p>${esc(f.measure)}</p>`:""}<dl><div><dt>Kategorie</dt><dd>${esc(f.category)}</dd></div><div><dt>Zust\u00e4ndigkeit</dt><dd>${esc(f.responsible||"Offen")}</dd></div><div><dt>Frist</dt><dd>${esc(f.deadline?fmt(f.deadline):"Nicht festgelegt")}</dd></div></dl>${f.photos?.length?`<div class="report-finding-photos">${f.photos.map(ph=>`<img src="${ph.dataUrl}" alt="${esc(ph.name)}">`).join("")}</div>`:""}</div></article>`).join(""):`<div class="empty-state compact"><strong>Noch keine Feststellungen</strong><p>Erfasste Punkte erscheinen hier automatisch.</p></div>`}
function saveCurrent(){syncForm();if(!validate(1))return false;const now=new Date().toISOString();if(!state.current.id){state.current.id=projectId();state.current.createdAt=now}state.current.updatedAt=now;const i=state.projects.findIndex(p=>p.id===state.current.id),copy=JSON.parse(JSON.stringify(state.current));if(i>=0)state.projects[i]=copy;else state.projects.unshift(copy);if(!persist())return false;localStorage.setItem(DRAFT_KEY,JSON.stringify(state.current));renderProjects();renderReport();toast(`Projekt ${state.current.id} gespeichert.`);return true}function newProject(confirmReset=true){const has=state.current.name||state.current.areas.length||state.current.findings.length;if(confirmReset&&has&&!window.confirm("Aktuellen Entwurf verwerfen und ein neues Projekt beginnen?"))return;state.current=emptyProject();syncState();resetFinding();setStep(1);localStorage.removeItem(DRAFT_KEY);goTool();toast("Neues Projekt gestartet.")}function openProject(id){const p=state.projects.find(x=>x.id===id);if(!p)return;state.current=JSON.parse(JSON.stringify(p));syncState();setStep(1);localStorage.setItem(DRAFT_KEY,JSON.stringify(state.current));goTool();toast(`${id} ge\u00f6ffnet.`)}function duplicateProject(id){const p=state.projects.find(x=>x.id===id);if(!p)return;const c=JSON.parse(JSON.stringify(p));c.id=projectId();c.name+=` \u2013 Kopie`;c.status="Entwurf";c.createdAt=c.updatedAt=new Date().toISOString();c.findings=c.findings.map(f=>({...f,id:findingId()}));state.projects.unshift(c);persist();renderProjects();toast(`Projekt als ${c.id} dupliziert.`)}function requestDelete(id){state.deleteTarget=id;refs.confirmModal.classList.add("open");refs.confirmModal.setAttribute("aria-hidden","false");document.body.classList.add("modal-open")}function closeModal(){state.deleteTarget=null;refs.confirmModal.classList.remove("open");refs.confirmModal.setAttribute("aria-hidden","true");document.body.classList.remove("modal-open")}function confirmDelete(){if(!state.deleteTarget)return;state.projects=state.projects.filter(p=>p.id!==state.deleteTarget);if(state.current.id===state.deleteTarget){state.current=emptyProject();syncState();localStorage.removeItem(DRAFT_KEY)}persist();renderProjects();closeModal();toast("Projekt gel\u00f6scht.")}function changeStatus(id,status){const p=state.projects.find(x=>x.id===id);if(!p)return;p.status=status;p.updatedAt=new Date().toISOString();if(state.current.id===id)state.current.status=status;persist();renderProjects();toast(`Status auf \u201e${status}\u201c gesetzt.`)}
function renderProjects(){const q=refs.projectSearch.value.trim().toLowerCase(),status=refs.projectStatusFilter.value,filtered=state.projects.filter(p=>[p.id,p.name,p.objectType,p.city,p.street].join(" ").toLowerCase().includes(q)&&(status==="Alle"||p.status===status)),all=state.projects.flatMap(p=>p.findings||[]);refs.totalProjects.textContent=state.projects.length;refs.activeProjects.textContent=state.projects.filter(p=>p.status==="In Bearbeitung"||p.status==="Zur Pr\u00fcfung").length;refs.openFindings.textContent=all.filter(f=>f.status!=="Erledigt").length;refs.highFindings.textContent=all.filter(f=>f.priority==="Hoch"&&f.status!=="Erledigt").length;if(!filtered.length){refs.projectList.innerHTML=`<div class="empty-state large"><strong>${state.projects.length?"Keine passenden Projekte gefunden":"Noch keine Projekte gespeichert"}</strong><p>${state.projects.length?"Passe Suche oder Filter an.":"Starte oben eine Objektaufnahme oder lade das Demoprojekt."}</p>${state.projects.length?"":`<button class="button primary" id="dynamicEmptyStartButton" type="button">Erstes Projekt anlegen</button>`}</div>`;$("#dynamicEmptyStartButton")?.addEventListener("click",()=>newProject(false));return}refs.projectList.innerHTML=filtered.map(p=>{const open=(p.findings||[]).filter(f=>f.status!=="Erledigt").length,high=(p.findings||[]).filter(f=>f.priority==="Hoch"&&f.status!=="Erledigt").length,loc=[p.postalCode,p.city].filter(Boolean).join(" ");return`<article class="project-card"><div class="project-card-top"><div><span class="project-id">${esc(p.id)}</span><h3>${esc(p.name)}</h3><p>${esc([p.objectType,loc,p.unit].filter(Boolean).join(" \u00b7 ")||"Keine weiteren Objektdaten")}</p></div><span class="status-badge">${esc(p.status)}</span></div><div class="project-card-meta"><div><span>Bereiche</span><strong>${p.areas?.length||0}</strong></div><div><span>Offen</span><strong>${open}</strong></div><div><span>Hoch</span><strong>${high}</strong></div></div><div class="project-card-actions"><button type="button" data-open-project="${esc(p.id)}">\u00d6ffnen</button><button type="button" data-duplicate-project="${esc(p.id)}">Duplizieren</button><select data-status-project="${esc(p.id)}" aria-label="Projektstatus \u00e4ndern">${["Entwurf","In Bearbeitung","Zur Pr\u00fcfung","Abgeschlossen"].map(o=>`<option ${p.status===o?"selected":""}>${o}</option>`).join("")}</select><button type="button" data-delete-project="${esc(p.id)}">L\u00f6schen</button></div></article>`}).join("")}
function loadDemo(){const p={id:projectId(),name:"Objektkontrolle Mehrfamilienhaus Moers",status:"In Bearbeitung",objectType:"Mehrfamilienhaus",inspectionReason:"Regelm\u00e4\u00dfige Objektkontrolle",street:"Beispielstra\u00dfe 18",postalCode:"47441",city:"Moers",unit:"Gesamtobjekt",inspectionDate:today(),inspectorName:"Max Mustermann",projectNote:"Kontrollgang durch Gemeinschaftsfl\u00e4chen und technische Nebenbereiche.",areas:["Au\u00dfenbereich","Hauseingang","Treppenhaus","Keller","Technikraum","Gemeinschaftsfl\u00e4che"],findings:[{id:findingId(),area:"Keller",category:"Feuchtigkeit",description:"Feuchte Verf\u00e4rbung an der Au\u00dfenwand im Bereich Kellerraum 4.",priority:"Hoch",status:"Pr\u00fcfung erforderlich",measure:"Ursache kurzfristig durch ein Fachunternehmen pr\u00fcfen lassen und Bereich bis dahin beobachten.",responsible:"Technische Verwaltung",deadline:new Date(Date.now()+7*86400000).toISOString().slice(0,10),internalNote:"Vergleichsfoto beim n\u00e4chsten Termin aufnehmen.",photos:[]},{id:findingId(),area:"Hauseingang",category:"Technik",description:"T\u00fcrschlie\u00dfer zieht die Hauseingangst\u00fcr nicht vollst\u00e4ndig ins Schloss.",priority:"Mittel",status:"Beauftragung vorgesehen",measure:"T\u00fcrschlie\u00dfer nachstellen und Schlie\u00dfvorgang pr\u00fcfen.",responsible:"Hausmeisterdienst",deadline:"",internalNote:"",photos:[]},{id:findingId(),area:"Au\u00dfenbereich",category:"Allgemeiner Zustand",description:"Beschilderung f\u00fcr die M\u00fcllstandpl\u00e4tze ist teilweise nicht mehr lesbar.",priority:"Niedrig",status:"Offen",measure:"Beschriftung bei n\u00e4chster regul\u00e4rer Bestellung erneuern.",responsible:"Objektbetreuung",deadline:"",internalNote:"",photos:[]}],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};state.projects.unshift(p);persist();state.current=JSON.parse(JSON.stringify(p));syncState();renderProjects();setStep(4);goTool();toast("Demoprojekt wurde geladen.")}
function copySummary(){syncForm();const p=state.current,lines=[`${p.name||"Inspectora-Projekt"} (${p.id||"Entwurf"})`,[p.objectType,p.street,p.postalCode,p.city].filter(Boolean).join(" \u00b7 "),`Anlass: ${p.inspectionReason||"Nicht angegeben"}`,`Bereiche: ${p.areas.join(", ")||"Keine"}`,"",...p.findings.map((f,i)=>`${i+1}. ${f.area} \u2013 ${f.description} | Priorit\u00e4t: ${f.priority} | Status: ${f.status}${f.measure?` | Ma\u00dfnahme: ${f.measure}`:""}`)];navigator.clipboard.writeText(lines.join("\n")).then(()=>toast("Kurzfassung kopiert.")).catch(()=>toast("Kopieren wurde vom Browser nicht erlaubt."))}
function bind(){refs.menuToggle.addEventListener("click",()=>{const o=refs.siteNav.classList.toggle("open");refs.menuToggle.classList.toggle("active",o);refs.menuToggle.setAttribute("aria-expanded",String(o));document.body.classList.toggle("menu-open",o)});$$('#siteNav a').forEach(a=>a.addEventListener("click",()=>{refs.siteNav.classList.remove("open");refs.menuToggle.classList.remove("active");document.body.classList.remove("menu-open")}));["#navStartProject","#heroStartProject","#emptyStartButton"].forEach(s=>$(s)?.addEventListener("click",()=>{goTool();setStep(1)}));$("#loadDemoButton").addEventListener("click",loadDemo);$("#newProjectButton").addEventListener("click",()=>newProject(true));$("#saveProjectButton").addEventListener("click",saveCurrent);$("#finishAndSaveButton").addEventListener("click",()=>{if(saveCurrent())$("#projekte").scrollIntoView({behavior:"smooth"})});$$('.tool-step').forEach(b=>b.addEventListener("click",()=>setStep(b.dataset.step)));$$('.next-step').forEach(b=>b.addEventListener("click",()=>{if(validate(state.step))setStep(b.dataset.next)}));$$('.previous-step').forEach(b=>b.addEventListener("click",()=>setStep(b.dataset.previous)));$$('#quickAreaGrid button').forEach(b=>b.addEventListener("click",()=>state.current.areas.includes(b.dataset.area)?removeArea(b.dataset.area):addArea(b.dataset.area)));refs.addCustomAreaButton.addEventListener("click",()=>{addArea(refs.customAreaInput.value);refs.customAreaInput.value=""});refs.customAreaInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();refs.addCustomAreaButton.click()}});refs.selectedAreas.addEventListener("click",e=>{const b=e.target.closest("[data-remove-area]");if(b)removeArea(b.dataset.removeArea)});refs.findingForm.addEventListener("submit",e=>{e.preventDefault();const f=findingFromForm();if(!f.area){toast("Bitte einen Bereich ausw\u00e4hlen.");return}if(!f.description){toast("Bitte eine Feststellung beschreiben.");return}const i=state.current.findings.findIndex(x=>x.id===f.id);if(i>=0){state.current.findings[i]=f;toast("Feststellung aktualisiert.")}else{state.current.findings.push(f);toast("Feststellung \u00fcbernommen.")}resetFinding();renderFindings();renderReport();saveDraft()});refs.resetFindingButton.addEventListener("click",resetFinding);refs.findingFilter.addEventListener("change",renderFindings);refs.findingList.addEventListener("click",e=>{const a=e.target.closest("[data-edit-finding]"),d=e.target.closest("[data-delete-finding]");if(a)editFinding(a.dataset.editFinding);if(d)deleteFinding(d.dataset.deleteFinding)});refs.findingPhotos.addEventListener("change",()=>handlePhotoFiles(refs.findingPhotos.files));refs.findingPhotoPreview.addEventListener("click",e=>{const b=e.target.closest("[data-remove-photo]");if(b)removePhoto(b.dataset.removePhoto)});$("#printReportButton").addEventListener("click",generatePdf);$("#copySummaryButton").addEventListener("click",copySummary);refs.projectSearch.addEventListener("input",renderProjects);refs.projectStatusFilter.addEventListener("change",renderProjects);refs.projectList.addEventListener("click",e=>{const o=e.target.closest("[data-open-project]"),u=e.target.closest("[data-duplicate-project]"),d=e.target.closest("[data-delete-project]");if(o)openProject(o.dataset.openProject);if(u)duplicateProject(u.dataset.duplicateProject);if(d)requestDelete(d.dataset.deleteProject)});refs.projectList.addEventListener("change",e=>{const s=e.target.closest("[data-status-project]");if(s)changeStatus(s.dataset.statusProject,s.value)});$$('[data-close-modal]').forEach(x=>x.addEventListener("click",closeModal));refs.confirmDeleteButton.addEventListener("click",confirmDelete);[refs.projectName,refs.objectType,refs.inspectionReason,refs.street,refs.postalCode,refs.city,refs.unit,refs.inspectionDate,refs.inspectorName,refs.projectNote].forEach(el=>{el.addEventListener("input",saveDraft);el.addEventListener("change",saveDraft)})}

function initHeaderScroll(){
  const header=document.querySelector(".site-header");
  if(!header)return;
  const update=()=>header.classList.toggle("scrolled",window.scrollY>24);
  update();
  window.addEventListener("scroll",update,{passive:true});
}

function initServiceMap(){
  const mapElement=document.getElementById("map");
  if(!mapElement||typeof L==="undefined")return;

  const map=L.map(mapElement,{
    scrollWheelZoom:false,
    zoomControl:true
  }).setView([51.445,6.61],9);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    attribution:"\u00a9 OpenStreetMap contributors",
    maxZoom:19
  }).addTo(map);

  const center=[51.466,6.58];

  L.circle(center,{
    radius:22000,
    color:"#2457d6",
    weight:2,
    fillColor:"#2457d6",
    fillOpacity:.15
  }).addTo(map).bindPopup("<strong>Inspectora Kerngebiet</strong><br>Moers, Kamp-Lintfort und Umgebung");

  L.circle(center,{
    radius:50000,
    color:"#1f8a70",
    weight:2,
    dashArray:"8 8",
    fillColor:"#1f8a70",
    fillOpacity:.06
  }).addTo(map).bindPopup("<strong>Erweiterter Radius</strong><br>Je nach Auftrag und Termin");

  const cities=[
    ["Moers",51.4516,6.6263],
    ["Kamp-Lintfort",51.4958,6.5321],
    ["Neukirchen-Vluyn",51.4412,6.5538],
    ["Rheinberg",51.5465,6.5952],
    ["Duisburg",51.4344,6.7623],
    ["Krefeld",51.3388,6.5853],
    ["Wesel",51.6571,6.6174],
    ["Geldern",51.5191,6.3236]
  ];

  cities.forEach(([name,lat,lng])=>{
    L.marker([lat,lng],{
      icon:L.divIcon({
        className:"",
        html:'<div class="city-marker">\u25cf</div>',
        iconSize:[28,28],
        iconAnchor:[14,14],
        popupAnchor:[0,-14]
      })
    }).addTo(map).bindPopup(`<strong>${name}</strong>`);
  });

  L.marker(center).addTo(map).bindPopup("<strong>Inspectora</strong><br>Ausgangspunkt Moers / Kamp-Lintfort").openPopup();

  setTimeout(()=>map.invalidateSize(),250);
}

function compressImage(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(reader.error);
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("Bild konnte nicht gelesen werden."));
      img.onload=()=>{
        let width=img.naturalWidth,height=img.naturalHeight;
        if(width>PHOTO_MAX_DIMENSION||height>PHOTO_MAX_DIMENSION){
          const scale=PHOTO_MAX_DIMENSION/Math.max(width,height);
          width=Math.round(width*scale);
          height=Math.round(height*scale);
        }
        const canvas=document.createElement("canvas");
        canvas.width=width;
        canvas.height=height;
        canvas.getContext("2d").drawImage(img,0,0,width,height);
        const dataUrl=canvas.toDataURL("image/jpeg",PHOTO_QUALITY);
        resolve({id:`P-${Date.now()}-${Math.random().toString(16).slice(2,7)}`,name:file.name,dataUrl,width,height,size:dataUrl.length});
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhotoFiles(fileList){
  const files=[...fileList].filter(file=>file.type.startsWith("image/"));
  if(!files.length)return;
  const free=MAX_PHOTOS_PER_FINDING-state.currentPhotos.length;
  if(free<=0){
    toast(`Maximal ${MAX_PHOTOS_PER_FINDING} Bilder pro Feststellung.`);
    refs.findingPhotos.value="";
    return;
  }
  const toProcess=files.slice(0,free);
  if(files.length>free)toast(`Nur ${free} weitere(s) Bild(er) wurden übernommen (max. ${MAX_PHOTOS_PER_FINDING}).`);
  for(const file of toProcess){
    try{
      state.currentPhotos.push(await compressImage(file));
    }catch{
      toast(`„${file.name}“ konnte nicht verarbeitet werden.`);
    }
  }
  refs.findingPhotos.value="";
  renderPhotoPreview();
}

function renderPhotoPreview(){
  refs.findingPhotoPreview.innerHTML=state.currentPhotos.length
    ?state.currentPhotos.map(p=>`<div class="photo-thumb"><img src="${p.dataUrl}" alt="${esc(p.name)}"><button type="button" data-remove-photo="${esc(p.id)}" aria-label="${esc(p.name)} entfernen">×</button></div>`).join("")
    :`<p class="photo-empty">Noch keine Bilder ausgewählt (max. ${MAX_PHOTOS_PER_FINDING}).</p>`;
}

function removePhoto(id){
  state.currentPhotos=state.currentPhotos.filter(p=>p.id!==id);
  renderPhotoPreview();
}

function priorityRgb(priority){
  if(priority==="Hoch")return[196,60,80];
  if(priority==="Mittel")return[167,99,0];
  return[20,121,90];
}

function photoGridLayout(maxWidth){
  const box=28,gap=4;
  const perRow=Math.max(1,Math.floor((maxWidth+gap)/(box+gap)));
  return{box,gap,perRow};
}

function drawPhotoGrid(doc,photos,x,y,maxWidth){
  const{box,gap,perRow}=photoGridLayout(maxWidth);
  photos.forEach((photo,i)=>{
    const col=i%perRow,row=Math.floor(i/perRow);
    const boxX=x+col*(box+gap),boxY=y+row*(box+gap);
    const ratio=Math.min(box/photo.width,box/photo.height,1);
    const w=photo.width*ratio,h=photo.height*ratio;
    doc.setDrawColor(220,228,238);
    doc.roundedRect(boxX,boxY,box,box,1.5,1.5);
    try{doc.addImage(photo.dataUrl,"JPEG",boxX+(box-w)/2,boxY+(box-h)/2,w,h)}catch{}
  });
  const rows=Math.ceil(photos.length/perRow);
  return rows*(box+gap)-gap;
}

function generatePdf(){
  if(typeof window.jspdf==="undefined"){
    toast("PDF-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen.");
    return;
  }
  syncForm();
  renderReport();
  const p=state.current;
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"mm",format:"a4"});
  const pageW=doc.internal.pageSize.getWidth();
  const pageH=doc.internal.pageSize.getHeight();
  const marginX=16,contentW=pageW-marginX*2,headerH=24,footerH=14;
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
    doc.text(p.name||"Objektprojekt",marginX+13,18);
    doc.text(`Projekt-ID: ${p.id||"Entwurf"}`,pageW-marginX,11,{align:"right"});
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
    const lines=doc.splitTextToSize("Diese Übersicht dient der strukturierten Dokumentation. Sie ersetzt keine technische Begutachtung oder fachliche Prüfung.",contentW);
    lines.forEach((line,i)=>doc.text(line,marginX,pageH-9+i*3.4));
  }

  function newPage(){
    drawFooter();
    doc.addPage();
    pageNum++;
    drawHeader();
    cursorY=headerH+10;
  }

  function ensureSpace(h){
    if(cursorY+h>pageH-footerH-4)newPage();
  }

  drawHeader();
  cursorY=headerH+10;

  doc.setFont("helvetica","bold");
  doc.setFontSize(16);
  doc.setTextColor(16,32,57);
  doc.text(p.name||"Neues Objektprojekt",marginX,cursorY);
  cursorY+=7;

  doc.setFont("helvetica","normal");
  doc.setFontSize(9);
  doc.setTextColor(90,100,120);
  const loc=[p.street,[p.postalCode,p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  doc.text([p.objectType,loc,p.unit].filter(Boolean).join("   ·   ")||"Noch keine Objektdaten eingetragen",marginX,cursorY);
  cursorY+=10;

  const stats=[["Bereiche",p.areas.length],["Feststellungen",p.findings.length],["Hohe Priorität",p.findings.filter(f=>f.priority==="Hoch").length],["Erledigt",p.findings.filter(f=>f.status==="Erledigt").length]];
  const statGap=4,boxW=(contentW-statGap*3)/4;
  stats.forEach(([label,val],i)=>{
    const x=marginX+i*(boxW+statGap);
    doc.setFillColor(238,243,250);
    doc.roundedRect(x,cursorY,boxW,16,2,2,"F");
    doc.setFont("helvetica","bold");
    doc.setFontSize(13);
    doc.setTextColor(16,32,57);
    doc.text(String(val),x+4,cursorY+9);
    doc.setFont("helvetica","normal");
    doc.setFontSize(7);
    doc.setTextColor(110,120,140);
    doc.text(label,x+4,cursorY+13.5);
  });
  cursorY+=16+10;

  const details=[["Anlass",p.inspectionReason],["Aufnahmedatum",p.inspectionDate?fmt(p.inspectionDate):""],["Bearbeitende Person",p.inspectorName],["Ausgangslage",p.projectNote]].filter(([,v])=>v);
  if(details.length){
    ensureSpace(8);
    doc.setFont("helvetica","bold");
    doc.setFontSize(11);
    doc.setTextColor(16,32,57);
    doc.text("Objekt und Anlass",marginX,cursorY);
    cursorY+=6;
    details.forEach(([label,value])=>{
      const valueLines=doc.splitTextToSize(String(value),contentW-38);
      ensureSpace(Math.max(5,valueLines.length*4.4)+1.5);
      doc.setFont("helvetica","bold");
      doc.setFontSize(8);
      doc.setTextColor(110,120,140);
      doc.text(`${label}:`,marginX,cursorY);
      doc.setFont("helvetica","normal");
      doc.setFontSize(9);
      doc.setTextColor(40,48,64);
      valueLines.forEach((line,i)=>doc.text(line,marginX+38,cursorY+i*4.4));
      cursorY+=Math.max(5,valueLines.length*4.4)+1.5;
    });
    cursorY+=4;
  }

  if(p.areas.length){
    ensureSpace(8);
    doc.setFont("helvetica","bold");
    doc.setFontSize(11);
    doc.setTextColor(16,32,57);
    doc.text("Bereiche",marginX,cursorY);
    cursorY+=6;
    doc.setFont("helvetica","normal");
    doc.setFontSize(8);
    doc.setTextColor(40,48,64);
    let x=marginX;
    p.areas.forEach(area=>{
      const w=doc.getTextWidth(area)+6;
      if(x+w>marginX+contentW){
        x=marginX;
        cursorY+=8;
        ensureSpace(8);
      }
      doc.setFillColor(232,240,255);
      doc.roundedRect(x,cursorY-4.5,w,7,3,3,"F");
      doc.text(area,x+3,cursorY);
      x+=w+3;
    });
    cursorY+=12;
  }

  ensureSpace(10);
  doc.setFont("helvetica","bold");
  doc.setFontSize(13);
  doc.setTextColor(16,32,57);
  doc.text("Feststellungen und Maßnahmen",marginX,cursorY);
  cursorY+=8;

  if(!p.findings.length){
    ensureSpace(8);
    doc.setFont("helvetica","normal");
    doc.setFontSize(9);
    doc.setTextColor(110,120,140);
    doc.text("Noch keine Feststellungen erfasst.",marginX,cursorY);
    cursorY+=8;
  }

  p.findings.forEach(f=>{
    const lineH=4.4;
    doc.setFont("helvetica","bold");
    doc.setFontSize(10);
    const descLines=doc.splitTextToSize(f.description||"",contentW);
    doc.setFont("helvetica","normal");
    doc.setFontSize(9);
    const measureLines=f.measure?doc.splitTextToSize(`Maßnahme: ${f.measure}`,contentW):[];
    const{box,gap,perRow}=photoGridLayout(contentW);
    const photosRows=f.photos?.length?Math.ceil(f.photos.length/perRow):0;
    const photosH=photosRows?photosRows*(box+gap):0;
    const blockH=11+descLines.length*lineH+(measureLines.length?measureLines.length*lineH+2:0)+6+photosH+8;

    if(cursorY+blockH>pageH-footerH-4)newPage();

    doc.setDrawColor(225,231,240);
    doc.line(marginX,cursorY,marginX+contentW,cursorY);
    cursorY+=6;

    doc.setFont("helvetica","bold");
    doc.setFontSize(8);
    const[r,g,b]=priorityRgb(f.priority);
    doc.setTextColor(r,g,b);
    doc.text(`${f.priority.toUpperCase()} · ${f.status}`,marginX,cursorY);
    doc.setTextColor(140,150,165);
    doc.text(f.area,marginX+contentW,cursorY,{align:"right"});
    cursorY+=5;

    doc.setFont("helvetica","bold");
    doc.setFontSize(10);
    doc.setTextColor(16,32,57);
    descLines.forEach((line,i)=>doc.text(line,marginX,cursorY+i*lineH));
    cursorY+=descLines.length*lineH+1.5;

    if(measureLines.length){
      doc.setFont("helvetica","normal");
      doc.setFontSize(9);
      doc.setTextColor(70,80,100);
      measureLines.forEach((line,i)=>doc.text(line,marginX,cursorY+i*lineH));
      cursorY+=measureLines.length*lineH+1.5;
    }

    doc.setFont("helvetica","normal");
    doc.setFontSize(8);
    doc.setTextColor(110,120,140);
    const metaParts=[`Kategorie: ${f.category}`,`Zuständigkeit: ${f.responsible||"Offen"}`,`Frist: ${f.deadline?fmt(f.deadline):"Nicht festgelegt"}`];
    doc.text(metaParts.join("   ·   "),marginX,cursorY);
    cursorY+=6;

    if(f.photos?.length){
      cursorY+=drawPhotoGrid(doc,f.photos,marginX,cursorY,contentW)+4;
    }
    cursorY+=4;
  });

  drawFooter();
  doc.save(`Inspectora-${p.id||"Entwurf"}-${today()}.pdf`);
  toast("PDF wurde erstellt.");
}

function init(){bind();initHeaderScroll();initServiceMap();try{const d=repairStoredData(JSON.parse(localStorage.getItem(DRAFT_KEY)||"null"));if(d&&typeof d==="object"){state.current={...emptyProject(),...d};localStorage.setItem(DRAFT_KEY,JSON.stringify(state.current))}}catch{}syncState();renderProjects();setStep(1)}init()})();

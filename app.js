(()=>{"use strict";
// Nur geteilte Website-Chrome: Mobil-Menü und Header-Scroll.
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

// Wissensbasis-Zahl im Inspector-Panel. Holt die tatsächliche Anzahl der
// Paragraphen aus der Netlify Function, damit die Angabe nicht veraltet.
// Ohne JavaScript oder bei einem Fehler bleibt der Fallback-Text aus dem HTML
// stehen – der ist bewusst ohne Zahl formuliert und deshalb auch dann richtig.
// Grundsatz: lieber ungenauer als eine Zahl, die nicht belegt ist.
//
// Bewusst ein eigener Block: Die $-Helfer weiter oben sind nur in ihrem eigenen
// IIFE sichtbar. Deshalb hier nichts von außen nutzen.
(()=>{"use strict";
const kbCount=document.getElementById("kbCount");
if(!kbCount)return;

fetch("/.netlify/functions/wissensbasis-status")
  .then(r=>r.ok?r.json():Promise.reject(new Error("HTTP "+r.status)))
  .then(data=>{
    const anzahl=data&&data.paragraphen,gesetze=data&&data.gesetze;
    if(typeof anzahl!=="number"||!(anzahl>0))throw new Error("keine gültige Anzahl");
    if(!Array.isArray(gesetze)||!gesetze.length)throw new Error("keine Gesetze in der Antwort");
    const kuerzel=gesetze.map(g=>g&&g.kuerzel).filter(Boolean);
    if(!kuerzel.length)throw new Error("keine Kürzel in der Antwort");
    kbCount.textContent=`${anzahl} Paragraphen aus ${kuerzel.join(", ")}`;
    // Aufschlüsselung und Quelle als Tooltip – die verbindliche Quellenangabe
    // steht weiterhin an den Antworten des Assistenten selbst.
    const details=gesetze.filter(g=>g&&g.kuerzel).map(g=>`${g.kuerzel} ${g.paragraphen}`).join(" · ");
    kbCount.title=data.quelle?`${details} – Quelle: ${data.quelle}`:details;
  })
  .catch(err=>console.warn("[kbCount] Zahl nicht geladen, Fallback-Text bleibt stehen:",err));
})();

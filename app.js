const EMAIL_ADDRESS = "kontakt.inspectora@gmail.com";
const STORAGE_KEY = "inspectora-simple-project-v1";

const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");
const toast = document.getElementById("toast");
const progressBar = document.querySelector(".scroll-progress");

navToggle.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("active");
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.textContent = isOpen ? "×" : "☰";
});

document.querySelectorAll(".nav-links a").forEach(link => {
  link.addEventListener("click", () => {
    navLinks.classList.remove("active");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.textContent = "☰";
  });
});

window.addEventListener("scroll", () => {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
  progressBar.style.width = `${progress}%`;
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

async function copyText(text, successMessage = "Kopiert") {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.appendChild(fallback);
    fallback.focus();
    fallback.select();
    document.execCommand("copy");
    fallback.remove();
  }

  showToast(successMessage);
}

function scrollToProject() {
  document.getElementById("projekt").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* Karte */
const mapElement = document.getElementById("map");
let map = null;

if (mapElement && typeof L !== "undefined") {
  map = L.map(mapElement, { scrollWheelZoom: false }).setView([51.43, 6.78], 9);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19
  }).addTo(map);

  const cities = [
    { name: "Duisburg", lat: 51.4344, lng: 6.7673 },
    { name: "Oberhausen", lat: 51.4615, lng: 6.8569 },
    { name: "Mülheim an der Ruhr", lat: 51.4301, lng: 6.9789 },
    { name: "Essen", lat: 51.4556, lng: 7.0116 },
    { name: "Düsseldorf", lat: 51.2277, lng: 6.7735 },
    { name: "Moers", lat: 51.4528, lng: 6.6361 },
    { name: "Kamp-Lintfort", lat: 51.5000, lng: 6.5247 },
    { name: "Neukirchen-Vluyn", lat: 51.4306, lng: 6.3875 },
    { name: "Rheinberg", lat: 51.3764, lng: 6.4511 },
    { name: "Voerde", lat: 51.5675, lng: 6.7089 },
    { name: "Dinslaken", lat: 51.5606, lng: 6.7389 },
    { name: "Krefeld", lat: 51.3339, lng: 6.5688 },
    { name: "Ratingen", lat: 51.3050, lng: 6.8386 }
  ];

  const markers = cities.map(city => {
    return L.marker([city.lat, city.lng], {
      icon: L.divIcon({
        className: "",
        html: '<div class="city-marker">●</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      })
    })
      .addTo(map)
      .bindPopup(`<div class="city-popup">${city.name}</div>`);
  });

  const markerGroup = L.featureGroup(markers);
  map.fitBounds(markerGroup.getBounds().pad(0.15));

  const mapLink = document.querySelector('a[href="#einsatzgebiet"]');
  if (mapLink) {
    mapLink.addEventListener("click", () => {
      window.setTimeout(() => map.invalidateSize(), 350);
    });
  }

  window.addEventListener("load", () => {
    window.setTimeout(() => map.invalidateSize(), 150);
  });
}

/* Leistungen */
const serviceData = {
  owner: {
    service: "Eigentümerbericht",
    description: "Verständliche Zusammenfassung des Objektzustands, laufender Maßnahmen und offener Punkte.",
    audience: "Verwaltung, Eigentümer, Investoren",
    output: "Eigentümerbericht",
    input: "Fotos, Notizen, Objektdaten",
    benefits: [
      "kompakt und verständlich",
      "professionell weiterverwendbar",
      "offene Punkte klar erkennbar"
    ]
  },
  object: {
    service: "Objektbericht",
    description: "Strukturierter Bericht aus vorhandenen Fotos, Notizen und Objektinformationen.",
    audience: "Verwaltung, Bestandshalter, Makler",
    output: "Objektbericht",
    input: "Fotos, Notizen, Objektangaben",
    benefits: [
      "einheitlicher Aufbau",
      "Informationen sauber gebündelt",
      "für interne und externe Nutzung"
    ]
  },
  defects: {
    service: "Mängel- & Maßnahmenliste",
    description: "Auffälligkeiten werden nach Bereich, Priorität, Status und nächstem Schritt geordnet.",
    audience: "Verwaltung, Eigentümer, Projektteams",
    output: "Maßnahmenübersicht",
    input: "Fotos, Hinweise, Handwerkerinfos",
    benefits: [
      "Prioritäten sofort erkennbar",
      "offene Punkte nachvollziehbar",
      "geeignet für Abstimmungen"
    ]
  },
  photos: {
    service: "Fotodokumentation",
    description: "Bildmaterial wird nach Bereichen sortiert, beschriftet und als klare Übersicht aufbereitet.",
    audience: "Verwaltung, Makler, Eigentümer",
    output: "Fotodokumentation",
    input: "Fotos und kurze Hinweise",
    benefits: [
      "Fotos logisch sortiert",
      "Bereiche klar beschriftet",
      "übersichtliche Weitergabe"
    ]
  },
  expose: {
    service: "Exposé-Texte",
    description: "Objektbeschreibung, Lagebeschreibung und Kurztexte für Vermarktung und Immobilienportale.",
    audience: "Makler, Eigentümer, Vermarktung",
    output: "Exposé-Textvorlage",
    input: "Objektdaten, Ausstattungsmerkmale",
    benefits: [
      "professionelle Formulierungen",
      "direkt weiterverwendbar",
      "einheitlicher Markenauftritt"
    ]
  },
  documents: {
    service: "Unterlagen strukturieren",
    description: "Ungeordnete Objektinformationen werden zu einer nachvollziehbaren, verwertbaren Übersicht.",
    audience: "Verwaltung, Asset Management, Bestand",
    output: "Objektübersicht",
    input: "Dokumente, Notizen, Objektdaten",
    benefits: [
      "Informationen zentral gebündelt",
      "offene Punkte sichtbar",
      "leichter weiterzuverarbeiten"
    ]
  }
};

const serviceOptions = document.querySelectorAll(".service-option");
const serviceTitle = document.getElementById("serviceTitle");
const serviceDescription = document.getElementById("serviceDescription");
const serviceAudience = document.getElementById("serviceAudience");
const serviceOutput = document.getElementById("serviceOutput");
const serviceInput = document.getElementById("serviceInput");
const serviceBenefits = document.getElementById("serviceBenefits");

let currentServiceKey = "owner";
let currentService = serviceData[currentServiceKey];

function renderService(key) {
  currentServiceKey = key;
  currentService = serviceData[key];

  serviceTitle.textContent = currentService.service;
  serviceDescription.textContent = currentService.description;
  serviceAudience.textContent = currentService.audience;
  serviceOutput.textContent = currentService.output;
  serviceInput.textContent = currentService.input;
  serviceBenefits.innerHTML = currentService.benefits
    .map(item => `<span>✓ ${item}</span>`)
    .join("");

  serviceOptions.forEach(option => {
    option.classList.toggle("active", option.dataset.serviceKey === key);
  });
}

serviceOptions.forEach(option => {
  option.addEventListener("click", () => {
    renderService(option.dataset.serviceKey);
  });
});


/* Praxisbeispiel */
const caseData = {
  expose: {
    inputTitle: "Fotos, Grundriss und Objektdaten",
    inputs: [
      ["JPG", "28 Objektfotos", "teilweise doppelt, ohne Raumzuordnung"],
      ["PDF", "Grundriss", "Raumbezeichnungen vorhanden"],
      ["PDF", "Energieausweis", "gültig bis 2031"],
      ["TXT", "11 Besichtigungsnotizen", "Ausstattung, Lage und Zustand"]
    ],
    checks: [
      ["ok", "Wohnfläche und Zimmerzahl vorhanden"],
      ["warn", "Baujahr nicht eindeutig belegt"],
      ["warn", "Angabe zu Hausgeld oder Nebenkosten fehlt"]
    ],
    outputTitle: "Vermarktungsfertiges Exposé-Paket",
    type: "Vermarktungspaket",
    code: "EX-2026-021",
    title: "Wohnungsdaten geprüft und einheitlich zusammengeführt",
    text: "Die Angaben aus Grundriss, Energieausweis, Notizen und Bildmaterial wurden abgeglichen. Widersprüchliche oder fehlende Punkte sind getrennt markiert. Für die Vermarktung stehen ein Datenblatt, eine sortierte Bildauswahl, ein sachlicher Exposé-Text und eine Liste der noch zu klärenden Angaben bereit.",
    results: [
      ["01", "Objektdatenblatt", "einheitliche Angaben für Portal und Exposé"],
      ["02", "16 ausgewählte Fotos", "sortiert, beschriftet und ohne Dubletten"],
      ["03", "Exposé-Text", "sachlich aus den geprüften Daten erstellt"],
      ["04", "Klärungsliste", "3 fehlende oder unklare Angaben"]
    ],
    service: "Exposé-Texte",
    details: "Für eine 2-Zimmer-Wohnung sollen Fotos, Grundriss, Energieausweis und Objektdaten geprüft und als vollständiges Vermarktungspaket aufbereitet werden."
  },
  owner: {
    inputTitle: "Objektfotos, Handwerkerstände und Rückfragen",
    inputs: [
      ["JPG", "19 Zustandsfotos", "Wohnung, Keller und Gemeinschaftsflächen"],
      ["PDF", "2 Handwerkerangebote", "Malerarbeiten und Bodenreparatur"],
      ["MAIL", "4 Rückmeldungen", "Verwaltung, Mieter und Dienstleister"],
      ["TXT", "Übergabenotizen", "Zählerstände und offene Punkte"]
    ],
    checks: [
      ["ok", "Maßnahmen nach Objektbereich zugeordnet"],
      ["ok", "Angebote den offenen Punkten zugeordnet"],
      ["warn", "Freigabe für Bodenreparatur noch offen"]
    ],
    outputTitle: "Entscheidungsfähiger Eigentümerbericht",
    type: "Eigentümerinformation",
    code: "EB-2026-021",
    title: "Zustand, Kostenstände und Entscheidungen in einer Übersicht",
    text: "Der Bericht trennt erledigte Arbeiten, offene Maßnahmen und notwendige Entscheidungen. Zu jeder Position sind Bildnachweis, aktueller Status und vorhandene Kostenangaben hinterlegt. Der Eigentümer sieht auf einer Seite, welche Punkte abgeschlossen sind und wo eine Freigabe benötigt wird.",
    results: [
      ["01", "Kurzstatus", "aktueller Stand des Objekts"],
      ["02", "Maßnahmenübersicht", "erledigt, offen oder in Prüfung"],
      ["03", "Kostenstände", "Angebote den Positionen zugeordnet"],
      ["04", "Entscheidungsbedarf", "Freigaben klar markiert"]
    ],
    service: "Eigentümerbericht",
    details: "Aus Fotos, Handwerkerständen, Angeboten und Übergabenotizen soll ein entscheidungsfähiger Eigentümerbericht entstehen."
  },
  object: {
    inputTitle: "Besichtigungsfotos und Objektaufnahme",
    inputs: [
      ["JPG", "31 Innen- und Außenfotos", "ohne einheitliche Reihenfolge"],
      ["PDF", "Bestandsgrundriss", "Raumaufteilung und Flächen"],
      ["TXT", "Vor-Ort-Notizen", "Zustand und sichtbare Auffälligkeiten"],
      ["XLS", "Objektstammdaten", "Adresse, Nutzung und Ansprechpartner"]
    ],
    checks: [
      ["ok", "Fotos nach Gebäudebereich sortiert"],
      ["ok", "Flächenangaben mit Grundriss abgeglichen"],
      ["warn", "Angabe zum Baujahr muss bestätigt werden"]
    ],
    outputTitle: "Strukturierter Objektbericht",
    type: "Objektdokumentation",
    code: "OB-2026-021",
    title: "Nachvollziehbare Bestandsaufnahme nach Bereichen",
    text: "Der Objektbericht führt Stammdaten, Bildmaterial und Vor-Ort-Notizen in einer festen Struktur zusammen. Außenbereich, Gemeinschaftsflächen und Wohnung werden getrennt dargestellt. Sichtbare Auffälligkeiten bleiben als Beobachtung gekennzeichnet und werden nicht als Gutachten bewertet.",
    results: [
      ["01", "Objektstammdaten", "Adresse, Nutzung und Ansprechpartner"],
      ["02", "Bereichsübersicht", "Außen, Gemeinschaft und Einheit"],
      ["03", "Bildnachweise", "Fotos passend zu jedem Abschnitt"],
      ["04", "Auffälligkeiten", "sichtbare Punkte getrennt dokumentiert"]
    ],
    service: "Objektbericht",
    details: "Eine Vor-Ort-Aufnahme mit Fotos, Grundriss und Stammdaten soll als strukturierter Objektbericht aufbereitet werden."
  },
  defects: {
    inputTitle: "Mängelfotos, Notizen und Handwerkerinfos",
    inputs: [
      ["JPG", "12 Mängelfotos", "mehrere Räume und Gemeinschaftsflächen"],
      ["TXT", "9 Einzelhinweise", "ohne Priorität oder Zuständigkeit"],
      ["MAIL", "3 Handwerkerrückmeldungen", "Termine und Materialbedarf"],
      ["PDF", "1 Angebot", "Bodenreparatur Schlafzimmer"]
    ],
    checks: [
      ["ok", "Doppelte Hinweise zusammengeführt"],
      ["ok", "Bildnachweise den Positionen zugeordnet"],
      ["warn", "Zuständigkeit für Feuchteprüfung noch offen"]
    ],
    outputTitle: "Priorisierte Mängel- und Maßnahmenliste",
    type: "Maßnahmensteuerung",
    code: "MM-2026-021",
    title: "Jeder offene Punkt mit Nachweis, Priorität und nächstem Schritt",
    text: "Aus einzelnen Fotos und Rückmeldungen entsteht eine Arbeitsliste, die nach Objektbereich und Dringlichkeit sortiert ist. Jede Position enthält Bildnachweis, Status, Zuständigkeit und den nächsten vereinbarten Schritt. So kann die Verwaltung die Bearbeitung direkt nachhalten.",
    results: [
      ["01", "9 Positionen", "nach Bereich zusammengeführt"],
      ["02", "Prioritäten", "kurzfristig, regulär oder beobachten"],
      ["03", "Zuständigkeiten", "Verwaltung, Handwerker oder Eigentümer"],
      ["04", "Bearbeitungsstatus", "offen, terminiert oder erledigt"]
    ],
    service: "Mängel- & Maßnahmenliste",
    details: "Mängelfotos, Einzelhinweise und Handwerkerrückmeldungen sollen in eine priorisierte Maßnahmenliste überführt werden."
  },
  photos: {
    inputTitle: "Unsortierte Fotos aus Besichtigung und Übergabe",
    inputs: [
      ["JPG", "47 Originalfotos", "mehrere ähnliche Aufnahmen"],
      ["JPG", "6 Detailaufnahmen", "Schäden und Zählerstände"],
      ["TXT", "kurze Raumliste", "Wohnzimmer, Schlafen, Bad, Küche"],
      ["TXT", "Übergabedatum", "Aufnahme vom 18.06.2026"]
    ],
    checks: [
      ["ok", "Fotos nach Raum und Bereich erkannt"],
      ["ok", "unscharfe und doppelte Aufnahmen markiert"],
      ["ok", "Zählerstände getrennt dokumentiert"]
    ],
    outputTitle: "Geordnete Fotodokumentation",
    type: "Bilddokumentation",
    code: "FD-2026-021",
    title: "Relevante Aufnahmen in nachvollziehbarer Reihenfolge",
    text: "Die Originalbilder werden gesichtet, nach Räumen sortiert und mit kurzen sachlichen Beschriftungen versehen. Dubletten und unbrauchbare Aufnahmen werden nicht in das Ergebnis übernommen. Schäden, Details und Zählerstände erhalten eigene Abschnitte.",
    results: [
      ["01", "26 verwendete Fotos", "aus 53 Originalaufnahmen ausgewählt"],
      ["02", "Raumstruktur", "klare Reihenfolge nach Objektbereichen"],
      ["03", "Beschriftungen", "Ort und sichtbarer Inhalt je Foto"],
      ["04", "Sonderabschnitte", "Details, Schäden und Zählerstände"]
    ],
    service: "Fotodokumentation",
    details: "Unsortierte Besichtigungs- und Übergabefotos sollen ausgewählt, nach Räumen geordnet und sachlich beschriftet werden."
  },
  documents: {
    inputTitle: "Verteilte Objektunterlagen aus mehreren Quellen",
    inputs: [
      ["PDF", "Grundriss und Energieausweis", "unterschiedliche Dateinamen"],
      ["XLS", "Miet- und Flächendaten", "mehrere Tabellenblätter"],
      ["MAIL", "Verwalterauskünfte", "Angaben zu Hausgeld und Rücklage"],
      ["JPG", "Dokumentenfotos", "nicht eindeutig zugeordnet"]
    ],
    checks: [
      ["ok", "Dateien nach Dokumentart erkannt"],
      ["warn", "Wohnflächenangabe weicht zwischen zwei Quellen ab"],
      ["warn", "aktueller Wirtschaftsplan fehlt"]
    ],
    outputTitle: "Geordnete Objektakte mit Prüfliste",
    type: "Unterlagenübersicht",
    code: "OU-2026-021",
    title: "Vorhandene, fehlende und widersprüchliche Unterlagen getrennt",
    text: "Die Unterlagen werden einheitlich benannt, nach Themen abgelegt und in einer zentralen Übersicht erfasst. Abweichende Angaben werden nicht stillschweigend übernommen, sondern als Klärungspunkt ausgewiesen. Fehlende Dokumente erscheinen in einer separaten Nachforderungsliste.",
    results: [
      ["01", "Dokumentenregister", "Dateiname, Stand und Dokumentart"],
      ["02", "einheitliche Ablage", "Stammdaten, Technik, Vertrag und Kosten"],
      ["03", "Abweichungsliste", "widersprüchliche Angaben sichtbar"],
      ["04", "Nachforderungsliste", "fehlende Dokumente klar benannt"]
    ],
    service: "Unterlagen strukturieren",
    details: "Verteilte Objektunterlagen aus PDF, Excel, E-Mail und Fotos sollen als geordnete Objektakte mit Prüfliste aufbereitet werden."
  }
};

const caseTabs = document.querySelectorAll(".case-tab");
const caseInputTitle = document.getElementById("caseInputTitle");
const caseInputList = document.getElementById("caseInputList");
const caseCheckList = document.getElementById("caseCheckList");
const caseOutputTitle = document.getElementById("caseOutputTitle");
const caseDocumentType = document.getElementById("caseDocumentType");
const caseDocumentCode = document.getElementById("caseDocumentCode");
const caseDocumentTitle = document.getElementById("caseDocumentTitle");
const caseDocumentText = document.getElementById("caseDocumentText");
const caseResultGrid = document.getElementById("caseResultGrid");
const caseStartButton = document.getElementById("caseStartButton");
let currentCase = caseData.expose;

function renderCase(key) {
  const data = caseData[key];
  if (!data) return;
  currentCase = data;

  caseInputTitle.textContent = data.inputTitle;
  caseInputList.innerHTML = data.inputs.map(item =>
    `<div><span>${item[0]}</span><p><strong>${item[1]}</strong><small>${item[2]}</small></p></div>`
  ).join("");

  caseCheckList.innerHTML = data.checks.map(item => {
    const symbol = item[0] === "ok" ? "✓" : "!";
    return `<li class="${item[0]}"><b>${symbol}</b>${item[1]}</li>`;
  }).join("");

  caseOutputTitle.textContent = data.outputTitle;
  caseDocumentType.textContent = data.type;
  caseDocumentCode.textContent = data.code;
  caseDocumentTitle.textContent = data.title;
  caseDocumentText.textContent = data.text;
  caseResultGrid.innerHTML = data.results.map(item =>
    `<div><span>${item[0]}</span><p><strong>${item[1]}</strong><small>${item[2]}</small></p></div>`
  ).join("");

  caseTabs.forEach(tab => {
    const active = tab.dataset.case === key;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

caseTabs.forEach(tab => {
  tab.addEventListener("click", () => renderCase(tab.dataset.case));
});

if (caseStartButton) {
  caseStartButton.addEventListener("click", () => {
    applyServiceToProject(currentCase.service, currentCase.outputTitle, currentCase.details);
  });
}

/* Projektanfrage */
const serviceType = document.getElementById("serviceType");
const objectType = document.getElementById("objectType");
const city = document.getElementById("city");
const contactName = document.getElementById("contactName");
const contactEmail = document.getElementById("contactEmail");
const projectDetails = document.getElementById("projectDetails");
const requestTitle = document.getElementById("requestTitle");
const requestSummary = document.getElementById("requestSummary");
const requestObject = document.getElementById("requestObject");
const requestLocation = document.getElementById("requestLocation");
const configuredMailButton = document.getElementById("configuredMailButton");
const saveState = document.getElementById("saveState");

const projectFields = [
  serviceType,
  objectType,
  city,
  contactName,
  contactEmail,
  projectDetails
];

function getProjectText() {
  const location = city.value.trim() || "noch offen";
  const details = projectDetails.value.trim() || "Keine zusätzlichen Hinweise eingetragen.";
  const nameLine = contactName.value.trim()
    ? `Name / Unternehmen: ${contactName.value.trim()}\n`
    : "";
  const emailLine = contactEmail.value.trim()
    ? `E-Mail: ${contactEmail.value.trim()}\n`
    : "";

  return `Guten Tag,

ich interessiere mich für folgende Inspectora-Leistung:

Leistung: ${serviceType.value}
Objektart: ${objectType.value}
Ort / Ausführung: ${location}
${nameLine}${emailLine}
Ausgangslage / gewünschtes Ergebnis:
${details}
`;
}

function saveProject() {
  const data = {};
  projectFields.forEach(field => {
    data[field.id] = field.value;
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  saveState.textContent = "Lokal gespeichert";
}

function updateRequest() {
  const location = city.value.trim() || "noch offen";

  requestTitle.textContent = serviceType.value;
  requestSummary.textContent =
    `${serviceType.value} für ${objectType.value}.\nAusführung: ${location}.`;
  requestObject.textContent = objectType.value;
  requestLocation.textContent = location;

  const subject = encodeURIComponent(`Inspectora Anfrage – ${serviceType.value}`);
  const body = encodeURIComponent(getProjectText());
  configuredMailButton.href = `mailto:${EMAIL_ADDRESS}?subject=${subject}&body=${body}`;

  saveProject();
}

function restoreProject() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;

    projectFields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(saved, field.id)) {
        field.value = saved[field.id];
      }
    });
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

projectFields.forEach(field => {
  field.addEventListener(field.tagName === "SELECT" ? "change" : "input", updateRequest);
});

function applyServiceToProject(service, output, details = "") {
  const availableServices = Array.from(serviceType.options).map(option => option.value);
  serviceType.value = availableServices.includes(service)
    ? service
    : "Unterlagen strukturieren";

  if (details) {
    projectDetails.value = details;
  }

  updateRequest();
  scrollToProject();
  showToast("Leistung übernommen");
}

document.getElementById("serviceStartButton").addEventListener("click", () => {
  applyServiceToProject(
    currentService.service,
    currentService.output,
    `Vorhandene Grundlage: ${currentService.input}. Gewünschtes Ergebnis: ${currentService.output}.`
  );
});

document.getElementById("copyRequestButton").addEventListener("click", () => {
  copyText(getProjectText(), "Anfrage kopiert");
});

document.getElementById("resetRequestButton").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  serviceType.value = "Eigentümerbericht";
  objectType.value = "Wohnung";
  city.value = "Digital";
  contactName.value = "";
  contactEmail.value = "";
  projectDetails.value = "";
  updateRequest();
  showToast("Eingaben zurückgesetzt");
});

/* Portal-Demo */
const portalFileData = {
  owner: {
    title: "Eigentümerbericht",
    text: "Kompakte Zusammenfassung des Objektzustands mit Auffälligkeiten, Maßnahmen und nächsten Schritten.",
    meta: "PDF · 6 Seiten",
    status: "In Bearbeitung · 82%",
    code: "EB-2026-014",
    service: "Eigentümerbericht",
    output: "Eigentümerbericht"
  },
  photos: {
    title: "Fotodokumentation",
    text: "24 Fotos, geordnet nach Bereichen und mit kurzen, nachvollziehbaren Beschriftungen versehen.",
    meta: "PDF · 24 Fotos",
    status: "Bereit zur Übergabe",
    code: "FD-2026-014",
    service: "Fotodokumentation",
    output: "Fotodokumentation"
  },
  actions: {
    title: "Maßnahmenübersicht",
    text: "Drei offene Punkte mit Priorität, Zuständigkeit und empfohlenem nächsten Schritt.",
    meta: "Übersicht · 3 Positionen",
    status: "Prüfung ausstehend",
    code: "MM-2026-014",
    service: "Mängel- & Maßnahmenliste",
    output: "Maßnahmenübersicht"
  }
};

const portalFileButtons = document.querySelectorAll(".portal-file");
const portalFileTitle = document.getElementById("portalFileTitle");
const portalFileText = document.getElementById("portalFileText");
const portalFileMeta = document.getElementById("portalFileMeta");
const portalFileStatus = document.getElementById("portalFileStatus");
const portalDocumentCode = document.getElementById("portalDocumentCode");

let currentPortalFile = portalFileData.owner;

function renderPortalFile(key) {
  currentPortalFile = portalFileData[key];
  portalFileTitle.textContent = currentPortalFile.title;
  portalFileText.textContent = currentPortalFile.text;
  portalFileMeta.textContent = currentPortalFile.meta;
  portalFileStatus.textContent = currentPortalFile.status;
  portalDocumentCode.textContent = currentPortalFile.code;

  portalFileButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.portalFile === key);
  });
}

portalFileButtons.forEach(button => {
  button.addEventListener("click", () => {
    renderPortalFile(button.dataset.portalFile);
  });
});

document.getElementById("portalStartButton").addEventListener("click", () => {
  applyServiceToProject(
    currentPortalFile.service,
    currentPortalFile.output,
    `Orientierung an der Portal-Demo. Gewünschtes Ergebnis: ${currentPortalFile.title}.`
  );
});

restoreProject();
renderService("owner");
renderPortalFile("owner");
renderCase("expose");
updateRequest();

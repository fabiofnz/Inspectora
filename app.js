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
const map = L.map("map", { scrollWheelZoom: false }).setView([51.43, 6.78], 9);

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

document.querySelector('a[href="#einsatzgebiet"]').addEventListener("click", () => {
  window.setTimeout(() => map.invalidateSize(), 350);
});

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
updateRequest();

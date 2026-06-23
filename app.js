const EMAIL_ADDRESS = "kontakt.inspectora@gmail.com";
    const STORAGE_KEY = "inspectora-project-v3";

    const navToggle = document.getElementById("navToggle");
    const navLinks = document.getElementById("navLinks");
    const toast = document.getElementById("toast");

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
      const scrollTop = window.scrollY;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? (scrollTop / scrollable) * 100 : 0;
      document.querySelector(".scroll-progress").style.width = `${progress}%`;
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
      document.getElementById("projekt").scrollIntoView({ behavior: "smooth", block: "start" });
    }

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

    const serviceType = document.getElementById("serviceType");
    const objectType = document.getElementById("objectType");
    const city = document.getElementById("city");
    const urgency = document.getElementById("urgency");
    const resultType = document.getElementById("resultType");
    const objectCount = document.getElementById("objectCount");
    const contactName = document.getElementById("contactName");
    const contactEmail = document.getElementById("contactEmail");
    const projectDetails = document.getElementById("projectDetails");
    const requestTitle = document.getElementById("requestTitle");
    const requestSummary = document.getElementById("requestSummary");
    const requestMode = document.getElementById("requestMode");
    const requestScope = document.getElementById("requestScope");
    const configuredMailButton = document.getElementById("configuredMailButton");
    const saveState = document.getElementById("saveState");

    const projectFields = [
      serviceType,
      objectType,
      city,
      urgency,
      resultType,
      objectCount,
      contactName,
      contactEmail,
      projectDetails
    ];

    function getProjectText() {
      const details = projectDetails.value.trim() || "Keine zusätzlichen Hinweise eingetragen.";
      const nameLine = contactName.value.trim() ? `Name / Unternehmen: ${contactName.value.trim()}\n` : "";
      const emailLine = contactEmail.value.trim() ? `E-Mail: ${contactEmail.value.trim()}\n` : "";

      return `Guten Tag,\n\nich interessiere mich für folgende Unterstützung:\n\nLeistung: ${serviceType.value}\nObjektart: ${objectType.value}\nUmfang: ${objectCount.value}\nOrt / Ausführung: ${city.value || "noch offen"}\nZeitrahmen: ${urgency.value}\nGewünschtes Ergebnis: ${resultType.value}\n${nameLine}${emailLine}\nAusgangslage / Hinweise:\n${details}\n`;
    }

    function updateRequest() {
      const location = city.value.trim() || "Ort noch offen";
      const summary = `${serviceType.value} für ${objectCount.value} (${objectType.value}) in ${location}.\nZeitrahmen: ${urgency.value}.\nGewünschtes Ergebnis: ${resultType.value}.`;

      requestTitle.textContent = serviceType.value;
      requestSummary.textContent = summary;
      requestScope.textContent = objectCount.value;
      requestMode.textContent = /Objektbegehung|Leerstand|Besichtigung|Vor-Ort/i.test(serviceType.value) ? "Vor Ort" : "Digital / Vor Ort";

      const subject = encodeURIComponent(`Inspectora Anfrage – ${serviceType.value}`);
      const body = encodeURIComponent(getProjectText());
      configuredMailButton.href = `mailto:${EMAIL_ADDRESS}?subject=${subject}&body=${body}`;

      saveProject();
    }

    function saveProject() {
      const data = {};
      projectFields.forEach(field => data[field.id] = field.value);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      saveState.textContent = "Lokal gespeichert";
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

    document.getElementById("copyRequestButton").addEventListener("click", () => {
      copyText(getProjectText(), "Anfrage kopiert");
    });

    document.getElementById("downloadRequestButton").addEventListener("click", () => {
      const blob = new Blob([getProjectText()], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Inspectora-Anfrage-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast("TXT erstellt");
    });

    document.getElementById("resetRequestButton").addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      serviceType.value = "Eigentümerbericht";
      objectType.value = "Wohnung";
      city.value = "Duisburg";
      urgency.value = "flexibel";
      resultType.value = "Eigentümerbericht";
      objectCount.value = "1 Objekt / 1 Einheit";
      contactName.value = "";
      contactEmail.value = "";
      projectDetails.value = "";
      updateRequest();
      showToast("Konfiguration zurückgesetzt");
    });

    function applyToProject({ service, result, object = null, details = "" }) {
      const serviceOptions = Array.from(serviceType.options).map(option => option.value);
      const resultOptions = Array.from(resultType.options).map(option => option.value);
      const objectOptions = Array.from(objectType.options).map(option => option.value);

      serviceType.value = serviceOptions.includes(service) ? service : "Sonstige Anfrage";
      resultType.value = resultOptions.includes(result) ? result : "Objektübersicht";

      if (object && objectOptions.includes(object)) {
        objectType.value = object;
      }

      if (details) {
        projectDetails.value = details;
      }

      updateRequest();
      scrollToProject();
      showToast("In Projekt übernommen");
    }

    const docChips = document.querySelectorAll(".doc-chip");
    const docPurpose = document.getElementById("docPurpose");
    const docObject = document.getElementById("docObject");
    const docDepth = document.getElementById("docDepth");
    const docRecommendation = document.getElementById("docRecommendation");
    const docDescription = document.getElementById("docDescription");
    const docNeeded = document.getElementById("docNeeded");
    const docOutput = document.getElementById("docOutput");
    const docScope = document.getElementById("docScope");
    const docNextStep = document.getElementById("docNextStep");

    let currentDocState = {};

    function getSelectedInputs() {
      return Array.from(document.querySelectorAll(".doc-chip.active")).map(chip => chip.dataset.value);
    }

    function updateDocTool() {
      const inputs = getSelectedInputs();
      const purpose = docPurpose.value;
      const object = docObject.value;
      const depth = docDepth.value;

      let recommendation = "Objektbericht";
      let description = "Strukturierte Dokumentation aus vorhandenen Informationen.";
      let output = "Objektbericht";

      if (purpose === "Eigentümerinformation") {
        recommendation = "Eigentümerbericht";
        description = "Klare Zusammenfassung für Eigentümer, Verwaltung oder Investor.";
        output = "Eigentümerbericht";
      } else if (purpose === "Vermarktung") {
        recommendation = "Exposé-Texte";
        description = "Objekt- und Lagebeschreibung für Vermarktung und Portale.";
        output = "Exposé-Textvorlage";
      } else if (purpose === "Mängelübersicht") {
        recommendation = "Mängel- & Maßnahmenliste";
        description = "Priorisierte Übersicht mit Status und nächsten Schritten.";
        output = "Maßnahmenübersicht";
      } else if (purpose === "Handwerkerstatus") {
        recommendation = "Handwerkerstatus";
        description = "Arbeitsstand, offene Punkte und sichtbare Ergebnisse auf einen Blick.";
        output = "Statusbericht";
      } else if (purpose === "Interne Ablage") {
        recommendation = "Unterlagen strukturieren";
        description = "Geordnete Informationen für interne Ablage und Weiterverarbeitung.";
        output = "Objektübersicht";
      }

      if (object === "Portfolio / mehrere Objekte") {
        recommendation = "Unterlagen strukturieren";
        description = "Einheitliche Übersicht mehrerer Objekte oder Einheiten.";
        output = "Objektübersicht";
      }

      const needed = inputs.length ? inputs.join(", ") : "Noch keine Auswahl";
      currentDocState = { recommendation, description, output, object, depth, needed, purpose };

      docRecommendation.textContent = `${recommendation} · ${depth}`;
      docDescription.textContent = description;
      docNeeded.textContent = needed;
      docOutput.textContent = output;
      docScope.textContent = depth;
      docNextStep.textContent = `${object}, Ziel: ${purpose}. Auswahl in die Projektanfrage übernehmen.`;
    }

    docChips.forEach(chip => {
      chip.addEventListener("click", () => {
        chip.classList.toggle("active");
        updateDocTool();
      });
    });

    [docPurpose, docObject, docDepth].forEach(field => field.addEventListener("change", updateDocTool));

    document.getElementById("applyDocButton").addEventListener("click", () => {
      applyToProject({
        service: currentDocState.recommendation,
        result: currentDocState.output,
        object: currentDocState.object,
        details: `Vorhandene Informationen: ${currentDocState.needed}. Gewünschte Tiefe: ${currentDocState.depth}. Ziel: ${currentDocState.purpose}.`
      });
    });

    document.getElementById("copyDocButton").addEventListener("click", () => {
      copyText(
        `${currentDocState.recommendation} (${currentDocState.depth})\nObjekt: ${currentDocState.object}\nVorhanden: ${currentDocState.needed}\nErgebnis: ${currentDocState.output}`,
        "Konfiguration kopiert"
      );
    });

    const demoData = {
      owner: {
        title: "Eigentümerbericht",
        object: "Wohnung, Duisburg",
        scope: "12 Fotos / 4 Notizen",
        output: "Eigentümerbericht",
        headline: "Zusammenfassung",
        text: "Fotos und Notizen werden zu einer klaren Eigentümerinformation zusammengeführt.",
        items: [
          "Zustand der Einheit zusammengefasst",
          "Auffälligkeiten separat aufgeführt",
          "Nächste Schritte vorbereitet"
        ],
        service: "Eigentümerbericht",
        objectType: "Wohnung"
      },
      defects: {
        title: "Mängel- & Maßnahmenliste",
        object: "Mehrfamilienhaus, Moers",
        scope: "26 Fotos / 9 Hinweise",
        output: "Maßnahmenübersicht",
        headline: "Priorisierte Übersicht",
        text: "Auffälligkeiten werden nach Bereich, Dringlichkeit und Status geordnet.",
        items: [
          "Mängel nach Bereich sortiert",
          "Prioritäten und Status sichtbar",
          "Nächste Maßnahmen vorbereitet"
        ],
        service: "Mängel- & Maßnahmenliste",
        objectType: "Mehrfamilienhaus"
      },
      photos: {
        title: "Fotodokumentation",
        object: "Gewerbeobjekt, Krefeld",
        scope: "48 Fotos",
        output: "Fotodokumentation",
        headline: "Strukturierte Bildübersicht",
        text: "Fotos werden nach Bereichen geordnet und nachvollziehbar beschriftet.",
        items: [
          "Fotos nach Bereichen sortiert",
          "Bildbeschriftungen vorbereitet",
          "Übersicht für Verwaltung oder Eigentümer"
        ],
        service: "Fotodokumentation",
        objectType: "Gewerbeobjekt"
      },
      craftsmen: {
        title: "Handwerkerstatus",
        object: "Leerstand, Kamp-Lintfort",
        scope: "15 Fotos / 3 Gewerke",
        output: "Statusbericht",
        headline: "Fortschritt dokumentiert",
        text: "Erledigte Arbeiten, offene Punkte und sichtbare Ergebnisse werden getrennt dargestellt.",
        items: [
          "Arbeitsfortschritt zusammengefasst",
          "Offene Punkte markiert",
          "Status für Eigentümer oder Verwaltung"
        ],
        service: "Handwerkerstatus",
        objectType: "Leerstand"
      }
    };

    const resultTabs = document.querySelectorAll(".result-tab");
    const demoTitle = document.getElementById("demoTitle");
    const demoObject = document.getElementById("demoObject");
    const demoScope = document.getElementById("demoScope");
    const demoOutput = document.getElementById("demoOutput");
    const demoHeadline = document.getElementById("demoHeadline");
    const demoText = document.getElementById("demoText");
    const demoList = document.getElementById("demoList");
    let currentDemo = demoData.owner;

    function renderDemo(key) {
      currentDemo = demoData[key];
      demoTitle.textContent = currentDemo.title;
      demoObject.textContent = currentDemo.object;
      demoScope.textContent = currentDemo.scope;
      demoOutput.textContent = currentDemo.output;
      demoHeadline.textContent = currentDemo.headline;
      demoText.textContent = currentDemo.text;
      demoList.innerHTML = currentDemo.items.map(item => `<div>✓ ${item}</div>`).join("");
    }

    resultTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        resultTabs.forEach(button => button.classList.remove("active"));
        tab.classList.add("active");
        renderDemo(tab.dataset.demo);
      });
    });

    document.getElementById("applyDemoButton").addEventListener("click", () => {
      applyToProject({
        service: currentDemo.service,
        result: currentDemo.output,
        object: currentDemo.objectType,
        details: `Orientierung an der Musteransicht „${currentDemo.title}“. Beispielumfang: ${currentDemo.scope}.`
      });
    });

    document.getElementById("copyDemoButton").addEventListener("click", () => {
      copyText(
        `${currentDemo.title}\n${currentDemo.object}\n${currentDemo.scope}\n${currentDemo.text}\n- ${currentDemo.items.join("\n- ")}`,
        "Vorschau kopiert"
      );
    });

    const studioOptions = document.querySelectorAll(".studio-option");
    const studioTitle = document.getElementById("studioTitle");
    const studioText = document.getElementById("studioText");
    const studioOutput = document.getElementById("studioOutput");
    let currentStudio = {
      service: "Exposé-Texte",
      result: "Objektbeschreibung, Lagebeschreibung und Kurztext für Immobilienportale",
      output: "Exposé-Textvorlage"
    };

    studioOptions.forEach(option => {
      option.addEventListener("click", () => {
        studioOptions.forEach(button => button.classList.remove("active"));
        option.classList.add("active");

        currentStudio = {
          service: option.dataset.service,
          result: option.dataset.result,
          output: option.dataset.output
        };

        studioTitle.textContent = currentStudio.service;
        studioText.textContent = currentStudio.result;
        studioOutput.textContent = currentStudio.output;
      });
    });

    document.getElementById("applyStudioButton").addEventListener("click", () => {
      applyToProject({
        service: currentStudio.service,
        result: currentStudio.output,
        details: `Ausgewählte Studio-Leistung: ${currentStudio.service}. Gewünschtes Ergebnis: ${currentStudio.result}.`
      });
    });

    document.getElementById("copyStudioButton").addEventListener("click", () => {
      copyText(`${currentStudio.service}\n${currentStudio.result}\nFormat: ${currentStudio.output}`, "Leistung kopiert");
    });

    restoreProject();
    updateRequest();
    updateDocTool();
    renderDemo("owner");

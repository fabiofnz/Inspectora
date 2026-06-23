Inspectora repository instructions
Product direction
Inspectora is a modern digital real-estate documentation platform for property companies.
The primary customer flow is: choose a service, review the result/portal demo, check the service area, start a project.
Keep the experience simple, fast and function-led. Avoid long marketing text and duplicate tools.
The core services are: Eigentümerbericht, Objektbericht, Mängel- & Maßnahmenliste, Fotodokumentation, Exposé-Texte, Unterlagen strukturieren.
Inspectora does not provide appraisals, expert opinions or regulated surveyor services.
Technical structure
Keep the public website split into exactly three main files:
index.html
styles.css
app.js
Keep CNAME and README.md unchanged unless explicitly requested.
Do not add frameworks or package managers unless explicitly requested.
Use semantic HTML, responsive CSS and plain JavaScript.
Preserve GitHub Pages compatibility.
Change rules
Do not create duplicate configurators, duplicate service lists or duplicate project forms.
Prefer improving an existing section over adding another section.
Keep the navigation short.
When changing an HTML id, update every matching JavaScript reference.
Never put API keys, passwords, tokens or secrets in client-side files.
Keep all user-visible text in German unless explicitly requested otherwise.
Maintain accessibility: labels, button types, aria attributes, keyboard focus and mobile navigation.
Validation
Before considering a change complete:
Run `node --check app.js`.
Run `node scripts/validate-site.mjs`.
Confirm all internal navigation links target an existing id.
Confirm all ids used by `getElementById` exist exactly once.
Check desktop and mobile layouts.

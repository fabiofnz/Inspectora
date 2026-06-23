import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = ["index.html", "styles.css", "app.js"];

const fail = (message) => {
  console.error(`✖ ${message}`);
  process.exitCode = 1;
};

const pass = (message) => {
  console.log(`✓ ${message}`);
};

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    fail(`Required file is missing: ${file}`);
  } else {
    pass(`Found ${file}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const js = fs.readFileSync(path.join(root, "app.js"), "utf8");

function extractAll(text, regex) {
  return [...text.matchAll(regex)].map((match) => match[1]);
}

const ids = extractAll(html, /\bid=["']([^"']+)["']/g);
const idCounts = new Map();

for (const id of ids) {
  idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
}

const duplicateIds = [...idCounts.entries()]
  .filter(([, count]) => count > 1)
  .map(([id, count]) => `${id} (${count}x)`);

if (duplicateIds.length) {
  fail(`Duplicate HTML ids: ${duplicateIds.join(", ")}`);
} else {
  pass(`No duplicate HTML ids (${ids.length} ids checked)`);
}

const jsIds = [
  ...extractAll(js, /getElementById\(\s*["']([^"']+)["']\s*\)/g),
  ...extractAll(js, /querySelector\(\s*["']#([^"']+)["']\s*\)/g),
];

const missingJsIds = [...new Set(jsIds)]
  .filter((id) => !idCounts.has(id));

if (missingJsIds.length) {
  fail(`JavaScript references missing HTML ids: ${missingJsIds.join(", ")}`);
} else {
  pass(`All JavaScript id references exist (${new Set(jsIds).size} checked)`);
}

const anchors = extractAll(html, /\bhref=["']#([^"']+)["']/g)
  .filter((target) => target && target !== "top");

const missingAnchors = [...new Set(anchors)]
  .filter((target) => !idCounts.has(target));

if (missingAnchors.length) {
  fail(`Internal links point to missing ids: ${missingAnchors.join(", ")}`);
} else {
  pass(`All internal links are valid (${new Set(anchors).size} checked)`);
}

const localStyles = extractAll(html, /<link[^>]+href=["']([^"']+\.css)["'][^>]*>/g)
  .filter((href) => !/^https?:\/\//i.test(href));

const localScripts = extractAll(html, /<script[^>]+src=["']([^"']+\.js)["'][^>]*>/g)
  .filter((src) => !/^https?:\/\//i.test(src));

for (const asset of [...localStyles, ...localScripts]) {
  if (!fs.existsSync(path.join(root, asset))) {
    fail(`Referenced local asset is missing: ${asset}`);
  } else {
    pass(`Referenced asset exists: ${asset}`);
  }
}

const cssBraceBalance =
  [...css].reduce((balance, char) => {
    if (char === "{") return balance + 1;
    if (char === "}") return balance - 1;
    return balance;
  }, 0);

if (cssBraceBalance !== 0) {
  fail(`CSS braces are unbalanced (balance: ${cssBraceBalance})`);
} else {
  pass("CSS braces are balanced");
}

const forbiddenSecretPatterns = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
];

const combined = `${html}\n${css}\n${js}`;
const detectedSecrets = forbiddenSecretPatterns.flatMap((pattern) =>
  combined.match(pattern) ?? []
);

if (detectedSecrets.length) {
  fail("Possible API key or token detected in public website files");
} else {
  pass("No common API-key patterns detected");
}

if (!process.exitCode) {
  console.log("\nWebsite validation completed successfully.");
}

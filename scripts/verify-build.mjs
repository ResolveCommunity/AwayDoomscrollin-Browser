import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const distributionRoot = join(projectRoot, "dist");
const expectedMatches = [
  "https://www.instagram.com/*",
  "https://instagram.com/*",
  "https://m.instagram.com/*",
  "https://tiktok.com/*",
  "https://m.tiktok.com/*",
  "https://www.tiktok.com/*",
  "https://www.youtube.com/*",
  "https://m.youtube.com/*"
];

async function listFiles(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path, base));
    } else {
      files.push(path.slice(base.length + 1).replaceAll("\\", "/"));
    }
  }
  return files.sort();
}

async function assertFile(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size === 0) {
    throw new Error(`Expected non-empty file: ${path}`);
  }
}

async function verifyTarget(target) {
  const root = join(distributionRoot, target);
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));

  if (manifest.manifest_version !== 3) {
    throw new Error(`${target}: Manifest V3 is required`);
  }
  if (JSON.stringify(manifest.permissions) !== JSON.stringify(["storage"])) {
    throw new Error(`${target}: unexpected permissions`);
  }
  if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(expectedMatches)) {
    throw new Error(`${target}: explicit supported-site access is missing or too broad`);
  }
  if (JSON.stringify(manifest.content_scripts?.[0]?.matches) !== JSON.stringify(expectedMatches)) {
    throw new Error(`${target}: supported-site match patterns are not narrowly scoped`);
  }
  const expectedResources = [{ resources: ["icons/icon-48.png"], matches: expectedMatches }];
  if (JSON.stringify(manifest.web_accessible_resources) !== JSON.stringify(expectedResources)) {
    throw new Error(`${target}: unexpected web-accessible resources`);
  }
  if (target === "chrome" && manifest.browser_specific_settings) {
    throw new Error("chrome: Firefox-only settings must not be present");
  }
  if (target === "chrome" && manifest.background?.service_worker !== "background/background.js") {
    throw new Error("chrome: onboarding service worker is missing");
  }
  if (target === "firefox") {
    if (JSON.stringify(manifest.background?.scripts) !== JSON.stringify(["background/background.js"])) {
      throw new Error("firefox: onboarding background script is missing");
    }
    const required = manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required;
    if (JSON.stringify(required) !== JSON.stringify(["none"])) {
      throw new Error("firefox: no-data-collection declaration is missing");
    }
  }

  const referencedFiles = [
    ...Object.values(manifest.icons || {}),
    manifest.action?.default_popup,
    ...Object.values(manifest.action?.default_icon || {}),
    manifest.background?.service_worker,
    ...(manifest.background?.scripts || []),
    ...(manifest.content_scripts?.flatMap((entry) => [...(entry.js || []), ...(entry.css || [])]) || [])
  ].filter(Boolean);
  for (const relativePath of new Set(referencedFiles)) {
    await assertFile(join(root, relativePath));
  }

  const files = await listFiles(root);
  for (const relativePath of files.filter((path) => path.endsWith(".js") || path.endsWith(".html"))) {
    const source = await readFile(join(root, relativePath), "utf8");
    const forbidden = [
      /\beval\s*\(/,
      /\bnew\s+Function\s*\(/,
      /\bimportScripts\s*\(\s*["']https?:/,
      /<script[^>]+src\s*=\s*["']https?:/i,
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /\bEventSource\b/,
      /\bsendBeacon\b/
    ];
    if (forbidden.some((pattern) => pattern.test(source))) {
      throw new Error(`${target}: forbidden remote or dynamic-code primitive in ${relativePath}`);
    }
  }

  const popup = await readFile(join(root, "popup", "popup.html"), "utf8");
  if (/<script(?![^>]+src=)[^>]*>/i.test(popup)) {
    throw new Error(`${target}: popup contains an inline script`);
  }
  if (!popup.includes('data-privacy-link')) {
    throw new Error(`${target}: popup must link to the privacy disclosure`);
  }
  if (!popup.includes('href="https://awaydoomscrollin.com/en/"')) {
    throw new Error(`${target}: popup must expose the labelled project website link`);
  }
  await assertFile(join(root, "privacy", "privacy.html"));
  await assertFile(join(root, "privacy", "privacy.css"));
  await assertFile(join(root, "onboarding", "onboarding.html"));
  await assertFile(join(root, "onboarding", "onboarding.css"));
  await assertFile(join(root, "onboarding", "onboarding.js"));
  for (const platform of ["instagram", "tiktok", "youtube"]) {
    const iconPath = `../icons/platform-${platform}.svg`;
    if (!popup.includes(`src="${iconPath}"`)) {
      throw new Error(`${target}: ${platform} platform icon is not referenced by the popup`);
    }
    await assertFile(join(root, "icons", `platform-${platform}.svg`));
  }

  console.log(`${target}: ${files.length} files verified`);
}

await verifyTarget("chrome");
await verifyTarget("firefox");

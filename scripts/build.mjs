import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const sourceRoot = join(projectRoot, "src");
const commonRoot = join(sourceRoot, "common");
const manifestRoot = join(sourceRoot, "manifests");
const distributionRoot = join(projectRoot, "dist");

function assertSafeDistributionPath(path) {
  if (dirname(path) !== projectRoot || basename(path) !== "dist") {
    throw new Error(`Refusing to replace unexpected output path: ${path}`);
  }
}

async function readManifest(target) {
  const path = join(manifestRoot, `${target}.json`);
  return JSON.parse(await readFile(path, "utf8"));
}

async function createPopupMessages(output) {
  const messages = {};
  for (const language of ["en", "tr"]) {
    const catalogPath = join(commonRoot, "_locales", language, "messages.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    messages[language] = Object.fromEntries(
      Object.entries(catalog).map(([key, entry]) => [key, entry.message])
    );
  }
  const source =
    `globalThis.AwayDoomscrollinPopupMessages = Object.freeze(${JSON.stringify(messages)});\n`;
  await writeFile(join(output, "popup", "popup-messages.js"), source, "utf8");
}

async function buildTarget(target) {
  const output = join(distributionRoot, target);
  await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  await mkdir(output, { recursive: true });
  await cp(commonRoot, output, { recursive: true });
  await createPopupMessages(output);

  const manifest = await readManifest(target);
  await writeFile(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

assertSafeDistributionPath(distributionRoot);
await mkdir(distributionRoot, { recursive: true });
await buildTarget("chrome");
await buildTarget("firefox");

console.log(`Built Chrome and Firefox packages in ${distributionRoot}`);


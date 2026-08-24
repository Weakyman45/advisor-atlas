import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "site");
const docs = path.join(root, "docs");
const owner = process.env.GITHUB_PAGES_OWNER || "Weakyman45";
const repository = process.env.GITHUB_PAGES_REPOSITORY || "advisor-atlas";
const pagesOrigin = `https://${owner.toLowerCase()}.github.io/${repository}`;

const [html, data] = await Promise.all([
  fs.readFile(path.join(site, "index.html"), "utf8"),
  fs.readFile(path.join(site, "data", "professors.json"), "utf8"),
]);
const parsed = JSON.parse(data);
if (!Array.isArray(parsed.professors) || parsed.professors.length !== 141) {
  throw new Error("Expected exactly 141 professors in the GitHub Pages build");
}

await fs.rm(docs, { recursive: true, force: true });
await fs.mkdir(path.join(docs, "data"), { recursive: true });
await Promise.all([
  fs.writeFile(path.join(docs, "index.html"), html.replaceAll("__ORIGIN__", pagesOrigin)),
  fs.copyFile(path.join(site, "styles.css"), path.join(docs, "styles.css")),
  fs.copyFile(path.join(site, "app.js"), path.join(docs, "app.js")),
  fs.copyFile(path.join(site, "data", "professors.json"), path.join(docs, "data", "professors.json")),
  fs.copyFile(path.join(root, "public", "og.png"), path.join(docs, "og.png")),
  fs.writeFile(path.join(docs, ".nojekyll"), ""),
]);

console.log(JSON.stringify({ owner, repository, pagesOrigin, professors: parsed.professors.length, output: docs }));

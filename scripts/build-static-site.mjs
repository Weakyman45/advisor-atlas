import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [html, css, clientJs, dataRaw, runtime, hostingRaw] = await Promise.all([
  fs.readFile(path.join(root, "site", "index.html"), "utf8"),
  fs.readFile(path.join(root, "site", "styles.css"), "utf8"),
  fs.readFile(path.join(root, "site", "app.js"), "utf8"),
  fs.readFile(path.join(root, "site", "data", "professors.json"), "utf8"),
  fs.readFile(path.join(root, "worker", "runtime.js"), "utf8"),
  fs.readFile(path.join(root, ".openai", "hosting.json"), "utf8"),
]);
const data = JSON.parse(dataRaw);
if (!Array.isArray(data.professors) || data.professors.length !== 141) throw new Error("Expected exactly 141 professors in site data");
if (new Set(data.professors.map((professor) => professor.id)).size !== 141) throw new Error("Professor IDs must be unique");
let ogBase64 = "";
try { ogBase64 = (await fs.readFile(path.join(root, "public", "og.png"))).toString("base64"); } catch {}
const serverSource = [
  `const INDEX_HTML = ${JSON.stringify(html)};`, `const STYLES_CSS = ${JSON.stringify(css)};`,
  `const CLIENT_JS = ${JSON.stringify(clientJs)};`, `const BASE_DATA = ${JSON.stringify(data)};`,
  `const OG_IMAGE_BYTES = ${JSON.stringify(ogBase64)};`, runtime,
].join("\n\n");
const distServer = path.join(root, "dist", "server");
const distOpenAi = path.join(root, "dist", ".openai");
await fs.mkdir(distServer, { recursive: true });
await fs.mkdir(path.join(distOpenAi, "drizzle"), { recursive: true });
await fs.writeFile(path.join(distServer, "index.js"), serverSource);
await fs.writeFile(path.join(distOpenAi, "hosting.json"), hostingRaw);
await fs.copyFile(path.join(root, "drizzle", "0000_professor_progress.sql"), path.join(distOpenAi, "drizzle", "0000_professor_progress.sql"));
console.log(JSON.stringify({ professors: data.professors.length, bytes: Buffer.byteLength(serverSource), output: path.join(distServer, "index.js") }));

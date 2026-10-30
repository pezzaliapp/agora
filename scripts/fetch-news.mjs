// Agorà — scarica i feed Google News lato server (GitHub Actions, gratis)
// e salva un JSON per ogni combinazione regione/categoria e per ogni località
// di scripts/cities.txt. Uso: node scripts/fetch-news.mjs <cartella-output>
// Nessuna dipendenza: richiede solo Node 18+ (fetch nativo).

import { writeFile, mkdir, readFile } from "node:fs/promises";

const OUT = process.argv[2] || "out";
const LOCAL_MAX = +(process.env.LOCAL_MAX || 80);     // località aggiornate per giro
const LOCAL_MAX_AGE = 50 * 60e3;                      // aggiorna le località più vecchie di 50 min

const CATEGORIES = ["Attualità", "Economia", "Tecnologia", "Sport", "Scienza", "Cultura"];
const REGIONS = ["both", "it", "world"];

const TOPIC = {
  "Economia": "BUSINESS",
  "Tecnologia": "TECHNOLOGY",
  "Sport": "SPORTS",
  "Scienza": "SCIENCE",
  "Cultura": "ENTERTAINMENT",
};

const WORLD_TERMS = {
  "Attualità": "world news",
  "Economia": "world economy business",
  "Tecnologia": "technology",
  "Sport": "sports",
  "Scienza": "science",
  "Cultura": "culture arts",
};

const IT = "hl=it&gl=IT&ceid=IT:it";

function feedUrl(region, category) {
  if (region === "world") {
    const q = encodeURIComponent(WORLD_TERMS[category]);
    return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  }
  let topic;
  if (category === "Attualità") topic = region === "it" ? "NATION" : null;
  else topic = TOPIC[category];
  const base = topic
    ? `https://news.google.com/rss/headlines/section/topic/${topic}`
    : `https://news.google.com/rss`;
  return `${base}?${IT}`;
}

// Stessa normalizzazione usata da js/app.js
function norm(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .split("/")[0].replace(/[^a-z0-9]+/g, " ").trim();
}
const slug = (s) => norm(s).replace(/ /g, "-");

function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
}

function parse(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.slice(0, 20).map((it) => {
    let title = tag(it, "title");
    let source = tag(it, "source");
    if (!source && title.includes(" - ")) {
      const parts = title.split(" - ");
      source = parts.pop();
      title = parts.join(" - ");
    } else if (source && title.endsWith(" - " + source)) {
      title = title.slice(0, -(source.length + 3));
    }
    const d = new Date(tag(it, "pubDate"));
    return {
      title: title || "(senza titolo)",
      source: source || "Fonte",
      url: tag(it, "link"),
      date: isNaN(d) ? "" : d.toISOString(),
    };
  }).filter((a) => a.url)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AgoraNewsBot/1.0; +https://github.com/pezzaliapp/agora)",
          "Accept": "application/rss+xml, application/xml, text/xml",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      if (!text.includes("<item")) throw new Error("feed vuoto");
      return text;
    } catch (e) {
      err = e;
      await sleep(2000 * (i + 1));
    }
  }
  throw err;
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; }
}

async function save(file, articles) {
  await writeFile(file, JSON.stringify({ updated: new Date().toISOString(), articles }) + "\n");
}

await mkdir(`${OUT}/local`, { recursive: true });
let ok = 0, fail = 0;

// ── 1. Categorie (ogni giro) ───────────────────────────────────
const cache = new Map();
for (const region of REGIONS) {
  for (const category of CATEGORIES) {
    const url = feedUrl(region, category);
    const file = `${OUT}/${region}-${slug(category)}.json`;
    try {
      if (!cache.has(url)) cache.set(url, parse(await get(url)));
      const articles = cache.get(url);
      if (!articles.length) throw new Error("nessun articolo");
      await save(file, articles);
      ok++;
    } catch (e) {
      // si tiene il file precedente: l'app mostra le ultime notizie buone
      fail++;
      console.warn(`✗ ${file}: ${e.message}`);
    }
  }
}
console.log(`Categorie: ${ok} ok, ${fail} errori`);

// ── 2. Località (a rotazione, le più vecchie prima) ────────────
const names = (await readFile(new URL("./cities.txt", import.meta.url), "utf8"))
  .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

const index = {};
const ages = [];
for (const name of names) {
  const s = slug(name);
  index[norm(name)] = { slug: s, name };
  const prev = await readJson(`${OUT}/local/${s}.json`);
  ages.push({ name, s, updated: prev ? new Date(prev.updated).getTime() : 0 });
}
await writeFile(`${OUT}/local/index.json`, JSON.stringify(index) + "\n");

const todo = ages
  .filter((a) => Date.now() - a.updated > LOCAL_MAX_AGE)
  .sort((a, b) => a.updated - b.updated)
  .slice(0, LOCAL_MAX);

let lok = 0, lfail = 0;
for (const { name, s } of todo) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(name)}&${IT}`;
  try {
    const articles = parse(await get(url, 2));
    if (!articles.length) throw new Error("nessun articolo");
    await save(`${OUT}/local/${s}.json`, articles);
    lok++;
  } catch (e) {
    lfail++;
    console.warn(`✗ local/${s}: ${e.message}`);
  }
  await sleep(400); // gentile con Google
}
console.log(`Località: ${lok} aggiornate, ${lfail} errori, ${names.length - todo.length} ancora fresche`);

if (ok === 0 && lok === 0) process.exit(1);

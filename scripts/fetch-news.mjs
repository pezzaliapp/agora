// Agorà — scarica i feed Google News lato server (GitHub Actions, gratis)
// e salva un JSON per ogni combinazione regione/categoria in data/.
// Nessuna dipendenza: richiede solo Node 18+ (fetch nativo).

import { writeFile, mkdir, readFile } from "node:fs/promises";

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

// Nome file stabile e senza accenti, uguale a quello usato da js/app.js
export function slug(region, category) {
  const c = category.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return `${region}-${c}`;
}

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
  }).filter((a) => a.url);
}

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
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw err;
}

await mkdir("data", { recursive: true });
let ok = 0, fail = 0;
const cache = new Map(); // stesso URL usato da più combinazioni

for (const region of REGIONS) {
  for (const category of CATEGORIES) {
    const url = feedUrl(region, category);
    const file = `data/${slug(region, category)}.json`;
    try {
      if (!cache.has(url)) cache.set(url, parse(await get(url)));
      const articles = cache.get(url);
      if (!articles.length) throw new Error("nessun articolo");
      // scrive solo se i titoli sono cambiati (evita commit inutili)
      let prev = null;
      try { prev = JSON.parse(await readFile(file, "utf8")); } catch {}
      const same = prev && JSON.stringify(prev.articles) === JSON.stringify(articles);
      if (!same) {
        await writeFile(file, JSON.stringify({ updated: new Date().toISOString(), articles }) + "\n");
      }
      ok++;
      console.log(`✓ ${file} (${articles.length})${same ? " invariato" : ""}`);
    } catch (e) {
      // in caso di errore si tiene il file precedente: l'app mostra le ultime notizie buone
      fail++;
      console.warn(`✗ ${file}: ${e.message}`);
    }
  }
}

console.log(`Fatto: ${ok} ok, ${fail} errori`);
if (ok === 0) process.exit(1);

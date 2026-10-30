/* ──────────────────────────────────────────────────────────────
   Agorà — aggregatore di notizie indipendente (PWA)
   Fonte: feed Google News (aggrega molte testate, link agli originali)
   letti tramite proxy CORS gratuiti. Nessuna chiave, nessuna pubblicità.
   ────────────────────────────────────────────────────────────── */

const CATEGORIES = ["Attualità", "Economia", "Tecnologia", "Sport", "Scienza", "Cultura"];
const REGIONS = [
  { id: "both", label: "Italia + Mondo" },
  { id: "it", label: "Italia" },
  { id: "world", label: "Mondo" },
];

// Topic Google News per categoria (Attualità è gestita a parte)
const TOPIC = {
  "Economia": "BUSINESS",
  "Tecnologia": "TECHNOLOGY",
  "Sport": "SPORTS",
  "Scienza": "SCIENCE",
  "Cultura": "ENTERTAINMENT",
};

// Locale per regione
const LOCALE = {
  it:    { hl: "it",    gl: "IT", ceid: "IT:it" },
  both:  { hl: "it",    gl: "IT", ceid: "IT:it" },
  world: { hl: "it", gl: "IT", ceid: "IT:it" },
};

// Proxy CORS gratuiti (provati in ordine, con fallback)
const PROXIES = [
  (u) => "https://agora-proxy.pezzalialessandro.workers.dev/?url=" + encodeURIComponent(u),
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  (u) => "https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(u),
  (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
];

// ── Stato ──────────────────────────────────────────────────────
const state = {
  category: "Attualità",
  region: "both",
  local: null, // { locality } oppure null
  loading: false,
  reqId: 0,
};

// ── Costruzione URL feed ───────────────────────────────────────
function feedUrl() {
  if (state.local) {
    const q = encodeURIComponent(state.local.locality);
    return `https://news.google.com/rss/search?q=${q}&hl=it&gl=IT&ceid=IT:it`;
  }
  const loc = LOCALE[state.region];
  let topic;
  // "Mondo" usa una ricerca internazionale (il topic WORLD viene bloccato dal proxy)
  if (state.region === "world") {
    const terms = {
      "Attualità": "world news",
      "Economia": "world economy business",
      "Tecnologia": "technology",
      "Sport": "sports",
      "Scienza": "science",
      "Cultura": "culture arts",
    };
    const q = encodeURIComponent(terms[state.category] || "world news");
    return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  }
  if (state.category === "Attualità") {
    topic = state.region === "it" ? "NATION" : null;
  } else {
    topic = TOPIC[state.category];
  }
  const base = topic
    ? `https://news.google.com/rss/headlines/section/topic/${topic}`
    : `https://news.google.com/rss`;
  return `${base}?hl=${loc.hl}&gl=${loc.gl}&ceid=${loc.ceid}`;
}

// ── Notizie pre-scaricate da GitHub Actions (data/*.json) ──────
// Un workflow gratuito scarica i feed ogni 20 minuti e li salva nella repo:
// l'app li legge dal proprio sito, senza proxy e senza problemi CORS.
const RAW_DATA = "https://raw.githubusercontent.com/pezzaliapp/agora/main/data/";

function dataSlug(region, category) {
  const c = category.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return `${region}-${c}`;
}

function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { cache: "no-store", signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function fetchPrebuilt() {
  const name = dataSlug(state.region, state.category) + ".json";
  // 1) stesso sito (GitHub Pages)  2) raw.githubusercontent (aggiornato anche se Pages è in ritardo)
  let best = null;
  for (const base of ["data/", RAW_DATA]) {
    try {
      const res = await fetchWithTimeout(base + name + "?t=" + Date.now(), 6000);
      if (!res.ok) continue;
      const j = await res.json();
      if (!j.articles?.length) continue;
      if (!best || j.updated > best.updated) best = j;
      // se è recente (< 45 min) non serve cercare altrove
      if (Date.now() - new Date(j.updated) < 45 * 60e3) break;
    } catch {}
  }
  if (!best) throw new Error("dati non disponibili");
  return best;
}

// ── Fetch live con fallback fra proxy (ricerca locale / riserva) ─
async function fetchFeed(url) {
  let lastErr;
  for (const wrap of PROXIES) {
    try {
      const res = await fetchWithTimeout(wrap(url), 8000);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      if (text && text.includes("<item")) return text;
      throw new Error("feed vuoto");
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("tutti i proxy hanno fallito");
}

// ── Ultimo risultato buono (per non mostrare mai una pagina vuota) ─
function cacheKey() {
  return "agora:" + (state.local ? "local:" + state.local.locality.toLowerCase() : dataSlug(state.region, state.category));
}
function saveLast(list, updated) {
  try { localStorage.setItem(cacheKey(), JSON.stringify({ list, updated })); } catch {}
}
function loadLast() {
  try { return JSON.parse(localStorage.getItem(cacheKey())); } catch { return null; }
}

async function getArticles() {
  if (!state.local) {
    try {
      const j = await fetchPrebuilt();
      return { list: j.articles.slice(0, 12), updated: j.updated };
    } catch {}
  }
  const list = parseFeed(await fetchFeed(feedUrl()));
  if (!list.length) throw new Error("nessun risultato");
  return { list, updated: new Date().toISOString() };
}

// ── Parsing RSS Google News ────────────────────────────────────
function parseFeed(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  const items = [...doc.querySelectorAll("item")];
  return items.slice(0, 12).map((it) => {
    const get = (t) => it.querySelector(t)?.textContent?.trim() || "";
    let title = get("title");
    const sourceEl = it.querySelector("source");
    let source = sourceEl?.textContent?.trim() || "";
    // Google News mette spesso "Titolo - Testata": separa la testata
    if (!source && title.includes(" - ")) {
      const parts = title.split(" - ");
      source = parts[parts.length - 1];
      title = parts.slice(0, -1).join(" - ");
    } else if (source && title.endsWith(" - " + source)) {
      title = title.slice(0, -(source.length + 3));
    }
    return {
      title: title || "(senza titolo)",
      source: source || "Fonte",
      url: get("link"),
      date: formatDate(get("pubDate")),
    };
  }).filter((a) => a.url);
}

function formatDate(s) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d)) return "";
  const now = new Date();
  const diffH = (now - d) / 36e5;
  if (diffH < 1) return "poco fa";
  if (diffH < 24) return Math.floor(diffH) + " h fa";
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

// ── Render ─────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function renderControls() {
  // regione
  const r = $("region");
  r.innerHTML = "";
  REGIONS.forEach((reg) => {
    const b = document.createElement("button");
    b.textContent = reg.label;
    if (state.region === reg.id && !state.local) b.classList.add("on");
    b.onclick = () => { state.local = null; state.region = reg.id; load(); };
    r.appendChild(b);
  });
  // categorie
  const c = $("chips");
  c.innerHTML = "";
  CATEGORIES.forEach((cat) => {
    const b = document.createElement("button");
    b.textContent = cat;
    if (state.category === cat && !state.local) b.classList.add("on");
    b.onclick = () => { state.local = null; state.category = cat; load(); };
    c.appendChild(b);
  });
  // contesto
  const ctx = $("context");
  if (state.local) {
    ctx.innerHTML = `<svg viewBox="0 0 24 24" class="ic"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${escapeHtml(state.local.locality)} <button class="clear" id="clearLocal"><svg viewBox="0 0 24 24" class="ic"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;
    $("clearLocal").onclick = () => { state.local = null; $("locality").value = ""; load(); };
  } else {
    ctx.innerHTML = `<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"></path></svg> ${state.category}`;
  }
}

function skeletons() {
  let h = "";
  for (let i = 0; i < 5; i++) {
    h += `<article>
      <div class="sk" style="width:90px;height:11px;margin-bottom:10px"></div>
      <div class="sk" style="width:85%;height:24px;margin-bottom:8px"></div>
      <div class="sk" style="width:55%;height:24px;margin-bottom:14px"></div>
      <div class="sk" style="width:120px;height:12px"></div>
    </article>`;
  }
  $("feed").innerHTML = h;
}

function renderArticles(list) {
  const feed = $("feed");
  feed.innerHTML = "";
  list.forEach((a, i) => {
    const el = document.createElement("article");
    if (i === 0) el.classList.add("lead");
    el.style.animationDelay = (0.04 + i * 0.05) + "s";
    el.innerHTML = `
      <div class="meta">
        <span class="src">${escapeHtml(a.source)}</span>
        ${a.date ? `<span class="dot">•</span><span class="date">${escapeHtml(a.date)}</span>` : ""}
      </div>
      <h2><a href="${escapeAttr(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.title)}</a></h2>
      <a class="readmore" href="${escapeAttr(a.url)}" target="_blank" rel="noopener noreferrer">
        Leggi l'originale
        <svg viewBox="0 0 24 24" class="ic"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
      </a>`;
    feed.appendChild(el);
  });
}

function renderError() {
  $("feed").innerHTML = `<div class="errorbox">
    <p>Non sono riuscito a recuperare le notizie.<br>Il proxy gratuito potrebbe essere momentaneamente occupato.</p>
    <button id="retryBtn">Riprova</button>
  </div>`;
  $("retryBtn").onclick = load;
}

// ── Caricamento ────────────────────────────────────────────────
let lastLoad = 0;
async function load() {
  lastLoad = Date.now();
  const id = ++state.reqId;
  state.loading = true;
  renderControls();
  setRefreshing(true);
  skeletons();
  try {
    const { list, updated } = await getArticles();
    if (id !== state.reqId) return;
    renderArticles(list);
    saveLast(list, updated);
    $("updated").textContent = "notizie aggiornate " + updatedLabel(updated);
  } catch (e) {
    if (id !== state.reqId) return;
    const last = loadLast();
    if (last?.list?.length) {
      renderArticles(last.list);
      $("updated").textContent = "fonte non raggiungibile — mostro le notizie salvate " + updatedLabel(last.updated);
    } else {
      renderError();
      $("updated").textContent = "";
    }
  } finally {
    if (id === state.reqId) { state.loading = false; setRefreshing(false); }
  }
}

function updatedLabel(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const t = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? "alle " + t
    : "del " + d.toLocaleDateString("it-IT", { day: "numeric", month: "short" }) + " alle " + t;
}

function setRefreshing(on) {
  $("refreshLabel").textContent = on ? "carico" : "aggiorna";
  $("refreshBtn").querySelector(".ic").classList.toggle("spin", on);
}

// ── Località ───────────────────────────────────────────────────
function submitLocality() {
  const q = $("locality").value.trim();
  if (!q) return;
  state.local = { locality: q };
  load();
}

async function useMyLocation() {
  if (!navigator.geolocation) {
    alert("Geolocalizzazione non disponibile su questo dispositivo.");
    return;
  }
  setRefreshing(true);
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const { latitude: lat, longitude: lon } = pos.coords;
      // reverse geocoding gratuito, senza chiave, lato client
      const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=it`);
      const j = await res.json();
      const place = j.city || j.locality || j.principalSubdivision;
      if (!place) throw new Error("no place");
      $("locality").value = place;
      state.local = { locality: place };
      load();
    } catch {
      setRefreshing(false);
      alert("Non sono riuscito a determinare la tua città. Scrivila nella ricerca.");
    }
  }, () => {
    setRefreshing(false);
    alert("Posizione non concessa. Scrivi una località nella ricerca.");
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 600000 });
}

// ── Utilità ────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ── Init ───────────────────────────────────────────────────────
$("locality").addEventListener("keydown", (e) => { if (e.key === "Enter") submitLocality(); });
$("geoBtn").addEventListener("click", useMyLocation);
$("refreshBtn").addEventListener("click", () => { if (!state.loading) load(); });

renderControls();
load();

// Ricarica da sola quando riapri l'app (PWA in background) o ogni 15 minuti se resta aperta
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !state.loading && Date.now() - lastLoad > 5 * 60e3) load();
});
setInterval(() => {
  if (document.visibilityState === "visible" && !state.loading) load();
}, 15 * 60e3);

// ── Service worker ─────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// Avviso offline
window.addEventListener("offline", () => {
  $("offlineNote").textContent = "Sei offline — le notizie richiedono una connessione.";
});
window.addEventListener("online", () => { $("offlineNote").textContent = ""; });

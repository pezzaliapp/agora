# Agorà

Aggregatore di notizie **indipendente**, **gratuito** e **senza pubblicità**.
Agorà non scrive notizie proprie: raccoglie i titoli da molte testate diverse
(tramite i feed di Google News) e rimanda sempre all'articolo originale.
L'equilibrio nasce dalla pluralità delle voci, non da una linea editoriale.

È una **PWA** (Progressive Web App): si apre nel browser e si può installare
sul telefono o sul desktop come una vera app, con icona e modalità a schermo
intero.

## Funzioni

- Categorie: Attualità, Economia, Tecnologia, Sport, Scienza, Cultura
- Regione: Italia, Mondo, oppure entrambe
- Notizie locali: cerca una città/zona o usa la tua posizione
- Installabile (manifest + service worker) e con shell disponibile offline

## Come pubblicarla su GitHub Pages

1. Crea una repo (per esempio `Agora`, senza accento — GitHub non accetta
   caratteri accentati nei nomi).
2. Carica **tutto il contenuto di questa cartella** nella radice della repo
   (i file `index.html`, `manifest.webmanifest`, `sw.js`, e le cartelle
   `css/`, `js/`, `icons/`).
3. Vai su **Settings → Pages**.
4. In *Build and deployment* scegli **Deploy from a branch**, branch `main`,
   cartella `/ (root)`, e salva.
5. Dopo un minuto il sito sarà online su
   `https://TUO-UTENTE.github.io/Agora/`.
6. Aprilo dal telefono: il browser proporrà **"Aggiungi a schermata Home" /
   "Installa app"**.

> Nota: i percorsi sono tutti **relativi**, quindi funziona anche sotto la
> sotto-cartella `/Agora/` tipica di GitHub Pages.

## Come funzionano i dati

- Le notizie arrivano dai feed RSS di **Google News**, che aggregano molte
  testate diverse e linkano sempre all'originale.
- Un workflow **GitHub Actions** gratuito (`.github/workflows/update-news.yml`)
  scarica i feed **ogni 20 minuti** e li salva in `data/*.json`. L'app li legge
  dal proprio sito: niente proxy, niente problemi CORS.
- Se un feed non risponde, resta l'ultima versione buona; se la rete manca,
  l'app mostra le ultime notizie salvate sul dispositivo.
- Solo la **ricerca locale** (città/zona) usa ancora i proxy CORS in tempo
  reale, con timeout e fallback automatico.
- La geolocalizzazione usa il reverse-geocoding gratuito di **BigDataCloud**.

Tutto resta **a costo zero**: GitHub Actions è gratuito per le repo pubbliche.

> Nota: GitHub sospende i workflow programmati se la repo non ha attività per
> 60 giorni e manda un'email di avviso: in quel caso basta riattivarlo da
> **Actions → Aggiorna notizie → Enable workflow**.

## Struttura

```
.
├── index.html
├── manifest.webmanifest
├── sw.js
├── css/styles.css
├── js/app.js
├── data/           (notizie generate automaticamente)
├── scripts/fetch-news.mjs
├── .github/workflows/update-news.yml
└── icons/  (192, 512, maskable, apple-touch, favicon)
```

## Licenza

Codice libero: usalo, modificalo e ripubblicalo come preferisci.

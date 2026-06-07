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

## Come funzionano i dati (e i limiti onesti)

- Le notizie arrivano dai feed RSS di **Google News**, che aggregano molte
  testate diverse e linkano sempre all'originale.
- Poiché un sito statico non può leggere direttamente quei feed (limiti CORS
  del browser), Agorà passa per un **proxy CORS pubblico gratuito**
  (allorigins / codetabs / corsproxy, con fallback automatico).
- La geolocalizzazione usa il reverse-geocoding gratuito e senza chiave di
  **BigDataCloud** solo per ricavare il nome della città.

Tutto questo è **gratuito e senza pubblicità**, ma i proxy pubblici possono
ogni tanto essere lenti o occupati: in quel caso basta toccare **Aggiorna**.

### Vuoi massima affidabilità e indipendenza totale?

Il punto più fragile è il proxy pubblico. Se in futuro vuoi non dipendere da
terzi, puoi mettere un mini-proxy tuo (poche righe) su un servizio gratuito
(es. una Cloudflare Worker) e sostituire l'elenco `PROXIES` in `js/app.js` con
il tuo indirizzo. La app resta identica.

## Struttura

```
.
├── index.html
├── manifest.webmanifest
├── sw.js
├── css/styles.css
├── js/app.js
└── icons/  (192, 512, maskable, apple-touch, favicon)
```

## Licenza

Codice libero: usalo, modificalo e ripubblicalo come preferisci.

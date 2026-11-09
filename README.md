# PortWatch — Termini Imerese

Sistema di monitoraggio marittimo e intelligence doganale per il **porto di Termini Imerese (PA)** — UN/LOCODE `ITTRI`, coordinate porto **37.98607° N, 13.70420° E**.

L'applicazione legge i **dati AIS reali** dell'area dalla fonte REST [aiscast / Open Waters AIS](https://github.com/openwatersio/aiscast), rileva automaticamente arrivi, partenze, avvicinamenti, variazioni di ETA e perdite di segnale, e mantiene un archivio permanente delle navi con la relativa scheda merceologica e le checklist di preparazione doganale.

> **Nessun dato AIS è simulato.** Se il segnale manca l'interfaccia lo dichiara e le sezioni restano vuote. Le uniche navi in archivio sono quelle realmente ricevute o censite manualmente dall'operatore.

---

## 1. Architettura

L'applicazione gira su **Cloudflare Workers** (tramite OpenNext) ed è pubblicata con **Freebuff Sites**.

```
src/
  app/                        pagine (App Router) + API routes
    api/ais/status|reconnect  stato, log, forzatura di un ciclo AIS
    api/map                   feed posizioni per la mappa
    api/calls                 scali filtrati (attese/arrivi/partenze/in porto)
    api/vessels[/id]          anagrafica, profilo merceologico, traccia
    api/customs[/id]          pratiche doganali e checklist
    api/events                storico eventi + presa visione
    api/settings|recipients   parametri e destinatari email
    api/email/test            invio di una email di prova
    api/export                esportazione Excel
  lib/
    db.ts                     accesso a D1 (schema, migrazioni, seed idempotenti)
    ais/aiscast.ts            client REST aiscast + mappatura GeoJSON → nave/posizione
    ais/status.ts             stato persistito, polling dell'area, log
    ais/ingest.ts             posizioni → navi → geofence → eventi
    domain/geofence.ts        macchina a stati testabile (anti-rimbalzo)
    repo/*                    accesso dati (navi, scali, eventi, dogana, statistiche)
    notify/email.ts           invio notifiche via API HTTP (Brevo)
    xlsx.ts                   generazione file Excel (ExcelJS)
    schema.ts                 schema SQL e migrazioni
```

Stack: Next.js 16 (React 19, TypeScript strict), Leaflet + tile CARTO dark, **Cloudflare D1** (SQLite gestito), **Brevo** per le email, ExcelJS. Nessun processo persistente, nessuna dipendenza nativa.

## 2. Aggiornamento dei dati AIS

Non esiste uno stream continuo: il Worker interroga l'area al massimo **una volta ogni 15 minuti**.

- `GET https://ais.openwaters.io/v1/vessels?bbox=minLat,minLon,maxLat,maxLon` restituisce GeoJSON, non richiede credenziali (limite anonimo: 120 richieste/minuto e 100 gradi² di area).
- Il primo accesso a una pagina o a `/api/ais/status` dopo la finestra di 15 minuti avvia un ciclo in background con `waitUntil`: la risposta HTTP non aspetta il polling.
- Il ciclo applica posizioni e dati statici, aggiorna il geofence, chiude gli scali, registra gli eventi e pota le posizioni più vecchie della conservazione configurata.
- Stato, contatori e log dell'ultimo ciclo sono salvati in `app_meta`, quindi sopravvivono al riavvio degli isolate.
- Impostazioni → **Riconnetti** forza subito un ciclo ignorando la finestra.

**Limite dichiarato:** senza un cron esterno l'aggiornamento avviene alla prima richiesta dopo 15 minuti. Se serve un ciclo automatico anche senza visite, basta far chiamare `/api/ais/status` ogni 15 minuti da un monitor gratuito (es. cron-job.org): l'endpoint rileva l'area scaduta e lancia il polling.

Obblighi di licenza: i dati aiscast vanno attribuiti come *Open Waters AIS (https://openwaters.io/ais/)* e, per i messaggi di provenienza AISHub, ai *AISHub contributors*. L'attribuzione è nella barra laterale dell'applicazione.

## 3. Rilevamento eventi (geofence)

| Parametro | Default | Effetto |
| --- | --- | --- |
| Raggio area portuale | 1 200 m | geofence per arrivi/partenze |
| Isteresi uscita | 15 % | raggio di uscita = 1 380 m |
| Campioni conferma ingresso | 2 | evita falsi arrivi da rimbalzo GPS |
| Conferma partenza | 10 min | uscita solo dopo permanenza fuori area |
| Raggio avvicinamento | 12 mn | evento `APPROACH` |
| Perdita segnale | 20 min | evento `SIGNAL_LOST` una sola volta per episodio |
| Variazione ETA | 60 min | evento `ETA_CHANGE` oltre soglia |
| Deduplica eventi | 45 min | stesso tipo/nave non duplicato |

Gerarchia delle transizioni: `!inside → ENTRY` (crea/aggiorna lo scalo, `ATA` = primo campione valido), `inside → EXIT` (chiude lo scalo, `ATD` = ultima posizione dentro l'area). Ogni ciclo conferma anche le uscite delle navi che hanno smesso di trasmettere e rileva le perdite di segnale.

## 4. Sviluppo in locale

Requisiti: Node.js ≥ 22 e npm.

```bash
npm install
cp .env.example .env.local   # EMAIL_API_KEY se servono le notifiche
npm run dev                  # http://localhost:3000 (D1 locale via Miniflare)
```

Verifiche:

```bash
npm run typecheck
npm test
```

Prova nel runtime Workers reale (consigliata prima di pubblicare):

```bash
npx wrangler dev --config freebuff.wrangler.jsonc --port 8788
```

Comandi utili:

```bash
# ispezione del D1 locale usato da `npm run dev`
npx wrangler d1 execute freebuff-next-db-local --config freebuff.wrangler.jsonc --local --command "SELECT COUNT(*) FROM vessels"
# build Workers + manifest di deploy
npx sites_prepare_next   # tramite gli strumenti Sites
```

## 5. Dati persistenti (D1)

Tabelle: `vessels`, `vessel_aliases`, `vessel_profiles`, `vessel_states`, `positions` (conservazione 90 giorni, campionamento 60 s / 100 m), `port_calls`, `events`, `customs_operations`, `customs_items`, `checklist_templates`, `settings`, `notification_recipients`, `app_meta`.

Lo schema è creato in modo idempotente al primo accesso; le modifiche successive passano da `MIGRATIONS` in `src/lib/schema.ts`. Il riconoscimento di una nave avviene per **MMSI**, poi per alias MMSI, infine per **IMO**: un'unità già censita non viene duplicata. I dati statici AIS aggiornano la scheda senza sovrascrivere i campi inseriti manualmente.

## 6. Notifiche

- **Dashboard**: ogni evento è visibile nello storico con presa visione ed esito dell'invio.
- **Email**: invio tramite **API HTTP di Brevo** (piano gratuito: 300 email/giorno, nessun dominio richiesto).

```ini
EMAIL_API_KEY=xkeysib-...
EMAIL_FROM=<mittente-verificato-su-brevo>
NOTIFY_EMAILS=<destinatari-separati-da-virgola>
```

Passi: creare l'account su [brevo.com](https://www.brevo.com), verificare l'indirizzo mittente in *Senders & Domains*, generare la chiave in *Settings → API Keys*, poi salvarla come secret `EMAIL_API_KEY` del sito (Sites → Secrets) oppure in `.env.local` in sviluppo. Destinatari multipli gestibili da **Impostazioni**, con attivazione, soglia di severità e invio di prova.

Se la chiave manca, l'evento riporta `email_status = skipped` con il motivo (`EMAIL_API_KEY` assente): nessun invio viene simulato.

## 7. Intelligence doganale

Quando una nave compare tra le **attese**, il sistema mostra merci abitualmente trasportate, codici HS noti, precedenti scali e provenienze, la checklist documentale proposta dal modello di carico e le annotazioni dell'operatore. La pratica doganale viene creata in bozza per le navi attese con scheda merceologica compilata; ogni voce è modificabile (`bozza → in preparazione → pronta → chiusa`).

> **Le informazioni sulle merci sono storiche e indicative.** Non sono una dichiarazione del carico del viaggio in corso e non sostituiscono la documentazione doganale né i sistemi ufficiali.

## 8. Pubblicazione (Freebuff Sites)

Il progetto è pubblicato su Freebuff Sites con un database D1 dedicato per ambiente:

- **Produzione:** <https://site-32aceaf9996c406d9832e961f728fe05.freebuff.page> — indirizzo stabile da usare nell'uso quotidiano
- **Preview:** <https://site-266e8f7530a7478da25dcce60ebdbd3b.freebuff.page> — per provare le modifiche prima di pubblicarle

### Aggiornamento automatico ogni 15 minuti

Il polling dell'area avviene alla prima richiesta dopo 15 minuti: per averlo anche senza aprire il sito serve un chiamante esterno. Freebuff Sites non espone Cloudflare Cron Triggers (l'adapter OpenNext esporta solo `fetch` e il manifest di deploy non ha un campo `triggers`), quindi le opzioni sono fuori dalla piattaforma:

- **GitHub Actions** (consigliata, gratuita e online): il workflow pronto è in `.github/workflows/portwatch-ais-cron.yml` e gira ogni 15 minuti su un runner GitHub, senza PC accesso. Richiede solo che il progetto sia in un repository GitHub con Actions abilitate. Nota: GitHub sospende i workflow pianificati dopo 60 giorni di inattività del repository, e le esecuzioni possono slittare di qualche minuto.
- **Attività pianificata di Windows**: `scripts/windows/ping-portwatch-ais.bat` ogni 15 minuti (funziona solo a PC accesso).
- **Qualsiasi monitor HTTP** (cron-job.org, UptimeRobot…) puntato su `/api/ais/status` ogni 15 minuti.

In tutti i casi l'endpoint è idempotente e autolimitato: se il ciclo è recente non fa nulla, quindi chiamate ravvicinate non consumano quota AIS né righe D1.

Se Freebuff Sites mette in pausa il sito per quota di hosting (per esempio limite giornaliero di righe scritte su D1), le richieste rispondono `429` con «This site has reached its hosting allowance» e i dati restano conservati. Il workflow tratta quel caso come **avviso e non come errore**: lo registra nel log, esce con successo e riprova al ciclo successivo, evitando un'email di errore ogni 15 minuti. La pausa si azzera al reset della quota.

### Repository GitHub e attivazione delle Actions

Repository: <https://github.com/daspagnolo01-maker/portwatch> (pubblico; nessuna credenziale o dato personale nel codice).

Il workflow `.github/workflows/portwatch-ais-cron.yml` non richiede secret: chiama solo `/api/ais/status`, che è pubblico e in sola lettura.

1. Creare un repository **vuoto** su GitHub: senza README, senza `.gitignore`, senza licenza (altrimenti il primo push va forzato o riconciliato).
2. Collegare e caricare il progetto: `git remote add origin https://github.com/<utente>/portwatch.git`, poi `git push -u origin main`.
3. Su GitHub: **Settings → Actions → General**, lasciare *Allow all actions and reusable workflows*; in *Workflow permissions* è sufficiente *Read repository contents*.
4. Primo avvio manuale: **Actions → PortWatch AIS cron → Run workflow**. Nel log si leggono `stato`, `ultimo ciclo`, numero di navi ed esito del canale email.
5. Da quel momento la pianificazione è automatica ogni 15 minuti (`*/15 * * * *`, orario **UTC**). Se il repository resta inattivo per 60 giorni GitHub sospende i workflow pianificati: un commit o un *Run workflow* li riattiva.

Quello che **non** va nel repository: `.env`, file `*.db`, build (`freebuff-sites-build/`, `.open-next/`, `.next/`), artefatti e log — sono già in `.gitignore`. I secret di produzione (per esempio `EMAIL_API_KEY`) restano solo nell'ambiente Sites, mai in Git.

### Pubblicare una nuova versione

Per aggiornare il sito pubblicato:

1. `npm run typecheck && npm test`
2. preparare la build Workers (`sites_prepare_next`, che usa l'adapter OpenNext e genera `freebuff-sites-build/manifest.json`)
3. pubblicare il manifest con gli strumenti Sites (`sites_deploy`).

Variabili e secret: `EMAIL_API_KEY` e, se serve, `EMAIL_FROM` / `NOTIFY_EMAILS` / `AISCAST_REST_URL`. **I secret e il database sono separati per ambiente**: aggiungere `EMAIL_API_KEY` sia in Preview sia in Production, altrimenti quell'ambiente dichiara le email come non configurate. Il database D1 (`DB`) è provisionato dall'ambiente Sites; non ci sono credenziali Cloudflare da gestire a mano.

## 9. Accesso e autenticazione

Il sito è uno strumento operativo e non un servizio pubblico: **tutte le pagine e le API richiedono l'accesso**, tranne `/auth/freebuff/*` e i due endpoint di monitoraggio `/api/ais/status` e `/api/health` (usati dal cron e dai controlli esterni, senza dati personali).

L'accesso usa **Sign in with Freebuff** (`@freebuff/auth`): l'utente entra con il proprio account Freebuff (Google, GitHub o Apple) e non ci sono password né segreti da gestire. L'integrazione è fatta di quattro pezzi:

- `src/lib/freebuff.ts` — istanza unica, creata alla prima richiesta con `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER` e `APP_ORIGIN`;
- `src/proxy.ts` — richiede la sessione prima di eseguire pagine e API: senza sessione le pagine rimandano a `/auth/freebuff/signin?returnTo=…` e le API rispondono `401`;
- `src/app/auth/freebuff/[...freebuff]/route.ts` — callback di accesso, uscita e sessione;
- `src/components/UserMenu.tsx` — nome dell'utente collegato e pulsante **Esci** nella barra superiore.

Le regole di accesso sono isolate in `src/lib/access.ts` e coperte da test (`tests/access.test.ts`), così un percorso nuovo non finisce per sbaglio fuori o dentro la protezione.

L'ambiente deve avere l'autenticazione abilitata su Sites (`sites_enable_auth`): il deploy inietta `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN` e la callback registrata è `/auth/freebuff/callback` sull'origine del sito. In locale si usano le variabili dell'ambiente **development**, mai quelle di produzione.

## 10. Limiti dichiarati

- La copertura AIS dipende dai ricevitori della fonte: l'assenza di segnale **non** implica l'assenza della nave.
- aiscast è un servizio comunitario con livello anonimo: copertura e disponibilità variano nel tempo. L'attribuzione delle fonti è obbligatoria per licenza.
- L'aggiornamento è a polling ogni 15 minuti, non in tempo reale secondo per secondo.
- La quota gratuita di Sites consente 10.000 righe D1 scritte al giorno e 10.000 richieste giornaliere: superata la soglia il sito va in pausa (`429`) fino al reset, quindi l'area di monitoraggio va tenuta stretta e il polling non va accelerato sotto i 15 minuti.
- Le email dipendono da Brevo: superato il limite giornaliero gratuito gli invii vengono rifiutati e l'errore è registrato sull'evento.
- ATA/ATD sono orari di **rilevamento AIS**, non dati ufficiali dell'Autorità Portuale.
- L'ultimo porto di provenienza non è un campo AIS: viene dedotto dallo storico locale degli scali (o inserito manualmente).
- GT, DWT, armatore e anno di costruzione non sono trasmessi via AIS: vanno compilati dall'operatore.
- Il software è uno strumento di supporto operativo, non un sistema doganale ufficiale.

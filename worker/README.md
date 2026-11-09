# AutoMemo Push – backend delle notifiche

Cloudflare Worker gratuito che invia le **notifiche push** di AutoMemo (Web Push + VAPID) ai giorni di preavviso scelti dall'utente (30, 15, 7, 1).

- `src/webpush.ts` – cifratura RFC 8291 (aes128gcm) e firma VAPID RFC 8292, solo WebCrypto, nessuna libreria esterna
- `src/schedule.ts` – logica delle soglie: deduplica (mai due volte la stessa soglia), recupero se un giorno salta, nessuna raffica per scadenze vicine
- `src/index.ts` – API + job programmato
- `migrations/` – schema D1

## Dati salvati (minimi)
Per dispositivo: id anonimo casuale, sottoscrizione push (endpoint e chiavi pubbliche del browser).
Per scadenza: id casuale della scadenza e del veicolo, tipo (es. "Revisione"), data di scadenza, soglie scelte e soglie già inviate.
**Mai** targhe, nomi dei veicoli, km, note, foto o costi. Le scadenze passate vengono cancellate automaticamente; le sottoscrizioni scadute (404/410) anche.

## API (CORS solo da `ALLOWED_ORIGINS`)
| Metodo | Percorso | Uso |
| --- | --- | --- |
| GET | `/api/vapid-public-key` | chiave pubblica VAPID |
| PUT | `/api/devices/:deviceId` | salva/aggiorna `{ subscription, deadlines? }` |
| POST | `/api/devices/:deviceId/test` | notifica di prova (max 1 al minuto) |
| DELETE | `/api/devices/:deviceId` | "Disattiva notifiche": cancella tutto |

## Invio programmato
Il cron (`*/2 6-10 * * *` UTC) controlla le scadenze e invia solo dalle **08:00 ora di Roma**, a blocchi di 10 notifiche per esecuzione per rispettare i limiti del piano Free (10 ms di CPU, 50 subrequest esterne). Capacità circa 1.200-1.500 notifiche al giorno.

## Sviluppo e test (senza account Cloudflare)
```bash
npm install
npm test                    # unitari: vettore ufficiale RFC 8291, VAPID, soglie
npm run test:integration    # Worker reale in locale (wrangler dev + D1 locale + cron simulato) con finto push service che decifra
cd .. && npm run test:push  # app + Worker locale + Chrome reale + FCM reale
```
Per lo sviluppo serve un file `.dev.vars` (non committato) con `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `ALLOWED_ORIGINS=https://autodav.github.io,http://localhost:4319`, `ALLOW_TEST_ENDPOINTS=1`, `SEND_HOUR=0`. Le chiavi si generano con `npm run vapid`.

## Pubblicazione (una volta, con un account Cloudflare gratuito)
```bash
npx wrangler login
npx wrangler d1 create automemo-push            # copiare il database_id in wrangler.toml
npx wrangler d1 migrations apply automemo-push --remote
npx wrangler secret put VAPID_PRIVATE_KEY       # chiave privata VAPID (mai nel repository)
npx wrangler deploy                             # → https://automemo-push.<sottodominio>.workers.dev
```
Poi nel repository GitHub: Settings → Secrets and variables → Actions → Variables → `PUSH_API_URL` = URL del Worker, e rilanciare il deploy di Pages.
La chiave pubblica VAPID in `wrangler.toml` deve corrispondere alla privata: se si rigenera la coppia, aggiornare entrambe.

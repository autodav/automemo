# AutoMemo 🚗

**La tua auto. Tutto sotto controllo.**

App web gratuita (PWA) per ricordare manutenzione, scadenze e spese della tua auto.
👉 Provala: https://autodav.github.io/automemo/

- Scadenze (tagliando, olio, revisione, bollo, assicurazione e altro) con intervalli impostati da te secondo il libretto del costruttore
- Registrazione di un intervento in 2 tocchi, con foto della fattura e note
- Avvisi nell'app a 30, 15, 7 e 1 giorno (verde / giallo / rosso)
- Spese mensili e annuali con grafico ed export CSV
- "Chiedi ad AutoMemo": risposte basate solo sui tuoi dati
- Backup e ripristino in JSON, modalità chiara e scura

**Notifiche push (opzionali):** con “Attiva notifiche” in Impostazioni arrivano avvisi sul telefono anche ad app chiusa (su iPhone solo dopo “Aggiungi alla schermata Home” da Safari, iOS 16.4+). Il backend è in [`worker/`](worker/README.md) e riceve solo i dati minimi (tipo e data delle scadenze, soglie scelte).

**Privacy:** nessuna registrazione e nessun server. I dati restano solo sul tuo dispositivo (IndexedDB): se cancelli i dati del browser vanno persi, quindi esporta un backup ogni tanto.

## Sviluppo
React + TypeScript + Tailwind CSS (Vite).

```bash
npm install
npm run dev            # sviluppo
npm run build          # build PWA in dist/
npm run build:single   # file unico AutoMemo.html da aprire senza server
npm run test:e2e       # test end-to-end (Playwright + Chrome)
npm run test:push      # test notifiche push: app + Worker locale + Chrome + FCM reale
```

La pubblicazione su GitHub Pages avviene automaticamente a ogni push su `main` (`.github/workflows/deploy.yml`).
L’indirizzo del backend push è un solo valore: la variabile di repository `PUSH_API_URL` (oppure `src/config.ts`). Se è vuoto, le notifiche push restano disattivate e l’app funziona con i soli promemoria interni.

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

**Privacy:** nessuna registrazione e nessun server. I dati restano solo sul tuo dispositivo (IndexedDB): se cancelli i dati del browser vanno persi, quindi esporta un backup ogni tanto.

## Sviluppo
React + TypeScript + Tailwind CSS (Vite).

```bash
npm install
npm run dev            # sviluppo
npm run build          # build PWA in dist/
npm run build:single   # file unico AutoMemo.html da aprire senza server
npm run test:e2e       # test end-to-end (Playwright + Chrome)
```

La pubblicazione su GitHub Pages avviene automaticamente a ogni push su `main` (`.github/workflows/deploy.yml`).

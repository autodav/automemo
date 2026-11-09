/**
 * Configurazione di AutoMemo.
 *
 * PUSH_API_URL: indirizzo del backend delle notifiche push (Cloudflare Worker in /worker),
 * es. "https://automemo-push.<account>.workers.dev". Se vuoto, le notifiche push sono disattivate
 * e l'app usa solo i promemoria interni. In build si può impostare anche con VITE_PUSH_API_URL.
 */
const PUSH_API_URL_DEFAULT = ''

export const PUSH_API_URL: string = (import.meta.env.VITE_PUSH_API_URL || PUSH_API_URL_DEFAULT).replace(/\/+$/, '')

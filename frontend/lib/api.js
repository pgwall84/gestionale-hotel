'use client';
import Cookies from 'js-cookie';

// Calcola l'URL del backend a runtime — chiamata ad ogni request
// In questo modo funziona da qualsiasi dispositivo e IP
function getApiUrl() {
  if (typeof window === 'undefined') {
    // Lato server (SSR): usa variabile d'ambiente
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api';
  }
  // Lato client: deriva dall'hostname corrente del browser.
  // In produzione (dietro Nginx, dominio pubblico) il backend non è
  // raggiungibile su una porta diretta (7001 non è aperta nel firewall e
  // non ha certificato SSL) — Nginx fa da reverse proxy per /api sotto lo
  // stesso dominio/porta 443, quindi qui basta un percorso relativo alla
  // stessa origine. In sviluppo LAN, invece, backend e frontend girano
  // come due processi Node separati senza reverse proxy davanti, quindi
  // serve ancora la porta esplicita 7001.
  //   localhost:7000 → localhost:7001 (sviluppo)
  //   192.168.1.5:7000 → 192.168.1.5:7001 (sviluppo, altro dispositivo LAN)
  //   hdgolfo-gestionale.com → hdgolfo-gestionale.com/api (produzione, via Nginx)
  const { protocol, hostname } = window.location;
  if (process.env.NODE_ENV === 'production') {
    return `${protocol}//${hostname}/api`;
  }
  return `${protocol}//${hostname}:7001/api`;
}

async function request(method, path, data = null, customHeaders = {}) {
  const BASE_URL = getApiUrl(); // calcolata ogni volta a runtime
  const token = Cookies.get('token');

  const headers = {
    'Authorization': token ? `Bearer ${token}` : '',
    ...customHeaders,
  };

  if (BASE_URL.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  if (!(data instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const options = {
    method,
    headers,
    body: data instanceof FormData ? data : data ? JSON.stringify(data) : null,
  };

  const res = await fetch(`${BASE_URL}${path}`, options);

  // Il redirect automatico su 401 serve per la sessione scaduta su una
  // pagina protetta — NON deve scattare sul login stesso: una password
  // sbagliata risponde anch'essa 401, ma lì serve l'errore vero
  // ("Credenziali non valide"), non un redirect che restituisce undefined
  // e manda in crash chi legge res.data (bug reale trovato il 09/08/2026,
  // causa vera dietro il falso "Errore di connessione" mostrato a login).
  if (res.status === 401 && typeof window !== 'undefined' && path !== '/auth/login') {
    Cookies.remove('token');
    window.location.href = '/login';
    return;
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    // I controller backend non sono uniformi: alcuni rispondono { errore: '...' }
    // (italiano, maggioranza per numero di file), altri { error: '...' } (inglese,
    // Sezione 5 di CLAUDE.md). Leggere solo una delle due chiavi degrada in modo
    // silenzioso a "Errore {status}" generico per metà degli endpoint — scoperto
    // il 06/08/2026 aggiungendo DELETE /api/ristorante/config/:id (chiave errore).
    // Vedi docs/EVOLUTIVE.md per il dettaglio, la nota precedente lì è superata.
    const err = new Error(json?.errore || json?.error || `Errore ${res.status}`);
    err.response = { status: res.status, data: json };
    throw err;
  }

  return { data: json, status: res.status };
}

const api = {
  get:    (path, headers = {})       => request('GET',    path, null, headers),
  post:   (path, data, headers = {}) => request('POST',   path, data, headers),
  put:    (path, data, headers = {}) => request('PUT',    path, data, headers),
  patch:  (path, data, headers = {}) => request('PATCH',  path, data, headers),
  delete: (path, headers = {})       => request('DELETE', path, null, headers),
};

// Esportata anche singolarmente: serve alle pagine SSE (cucina/sala/ristorante)
// che costruiscono a mano l'URL di un EventSource — stessa logica dev/prod,
// mai duplicarla (bug reale trovato l'11/08/2026: 3 pagine calcolavano l'URL
// SSE con la porta 7001 esplicita, mai aggiornate quando questo helper fu
// corretto il 09/08/2026 per le chiamate REST normali — in produzione la 7001
// non è aperta nel firewall, quindi la connessione restava sempre "in corso").
export { getApiUrl };
export default api;

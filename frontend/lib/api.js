'use client';
import Cookies from 'js-cookie';

// Calcola l'URL del backend a runtime — chiamata ad ogni request
// In questo modo funziona da qualsiasi dispositivo e IP
function getApiUrl() {
  if (typeof window === 'undefined') {
    // Lato server (SSR): usa variabile d'ambiente
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api';
  }
  // Lato client: deriva dall'hostname corrente del browser
  // localhost:7000 → localhost:7001
  // 192.168.1.5:7000 → 192.168.1.5:7001
  const { protocol, hostname } = window.location;
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

  if (res.status === 401 && typeof window !== 'undefined') {
    Cookies.remove('token');
    window.location.href = '/login';
    return;
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(json?.errore || `Errore ${res.status}`);
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

export default api;

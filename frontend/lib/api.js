// Client HTTP centralizzato — tutte le chiamate al backend passano da qui.
// Il token JWT viene letto dal cookie e allegato automaticamente a ogni richiesta.
// In caso di 401 (token scaduto) l'utente viene rimandato al login.

import Cookies from 'js-cookie';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api';

async function request(method, path, data = null, customHeaders = {}) {
  const token = Cookies.get('token');
  const headers = {
    'Authorization': token ? `Bearer ${token}` : '',
    ...customHeaders,
  };

  // Non impostare Content-Type per FormData (multer lo gestisce in automatico)
  if (!(data instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const options = {
    method,
    headers,
    body: data instanceof FormData ? data : data ? JSON.stringify(data) : null,
  };

  const res = await fetch(`${BASE_URL}${path}`, options);

  // Token scaduto o non valido → redirect al login
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

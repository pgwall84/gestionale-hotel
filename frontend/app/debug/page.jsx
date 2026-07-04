'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api';
const IS_PROD = process.env.NODE_ENV === 'production';

export default function DebugPage() {
  const [risposta, setRisposta] = useState(null);
  const [errore,   setErrore]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [log,      setLog]      = useState([]);

  if (IS_PROD) {
    return <div style={{ padding: 24, fontFamily: 'monospace' }}>Pagina non disponibile in produzione.</div>;
  }

  function aggiungiLog(msg) {
    setLog(prev => [...prev, `${new Date().toISOString().slice(11, 23)} — ${msg}`]);
  }

  async function testConnessione() {
    setLoading(true);
    setRisposta(null);
    setErrore(null);
    setLog([]);
    aggiungiLog('click ricevuto');
    aggiungiLog(`URL target: ${API_URL}/health`);

    try {
      aggiungiLog('fetch() avviata...');
      const res = await fetch(`${API_URL}/health`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      aggiungiLog(`risposta HTTP ${res.status}`);
      const testo = await res.text();
      aggiungiLog(`body: ${testo.slice(0, 120)}`);
      let body;
      try { body = JSON.parse(testo); } catch { body = testo; }
      if (!res.ok) {
        setErrore({ status: res.status, statusText: res.statusText, body });
      } else {
        setRisposta({ status: res.status, body });
      }
    } catch (err) {
      aggiungiLog(`ERRORE: ${err.name} — ${err.message}`);
      setErrore({ tipo: err.name, messaggio: err.message });
    } finally {
      setLoading(false);
      aggiungiLog('fine');
    }
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: 20, maxWidth: 680, margin: '0 auto', background: '#111', minHeight: '100vh', color: '#f3f4f6' }}>
      <h1 style={{ fontSize: 18, marginBottom: 20 }}>🔧 Debug — development</h1>

      {/* Variabili */}
      <section style={{ marginBottom: 24, background: '#1f2937', borderRadius: 8, padding: 14 }}>
        <div style={stileRiga}><span style={stileLabel}>NEXT_PUBLIC_API_URL</span><span style={{ color: '#fbbf24', wordBreak: 'break-all' }}>{API_URL}</span></div>
        <div style={stileRiga}><span style={stileLabel}>NODE_ENV</span><span style={{ color: '#fbbf24' }}>{process.env.NODE_ENV || '(non definito)'}</span></div>
      </section>

      {/* Bottone */}
      <button
        onClick={testConnessione}
        disabled={loading}
        style={{ padding: '12px 24px', fontSize: 15, fontFamily: 'monospace', background: loading ? '#374151' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 20, width: '100%' }}
      >
        {loading ? '⏳ Connessione in corso...' : '▶ Test connessione backend'}
      </button>

      {/* Log in tempo reale */}
      {log.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase' }}>Log</div>
          <pre style={{ ...stileBox('#0f172a', '#94a3b8'), fontSize: 11 }}>{log.join('\n')}</pre>
        </section>
      )}

      {/* Risposta OK */}
      {risposta && (
        <section style={{ marginBottom: 20 }}>
          <div style={{ color: '#22c55e', marginBottom: 8 }}>✅ HTTP {risposta.status} — OK</div>
          <pre style={stileBox('#052e16', '#bbf7d0')}>{JSON.stringify(risposta.body, null, 2)}</pre>
        </section>
      )}

      {/* Errore */}
      {errore && (
        <section style={{ marginBottom: 20 }}>
          <div style={{ color: '#ef4444', marginBottom: 8 }}>❌ Errore</div>
          <pre style={stileBox('#2d0a0a', '#fecaca')}>{JSON.stringify(errore, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}

const stileRiga  = { display: 'flex', gap: 8, marginBottom: 6, fontSize: 13, flexWrap: 'wrap' };
const stileLabel = { color: '#9ca3af', minWidth: 200 };

function stileBox(bg, color) {
  return { background: bg, color, padding: 12, borderRadius: 6, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 };
}

'use client';

// Pagina timbratura — un pulsante grande ENTRATA o USCITA.
// Il sistema determina automaticamente il tipo in base all'ultima timbratura.
// Accessibile a tutti i ruoli dallo smartphone.

import { useState, useEffect } from 'react';
import { LogIn, LogOut, Clock } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import StatusBadge from '@/components/ui/StatusBadge';
import api from '@/lib/api';

// Coordinate hotel e raggio massimo consentito per timbrare.
const HOTEL_LAT = 44.0773612;
const HOTEL_LON = 9.9127261;
const RAGGIO_MAX_METRI = 50;

// Formula Haversine — distanza in metri tra due coordinate GPS (funzione pura, no librerie).
function distanzaMetri(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Promisifica getCurrentPosition per poterla usare con await.
function ottieniPosizione() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('no-geolocation')); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
  });
}

export default function PaginaTimbratura() {
  const [stato, setStato] = useState(null);
  const [storico, setStorico] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [invio, setInvio] = useState(false);
  const [messaggio, setMessaggio] = useState(null);
  // Orologio live aggiornato ogni minuto
  const [oraCorrente, setOraCorrente] = useState('');

  useEffect(() => {
    caricaDati();
    aggiornaOra();
    const timer = setInterval(aggiornaOra, 30000);
    return () => clearInterval(timer);
  }, []);

  function aggiornaOra() {
    setOraCorrente(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
  }

  async function caricaDati() {
    setCaricamento(true);
    try {
      const [statoRes, storicoRes] = await Promise.all([
        api.get('/hr/timbrature/stato'),
        api.get('/hr/timbrature/storico'),
      ]);
      setStato(statoRes.data);
      setStorico(storicoRes.data.timbrature);
    } catch {
      setMessaggio({ testo: 'Errore nel caricamento dei dati.', tipo: 'red' });
    } finally {
      setCaricamento(false);
    }
  }

  async function handleTimbra() {
    setInvio(true);
    setMessaggio(null);

    let geo = {};
    try {
      const posizione = await ottieniPosizione();
      const distanza = Math.round(distanzaMetri(
        posizione.coords.latitude, posizione.coords.longitude, HOTEL_LAT, HOTEL_LON
      ));
      if (distanza > RAGGIO_MAX_METRI) {
        setMessaggio({ testo: `Devi essere in hotel per timbrare. Sei a ${distanza} metri dalla struttura.`, tipo: 'red' });
        setInvio(false);
        return;
      }
      geo = { latitudine: posizione.coords.latitude, longitudine: posizione.coords.longitude, distanza_hotel: distanza };
    } catch (err) {
      if (err?.code === 1 /* PERMISSION_DENIED */) {
        setMessaggio({ testo: 'Permesso posizione negato. Contatta il titolare.', tipo: 'red' });
        setInvio(false);
        return;
      }
      // Posizione non disponibile per altri motivi (timeout, GPS assente, browser non supportato):
      // non blocchiamo la timbratura, la registriamo senza coordinate.
      geo = {};
    }

    try {
      const res = await api.post('/hr/timbrature', geo);
      setMessaggio({ testo: res.data.messaggio, tipo: 'green' });
      await caricaDati();
    } catch (err) {
      setMessaggio({ testo: err?.response?.data?.errore || 'Errore durante la timbratura.', tipo: 'red' });
    } finally {
      setInvio(false);
    }
  }

  const formattaOra  = ts => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const formattaData = ts => new Date(ts).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });

  const dentroStruttura = stato?.dentroStruttura;

  return (
    <AppShell titolo="Timbratura">
      <div className="max-w-sm mx-auto">

        {/* ── Card pulsante principale ── */}
        <div className="rounded-xl p-6 mb-4 text-center"
             style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>

          {caricamento ? (
            <p className="text-sm py-8" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
          ) : (
            <>
              <div className="mb-5">
                <StatusBadge
                  status={dentroStruttura ? 'green' : 'red'}
                  label={dentroStruttura ? 'In struttura' : 'Fuori struttura'}
                />
                {stato?.ultimaTimbatura && (
                  <p className="text-[12px] mt-2" style={{ color: 'var(--muted-foreground)' }}>
                    Ultima: {stato.ultimaTimbatura.tipo} alle {formattaOra(stato.ultimaTimbatura.timestamp)}
                  </p>
                )}
              </div>

              {/* Ora corrente live */}
              <div className="flex items-center justify-center gap-2 mb-6">
                <Clock size={16} style={{ color: 'var(--muted-foreground)' }} />
                <span className="text-3xl font-medium tabular-nums" style={{ color: 'var(--foreground)' }}>
                  {oraCorrente}
                </span>
              </div>

              {/* Pulsante grande — 64px per uso comodo da smartphone */}
              <button
                onClick={handleTimbra}
                disabled={invio}
                className="w-full flex items-center justify-center gap-3 rounded-xl font-medium text-white text-lg transition-opacity disabled:opacity-60"
                style={{ height: '64px', background: dentroStruttura ? '#DC2626' : 'var(--hotel-navy)' }}
              >
                {dentroStruttura
                  ? <><LogOut size={22} />{invio ? 'Registrazione...' : 'USCITA'}</>
                  : <><LogIn size={22} />{invio ? 'Registrazione...' : 'ENTRATA'}</>
                }
              </button>
            </>
          )}
        </div>

        {/* Feedback */}
        {messaggio && (
          <div className="rounded-xl px-4 py-3 mb-4 text-sm"
               style={{
                 background: messaggio.tipo === 'green' ? 'var(--status-green-bg)' : 'var(--status-red-bg)',
                 color:      messaggio.tipo === 'green' ? 'var(--status-green-text)' : 'var(--status-red-text)',
               }}>
            {messaggio.testo}
          </div>
        )}

        {/* ── Storico ── */}
        <div className="rounded-xl overflow-hidden"
             style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '0.5px solid var(--border)' }}>
            <p className="text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>Ultimi 30 giorni</p>
          </div>
          {storico.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Nessuna timbratura registrata.
            </p>
          ) : (
            storico.slice(0, 20).map(t => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3"
                   style={{ borderBottom: '0.5px solid var(--border)' }}>
                <p className="text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
                  {formattaData(t.timestamp)}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium tabular-nums" style={{ color: 'var(--foreground)' }}>
                    {formattaOra(t.timestamp)}
                  </span>
                  <StatusBadge status={t.tipo === 'entrata' ? 'green' : 'red'} label={t.tipo} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}

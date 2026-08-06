'use client';

// Pagina Arrivi/Partenze di oggi — Modulo 5.1 (Check-in/check-out digitale,
// 03/08/2026). Vista operativa per reception/portiere notte: due liste
// (arrivi, partenze) filtrate da GET /api/prenotazioni/griglia sul solo
// giorno odierno, con azione di check-in/check-out a un click.
// Nessuna nuova rotta backend: riusa la griglia planning già esistente
// (stessa fonte di /planning-camere, dati sempre coerenti) e la transizione
// di stato PATCH /api/prenotazioni/:id/stato (già usata dal pannello
// dettaglio della griglia) — questa pagina è solo un filtro + scorciatoia
// per non dover aprire il planning per ogni arrivo/partenza del giorno.
//
// Permessi (shared/ruoli.js sezione 'prenotazioni'): check-in ammesso ad
// admin/titolare/receptionist/portiere_notte (quest'ultimo, come nel
// pannello planning, solo per questa transizione); check-out solo
// admin/titolare/receptionist — portiere_notte non è autorizzato, stessa
// regola del pannello dettaglio in /planning-camere.

import { useState, useEffect, useCallback } from 'react';
import { LogIn, LogOut, CheckCircle2, AlertTriangle, Loader2, User } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const RUOLI_CHECKIN  = ['admin', 'titolare', 'receptionist', 'portiere_notte'];
const RUOLI_CHECKOUT = ['admin', 'titolare', 'receptionist'];

// Stessa aritmetica locale usata in planning-camere/page.jsx e camere/page.jsx
// — mai new Date().toISOString(), fa perdere un giorno in UTC+1/+2.
function oggiLocale() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function domaniLocale() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATI_LABEL = {
  opzione:    'Opzione',
  confermata: 'Confermata',
  check_in:   'Check-in fatto',
  check_out:  'Check-out fatto',
  chiusa:     'Chiusa',
};

function RigaOspite({ riga, tipo, puoAgire, salvando, onAzione }) {
  const nome = `${riga.ospite_nome || ''} ${riga.ospite_cognome || ''}`.trim() || '—';
  const cameraLabel = riga.camera_numero === 'app' ? riga.camera_nome : `Camera ${riga.camera_numero}`;
  const inCorso = salvando === riga.soggiorno_id;

  // Check-in ammesso solo da 'confermata'; check-out solo da 'check_in' —
  // stessa TRANSIZIONI_VALIDE del backend (prenotazioniController.js).
  const azioneAmmessa = tipo === 'arrivo'
    ? riga.prenotazione_stato === 'confermata'
    : riga.prenotazione_stato === 'check_in';
  const giaFatto = tipo === 'arrivo'
    ? ['check_in', 'check_out', 'chiusa'].includes(riga.prenotazione_stato)
    : ['check_out', 'chiusa'].includes(riga.prenotazione_stato);

  return (
    <div className="flex items-center justify-between px-3 py-2.5 text-sm gap-3"
         style={{ borderBottom: '0.5px solid var(--border)' }}>
      <div className="flex items-center gap-2 min-w-0">
        <User size={15} style={{ color: 'var(--muted-foreground)' }} />
        <div className="min-w-0">
          <p className="font-medium truncate" style={{ color: 'var(--foreground)' }}>{nome}</p>
          <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
            {cameraLabel} · {riga.num_ospiti} ospit{riga.num_ospiti === 1 ? 'e' : 'i'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{
                background: giaFatto ? 'var(--status-blue-bg)' : 'var(--status-amber-bg)',
                color: giaFatto ? 'var(--status-blue-text)' : 'var(--status-amber-text)',
              }}>
          {STATI_LABEL[riga.prenotazione_stato] || riga.prenotazione_stato}
        </span>

        {giaFatto ? (
          <CheckCircle2 size={16} style={{ color: 'var(--status-blue-text)' }} />
        ) : puoAgire && azioneAmmessa ? (
          <button onClick={() => onAzione(riga)} disabled={inCorso}
                  className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-navy)' }}>
            {inCorso ? <Loader2 size={13} className="animate-spin" /> : (tipo === 'arrivo' ? <LogIn size={13} /> : <LogOut size={13} />)}
            {tipo === 'arrivo' ? 'Check-in' : 'Check-out'}
          </button>
        ) : !azioneAmmessa ? (
          <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
            {tipo === 'arrivo' ? 'Da confermare' : '—'}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function PaginaArriviPartenze() {
  const { utente } = useAuth();
  const oggiStr = oggiLocale();

  const [righe, setRighe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [salvando, setSalvando] = useState(null);

  const puoCheckIn  = RUOLI_CHECKIN.includes(utente?.ruolo);
  const puoCheckOut = RUOLI_CHECKOUT.includes(utente?.ruolo);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const risposta = await api.get(
        `/prenotazioni/griglia?data_inizio=${oggiStr}&data_fine=${domaniLocale()}`
      );
      setRighe(risposta.data.filter(r => r.soggiorno_id));
    } catch (err) {
      setErrore('Errore nel caricamento degli arrivi/partenze di oggi.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { carica(); }, [carica]);

  async function eseguiTransizione(riga, tipo) {
    setSalvando(riga.soggiorno_id);
    setErrore(null);
    try {
      await api.patch(`/prenotazioni/${riga.prenotazione_id}/stato`, {
        stato: tipo === 'arrivo' ? 'check_in' : 'check_out',
      });
      await carica();
    } catch (err) {
      setErrore(err.message || 'Operazione non riuscita.');
    } finally {
      setSalvando(null);
    }
  }

  const arrivi   = righe.filter(r => r.data_arrivo === oggiStr);
  const partenze = righe.filter(r => r.data_partenza === oggiStr);

  return (
    <AppShell titolo="Arrivi e Partenze" sottotitolo="Oggi">
      {errore && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          <AlertTriangle size={14} /> {errore}
        </div>
      )}

      {loading ? (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
      ) : (
        <div className="flex flex-col gap-5">
          <section>
            <div className="flex items-center gap-2 mb-2">
              <LogIn size={15} style={{ color: 'var(--status-green-text)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                Arrivi ({arrivi.length})
              </h3>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
              {arrivi.length === 0 ? (
                <p className="text-center py-6 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessun arrivo previsto oggi.</p>
              ) : (
                arrivi.map(r => (
                  <RigaOspite key={r.soggiorno_id} riga={r} tipo="arrivo"
                              puoAgire={puoCheckIn} salvando={salvando}
                              onAzione={(r) => eseguiTransizione(r, 'arrivo')} />
                ))
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-2">
              <LogOut size={15} style={{ color: 'var(--status-red-text)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                Partenze ({partenze.length})
              </h3>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
              {partenze.length === 0 ? (
                <p className="text-center py-6 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessuna partenza prevista oggi.</p>
              ) : (
                partenze.map(r => (
                  <RigaOspite key={r.soggiorno_id} riga={r} tipo="partenza"
                              puoAgire={puoCheckOut} salvando={salvando}
                              onAzione={(r) => eseguiTransizione(r, 'partenza')} />
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

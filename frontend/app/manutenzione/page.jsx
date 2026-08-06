'use client';

// Pagina Manutenzione/guasti — segnalazione aperta a tutto il personale
// (camera o area comune, foto opzionale), gestione stato (presa in carico,
// risoluzione) riservata ad admin/titolare. Stesso pattern UI di
// app/archivio/page.jsx (bottom sheet per la creazione, lista con filtri).

import { useState, useEffect, useCallback } from 'react';
import { Wrench, Plus, X, Camera as CameraIcon } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import StatusBadge from '@/components/ui/StatusBadge';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const LUOGHI = {
  camera:            'Camera',
  bar:               'Bar',
  sala_ristorante:   'Sala ristorante',
  cucina:            'Cucina',
  lavanderia:        'Lavanderia',
  lavaggio_piatti:   'Lavaggio piatti',
  magazzino:         'Magazzino',
  garage:            'Garage',
  altro:             'Altro',
};

const PRIORITA_BADGE = { bassa: 'green', media: 'amber', alta: 'red' };
const STATO_BADGE = { aperta: 'red', in_lavorazione: 'amber', risolta: 'green' };
const STATO_LABEL = { aperta: 'Aperta', in_lavorazione: 'In lavorazione', risolta: 'Risolta' };

export default function ManutenzionePage() {
  const { utente } = useAuth();
  const puoGestire = utente && ['admin', 'titolare'].includes(utente.ruolo);

  const [segnalazioni, setSegnalazioni] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [filtroStato, setFiltroStato] = useState('');
  const [filtroPriorita, setFiltroPriorita] = useState('');
  const [mostraForm, setMostraForm] = useState(false);
  const [inviando, setInviando] = useState(false);

  const carica = useCallback(async () => {
    try {
      setLoading(true); setErrore(null);
      const params = new URLSearchParams();
      if (filtroStato) params.set('stato', filtroStato);
      if (filtroPriorita) params.set('priorita', filtroPriorita);
      const r = await api.get(`/manutenzione?${params.toString()}`);
      setSegnalazioni(r.data.segnalazioni || []);
    } catch (err) {
      setErrore(err.message);
    } finally {
      setLoading(false);
    }
  }, [filtroStato, filtroPriorita]);

  useEffect(() => { carica(); }, [carica]);

  const aggiornaStato = async (id, stato) => {
    let note_risoluzione;
    if (stato === 'risolta') {
      note_risoluzione = window.prompt('Nota di risoluzione (opzionale):') || '';
    }
    try {
      await api.patch(`/manutenzione/${id}/stato`, { stato, note_risoluzione });
      await carica();
    } catch (err) {
      alert(err.response?.data?.errore || err.message);
    }
  };

  return (
    <AppShell titolo="Manutenzione">
      <div className="flex flex-col gap-4 max-w-2xl mx-auto">

        <div className="flex justify-between items-center">
          <h1 className="font-bold text-xl" style={{ color: 'var(--foreground)' }}>Manutenzione e guasti</h1>
          <button onClick={() => setMostraForm(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#16344b', color: '#fff' }}>
            <Plus size={16} /> Segnala
          </button>
        </div>

        {/* Filtri */}
        <div className="flex gap-2 flex-wrap">
          <select value={filtroStato} onChange={e => setFiltroStato(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}>
            <option value="">Tutti gli stati</option>
            {Object.entries(STATO_LABEL).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>
          <select value={filtroPriorita} onChange={e => setFiltroPriorita(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}>
            <option value="">Tutte le priorità</option>
            <option value="bassa">Bassa</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
          </select>
        </div>

        {/* Lista segnalazioni */}
        {loading ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : errore ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--status-red-text)' }}>{errore}</p>
        ) : segnalazioni.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessuna segnalazione.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {segnalazioni.map(s => (
              <div key={s.id} className="rounded-xl px-4 py-3 flex flex-col gap-2"
                   style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Wrench size={18} style={{ color: 'var(--muted-foreground)' }} />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--foreground)' }}>
                        {s.luogo_tipo === 'camera' ? `Camera ${s.camera_numero}` : LUOGHI[s.luogo_tipo] || s.luogo_tipo}
                        {s.luogo_note ? ` · ${s.luogo_note}` : ''}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {s.segnalato_da_nome ? `${s.segnalato_da_nome} ${s.segnalato_da_cognome} · ` : ''}
                        {new Date(s.created_at).toLocaleDateString('it-IT')}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <StatusBadge status={PRIORITA_BADGE[s.priorita]} label={s.priorita} />
                    <StatusBadge status={STATO_BADGE[s.stato]} label={STATO_LABEL[s.stato]} />
                  </div>
                </div>

                <p className="text-sm" style={{ color: 'var(--foreground)' }}>{s.descrizione}</p>

                {s.foto_filename && (
                  <a href={`/uploads/manutenzione/${s.foto_filename}`} target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--primary)' }}>
                    <CameraIcon size={14} /> Vedi foto
                  </a>
                )}

                {s.stato === 'risolta' && s.note_risoluzione && (
                  <p className="text-xs italic" style={{ color: 'var(--muted-foreground)' }}>
                    Risolta{s.gestito_da_nome ? ` da ${s.gestito_da_nome} ${s.gestito_da_cognome}` : ''}: {s.note_risoluzione}
                  </p>
                )}

                {puoGestire && s.stato !== 'risolta' && (
                  <div className="flex gap-2 pt-1">
                    {s.stato === 'aperta' && (
                      <button onClick={() => aggiornaStato(s.id, 'in_lavorazione')}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                        Prendi in carico
                      </button>
                    )}
                    <button onClick={() => aggiornaStato(s.id, 'risolta')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium"
                            style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
                      Segna risolta
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {mostraForm && (
        <FormSegnalazione
          loading={inviando}
          onAnnulla={() => setMostraForm(false)}
          onInvia={async (formData) => {
            setInviando(true);
            try {
              await api.post('/manutenzione', formData); // FormData: lib/api.js non forza Content-Type JSON
              setMostraForm(false);
              await carica();
            } catch (err) {
              alert(err.response?.data?.errore || err.message);
            } finally {
              setInviando(false);
            }
          }}
        />
      )}
    </AppShell>
  );
}

function FormSegnalazione({ onInvia, onAnnulla, loading }) {
  const [luogoTipo, setLuogoTipo] = useState('camera');
  const [cameraId, setCameraId] = useState('');
  const [camere, setCamere] = useState([]);
  const [luogoNote, setLuogoNote] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [priorita, setPriorita] = useState('media');
  const [foto, setFoto] = useState(null);

  useEffect(() => {
    // Lista camere per il selettore — GET /api/camere è aperta a qualunque
    // ruolo autenticato (nessun richiedeAzione), a differenza dell'anagrafica.
    const oggi = new Date().toISOString().slice(0, 10);
    api.get(`/camere?data=${oggi}`)
      .then(r => setCamere(r.data || []))
      .catch(() => setCamere([]));
  }, []);

  const valido = luogoTipo && descrizione.trim() && (luogoTipo !== 'camera' || cameraId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
         style={{ background: 'rgba(0,0,0,0.45)' }}
         onClick={onAnnulla}>
      <div className="w-full max-w-xl rounded-t-2xl p-5 flex flex-col gap-3 max-h-[90vh] overflow-y-auto"
           style={{ background: 'var(--card)' }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>Nuova segnalazione</p>
          <button onClick={onAnnulla}><X size={20} style={{ color: 'var(--muted-foreground)' }} /></button>
        </div>

        <select value={luogoTipo} onChange={e => { setLuogoTipo(e.target.value); setCameraId(''); }}
                className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }}>
          {Object.entries(LUOGHI).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
        </select>

        {luogoTipo === 'camera' && (
          <select value={cameraId} onChange={e => setCameraId(e.target.value)}
                  className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }}>
            <option value="">Seleziona camera...</option>
            {camere.map(c => <option key={c.id} value={c.id}>{c.numero}{c.nome ? ` — ${c.nome}` : ''}</option>)}
          </select>
        )}

        <input type="text" placeholder="Dettaglio luogo (opzionale, es. bagno cameriera)" value={luogoNote}
               onChange={e => setLuogoNote(e.target.value)}
               className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />

        <textarea placeholder="Cosa è successo? *" value={descrizione} onChange={e => setDescrizione(e.target.value)}
                  rows={3} className="w-full rounded-xl p-3 text-sm resize-none"
                  style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }} />

        <select value={priorita} onChange={e => setPriorita(e.target.value)}
                className="w-full rounded-xl p-3 text-sm" style={{ fontSize: 16, background: 'var(--input)', color: 'var(--foreground)', border: '1px solid var(--border)' }}>
          <option value="bassa">Priorità bassa</option>
          <option value="media">Priorità media</option>
          <option value="alta">Priorità alta</option>
        </select>

        <div>
          <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Foto (opzionale)</label>
          <input type="file" accept="image/*" onChange={e => setFoto(e.target.files?.[0] || null)}
                 className="w-full text-sm mt-1" style={{ color: 'var(--foreground)' }} />
        </div>

        <button
          onClick={() => {
            const fd = new FormData();
            fd.append('luogo_tipo', luogoTipo);
            if (luogoTipo === 'camera') fd.append('camera_id', cameraId);
            if (luogoNote) fd.append('luogo_note', luogoNote);
            fd.append('descrizione', descrizione.trim());
            fd.append('priorita', priorita);
            if (foto) fd.append('foto', foto);
            onInvia(fd);
          }}
          disabled={loading || !valido}
          className="w-full py-3.5 rounded-xl font-bold text-base"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: (loading || !valido) ? 0.6 : 1 }}>
          {loading ? 'Invio...' : 'Invia segnalazione'}
        </button>
      </div>
    </div>
  );
}

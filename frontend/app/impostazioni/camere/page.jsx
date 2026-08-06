'use client';

// Pagina Impostazioni ▸ Camere — task preliminare al modulo 2.3, deciso il
// 31/07/2026: sposta fuori da /tariffe (modulo 2.2) tutto ciò che è
// configurazione strutturale (non prezzo) delle camere, e aggiunge
// l'anagrafica delle camere fisiche che prima non esisteva in nessuna UI
// (le camere vivevano solo a DB). Tre sezioni:
//   1. Anagrafica camere (NUOVA) — crea/modifica/attiva-disattiva una camera
//      fisica. Mai una DELETE reale: una camera con soggiorni storici resta
//      referenziata, "eliminarla" significa disattivarla (bloccato con 409
//      se ha soggiorni in corso o futuri — vedi camereController.attivaDisattiva).
//   2. Categorie camera (SPOSTATA da /tariffe, codice invariato).
//   3. Assegnazione categoria→camera (SPOSTATA da /tariffe, codice invariato).
// Accesso: solo admin/titolare (shared/ruoli.js sezione 'camere'.'anagrafica'
// per la scrittura; questa pagina, a differenza di /tariffe, non è visibile
// nemmeno in lettura a receptionist — è configurazione, non consultazione
// prezzi). Vedi docs/DIARIO_SESSIONI.md per la decisione di riordino.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Power } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const RUOLI_ACCESSO = ['admin', 'titolare'];

const inputStyle = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

export default function PaginaImpostazioniCamere() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const [tipiCamera, setTipiCamera] = useState([]);
  const [camereTutte, setCamereTutte] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [successo, setSuccesso] = useState('');

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_ACCESSO.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const caricaTutto = useCallback(async () => {
    setCaricamento(true);
    try {
      const [resTipi, resCamere] = await Promise.all([
        api.get('/tipi-camera'),
        api.get('/camere?tutte=true'),
      ]);
      setTipiCamera(resTipi.data);
      setCamereTutte(resCamere.data.camere);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento.');
    } finally {
      setCaricamento(false);
    }
  }, []);

  useEffect(() => {
    if (utente && RUOLI_ACCESSO.includes(utente.ruolo)) caricaTutto();
  }, [utente, caricaTutto]);

  if (loading || !utente) return null;

  const camereAttive = camereTutte.filter(c => c.attivo);

  return (
    <AppShell titolo="Impostazioni · Camere">
      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}
      {successo && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
          {successo}
        </div>
      )}

      {caricamento ? (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
      ) : (
        <div className="flex flex-col gap-6">
          <SezioneAnagraficaCamere
            camereTutte={camereTutte}
            tipiCamera={tipiCamera}
            onCambiato={caricaTutto}
            onErrore={setErrore}
            onSuccesso={setSuccesso}
          />

          <SezioneCategorieCamera
            tipiCamera={tipiCamera}
            onCambiato={caricaTutto}
            onErrore={setErrore}
            onSuccesso={setSuccesso}
          />

          <SezioneAssegnazioneCamere
            camere={camereAttive}
            tipiCamera={tipiCamera}
            onCambiato={caricaTutto}
            onErrore={setErrore}
          />
        </div>
      )}
    </AppShell>
  );
}

// ── Sezione 1: anagrafica camere fisiche (NUOVA) ─────────────────────────────

function SezioneAnagraficaCamere({ camereTutte, tipiCamera, onCambiato, onErrore, onSuccesso }) {
  const [form, setForm] = useState(null); // null | 'nuovo' | {camera}
  const [numero, setNumero] = useState('');
  const [nome, setNome] = useState('');
  const [piano, setPiano] = useState('');
  const [salvataggio, setSalvataggio] = useState(false);

  function apriNuovo() {
    setNumero(''); setNome(''); setPiano(''); setForm('nuovo'); onErrore('');
  }
  function apriModifica(c) {
    setNumero(c.numero); setNome(c.nome ?? ''); setPiano(c.piano ?? ''); setForm(c); onErrore('');
  }

  async function salva() {
    if (!numero.trim()) return onErrore('Il numero/codice camera è obbligatorio.');
    setSalvataggio(true);
    try {
      const body = { numero: numero.trim(), nome: nome || null, piano: piano === '' ? null : Number(piano) };
      if (form === 'nuovo') await api.post('/camere', body);
      else await api.patch(`/camere/${form.id}`, body);
      setForm(null);
      onSuccesso('Camera salvata.');
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nel salvataggio.');
    } finally {
      setSalvataggio(false);
    }
  }

  async function cambiaStato(c) {
    const messaggio = c.attivo
      ? `Disattivare la camera "${c.numero !== 'app' ? c.numero : c.nome}"? Resterà visibile qui per riattivarla in futuro.`
      : `Riattivare la camera "${c.numero !== 'app' ? c.numero : c.nome}"?`;
    if (!confirm(messaggio)) return;
    try {
      await api.patch(`/camere/${c.id}/attivo`, { attivo: !c.attivo });
      onSuccesso(c.attivo ? 'Camera disattivata.' : 'Camera riattivata.');
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nell\'operazione.');
    }
  }

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Anagrafica camere</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            Numero/codice, nome e piano. Utile anche in futuro per aggiungere altre unità (es. un secondo appartamento).
          </p>
        </div>
        <button onClick={apriNuovo} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-white shrink-0"
                style={{ background: 'var(--hotel-amber)' }}>
          <Plus size={13} /> Nuova camera
        </button>
      </div>

      {form !== null && (
        <div className="mb-3 p-3 rounded-lg space-y-2" style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="Numero/codice (es. 12, app)" value={numero} onChange={e => setNumero(e.target.value)}
                   className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
            <input placeholder="Nome (opzionale)" value={nome} onChange={e => setNome(e.target.value)}
                   className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
            <input placeholder="Piano" type="number" value={piano} onChange={e => setPiano(e.target.value)}
                   className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
          </div>
          <div className="flex gap-2">
            <button onClick={salva} disabled={salvataggio}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                    style={{ background: 'var(--hotel-navy)' }}>
              {salvataggio ? 'Salvataggio...' : 'Salva'}
            </button>
            <button onClick={() => setForm(null)} className="text-xs font-medium px-3 py-1.5 rounded-lg border">Annulla</button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {camereTutte.map(c => (
          <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
               style={{ background: 'var(--background)', opacity: c.attivo ? 1 : 0.6 }}>
            <div>
              <span className="font-medium">{c.numero !== 'app' ? `Camera ${c.numero}` : (c.nome || 'Appartamento')}</span>
              {c.piano != null && <span className="ml-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>piano {c.piano}</span>}
              {c.tipo_camera_nome && <span className="ml-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>{c.tipo_camera_nome}</span>}
              {!c.attivo && (
                <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--status-graylight-bg)', color: 'var(--status-graylight-text)' }}>
                  Disattivata
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => apriModifica(c)} className="p-1.5 rounded-lg hover:bg-gray-100" style={{ color: 'var(--muted-foreground)' }}>
                <Pencil size={13} />
              </button>
              <button onClick={() => cambiaStato(c)} className="p-1.5 rounded-lg hover:bg-gray-100"
                      style={{ color: c.attivo ? 'var(--status-red-text)' : 'var(--status-green-text)' }}
                      title={c.attivo ? 'Disattiva' : 'Riattiva'}>
                <Power size={13} />
              </button>
            </div>
          </div>
        ))}
        {camereTutte.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--muted-foreground)' }}>Nessuna camera configurata.</p>
        )}
      </div>
    </div>
  );
}

// ── Sezione 2: categorie camera (spostata da /tariffe, invariata) ───────────

function SezioneCategorieCamera({ tipiCamera, onCambiato, onErrore, onSuccesso }) {
  const [form, setForm] = useState(null); // null | 'nuovo' | {tipo}
  const [nome, setNome] = useState('');
  const [capienzaMax, setCapienzaMax] = useState('');
  const [note, setNote] = useState('');
  const [salvataggio, setSalvataggio] = useState(false);

  function apriNuovo() {
    setNome(''); setCapienzaMax(''); setNote(''); setForm('nuovo'); onErrore('');
  }
  function apriModifica(t) {
    setNome(t.nome); setCapienzaMax(t.capienza_max ?? ''); setNote(t.note ?? ''); setForm(t); onErrore('');
  }

  async function salva() {
    if (!nome.trim()) return onErrore('Il nome della categoria è obbligatorio.');
    setSalvataggio(true);
    try {
      const body = { nome: nome.trim(), capienza_max: capienzaMax === '' ? null : Number(capienzaMax), note: note || null };
      if (form === 'nuovo') await api.post('/tipi-camera', body);
      else await api.patch(`/tipi-camera/${form.id}`, body);
      setForm(null);
      onSuccesso('Categoria salvata.');
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nel salvataggio.');
    } finally {
      setSalvataggio(false);
    }
  }

  async function elimina(t) {
    if (!confirm(`Eliminare la categoria "${t.nome}"?`)) return;
    try {
      await api.delete(`/tipi-camera/${t.id}`);
      onSuccesso('Categoria eliminata.');
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nell\'eliminazione.');
    }
  }

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Categorie camera</h3>
        <button onClick={apriNuovo} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-white"
                style={{ background: 'var(--hotel-amber)' }}>
          <Plus size={13} /> Nuova categoria
        </button>
      </div>

      {form !== null && (
        <div className="mb-3 p-3 rounded-lg space-y-2" style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Nome (es. Matrimoniale)" value={nome} onChange={e => setNome(e.target.value)}
                   className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
            <input placeholder="Capienza max" type="number" min={1} value={capienzaMax}
                   onChange={e => setCapienzaMax(e.target.value)}
                   className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
          </div>
          <input placeholder="Note (es. riferimento categoria su Booking/Airbnb)" value={note}
                 onChange={e => setNote(e.target.value)}
                 className="w-full px-3 rounded-lg text-sm outline-none" style={inputStyle} />
          <div className="flex gap-2">
            <button onClick={salva} disabled={salvataggio}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                    style={{ background: 'var(--hotel-navy)' }}>
              {salvataggio ? 'Salvataggio...' : 'Salva'}
            </button>
            <button onClick={() => setForm(null)} className="text-xs font-medium px-3 py-1.5 rounded-lg border">Annulla</button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {tipiCamera.map(t => (
          <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
               style={{ background: 'var(--background)' }}>
            <div>
              <span className="font-medium">{t.nome}</span>
              {t.capienza_max != null && <span className="ml-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>max {t.capienza_max} persone</span>}
              <span className="ml-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>{t.camere_assegnate} camere</span>
              {t.note && <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{t.note}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => apriModifica(t)} className="p-1.5 rounded-lg hover:bg-gray-100" style={{ color: 'var(--muted-foreground)' }}>
                <Pencil size={13} />
              </button>
              <button onClick={() => elimina(t)} className="p-1.5 rounded-lg hover:bg-gray-100" style={{ color: 'var(--status-red-text)' }}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {tipiCamera.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--muted-foreground)' }}>Nessuna categoria configurata.</p>
        )}
      </div>
    </div>
  );
}

// ── Sezione 3: assegnazione categoria alle camere (spostata da /tariffe, invariata) ──

function SezioneAssegnazioneCamere({ camere, tipiCamera, onCambiato, onErrore }) {
  const [salvataggio, setSalvataggio] = useState(null); // id camera in salvataggio

  async function assegna(cameraId, tipoCameraId) {
    setSalvataggio(cameraId);
    try {
      await api.patch(`/camere/${cameraId}/tipo`, { tipo_camera_id: tipoCameraId === '' ? null : Number(tipoCameraId) });
      onCambiato();
    } catch (err) {
      onErrore(err.message || 'Errore nell\'assegnazione.');
    } finally {
      setSalvataggio(null);
    }
  }

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Categoria per camera</h3>
      <div className="rounded-lg overflow-hidden" style={{ border: '0.5px solid var(--border)' }}>
        {camere.map((c, idx) => (
          <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm"
               style={{
                 background: idx % 2 === 0 ? 'var(--card)' : 'var(--background)',
                 borderBottom: idx < camere.length - 1 ? '0.5px solid var(--border)' : 'none',
               }}>
            <span>{c.numero !== 'app' ? `Camera ${c.numero}` : c.nome}</span>
            <select value={c.tipo_camera_id ?? ''} disabled={salvataggio === c.id}
                    onChange={e => assegna(c.id, e.target.value)}
                    className="px-2 py-1 rounded-lg text-xs outline-none" style={{ ...inputStyle, height: '30px' }}>
              <option value="">Nessuna categoria</option>
              {tipiCamera.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
        ))}
        {camere.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--muted-foreground)' }}>Nessuna camera attiva.</p>
        )}
      </div>
    </div>
  );
}

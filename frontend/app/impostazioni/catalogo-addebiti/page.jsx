'use client';

// Impostazioni ▸ Catalogo addebiti — voci bar per la griglia a quadratoni
// della pagina /addebiti-extra (modulo Addebiti extra, 10/08/2026).
// Deliberatamente separato da Impostazioni ▸ Menu: queste voci non sono il
// menu pubblico/stampato, sono solo la lista prezzi bar per l'addebito
// veloce. Nessuna DELETE reale, solo attivo/disattivo (stesso pattern di
// camere/tavoli/prodotti magazzino).
// Accessibile a: admin, titolare (shared/ruoli.js sezione
// 'catalogo_addebiti_rapidi'.scrittura).

import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertTriangle, Plus, Pencil, Check, X } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import api from '@/lib/api';

export default function PaginaCatalogoAddebiti() {
  const [voci, setVoci] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [nuova, setNuova] = useState({ nome: '', prezzo: '' });
  const [salvando, setSalvando] = useState(false);
  const [inModifica, setInModifica] = useState(null); // id in modifica
  const [formModifica, setFormModifica] = useState({ nome: '', prezzo: '' });

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const risposta = await api.get('/impostazioni/catalogo-addebiti?tutti=true');
      setVoci(risposta.data?.catalogo || []);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carica(); }, [carica]);

  async function creaVoce() {
    const prezzo = Number(nuova.prezzo);
    if (!nuova.nome.trim() || isNaN(prezzo) || prezzo < 0) return;
    setSalvando(true);
    setErrore(null);
    try {
      await api.post('/impostazioni/catalogo-addebiti', { nome: nuova.nome.trim(), prezzo });
      setNuova({ nome: '', prezzo: '' });
      await carica();
    } catch (err) {
      setErrore(err.message || 'Errore nel salvataggio');
    } finally {
      setSalvando(false);
    }
  }

  function apriModifica(voce) {
    setInModifica(voce.id);
    setFormModifica({ nome: voce.nome, prezzo: voce.prezzo });
  }

  async function salvaModifica(id) {
    const prezzo = Number(formModifica.prezzo);
    if (!formModifica.nome.trim() || isNaN(prezzo) || prezzo < 0) return;
    setSalvando(true);
    setErrore(null);
    try {
      await api.patch(`/impostazioni/catalogo-addebiti/${id}`, { nome: formModifica.nome.trim(), prezzo });
      setInModifica(null);
      await carica();
    } catch (err) {
      setErrore(err.message || 'Errore nel salvataggio');
    } finally {
      setSalvando(false);
    }
  }

  async function toggleAttivo(voce) {
    setSalvando(true);
    setErrore(null);
    try {
      await api.patch(`/impostazioni/catalogo-addebiti/${voce.id}`, { attivo: !voce.attivo });
      await carica();
    } catch (err) {
      setErrore(err.message || 'Errore nel salvataggio');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <AppShell titolo="Catalogo addebiti">
      <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
        Voci mostrate nella griglia rapida di Addebiti extra (bar/camera). Una voce disattivata resta negli addebiti già registrati ma sparisce dalla griglia.
      </p>

      {errore && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-3 text-xs"
             style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          <AlertTriangle size={14} /> {errore}
        </div>
      )}

      {/* Nuova voce */}
      <div className="rounded-xl p-3 mb-4 flex items-end gap-2"
           style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <div className="flex-1">
          <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Nome</label>
          <input
            value={nuova.nome}
            onChange={e => setNuova(v => ({ ...v, nome: e.target.value }))}
            placeholder="es. Birra 33"
            className="w-full text-sm rounded-lg px-2 py-1.5 mt-0.5"
            style={{ border: '0.5px solid var(--border)', background: 'var(--background)' }}
          />
        </div>
        <div style={{ width: 110 }}>
          <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Prezzo</label>
          <input
            type="number" min="0" step="0.5"
            value={nuova.prezzo}
            onChange={e => setNuova(v => ({ ...v, prezzo: e.target.value }))}
            placeholder="0.00"
            className="w-full text-sm rounded-lg px-2 py-1.5 mt-0.5"
            style={{ border: '0.5px solid var(--border)', background: 'var(--background)' }}
          />
        </div>
        <button onClick={creaVoce} disabled={salvando}
                className="rounded-lg px-3 py-1.5 text-sm font-medium flex items-center gap-1.5"
                style={{ background: 'var(--hotel-navy)', color: 'white', opacity: salvando ? 0.6 : 1 }}>
          <Plus size={14} /> Aggiungi
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          <Loader2 size={18} className="animate-spin mr-2" /> Caricamento...
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border)' }}>
          {!voci.length && (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--muted-foreground)' }}>
              Nessuna voce nel catalogo.
            </p>
          )}
          {voci.map(voce => (
            <div key={voce.id} className="flex items-center justify-between px-3 py-2 text-sm gap-2"
                 style={{ borderBottom: '0.5px solid var(--border)', opacity: voce.attivo ? 1 : 0.5 }}>
              {inModifica === voce.id ? (
                <>
                  <input
                    value={formModifica.nome}
                    onChange={e => setFormModifica(v => ({ ...v, nome: e.target.value }))}
                    className="flex-1 text-sm rounded-lg px-2 py-1"
                    style={{ border: '0.5px solid var(--border)' }}
                  />
                  <input
                    type="number" min="0" step="0.5"
                    value={formModifica.prezzo}
                    onChange={e => setFormModifica(v => ({ ...v, prezzo: e.target.value }))}
                    className="text-sm rounded-lg px-2 py-1"
                    style={{ width: 90, border: '0.5px solid var(--border)' }}
                  />
                  <button onClick={() => salvaModifica(voce.id)} aria-label="Salva">
                    <Check size={16} style={{ color: 'var(--status-green-text)' }} />
                  </button>
                  <button onClick={() => setInModifica(null)} aria-label="Annulla">
                    <X size={16} style={{ color: 'var(--muted-foreground)' }} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1">{voce.nome}</span>
                  <span style={{ color: 'var(--muted-foreground)' }}>€ {Number(voce.prezzo).toFixed(2).replace('.', ',')}</span>
                  <button onClick={() => apriModifica(voce)} aria-label={`Modifica ${voce.nome}`}>
                    <Pencil size={14} style={{ color: 'var(--muted-foreground)' }} />
                  </button>
                  <button
                    onClick={() => toggleAttivo(voce)}
                    className="text-xs rounded-lg px-2 py-1"
                    style={{ border: '0.5px solid var(--border)' }}
                  >
                    {voce.attivo ? 'Disattiva' : 'Riattiva'}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

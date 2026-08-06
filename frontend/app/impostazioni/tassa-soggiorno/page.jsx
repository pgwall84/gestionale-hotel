'use client';

// Pagina Impostazioni ▸ Tassa di soggiorno — Modulo 2.4, Fase 2A.
// Gestisce lo storico delle aliquote deliberate dal Comune di Lerici
// (configurazione_tassa_soggiorno, vedi database/migrations/021_tassa_soggiorno.sql).
// Una nuova aliquota non sovrascrive la precedente: il backend chiude
// automaticamente la riga aperta (valido_al IS NULL) e ne inserisce una
// nuova, così i soggiorni passati restano calcolati con l'aliquota vigente
// all'epoca. Riservata ad admin/titolare (shared/ruoli.js sezione
// 'tassa_soggiorno', azione 'configurazione') — la parte operativa
// (calcolo/riscossione/report) è nella pagina separata /tassa-soggiorno.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import DataTable from '@/components/ui/DataTable';
import CampoData from '@/components/ui/CampoData';

const RUOLI_CONFIGURAZIONE = ['admin', 'titolare'];

const inputStyle = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

export default function PaginaConfigurazioneTassaSoggiorno() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const [configurazioni, setConfigurazioni] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [successo, setSuccesso] = useState('');
  const [formAperto, setFormAperto] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);

  const [importoANotte, setImportoANotte] = useState('');
  const [etaEsenteFino, setEtaEsenteFino] = useState('');
  const [nottiMaxTassabili, setNottiMaxTassabili] = useState('');
  const [validoDal, setValidoDal] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_CONFIGURAZIONE.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const caricaConfigurazioni = useCallback(async () => {
    setCaricamento(true);
    try {
      const res = await api.get('/tassa-soggiorno/configurazione');
      setConfigurazioni(res.data);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento dello storico aliquote.');
    } finally {
      setCaricamento(false);
    }
  }, []);

  useEffect(() => {
    if (utente && RUOLI_CONFIGURAZIONE.includes(utente.ruolo)) caricaConfigurazioni();
  }, [utente, caricaConfigurazioni]);

  function apriNuovo() {
    setImportoANotte('');
    setEtaEsenteFino('');
    setNottiMaxTassabili('');
    setValidoDal('');
    setNote('');
    setErrore('');
    setSuccesso('');
    setFormAperto(true);
  }

  async function salva() {
    if (!importoANotte || !validoDal) {
      setErrore('Importo a notte e valido dal sono obbligatori.');
      return;
    }
    setSalvataggio(true);
    setErrore('');
    try {
      await api.post('/tassa-soggiorno/configurazione', {
        importo_a_notte: Number(importoANotte),
        eta_esente_fino: etaEsenteFino ? Number(etaEsenteFino) : null,
        notti_max_tassabili: nottiMaxTassabili ? Number(nottiMaxTassabili) : null,
        valido_dal: validoDal,
        note: note || null,
      });
      setFormAperto(false);
      setSuccesso('Nuova aliquota salvata.');
      caricaConfigurazioni();
    } catch (err) {
      setErrore(err.message || 'Errore nel salvataggio della nuova aliquota.');
    } finally {
      setSalvataggio(false);
    }
  }

  if (loading || !utente) return null;

  const colonne = [
    { header: 'Valido dal', accessor: r => r.valido_dal },
    { header: 'Valido al', accessor: r => r.valido_al || 'in corso' },
    { header: 'Importo/notte', accessor: r => `€${Number(r.importo_a_notte).toFixed(2)}` },
    { header: 'Età esente fino a', accessor: r => (r.eta_esente_fino ?? '—') },
    { header: 'Notti max tassabili', accessor: r => (r.notti_max_tassabili ?? '—') },
    { header: 'Note', accessor: r => r.note || '—' },
  ];

  return (
    <AppShell titolo="Tassa di soggiorno — Aliquote">
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

      <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Storico aliquote</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              Ogni nuova aliquota chiude automaticamente quella precedente — nessuna riga viene mai sovrascritta.
            </p>
          </div>
          <button onClick={apriNuovo} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-white shrink-0"
                  style={{ background: 'var(--hotel-amber)' }}>
            <Plus size={13} /> Nuova aliquota
          </button>
        </div>

        {formAperto && (
          <div className="mb-3 p-3 rounded-lg space-y-2" style={{ background: 'var(--background)', border: '0.5px solid var(--border)' }}>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min={0} step="0.01" placeholder="€/notte per persona" value={importoANotte}
                     onChange={e => setImportoANotte(e.target.value)}
                     className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
              <CampoData placeholder="Valido dal" value={validoDal}
                     onChange={v => setValidoDal(v)}
                     className="px-3" style={inputStyle} />
              <input type="number" min={0} placeholder="Età esente fino a (opzionale)" value={etaEsenteFino}
                     onChange={e => setEtaEsenteFino(e.target.value)}
                     className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
              <input type="number" min={0} placeholder="Notti max tassabili (opzionale)" value={nottiMaxTassabili}
                     onChange={e => setNottiMaxTassabili(e.target.value)}
                     className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
            </div>
            <input placeholder="Note (opzionale — es. riferimento delibera comunale)" value={note}
                   onChange={e => setNote(e.target.value)}
                   className="w-full px-3 rounded-lg text-sm outline-none" style={inputStyle} />
            <div className="flex gap-2">
              <button onClick={salva} disabled={salvataggio}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                      style={{ background: 'var(--hotel-navy)' }}>
                {salvataggio ? 'Salvataggio...' : 'Salva'}
              </button>
              <button onClick={() => setFormAperto(false)} className="text-xs font-medium px-3 py-1.5 rounded-lg border">Annulla</button>
            </div>
          </div>
        )}

        {caricamento ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
        ) : (
          <DataTable colonne={colonne} dati={configurazioni} emptyText="Nessuna aliquota configurata." />
        )}
      </div>
    </AppShell>
  );
}

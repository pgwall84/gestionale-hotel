'use client';

// Pagina Adempimenti ▸ Statistiche Liguria — Modulo 2.6, Fase 1 (28/08/2026).
// Genera l'XML RIMOVCLI/ISTAT C/59 (docs/rimovcli/ModelloC59.xsd) per un
// intervallo di date — UN FILE PER GIORNO (schema RIMOVCLI, diverso dal
// tracciato nazionale ROSS1000/Turismo5 in /impostazioni/ross1000, che non
// tocca questa pagina), per verifica manuale e upload manuale sul portale
// RIMOVCLI di Regione Liguria — NESSUN invio automatico (mancano ancora le
// credenziali; stesso approccio già seguito per ROSS1000 e Alloggiati Web:
// prima si genera/verifica, poi si carica). Regione Liguria ammette anche
// un caricamento in batch settimanale (mail Dott.ssa Tagliano, 27/08/2026):
// da qui si può generare più giorni insieme e scaricarli in un unico zip.
// Riservata ad admin/titolare (shared/ruoli.js sezione 'rimovcli').

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api, { getApiUrl } from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import CampoData from '@/components/ui/CampoData';
import { Download, AlertTriangle, FileBarChart, Archive } from 'lucide-react';

const RUOLI_PAGINA = ['admin', 'titolare'];

const inputStyle = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

function oggi() {
  return new Date().toISOString().slice(0, 10);
}
function domani() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function PaginaStatisticheLiguria() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const [dataInizio, setDataInizio] = useState(oggi());
  const [dataFine, setDataFine] = useState(domani());
  const [idstruttura, setIdstruttura] = useState('');
  const [generazione, setGenerazione] = useState(false);
  const [scaricandoZip, setScaricandoZip] = useState(false);
  const [errore, setErrore] = useState('');
  const [risultato, setRisultato] = useState(null); // { giorni: [{ giorno, xml, avvisi, nome_file }] }

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_PAGINA.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  function parametriQuery() {
    const p = new URLSearchParams({ data_inizio: dataInizio, data_fine: dataFine });
    if (idstruttura.trim()) p.set('idstruttura', idstruttura.trim());
    return p;
  }

  async function genera() {
    if (!dataInizio || !dataFine) {
      setErrore('Indica data di inizio e data di fine.');
      return;
    }
    setGenerazione(true);
    setErrore('');
    setRisultato(null);
    try {
      const res = await api.get(`/rimovcli/export-c59?${parametriQuery()}`);
      setRisultato(res.data);
    } catch (err) {
      setErrore(err.message || "Errore nella generazione dell'XML.");
    } finally {
      setGenerazione(false);
    }
  }

  function scaricaGiorno(giorno) {
    const blob = new Blob([giorno.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = giorno.nome_file || 'rimovcli_c59.xml';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function scaricaTuttiZip() {
    setScaricandoZip(true);
    setErrore('');
    try {
      const Cookies = (await import('js-cookie')).default;
      const token = Cookies.get('token');
      const res = await fetch(`${getApiUrl()}/rimovcli/export-c59.zip?${parametriQuery()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrore(err.error || `Errore ${res.status} nella generazione dello zip.`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rimovcli_c59_${dataInizio}_${dataFine}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErrore('Errore durante il download dello zip.');
    } finally {
      setScaricandoZip(false);
    }
  }

  if (loading || !utente) return null;

  const totaleAvvisi = risultato?.giorni?.reduce((tot, g) => tot + (g.avvisi?.length || 0), 0) || 0;

  return (
    <AppShell titolo="Statistiche Liguria">
      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--status-blue-bg)', border: '0.5px solid var(--border)' }}>
        <p className="text-xs" style={{ color: 'var(--foreground)' }}>
          Fase 1 — genera solo gli XML per verifica manuale, un file per ogni giorno dell'intervallo (schema
          RIMOVCLI/ISTAT C/59). Nessun invio reale al portale regionale: controlla il contenuto e gli avvisi
          prima di caricarli. Motore diverso dalla pagina ROSS1000 (in Adempimenti sopra) — non tocca il
          tracciato nazionale.
        </p>
      </div>

      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4" style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}

      <div className="rounded-xl p-4 mb-4 space-y-3" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Genera export</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Dal (incluso)</label>
            <CampoData value={dataInizio} onChange={v => setDataInizio(v)}
                   className="px-3" style={inputStyle} />
          </div>
          <div>
            <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Al (escluso)</label>
            <CampoData value={dataFine} onChange={v => setDataFine(v)}
                   className="px-3" style={inputStyle} />
          </div>
        </div>
        <div>
          <label className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            Codice struttura RIMOVCLI (opzionale — vuoto = "DA_CONFIGURARE", nessun codice reale finché la
            certificazione con Regione Liguria non ha esito positivo)
          </label>
          <input value={idstruttura} onChange={e => setIdstruttura(e.target.value)}
                 placeholder="DA_CONFIGURARE"
                 className="w-full px-3 rounded-lg text-sm outline-none" style={inputStyle} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={genera} disabled={generazione}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60"
                  style={{ background: 'var(--hotel-navy)' }}>
            <FileBarChart size={14} /> {generazione ? 'Generazione...' : 'Genera XML'}
          </button>
          <button onClick={scaricaTuttiZip} disabled={scaricandoZip || !dataInizio || !dataFine}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg disabled:opacity-60"
                  style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
            <Archive size={14} /> {scaricandoZip ? 'Preparazione zip...' : 'Scarica tutti (.zip)'}
          </button>
        </div>
      </div>

      {risultato?.giorni?.length > 0 && (
        <div className="space-y-3">
          {totaleAvvisi > 0 && (
            <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
              <p className="flex items-center gap-1.5 font-medium"><AlertTriangle size={13} /> {totaleAvvisi} avviso/i complessivi da verificare prima del caricamento</p>
            </div>
          )}

          {risultato.giorni.map(giorno => (
            <div key={giorno.giorno} className="rounded-xl p-4 space-y-3" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{giorno.giorno}</h3>
                <button onClick={() => scaricaGiorno(giorno)}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white"
                        style={{ background: 'var(--hotel-amber)' }}>
                  <Download size={13} /> Scarica {giorno.nome_file}
                </button>
              </div>

              {giorno.avvisi?.length > 0 && (
                <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
                  <p className="flex items-center gap-1.5 font-medium"><AlertTriangle size={13} /> {giorno.avvisi.length} avviso/i</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {giorno.avvisi.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}

              <pre className="text-[10px] p-3 rounded-lg overflow-x-auto max-h-96 overflow-y-auto"
                   style={{ background: 'var(--background)', border: '0.5px solid var(--border)', color: 'var(--foreground)' }}>
                {giorno.xml}
              </pre>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

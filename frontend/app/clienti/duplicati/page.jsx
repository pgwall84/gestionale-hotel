'use client';

// Pagina Duplicati sospetti — CRM ospiti (14/08/2026), Modulo 2.1.
// Punto più delicato dell'intera funzionalità: l'identità ospite è
// collegata a dati legali/fiscali (Alloggiati Web, tassa di soggiorno),
// quindi qui NON si cancella mai nulla e NON si unisce mai in automatico —
// solo segnalazione (GET /ospiti/duplicati-sospetti, gruppi per
// nome+cognome+data di nascita uguali) e unione manuale con conferma
// esplicita dell'operatore (POST /ospiti/:vincitore/unisci). Il "perdente"
// resta nel database con duplicato_di valorizzato, mai eliminato — vedi
// backend/controllers/anagraficaOspitiController.js.
// Permessi: solo admin/titolare (shared/ruoli.js sezione 'ospiti'.unisci),
// più stretto della scrittura normale su clienti.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import Link from 'next/link';
import { ArrowLeft, Users, AlertTriangle, Check } from 'lucide-react';

const RUOLI_UNISCI = ['admin', 'titolare'];

// Sceglie il candidato "vincitore" proposto di default: più soggiorni
// registrati (identità più consolidata nel sistema), a parità l'id più
// basso (il record più vecchio). Solo un suggerimento — l'operatore può
// sempre scegliere un altro candidato prima di confermare.
function candidatoSuggerito(candidati) {
  return [...candidati].sort((a, b) => {
    const diff = (b.numero_soggiorni || 0) - (a.numero_soggiorni || 0);
    if (diff !== 0) return diff;
    return a.id - b.id;
  })[0];
}

export default function PaginaDuplicati() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const [gruppi, setGruppi] = useState([]);
  const [selezioni, setSelezioni] = useState({}); // indice gruppo -> id vincitore scelto
  const [confermaIndice, setConfermaIndice] = useState(null);
  const [unendo, setUnendo] = useState(false);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [messaggio, setMessaggio] = useState('');

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_UNISCI.includes(utente.ruolo))) router.replace('/clienti');
  }, [utente, loading, router]);

  const caricaGruppi = useCallback(async () => {
    setCaricamento(true);
    setErrore('');
    try {
      const res = await api.get('/ospiti/duplicati-sospetti');
      setGruppi(res.data);
      const iniziali = {};
      res.data.forEach((g, i) => { iniziali[i] = candidatoSuggerito(g.candidati).id; });
      setSelezioni(iniziali);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento dei duplicati sospetti.');
    } finally {
      setCaricamento(false);
    }
  }, []);

  useEffect(() => {
    if (!utente || !RUOLI_UNISCI.includes(utente.ruolo)) return;
    caricaGruppi();
  }, [utente, caricaGruppi]);

  if (loading || !utente || !RUOLI_UNISCI.includes(utente.ruolo)) return null;

  async function confermaUnione(indice) {
    const gruppo = gruppi[indice];
    const vincitoreId = selezioni[indice];
    const perdenti = gruppo.candidati.filter(c => c.id !== vincitoreId);
    setUnendo(true);
    setErrore('');
    try {
      // Sequenziale, non in parallelo: ogni unisci tocca le stesse righe
      // (soggiorni/soggiorno_ospiti) del vincitore, meglio non sovrapporle.
      for (const perdente of perdenti) {
        await api.post(`/ospiti/${vincitoreId}/unisci`, { con_id: perdente.id });
      }
      const vincitore = gruppo.candidati.find(c => c.id === vincitoreId);
      setMessaggio(`Unito in ${vincitore.cognome} ${vincitore.nome}.`);
      setConfermaIndice(null);
      setGruppi(prev => prev.filter((_, i) => i !== indice));
    } catch (err) {
      setErrore(err.message || "Errore durante l'unione.");
    } finally {
      setUnendo(false);
    }
  }

  return (
    <AppShell titolo="Duplicati sospetti">
      <Link href="/clienti" className="inline-flex items-center gap-1 text-xs font-medium mb-4" style={{ color: 'var(--muted-foreground)' }}>
        <ArrowLeft size={13} /> Torna a Clienti
      </Link>

      <p className="text-[13px] mb-4" style={{ color: 'var(--muted-foreground)' }}>
        Gruppi con stesso nome, cognome e data di nascita — probabile stesso cliente registrato più volte.
        Nessuna unione è automatica: scegli il record da tenere come principale e conferma. Il record unito
        non viene mai cancellato, resta collegato al principale.
      </p>

      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}
      {messaggio && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-green-bg)', color: 'var(--status-green-text)' }}>
          <Check size={14} /> {messaggio}
        </div>
      )}

      {caricamento ? (
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
      ) : gruppi.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Users size={28} style={{ color: 'var(--muted-foreground)' }} />
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Nessun duplicato sospetto al momento.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {gruppi.map((gruppo, indice) => (
            <div key={indice} className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={15} style={{ color: 'var(--status-amber-text)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                  {gruppo.candidati.length} record — stesso nome e data di nascita
                </span>
              </div>

              <div className="flex flex-col gap-2 mb-3">
                {gruppo.candidati.map(c => (
                  <label key={c.id}
                         className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer text-sm"
                         style={{
                           border: '0.5px solid var(--border)',
                           background: selezioni[indice] === c.id ? 'var(--status-green-bg)' : 'var(--background)',
                         }}>
                    <input type="radio" name={`vincitore-${indice}`} checked={selezioni[indice] === c.id}
                           onChange={() => setSelezioni(prev => ({ ...prev, [indice]: c.id }))} />
                    <span className="flex-1">
                      <span className="font-medium" style={{ color: 'var(--foreground)' }}>{c.cognome} {c.nome}</span>
                      <span className="block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                        {c.data_nascita || '—'} · {c.email || 'senza email'} · {c.telefono || 'senza telefono'} ·{' '}
                        {c.numero_soggiorni || 0} soggiorn{c.numero_soggiorni === 1 ? 'o' : 'i'} ·
                        {' '}€ {Number(c.totale_speso || 0).toFixed(2)} spesi
                      </span>
                    </span>
                    {selezioni[indice] === c.id && (
                      <span className="text-[11px] font-medium shrink-0" style={{ color: 'var(--status-green-text)' }}>Tenuto</span>
                    )}
                  </label>
                ))}
              </div>

              {confermaIndice === indice ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px]" style={{ color: 'var(--foreground)' }}>
                    Confermi l'unione? Gli altri {gruppo.candidati.length - 1} record verranno collegati a questo, non più mostrati separatamente.
                  </span>
                  <button onClick={() => confermaUnione(indice)} disabled={unendo}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60" style={{ background: 'var(--hotel-navy)' }}>
                    {unendo ? 'Unione in corso...' : 'Conferma unione'}
                  </button>
                  <button onClick={() => setConfermaIndice(null)} disabled={unendo}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border">Annulla</button>
                </div>
              ) : (
                <button onClick={() => setConfermaIndice(indice)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--hotel-amber)' }}>
                  Unisci in questo record
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

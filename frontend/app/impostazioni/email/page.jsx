'use client';

// Pagina Impostazioni ▸ Testi email — Modulo 5.3, estensione (04/08/2026,
// richiesta esplicita del titolare). Gestisce oggetto+corpo delle 4 email
// automatiche (conferma/promemoria/recensione/pre_checkin,
// backend/lib/emailPrenotazioni.js) e i dati del footer comune a tutte le
// email (anche le offerte dedicate, vedi /marketing/offerte). Riservata ad
// admin/titolare (shared/ruoli.js sezione 'email_template').
// Corpo = testo semplice (non HTML): i placeholder {nome_ospite}/
// {elenco_soggiorni}/{hotel}/{link_pre_checkin} vengono sostituiti
// all'invio da backend/lib/emailLayout.js — stessa logica usata dal
// pulsante di test in /planning-camere. Nota sul pre check-in (modulo 5.2
// Fase B): se il testo del promemoria non contiene {link_pre_checkin}, il
// link viene comunque aggiunto in coda automaticamente quando previsto
// (mai perso per un testo non aggiornato) — il placeholder qui è solo per
// scegliere DOVE compare nel testo, non è obbligatorio inserirlo.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import { RotateCcw, Mail } from 'lucide-react';

const RUOLI_PAGINA = ['admin', 'titolare'];

// Testi di default (stessi della migration 026, seed di email_template) —
// usati solo dal pulsante "Ripristina testo predefinito", non letti dal DB.
const DEFAULT_TEMPLATE = {
  conferma: {
    oggetto: 'Prenotazione confermata — Hotel del Golfo',
    corpo: 'Gentile {nome_ospite},\n\nla sua prenotazione presso Hotel del Golfo è confermata:\n\n{elenco_soggiorni}\n\nLa aspettiamo!',
  },
  promemoria: {
    oggetto: 'Il suo arrivo si avvicina — Hotel del Golfo',
    corpo: 'Gentile {nome_ospite},\n\nle ricordiamo il suo prossimo soggiorno presso Hotel del Golfo:\n\n{elenco_soggiorni}\n\nPuò anche completare il pre check-in online, comodamente da casa:\n\n{link_pre_checkin}\n\nA presto!',
  },
  recensione: {
    oggetto: 'Grazie per essere stato nostro ospite — Hotel del Golfo',
    corpo: 'Gentile {nome_ospite},\n\nsperiamo che il suo soggiorno presso Hotel del Golfo sia stato piacevole.\n\nSe ha un momento, ci farebbe molto piacere leggere la sua opinione.',
  },
  pre_checkin: {
    oggetto: 'Completa il pre check-in — Hotel del Golfo',
    corpo: 'Gentile {nome_ospite},\n\nmanca poco al suo arrivo! Può completare il pre check-in online, comodamente da casa, in pochi minuti:\n\n{link_pre_checkin}\n\nA presto!',
  },
};

const ETICHETTE = {
  conferma: 'Conferma prenotazione',
  promemoria: 'Promemoria pre-arrivo',
  recensione: 'Richiesta recensione',
  pre_checkin: 'Invito pre check-in (invio manuale)',
};

const inputStyle = {
  height: '38px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

export default function PaginaTestiEmail() {
  const { utente, loading } = useAuth();
  const router = useRouter();

  const [template, setTemplate] = useState({});
  const [footer, setFooter] = useState({});
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [successo, setSuccesso] = useState('');
  const [salvataggioTipo, setSalvataggioTipo] = useState(null);
  const [salvataggioFooter, setSalvataggioFooter] = useState(false);

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_PAGINA.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const [risTemplate, risFooter] = await Promise.all([
        api.get('/email-template'),
        api.get('/email-template/footer'),
      ]);
      const mappa = {};
      risTemplate.data.forEach(t => { mappa[t.tipo] = { oggetto: t.oggetto, corpo: t.corpo }; });
      setTemplate(mappa);
      setFooter(risFooter.data || {});
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento.');
    } finally {
      setCaricamento(false);
    }
  }, []);

  useEffect(() => {
    if (utente && RUOLI_PAGINA.includes(utente.ruolo)) carica();
  }, [utente, carica]);

  function aggiornaCampo(tipo, campo, valore) {
    setTemplate(t => ({ ...t, [tipo]: { ...t[tipo], [campo]: valore } }));
  }

  function ripristina(tipo) {
    setTemplate(t => ({ ...t, [tipo]: { ...DEFAULT_TEMPLATE[tipo] } }));
  }

  async function salvaTemplate(tipo) {
    setSalvataggioTipo(tipo);
    setErrore('');
    setSuccesso('');
    try {
      await api.patch(`/email-template/${tipo}`, template[tipo]);
      setSuccesso(`Testo "${ETICHETTE[tipo]}" salvato.`);
    } catch (err) {
      setErrore(err.message || 'Errore nel salvataggio.');
    } finally {
      setSalvataggioTipo(null);
    }
  }

  async function salvaFooter() {
    setSalvataggioFooter(true);
    setErrore('');
    setSuccesso('');
    try {
      const res = await api.patch('/email-template/footer', footer);
      setFooter(res.data);
      setSuccesso('Dati footer salvati.');
    } catch (err) {
      setErrore(err.message || 'Errore nel salvataggio del footer.');
    } finally {
      setSalvataggioFooter(false);
    }
  }

  if (loading || !utente) return null;

  return (
    <AppShell titolo="Testi email">
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
        <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Placeholder disponibili nel corpo: <code>{'{nome_ospite}'}</code>, <code>{'{elenco_soggiorni}'}</code> (solo conferma/promemoria), <code>{'{hotel}'}</code>,
              <code>{'{link_pre_checkin}'}</code> (solo promemoria/invito pre check-in — se non lo scrivi nel testo viene comunque aggiunto in coda) — sostituiti automaticamente all'invio.
              Testo semplice: gli a-capo diventano paragrafi, non serve scrivere HTML.
            </p>
          </div>

          {['conferma', 'promemoria', 'recensione', 'pre_checkin'].map(tipo => (
            <div key={tipo} className="rounded-xl p-4 space-y-2" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
                  <Mail size={14} /> {ETICHETTE[tipo]}
                </h3>
                <button onClick={() => ripristina(tipo)}
                        className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border">
                  <RotateCcw size={12} /> Testo predefinito
                </button>
              </div>
              <input
                placeholder="Oggetto"
                value={template[tipo]?.oggetto || ''}
                onChange={e => aggiornaCampo(tipo, 'oggetto', e.target.value)}
                className="w-full px-3 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
              <textarea
                placeholder="Corpo"
                value={template[tipo]?.corpo || ''}
                onChange={e => aggiornaCampo(tipo, 'corpo', e.target.value)}
                rows={6}
                className="w-full p-3 rounded-lg text-sm outline-none resize-y"
                style={{ ...inputStyle, height: 'auto' }}
              />
              <button
                onClick={() => salvaTemplate(tipo)}
                disabled={salvataggioTipo !== null}
                className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                style={{ background: 'var(--hotel-navy)' }}
              >
                {salvataggioTipo === tipo ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          ))}

          <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Footer (comune a tutte le email, incluse le offerte)</h3>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Indirizzo" value={footer.footer_indirizzo || ''}
                     onChange={e => setFooter(f => ({ ...f, footer_indirizzo: e.target.value }))}
                     className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
              <input placeholder="Telefono" value={footer.footer_telefono || ''}
                     onChange={e => setFooter(f => ({ ...f, footer_telefono: e.target.value }))}
                     className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
              <input placeholder="Email" value={footer.footer_email || ''}
                     onChange={e => setFooter(f => ({ ...f, footer_email: e.target.value }))}
                     className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
              <input placeholder="Sito web" value={footer.footer_sito || ''}
                     onChange={e => setFooter(f => ({ ...f, footer_sito: e.target.value }))}
                     className="px-3 rounded-lg text-sm outline-none" style={inputStyle} />
            </div>
            <input placeholder="URL logo (pubblico — es. https://sito-hotel-five.vercel.app/logo.png). Lascia vuoto se non disponibile: il gestionale non è ancora raggiungibile da internet."
                   value={footer.logo_url || ''}
                   onChange={e => setFooter(f => ({ ...f, logo_url: e.target.value }))}
                   className="w-full px-3 rounded-lg text-sm outline-none" style={inputStyle} />
            <button
              onClick={salvaFooter}
              disabled={salvataggioFooter}
              className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
              style={{ background: 'var(--hotel-navy)' }}
            >
              {salvataggioFooter ? 'Salvataggio...' : 'Salva footer'}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

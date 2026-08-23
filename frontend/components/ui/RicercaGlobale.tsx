'use client';

// RicercaGlobale — barra di ricerca universale stile "Spotlight" (CMD+K,
// 23/08/2026, quarto pattern UI discusso col titolare). Cerca tra ospiti,
// camere, prenotazioni via GET /api/ricerca (nuovo endpoint, vedi
// backend/controllers/ricercaController.js). "Fatture" e "voci di menu"
// dalla richiesta originale non sono incluse: la fatturazione non è
// ancora costruita (Fase 2B), le voci di menu sono state deliberatamente
// escluse dall'ambito di questo primo giro (solo ospiti/camere/
// prenotazioni, decisione presa in chat).
//
// Componente controllato: apertura/chiusura decise da AppShell (unica
// fonte di verità per lo stato, niente listener duplicati se in futuro
// servisse più di un punto d'ingresso).

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, BedDouble, CalendarDays, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface RicercaGlobaleProps {
  aperta: boolean;
  onChiudi: () => void;
}

interface RisultatoOspite { id: number; nome: string; cognome: string; telefono: string | null; }
interface RisultatoCamera { id: number; numero: string; nome: string | null; piano: number | null; }
interface RisultatoPrenotazione {
  soggiorno_id: number; prenotazione_id: number; stato: string;
  camera_numero: string; data_arrivo: string; data_partenza: string;
  ospite_nome: string | null; ospite_cognome: string | null;
}
interface Risultati { ospiti: RisultatoOspite[]; camere: RisultatoCamera[]; prenotazioni: RisultatoPrenotazione[]; }

const RISULTATI_VUOTI: Risultati = { ospiti: [], camere: [], prenotazioni: [] };

export default function RicercaGlobale({ aperta, onChiudi }: RicercaGlobaleProps) {
  const [query, setQuery] = useState('');
  const [risultati, setRisultati] = useState<Risultati>(RISULTATI_VUOTI);
  const [cercando, setCercando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (aperta) {
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    setQuery('');
    setRisultati(RISULTATI_VUOTI);
  }, [aperta]);

  useEffect(() => {
    if (!aperta || query.trim().length < 2) {
      setRisultati(RISULTATI_VUOTI);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        setCercando(true);
        const res = await api.get(`/ricerca?q=${encodeURIComponent(query.trim())}`);
        setRisultati(res?.data ?? RISULTATI_VUOTI);
      } catch {
        setRisultati(RISULTATI_VUOTI);
      } finally {
        setCercando(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, aperta]);

  const vaiA = useCallback((path: string) => {
    onChiudi();
    router.push(path);
  }, [onChiudi, router]);

  if (!aperta) return null;

  const totale = risultati.ospiti.length + risultati.camere.length + risultati.prenotazioni.length;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onChiudi}
    >
      <div
        className="w-full max-w-lg mx-4 bg-white rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Search size={16} style={{ color: 'var(--muted-foreground)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca un ospite, una camera, una prenotazione..."
            className="flex-1 text-sm outline-none"
          />
          {cercando && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--muted-foreground)' }} />}
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border" style={{ color: 'var(--muted-foreground)' }}>Esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {query.trim().length < 2 && (
            <p className="px-4 py-6 text-xs text-center" style={{ color: 'var(--muted-foreground)' }}>
              Scrivi almeno 2 caratteri per iniziare a cercare.
            </p>
          )}

          {query.trim().length >= 2 && !cercando && totale === 0 && (
            <p className="px-4 py-6 text-xs text-center" style={{ color: 'var(--muted-foreground)' }}>
              Nessun risultato per &ldquo;{query.trim()}&rdquo;.
            </p>
          )}

          {risultati.ospiti.length > 0 && (
            <div className="py-1.5">
              <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                Ospiti
              </p>
              {risultati.ospiti.map((o) => (
                <button
                  key={`ospite-${o.id}`}
                  onClick={() => vaiA(`/clienti/${o.id}`)}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left hover:bg-gray-50"
                >
                  <User size={14} style={{ color: 'var(--muted-foreground)' }} />
                  <span className="font-medium">{o.nome} {o.cognome}</span>
                  {o.telefono && <span className="text-xs ml-auto" style={{ color: 'var(--muted-foreground)' }}>{o.telefono}</span>}
                </button>
              ))}
            </div>
          )}

          {risultati.camere.length > 0 && (
            <div className="py-1.5 border-t">
              <p className="px-4 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                Camere
              </p>
              {risultati.camere.map((c) => (
                <button
                  key={`camera-${c.id}`}
                  onClick={() => vaiA(`/planning-camere?ricerca=${encodeURIComponent(c.numero)}`)}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left hover:bg-gray-50"
                >
                  <BedDouble size={14} style={{ color: 'var(--muted-foreground)' }} />
                  <span className="font-medium">{c.numero !== 'app' ? `Camera ${c.numero}` : c.nome}</span>
                  {c.piano != null && <span className="text-xs ml-auto" style={{ color: 'var(--muted-foreground)' }}>Piano {c.piano}</span>}
                </button>
              ))}
            </div>
          )}

          {risultati.prenotazioni.length > 0 && (
            <div className="py-1.5 border-t">
              <p className="px-4 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                Prenotazioni
              </p>
              {risultati.prenotazioni.map((p) => (
                <button
                  key={`prenotazione-${p.soggiorno_id}`}
                  onClick={() => vaiA(`/planning-camere?ricerca=${encodeURIComponent(p.ospite_cognome || p.camera_numero)}`)}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left hover:bg-gray-50"
                >
                  <CalendarDays size={14} style={{ color: 'var(--muted-foreground)' }} />
                  <span className="font-medium">
                    {p.ospite_nome ? `${p.ospite_nome} ${p.ospite_cognome}` : 'Ospite non indicato'}
                  </span>
                  <span className="text-xs ml-auto" style={{ color: 'var(--muted-foreground)' }}>
                    Camera {p.camera_numero} · {new Date(p.data_arrivo + 'T00:00:00').toLocaleDateString('it-IT')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

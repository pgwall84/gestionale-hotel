// Test suite — Generatore schedina Alloggiati Web (Modulo 2.5 Fase 2,
// 11/08/2026). Solo la funzione pura generaRigaSchedina: nessuna chiamata
// di rete né di DB, verificabile senza credenziali reali e senza toccare
// WS_ALLOGGIATI. generaSchedineSoggiorno (che fa la query) non è coperta
// qui — richiede un pool reale, va verificata manualmente in locale come
// generaToken/scaricaTabella (Fase 1b).

const {
  generaRigaSchedina,
  campiObbligatoriMancanti,
  calcolaGiorniPermanenza,
  formatDataSchedina,
  ITALIA_CODICE,
} = require('../../backend/lib/alloggiatiSchedina');

// Riga base valida — capofamiglia (tipo 17), nato in Italia, con documento.
// Ogni test parte da qui e sovrascrive solo i campi che gli servono, per
// non ripetere l'intero oggetto 14 volte.
function rigaValida(overrides = {}) {
  return {
    tipo_alloggiato: '17',
    data_arrivo: '2026-08-20',
    data_partenza: '2026-08-25',
    camera_numero: '5',
    nome: 'Mario',
    cognome: 'Rossi',
    sesso: 'M',
    data_nascita: '1980-03-15',
    stato_nascita_codice: ITALIA_CODICE,
    comune_nascita_codice: '029001', // codice di fantasia, solo per il test di lunghezza/posizione
    provincia_nascita: 'SP',
    cittadinanza_codice: ITALIA_CODICE,
    documento_tipo_codice: 'IDENT',
    documento_numero: 'AB1234567',
    luogo_rilascio_codice: '029001',
    ...overrides,
  };
}

describe('generaRigaSchedina — riga valida', () => {
  test('produce esattamente 168 caratteri', () => {
    const { rigaSchedina, avviso } = generaRigaSchedina(rigaValida());
    expect(avviso).toBeNull();
    expect(rigaSchedina).not.toBeNull();
    expect(rigaSchedina.length).toBe(168);
  });

  test('ogni campo è nella posizione esatta del tracciato (manuale WS_ALLOGGIATI, Tabella 1)', () => {
    const { rigaSchedina } = generaRigaSchedina(rigaValida());
    expect(rigaSchedina.slice(0, 2)).toBe('17');           // Tipo Alloggiato
    expect(rigaSchedina.slice(2, 12)).toBe('20/08/2026');  // Data Arrivo
    expect(rigaSchedina.slice(12, 14)).toBe('05');         // Numero Giorni Permanenza
    expect(rigaSchedina.slice(14, 64).trim()).toBe('Rossi'); // Cognome (50, spazio-riempito)
    expect(rigaSchedina.slice(64, 94).trim()).toBe('Mario');  // Nome (30)
    expect(rigaSchedina.slice(94, 95)).toBe('1');          // Sesso: M → 1
    expect(rigaSchedina.slice(95, 105)).toBe('15/03/1980'); // Data Nascita
    expect(rigaSchedina.slice(105, 114).trim()).toBe('029001'); // Comune Nascita (9)
    expect(rigaSchedina.slice(114, 116)).toBe('SP');       // Provincia Nascita (2)
    expect(rigaSchedina.slice(116, 125).trim()).toBe(ITALIA_CODICE); // Stato Nascita (9)
    expect(rigaSchedina.slice(125, 134).trim()).toBe(ITALIA_CODICE); // Cittadinanza (9)
    expect(rigaSchedina.slice(134, 139).trim()).toBe('IDENT');      // Tipo Documento (5)
    expect(rigaSchedina.slice(139, 159).trim()).toBe('AB1234567');  // Numero Documento (20)
    expect(rigaSchedina.slice(159, 168).trim()).toBe('029001');     // Luogo Rilascio (9)
  });

  test('sesso F → codice 2', () => {
    const { rigaSchedina } = generaRigaSchedina(rigaValida({ sesso: 'F' }));
    expect(rigaSchedina.slice(94, 95)).toBe('2');
  });
});

describe('generaRigaSchedina — tipo_alloggiato 19/20 (familiare/membro gruppo)', () => {
  test('tipo/numero documento/luogo rilascio sempre blank, anche se non forniti — nessun avviso', () => {
    const riga = rigaValida({
      tipo_alloggiato: '19',
      documento_tipo_codice: null,
      documento_numero: null,
      luogo_rilascio_codice: null,
    });
    const { rigaSchedina, avviso } = generaRigaSchedina(riga);
    expect(avviso).toBeNull();
    expect(rigaSchedina.length).toBe(168);
    expect(rigaSchedina.slice(134, 139)).toBe('     '); // 5 spazi
    expect(rigaSchedina.slice(139, 159)).toBe(' '.repeat(20));
    expect(rigaSchedina.slice(159, 168)).toBe(' '.repeat(9));
  });

  test('tipo_alloggiato 20 con documento comunque valorizzato: viene ignorato (blank forzato)', () => {
    const riga = rigaValida({ tipo_alloggiato: '20' });
    const { rigaSchedina } = generaRigaSchedina(riga);
    expect(rigaSchedina.slice(134, 139)).toBe('     ');
  });
});

describe('generaRigaSchedina — campi obbligatori mancanti', () => {
  test('sesso mancante → esclusa con avviso che nomina ospite e camera', () => {
    const { rigaSchedina, avviso } = generaRigaSchedina(rigaValida({ sesso: null }));
    expect(rigaSchedina).toBeNull();
    expect(avviso).toContain('Rossi Mario (Camera 5)');
    expect(avviso).toContain('sesso');
  });

  test('nato in Italia senza comune/provincia di nascita → esclusa con avviso su entrambi', () => {
    const { avviso } = generaRigaSchedina(rigaValida({ comune_nascita_codice: null, provincia_nascita: null }));
    expect(avviso).toContain('comune di nascita');
    expect(avviso).toContain('provincia di nascita');
  });

  test('nato all\'estero senza comune/provincia di nascita → nessun avviso su quei campi (non obbligatori)', () => {
    const { rigaSchedina, avviso } = generaRigaSchedina(rigaValida({
      stato_nascita_codice: '109000200', // Francia, codice di fantasia per il test
      comune_nascita_codice: null,
      provincia_nascita: null,
    }));
    expect(avviso).toBeNull();
    expect(rigaSchedina.slice(105, 114)).toBe(' '.repeat(9)); // Comune Nascita: blank
    expect(rigaSchedina.slice(114, 116)).toBe('  ');           // Provincia Nascita: blank
  });

  test('capofamiglia (17) senza numero documento → esclusa con avviso', () => {
    const { avviso } = generaRigaSchedina(rigaValida({ documento_numero: null }));
    expect(avviso).toContain('numero documento');
  });

  test('cittadinanza mancante → esclusa con avviso', () => {
    const { avviso } = generaRigaSchedina(rigaValida({ cittadinanza_codice: null }));
    expect(avviso).toContain('cittadinanza');
  });
});

describe('generaRigaSchedina — date e permanenza', () => {
  test('soggiorno di 1 notte → "01"', () => {
    const { rigaSchedina } = generaRigaSchedina(rigaValida({ data_arrivo: '2026-08-20', data_partenza: '2026-08-21' }));
    expect(rigaSchedina.slice(12, 14)).toBe('01');
  });

  test('soggiorno di 30 notti (limite) → ancora generata', () => {
    const { rigaSchedina, avviso } = generaRigaSchedina(rigaValida({ data_arrivo: '2026-08-01', data_partenza: '2026-08-31' }));
    expect(avviso).toBeNull();
    expect(rigaSchedina.slice(12, 14)).toBe('30');
  });

  test('soggiorno di 31 notti → esclusa con avviso (limite tracciato)', () => {
    const { rigaSchedina, avviso } = generaRigaSchedina(rigaValida({ data_arrivo: '2026-08-01', data_partenza: '2026-09-01' }));
    expect(rigaSchedina).toBeNull();
    expect(avviso).toContain('31 notti');
  });

  test('data_partenza non successiva a data_arrivo → esclusa con avviso', () => {
    const { rigaSchedina, avviso } = generaRigaSchedina(rigaValida({ data_arrivo: '2026-08-20', data_partenza: '2026-08-20' }));
    expect(rigaSchedina).toBeNull();
    expect(avviso).toContain('non valide');
  });
});

describe('helper esportati', () => {
  test('formatDataSchedina: YYYY-MM-DD → GG/MM/AAAA', () => {
    expect(formatDataSchedina('2026-01-05')).toBe('05/01/2026');
  });

  test('calcolaGiorniPermanenza: differenza in notti', () => {
    expect(calcolaGiorniPermanenza('2026-08-20', '2026-08-25')).toBe(5);
  });

  test('campiObbligatoriMancanti: array vuoto per una riga completa', () => {
    expect(campiObbligatoriMancanti(rigaValida())).toEqual([]);
  });
});

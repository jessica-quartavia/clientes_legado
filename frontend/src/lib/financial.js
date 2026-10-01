/** Labels PT-BR para colunas reais de client_financial_data */
export const FINANCIAL_FIELD_LABELS = {
  ultima_renda_mensal: 'Renda mensal',
  ultimo_aporte: 'Aporte mensal',
  reserva_liquidez: 'Reserva financeira',
  valor_imoveis_quitados: 'Valor imóveis quitados',
  possui_carro: 'Possui carro',
  cheque_especial: 'Cheque especial',
  parcelamento_cartao: 'Parcelamento cartão',
  credito_pessoal: 'Crédito pessoal',
  credito_consignado: 'Crédito consignado',
  observacoes: 'Observações',
  updated_at: 'Atualizado em',
  created_at: 'Criado em',
  updated_by: 'Atualizado por',
  possui_imovel: 'Possui imóvel',
  possui_consorcio: 'Possui consórcio',
  hub_link: 'Link Hub',
};

const NUMERIC_FIN_KEYS = new Set([
  'ultima_renda_mensal',
  'ultimo_aporte',
  'reserva_liquidez',
  'valor_imoveis_quitados',
]);

/** @param {Record<string, unknown> | null | undefined} fin */
export function computePatrimonioResumo(fin) {
  if (!fin) return null;
  const reserva = fin.reserva_liquidez != null ? Number(fin.reserva_liquidez) : null;
  const imoveis = fin.valor_imoveis_quitados != null ? Number(fin.valor_imoveis_quitados) : null;
  if ((reserva == null || Number.isNaN(reserva)) && (imoveis == null || Number.isNaN(imoveis))) {
    return null;
  }
  return (reserva ?? 0) + (imoveis ?? 0);
}

const BOOLEAN_FIN_KEYS = new Set([
  'possui_carro',
  'cheque_especial',
  'parcelamento_cartao',
  'credito_pessoal',
  'credito_consignado',
  'possui_imovel',
  'possui_consorcio',
]);

/** @param {number | null | undefined} value */
export function formatCurrencyBRL(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

/** @param {unknown} value @param {string} key */
export function formatFinancialValue(value, key) {
  if (value == null || value === '' || (typeof value === 'number' && Number.isNaN(value))) return '—';
  if (BOOLEAN_FIN_KEYS.has(key)) return value === true ? 'Sim' : value === false ? 'Não' : '—';
  if (NUMERIC_FIN_KEYS.has(key)) return formatCurrencyBRL(Number(value));
  if (key === 'updated_at' || key === 'created_at') {
    try {
      return new Date(String(value)).toLocaleString('pt-BR');
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Ordem preferencial no drawer */
export const FINANCIAL_DISPLAY_ORDER = [
  'ultima_renda_mensal',
  'ultimo_aporte',
  'reserva_liquidez',
  'valor_imoveis_quitados',
  'possui_carro',
  'possui_imovel',
  'possui_consorcio',
  'cheque_especial',
  'parcelamento_cartao',
  'credito_pessoal',
  'credito_consignado',
  'observacoes',
  'hub_link',
  'updated_at',
  'created_at',
  'updated_by',
];

/** Colunas do CSV filtrado (todas fin_* úteis) */
export function buildExportColumns() {
  const base = [
    { label: 'nome', get: (r) => r.nome },
    { label: 'telefone', get: (r) => r.telefone },
    { label: 'email', get: (r) => r.email },
    { label: 'programa', get: (r) => r.programa },
    { label: 'ep', get: (r) => r.engenheiro_patrimonial },
    { label: 'mecanismos', get: (r) => r.mecanismos },
    { label: 'ultima_reuniao', get: (r) => r.ultima_reuniao_nome },
    { label: 'data_ultima_reuniao', get: (r) => r.ultima_reuniao_data },
  ];

  const finCols = FINANCIAL_DISPLAY_ORDER.map((key) => ({
    label: `fin_${key}`,
    get: (r) => r.financial?.[key] ?? r[`fin_${key}`] ?? '',
  }));

  return [...base, ...finCols];
}

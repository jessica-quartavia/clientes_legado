/**
 * Colunas reais de public.client_financial_data (BASEQV).
 * Relação: client_financial_data.client_id → clients.id
 */
export const CLIENT_FINANCIAL_COLUMNS = [
  'ultima_renda_mensal',
  'ultimo_aporte',
  'reserva_liquidez',
  'valor_imoveis_quitados',
  'possui_carro',
  'cheque_especial',
  'parcelamento_cartao',
  'credito_pessoal',
  'credito_consignado',
  'observacoes',
  'updated_at',
  'created_at',
  'updated_by',
  'possui_imovel',
  'possui_consorcio',
  'hub_link',
];

/** @param {number | string | null | undefined} n */
export function toNumber(n) {
  if (n == null || n === '') return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

/**
 * Não existe coluna "patrimônio" — resumo = reserva_liquidez + valor_imoveis_quitados.
 * @param {Record<string, unknown> | null | undefined} fin
 */
export function computePatrimonioResumo(fin) {
  if (!fin) return null;
  const reserva = toNumber(fin.reserva_liquidez);
  const imoveis = toNumber(fin.valor_imoveis_quitados);
  if (reserva == null && imoveis == null) return null;
  return (reserva ?? 0) + (imoveis ?? 0);
}

/**
 * Múltiplos registros: registro com updated_at mais recente; empate → created_at.
 * @param {Record<string, unknown>[]} rows
 */
export function pickLatestFinancialRow(rows) {
  if (!rows?.length) return null;
  if (rows.length === 1) return rows[0];
  return [...rows].sort((a, b) => {
    const ua = new Date(String(a.updated_at)).getTime();
    const ub = new Date(String(b.updated_at)).getTime();
    if (ub !== ua) return ub - ua;
    return new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime();
  })[0];
}

/** @param {Record<string, unknown> | null | undefined} fin */
export function flattenFinancial(fin) {
  if (!fin) return {};
  const skip = new Set(['id', 'client_id']);
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(fin)) {
    if (skip.has(k)) continue;
    out[`fin_${k}`] = v;
  }
  return out;
}

/**
 * @param {Record<string, unknown> | null | undefined} fin
 */
export function buildFinancialSummary(fin) {
  return {
    finance_renda: toNumber(fin?.ultima_renda_mensal),
    finance_aporte: toNumber(fin?.ultimo_aporte),
    finance_patrimonio: computePatrimonioResumo(fin),
  };
}

/** @returns {string[]} */
export function financialCsvColumnKeys() {
  return CLIENT_FINANCIAL_COLUMNS.map((c) => `fin_${c}`);
}

const MEANINGFUL_FINANCIAL_KEYS = [
  'ultima_renda_mensal',
  'ultimo_aporte',
  'reserva_liquidez',
  'valor_imoveis_quitados',
  'observacoes',
  'hub_link',
];

/** @param {Record<string, unknown> | null | undefined} fin */
export function hasMeaningfulFinancialData(fin) {
  if (!fin) return false;
  for (const key of MEANINGFUL_FINANCIAL_KEYS) {
    const v = fin[key];
    if (v == null || v === '') continue;
    if (typeof v === 'number' && Number.isFinite(v)) return true;
    if (typeof v === 'string' && v.trim()) return true;
  }
  for (const key of ['possui_carro', 'possui_imovel', 'possui_consorcio', 'cheque_especial', 'parcelamento_cartao', 'credito_pessoal', 'credito_consignado']) {
    if (fin[key] === true) return true;
  }
  return false;
}

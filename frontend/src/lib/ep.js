export const EP_NAO_INFORMADO = 'Não informado';

/** Valor bruto de engenheiro_patrimonial (BASEQV) para filtros e comparação. */
export function engenheiroPatrimonialValue(row) {
  const v = row?.engenheiro_patrimonial;
  if (v == null || String(v).trim() === '') return null;
  return String(v).trim();
}

export function formatEpDisplay(value) {
  const v = engenheiroPatrimonialValue({ engenheiro_patrimonial: value });
  return v ?? EP_NAO_INFORMADO;
}

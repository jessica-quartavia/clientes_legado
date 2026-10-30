export const CPF_NAO_INFORMADO = 'Não informado';

/** Apenas dígitos (busca / matching). */
export function cpfDigitsOnly(value) {
  if (value == null || value === '') return '';
  return String(value).replace(/\D/g, '');
}

/** Valor exibido: sempre public.clients.cpf (BASEQV). */
export function cpfDisplayRaw(client) {
  const v = client?.cpf;
  if (v == null || String(v).trim() === '') return null;
  return String(v).trim();
}

export function formatCpfDisplay(cpf) {
  return cpfDisplayRaw({ cpf }) ?? CPF_NAO_INFORMADO;
}

/** Busca global: texto + CPF normalizado (somente números). */
export function clientMatchesGlobalSearch(client, rawQuery) {
  const q = rawQuery?.trim() ?? '';
  if (!q) return true;

  const qLower = q.toLowerCase();
  const textHay = [client.nome, client.email, client.telefone, client.mecanismos, client.cpf]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (textHay.includes(qLower)) return true;

  const qDigits = cpfDigitsOnly(q);
  if (!qDigits) return false;

  const clientDigits = cpfDigitsOnly(client.cpf) || cpfDigitsOnly(client.cpf_digits);
  return Boolean(clientDigits && clientDigits.includes(qDigits));
}

import { hasMeaningfulFinancialData } from './financial.js';

export function hasValidFinancial(client) {
  return hasMeaningfulFinancialData(client.financial);
}

export function hasValidMeeting(client) {
  return Boolean(client.ultima_reuniao_data);
}

export function hasMechanisms(client) {
  return (client.quantidade_mecanismos ?? 0) > 0;
}

function matchBoolFilter(value, filter) {
  if (!filter) return true;
  const yes = filter === 'yes';
  return yes ? Boolean(value) : !value;
}

function clientEp(client) {
  return client.engenheiro_patrimonial ?? client.ep ?? '';
}

/** Filtros que existem na população BASEQV ativa (numerador e denominador do %). */
export function applyBasePopulationFilters(activeBaseRows, filters) {
  if (!activeBaseRows?.length) return [];
  return activeBaseRows.filter((row) => {
    if (filters.programa && row.programa !== filters.programa) return false;
    const ep = row.ep ?? row.engenheiro_patrimonial ?? '';
    if (filters.ep && ep !== filters.ep) return false;
    if (filters.status && row.status !== filters.status) return false;
    return true;
  });
}

/** Filtros específicos da visão legado + população + busca global. */
export function applyLegacyFilters(clients, filters) {
  const q = filters.search?.trim().toLowerCase() ?? '';
  return clients.filter((c) => {
    if (filters.programa && c.programa !== filters.programa) return false;
    if (filters.ep && clientEp(c) !== filters.ep) return false;
    if (filters.status && c.status !== filters.status) return false;

    if (q) {
      const hay = [c.nome, c.email, c.telefone, c.mecanismos].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }

    if (!matchBoolFilter(hasValidFinancial(c), filters.hasFin)) return false;
    if (!matchBoolFilter(hasValidMeeting(c), filters.hasReuniao)) return false;
    if (!matchBoolFilter(hasMechanisms(c), filters.hasMecanismos)) return false;

    return true;
  });
}

export function computeLegacyMetrics(filteredLegacyClients, filteredActiveBaseRows) {
  const totalLegacy = filteredLegacyClients.length;
  const withMechanisms = filteredLegacyClients.filter(hasMechanisms).length;
  const withMeeting = filteredLegacyClients.filter(hasValidMeeting).length;
  const withFinancial = filteredLegacyClients.filter(hasValidFinancial).length;
  const activeDenominator = filteredActiveBaseRows.length;

  let percentActiveBaseLegacy = null;
  if (activeDenominator > 0) {
    percentActiveBaseLegacy = (totalLegacy / activeDenominator) * 100;
  }

  return {
    totalLegacy,
    withMechanisms,
    withMeeting,
    withFinancial,
    percentActiveBaseLegacy,
    activeDenominator,
  };
}

export function formatPercentFromMetrics(metrics) {
  const { percentActiveBaseLegacy } = metrics;
  if (percentActiveBaseLegacy == null) return '—';
  return `${percentActiveBaseLegacy.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

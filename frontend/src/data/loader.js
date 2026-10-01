import { computePatrimonioResumo } from '../lib/financial.js';
import { isConfirmedLegacyClient } from '../lib/confirmed-legacy.js';

function enrichClientFinancialFields(client) {
  if (client.finance_renda != null || client.finance_aporte != null || client.finance_patrimonio != null) {
    return client;
  }
  const fin = client.financial;
  if (!fin) {
    return { ...client, finance_renda: null, finance_aporte: null, finance_patrimonio: null };
  }
  return {
    ...client,
    finance_renda: fin.ultima_renda_mensal != null ? Number(fin.ultima_renda_mensal) : null,
    finance_aporte: fin.ultimo_aporte != null ? Number(fin.ultimo_aporte) : null,
    finance_patrimonio: computePatrimonioResumo(fin),
  };
}

const cache = {
  clients: null,
  summary: null,
  activeBasePopulation: null,
  buildStatus: null,
  auditStatus: null,
  auditPending: false,
  loadedAt: 0,
};

export async function loadDashboardData({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.loadedAt && now - cache.loadedAt < 2000) {
    return {
      clients: cache.clients ?? [],
      summary: cache.summary ?? {},
      activeBasePopulation: cache.activeBasePopulation ?? [],
      buildStatus: cache.buildStatus ?? {},
      auditStatus: cache.auditStatus ?? {},
      auditPending: cache.auditPending ?? false,
      confirmedLegacyTotal: cache.clients?.length ?? 0,
    };
  }

  const [clientsRes, summaryRes, activeBaseRes, statusRes, auditSummaryRes, auditStatusRes] =
    await Promise.all([
      fetch('/clientes-legado.json'),
      fetch('/summary.json'),
      fetch('/active-base-population.json'),
      fetch('/build-status.json'),
      fetch('/audit-summary.json'),
      fetch('/audit-status.json'),
    ]);

  const rawClients = clientsRes.ok ? await clientsRes.json() : [];
  const summary = summaryRes.ok ? await summaryRes.json() : {};
  const activeBasePopulation = activeBaseRes.ok ? await activeBaseRes.json() : [];
  const buildStatus = statusRes.ok ? await statusRes.json() : {};
  if (auditSummaryRes.ok) {
    summary.audit = await auditSummaryRes.json();
  }
  const auditStatus = auditStatusRes.ok ? await auditStatusRes.json() : {};

  const all = Array.isArray(rawClients) ? rawClients.map(enrichClientFinancialFields) : [];
  const hasAuditFields = all.some((c) => c.auditoria_status != null);
  const confirmed = all.filter(isConfirmedLegacyClient);
  cache.clients = confirmed;
  const auditPending = all.length > 0 && !hasAuditFields;
  cache.summary = summary;
  cache.activeBasePopulation = Array.isArray(activeBasePopulation) ? activeBasePopulation : [];
  cache.buildStatus = buildStatus;
  cache.auditStatus = auditStatus;
  cache.auditPending = auditPending;
  cache.loadedAt = now;

  return {
    clients: cache.clients,
    summary: cache.summary,
    activeBasePopulation: cache.activeBasePopulation,
    buildStatus: cache.buildStatus,
    auditStatus: cache.auditStatus,
    auditPending,
    confirmedLegacyTotal: confirmed.length,
  };
}

export function exportCsv(rows, columns) {
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => c.label).join(',');
  const lines = rows.map((row) => columns.map((c) => escape(c.get(row))).join(','));
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clientes_legado_confirmados_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

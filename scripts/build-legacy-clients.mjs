import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fetchAllRows } from './lib/pagination.mjs';
import { resetBuildStatus, setStep, updateBuildStatus } from './lib/build-status.mjs';
import {
  buildMatchIndex,
  matchAnchor,
  matchPharus,
  resolveBaseqvClientForAnchorLegacy,
} from './lib/match-index.mjs';
import { normalizeCpf, normalizeEmail, normalizePhone, normalizeQvId } from './lib/normalize.mjs';
import {
  buildFinancialSummary,
  flattenFinancial,
  financialCsvColumnKeys,
  CLIENT_FINANCIAL_COLUMNS,
} from './lib/financial.mjs';
import { fetchFinancialByClientIds } from './lib/fetch-financial-batch.mjs';
import { buildActiveClientSet } from './lib/client-active.mjs';
import { hasMeaningfulFinancialData } from './lib/financial.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXPORTS_DIR = path.join(ROOT, 'exports');
const DATA_DIR = path.join(ROOT, 'data');

dotenv.config({ path: path.join(ROOT, '.env') });
dotenv.config({ path: path.join(ROOT, '.env.local'), override: true });

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Variável de ambiente ausente: ${name}. Copie .env.example para .env e preencha.`);
  }
  return v;
}

function createReadOnlyClient(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** @param {Record<string, unknown>[]} meetings @param {Record<string, Record<string, unknown>>} attendanceByUri */
function pickLastMeeting(meetings, attendanceByUri) {
  const now = Date.now();
  /** @type {Record<string, unknown> | null} */
  let bestAttended = null;
  /** @type {Record<string, unknown> | null} */
  let bestFallback = null;

  for (const m of meetings) {
    const start = new Date(String(m.start_time)).getTime();
    if (Number.isNaN(start) || start > now) continue;

    const att = attendanceByUri[m.calendly_event_uri];
    const status = att?.status;
    const remarcado = att?.remarcado === true;

    if (status === 'remarcado' || remarcado) continue;

    const candidate = { meeting: m, attendance: att ?? null, start };

    if (status === 'compareceu') {
      if (!bestAttended || start > bestAttended.start) bestAttended = candidate;
    } else if (!bestFallback || start > bestFallback.start) {
      bestFallback = candidate;
    }
  }

  const chosen = bestAttended ?? bestFallback;
  if (!chosen) return null;

  return {
    ultima_reuniao_data: chosen.meeting.start_time,
    ultima_reuniao_nome: chosen.meeting.event_name,
    ultima_reuniao_responsavel: chosen.meeting.host_email ?? null,
    ultima_reuniao_attendance_status: chosen.attendance?.status ?? null,
  };
}

/** @param {string} value */
function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** @param {Record<string, unknown>[]} rows @param {string[]} columns */
function toCsv(rows, columns) {
  const header = columns.join(',');
  const lines = rows.map((row) =>
    columns.map((col) => csvEscape(row[col])).join(','),
  );
  return [header, ...lines].join('\n');
}

async function main() {
  await resetBuildStatus();

  const baseqv = createReadOnlyClient(
    requireEnv('BASEQV_SUPABASE_URL'),
    requireEnv('BASEQV_SUPABASE_SERVICE_ROLE_KEY'),
  );
  const anchor = createReadOnlyClient(
    requireEnv('ANCHOR_SUPABASE_URL'),
    requireEnv('ANCHOR_SUPABASE_SERVICE_ROLE_KEY'),
  );
  const pharus = createReadOnlyClient(
    requireEnv('PHARUS_SUPABASE_URL'),
    requireEnv('PHARUS_SUPABASE_SERVICE_ROLE_KEY'),
  );

  await setStep('baseqv', 'processing', { stage: 'baseqv', progress: 5, message: 'Carregando BASEQV…' });

  const [clients, cancellations, clientMeetings, clientMecanismos, mecanismosCatalog, meetingAttendance] =
    await Promise.all([
      fetchAllRows(baseqv, 'clients', { orderBy: 'id' }),
      fetchAllRows(baseqv, 'cancellations', { orderBy: 'id' }),
      fetchAllRows(baseqv, 'client_meetings', { orderBy: 'id' }),
      fetchAllRows(baseqv, 'client_mecanismos', { orderBy: 'id' }),
      fetchAllRows(baseqv, 'mecanismos', { orderBy: 'id' }),
      fetchAllRows(baseqv, 'meeting_attendance', { orderBy: 'id' }),
    ]);

  const {
    activeClients,
    evaluationById,
    stats: activeStats,
  } = buildActiveClientSet(clients, cancellations);

  await setStep('baseqv', 'completed', {
    progress: 15,
    message: `BASEQV: ${activeStats.totalActive} ativos de ${activeStats.totalRaw}`,
  });

  await setStep('anchor', 'processing', { progress: 18, message: 'Carregando Anchor…' });
  const [anchorCadastro, anchorLegado] = await Promise.all([
    fetchAllRows(anchor, 'clientes_cadastro', { schema: 'qv_360', orderBy: 'qv_id' }).catch(async () =>
      fetchAllRows(anchor, 'clientes_cadastro', { schema: 'qv_360', orderBy: 'id' }),
    ),
    fetchAllRows(anchor, 'clientes_legado', { schema: 'qv_360', orderBy: 'id' }),
  ]);
  await setStep('anchor', 'completed', { progress: 28, message: 'Anchor carregado' });

  await setStep('pharus', 'processing', { progress: 30, message: 'Carregando Pharus…' });
  const pharusPersonal = await fetchAllRows(pharus, 'personal_info', {
    schema: 'core',
    orderBy: 'user_id',
  });
  await setStep('pharus', 'completed', { progress: 38, message: 'Pharus carregado' });

  await setStep('normalization', 'processing', { progress: 40, message: 'Normalizando identidades…' });

  const mecanismoNameById = new Map(
    mecanismosCatalog.map((m) => [m.id, m.name]),
  );

  /** @type {Map<string, Record<string, unknown>[]>} */
  const meetingsByClient = new Map();
  for (const m of clientMeetings) {
    const list = meetingsByClient.get(m.client_id) ?? [];
    list.push(m);
    meetingsByClient.set(m.client_id, list);
  }

  /** @type {Record<string, Record<string, unknown>>} */
  const attendanceByUri = {};
  for (const a of meetingAttendance) {
    attendanceByUri[a.calendly_event_uri] = a;
  }

  /** @type {Map<string, Record<string, unknown>[]>} */
  const mecsByClient = new Map();
  for (const cm of clientMecanismos) {
    const list = mecsByClient.get(cm.client_id) ?? [];
    list.push(cm);
    mecsByClient.set(cm.client_id, list);
  }

  /** @type {Map<string, Record<string, unknown>>} */
  const clientsById = new Map(clients.map((c) => [c.id, c]));
  /** @type {Map<string, Record<string, unknown>>} */
  const clientsByQvId = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const clientsByCpf = new Map();

  for (const c of activeClients) {
    const qv = normalizeQvId(c.qv_id);
    if (qv && !clientsByQvId.has(qv)) clientsByQvId.set(qv, c);
    const cpf = normalizeCpf(c.cpf ?? c.cpf_digits);
    if (cpf && !clientsByCpf.has(cpf)) clientsByCpf.set(cpf, c);
  }

  const anchorIndex = buildMatchIndex(anchorCadastro, {
    qvId: (r) => r.qv_id,
    cpf: (r) => r.cpf,
    email: (r) => r.email,
    phone: (r) => r.telefone,
    name: (r) => r.nome_completo,
  });

  const pharusIndex = buildMatchIndex(pharusPersonal, {
    cpf: (r) => r.cpf,
    email: (r) => r.email,
    phone: (r) => r.phone,
    name: (r) => r.name,
  });
  for (const row of pharusPersonal) {
    const alt = normalizeEmail(row.alternative_email);
    if (alt) {
      const list = pharusIndex.byEmail.get(alt) ?? [];
      if (!list.includes(row)) {
        list.push(row);
        pharusIndex.byEmail.set(alt, list);
      }
    }
  }

  await setStep('normalization', 'completed', { progress: 45 });

  await setStep('anchor_matching', 'processing', { progress: 48, message: 'Matching Anchor…' });

  /** @type {Record<string, unknown>[]} */
  const diagnostics = [];
  let foundAnchorCount = 0;
  let foundPharusCount = 0;
  let foundBothCount = 0;
  let notFoundEitherCount = 0;

  /** @type {Map<string, { anchor: ReturnType<typeof matchAnchor>; pharus: ReturnType<typeof matchPharus> }>} */
  const matchByClientId = new Map();

  for (const c of activeClients) {
    const anchorMatch = matchAnchor(c, anchorIndex);
    const pharusMatch = matchPharus(c, pharusIndex);
    matchByClientId.set(c.id, { anchor: anchorMatch, pharus: pharusMatch });

    if (anchorMatch.found) foundAnchorCount++;
    if (pharusMatch.found) foundPharusCount++;
    if (anchorMatch.found && pharusMatch.found) foundBothCount++;
    if (!anchorMatch.found && !pharusMatch.found) notFoundEitherCount++;

    const legacyCandidate = (!anchorMatch.found && !pharusMatch.found);

    diagnostics.push({
      baseqv_client_id: c.id,
      qv_id: c.qv_id,
      nome: c.name,
      cpf: c.cpf,
      email: c.email,
      telefone: c.phone,
      found_anchor: anchorMatch.found,
      anchor_match_type: anchorMatch.matchType,
      found_pharus: pharusMatch.found,
      pharus_match_type: pharusMatch.matchType,
      legacy_candidate: legacyCandidate,
    });
  }

  await setStep('anchor_matching', 'completed', { progress: 55 });
  await setStep('pharus_matching', 'completed', { progress: 60 });

  await setStep('explicit_anchor_legacy', 'processing', { progress: 62 });

  /** @type {Set<string>} */
  const explicitLegacyClientIds = new Set();
  /** @type {Record<string, unknown>[]} */
  const unmatchedAnchorLegacy = [];

  for (const row of anchorLegado) {
    const { client, linkType } = resolveBaseqvClientForAnchorLegacy(row, clientsByQvId, clientsByCpf);
    if (client) {
      const ev = evaluationById.get(client.id);
      if (ev?.isActiveAnalytical) explicitLegacyClientIds.add(client.id);
    } else {
      unmatchedAnchorLegacy.push({
        anchor_legado_id: row.id,
        qv_id: row.qv_id,
        data_entrada_qv360: row.data_entrada_qv360,
        link_attempt: linkType,
      });
    }
  }

  await setStep('explicit_anchor_legacy', 'completed', { progress: 65 });

  await setStep('deduplication', 'processing', { progress: 68 });

  /** @type {Set<string>} */
  const legacyClientIds = new Set();
  for (const c of activeClients) {
    const m = matchByClientId.get(c.id);
    if (m && !m.anchor.found && !m.pharus.found) legacyClientIds.add(c.id);
  }
  for (const id of explicitLegacyClientIds) legacyClientIds.add(id);

  const calculatedOnly = new Set(
    [...legacyClientIds].filter((id) => {
      const m = matchByClientId.get(id);
      return m && !m.anchor.found && !m.pharus.found;
    }),
  );
  let explicitAdditional = 0;
  for (const id of explicitLegacyClientIds) {
    if (!calculatedOnly.has(id)) explicitAdditional++;
  }

  await setStep('deduplication', 'completed', { progress: 72 });

  await setStep('financial', 'processing', {
    progress: 74,
    message: 'Carregando dados financeiros (lote por client_id)…',
  });

  const legacyIdList = [...legacyClientIds];
  const financialByClient = await fetchFinancialByClientIds(baseqv, legacyIdList);

  await setStep('financial', 'completed', { progress: 78, message: 'Dados financeiros carregados' });

  await setStep('mecanismos', 'processing', { progress: 80 });
  await setStep('reunioes', 'processing', { progress: 82 });

  /** @type {Record<string, unknown>[]} */
  const legacyRows = [];

  for (const clientId of legacyClientIds) {
    const c = clientsById.get(clientId);
    if (!c) continue;

    const m = matchByClientId.get(clientId) ?? {
      anchor: { found: false, matchType: null },
      pharus: { found: false, matchType: null },
    };

    const explicit = explicitLegacyClientIds.has(clientId);
    let legacyReason = 'NAO_ENCONTRADO_ANCHOR_NEM_PHARUS';
    if (explicit) legacyReason = 'LEGADO_EXPLICITO_ANCHOR';

    const clientMecs = (mecsByClient.get(clientId) ?? []).sort(
      (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
    );
    const mecNames = [];
    const mecSet = new Set();
    for (const cm of clientMecs) {
      const name = mecanismoNameById.get(cm.mecanismo_id) ?? cm.mecanismo_id;
      if (!mecSet.has(name)) {
        mecSet.add(name);
        mecNames.push(name);
      }
    }

    const lastMeeting = pickLastMeeting(meetingsByClient.get(clientId) ?? [], attendanceByUri);
    const fin = financialByClient.get(clientId) ?? null;
    const finFlat = flattenFinancial(fin);
    const finSummary = buildFinancialSummary(fin);
    const activeEval = evaluationById.get(clientId) ?? {
      isActiveAnalytical: false,
      activeRuleReason: 'UNKNOWN',
      cancellationEffective: false,
      frozen: false,
    };

    legacyRows.push({
      baseqv_client_id: c.id,
      qv_id: c.qv_id,
      nome: c.name,
      cpf: c.cpf,
      telefone: c.phone,
      email: c.email,
      programa: c.programa,
      status: c.status,
      engenheiro_patrimonial: c.engenheiro_patrimonial,
      ep: c.engenheiro_patrimonial,
      found_anchor: m.anchor.found,
      anchor_match_type: m.anchor.matchType,
      found_pharus: m.pharus.found,
      pharus_match_type: m.pharus.matchType,
      explicit_anchor_legacy: explicit,
      legacy_reason: legacyReason,
      is_active_analytical: activeEval.isActiveAnalytical,
      active_rule_reason: activeEval.activeRuleReason,
      cancellation_effective: activeEval.cancellationEffective,
      frozen: activeEval.frozen,
      mecanismos: mecNames.join(' | '),
      quantidade_mecanismos: mecNames.length,
      ultima_reuniao_data: lastMeeting?.ultima_reuniao_data ?? null,
      ultima_reuniao_nome: lastMeeting?.ultima_reuniao_nome ?? null,
      ultima_reuniao: lastMeeting?.ultima_reuniao_nome ?? null,
      data_ultima_reuniao: lastMeeting?.ultima_reuniao_data ?? null,
      ultima_reuniao_responsavel: lastMeeting?.ultima_reuniao_responsavel ?? null,
      ...finSummary,
      ...finFlat,
      financial: fin,
      mecanismos_lista: clientMecs.map((cm) => ({
        id: cm.id,
        mecanismo_id: cm.mecanismo_id,
        nome: mecanismoNameById.get(cm.mecanismo_id) ?? null,
        status: cm.status,
        sequence: cm.sequence,
        implemented_at: cm.implemented_at,
      })),
    });
  }

  legacyRows.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

  const invalidInactiveLegacyCount = legacyRows.filter((r) => !r.is_active_analytical).length;
  if (invalidInactiveLegacyCount > 0) {
    throw new Error(
      `invalid_inactive_legacy_count=${invalidInactiveLegacyCount}. Geração interrompida: há legado inativo na saída.`,
    );
  }

  const totalLegacyActive = legacyRows.length;
  const legacyWithFinancialData = legacyRows.filter((r) => hasMeaningfulFinancialData(r.financial)).length;
  const legacyWithMeeting = legacyRows.filter((r) => Boolean(r.ultima_reuniao_data)).length;
  const totalActiveBaseqv = activeStats.totalActive;
  const percentActiveBaseLegacy =
    totalActiveBaseqv > 0
      ? Math.round((totalLegacyActive / totalActiveBaseqv) * 1000) / 10
      : 0;

  const activeBasePopulation = activeClients.map((c) => ({
    programa: c.programa ?? null,
    ep: c.engenheiro_patrimonial ?? null,
    status: c.status ?? null,
  }));

  await setStep('mecanismos', 'completed');
  await setStep('reunioes', 'completed');
  await setStep('financial', 'completed');

  await setStep('csv_export', 'processing', { progress: 85, message: 'Gerando arquivos…' });

  await fs.mkdir(EXPORTS_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });

  const finColumns = financialCsvColumnKeys();

  const legacyCsvColumns = [
    'nome',
    'telefone',
    'email',
    'programa',
    'ep',
    'mecanismos',
    'ultima_reuniao',
    'data_ultima_reuniao',
    'is_active_analytical',
    'active_rule_reason',
    'cancellation_effective',
    'frozen',
    ...finColumns,
  ];

  const diagColumns = [
    'baseqv_client_id',
    'qv_id',
    'nome',
    'cpf',
    'email',
    'telefone',
    'found_anchor',
    'anchor_match_type',
    'found_pharus',
    'pharus_match_type',
    'legacy_candidate',
  ];

  const summary = {
    generatedAt: new Date().toISOString(),
    total_baseqv: clients.length,
    total_active_baseqv: totalActiveBaseqv,
    total_legacy_active: totalLegacyActive,
    legacy_with_financial_data: legacyWithFinancialData,
    legacy_with_meeting: legacyWithMeeting,
    percent_active_base_legacy: percentActiveBaseLegacy,
    legacy_with_mechanisms: legacyRows.filter((r) => r.quantidade_mecanismos > 0).length,
    legacy_without_mechanisms: legacyRows.filter((r) => r.quantidade_mecanismos === 0).length,
    legacy_without_meeting: legacyRows.filter((r) => !r.ultima_reuniao_data).length,
    legacy_without_financial_data: legacyRows.filter((r) => !hasMeaningfulFinancialData(r.financial)).length,
    invalid_inactive_legacy_count: invalidInactiveLegacyCount,
    active_filter: {
      removed_frozen: activeStats.removedFrozen,
      removed_cancellation_effective: activeStats.removedCancellation,
      rule_module: 'scripts/lib/client-active.mjs',
      rule_notes:
        'Ativo analítico: status ativo/Ativo, sem congelamento vigente, sem churn/data_churn e sem cancelamento efetivo (distrato assinado/churn_efetivado em cancellations).',
    },
    financialSchema: {
      table: 'public.client_financial_data',
      relation: 'client_financial_data.client_id → clients.id',
      columns: CLIENT_FINANCIAL_COLUMNS,
      multiRowRule:
        'Se houver mais de um registro por client_id, usa updated_at mais recente; empate → created_at mais recente.',
      patrimonioResumoRule:
        'Não há coluna patrimônio; resumo = reserva_liquidez + valor_imoveis_quitados (finance_patrimonio).',
      rendaColumn: 'ultima_renda_mensal',
      aporteColumn: 'ultimo_aporte',
    },
    totals: {
      baseqv: clients.length,
      baseqv_active: totalActiveBaseqv,
      anchor_cadastro: anchorCadastro.length,
      anchor_legado: anchorLegado.length,
      pharus_personal_info: pharusPersonal.length,
      baseqv_found_anchor: foundAnchorCount,
      baseqv_found_pharus: foundPharusCount,
      baseqv_found_both: foundBothCount,
      baseqv_not_found_either: notFoundEitherCount,
      explicit_anchor_legacy: explicitLegacyClientIds.size,
      explicit_already_in_calculated: explicitLegacyClientIds.size - explicitAdditional,
      explicit_additional: explicitAdditional,
      duplicates_removed: 0,
      final_legacy: totalLegacyActive,
      final_legacy_active: totalLegacyActive,
      legacy_with_cpf: legacyRows.filter((r) => normalizeCpf(r.cpf)).length,
      legacy_with_email: legacyRows.filter((r) => normalizeEmail(r.email)).length,
      legacy_with_phone: legacyRows.filter((r) => normalizePhone(r.telefone)).length,
      legacy_with_mecanismos: legacyRows.filter((r) => r.quantidade_mecanismos > 0).length,
      legacy_without_mecanismos: legacyRows.filter((r) => r.quantidade_mecanismos === 0).length,
      legacy_with_reuniao: legacyRows.filter((r) => r.ultima_reuniao_data).length,
      legacy_without_reuniao: legacyRows.filter((r) => !r.ultima_reuniao_data).length,
      legacy_with_financial: legacyWithFinancialData,
      legacy_without_financial: legacyRows.filter((r) => !hasMeaningfulFinancialData(r.financial)).length,
      legacy_with_meeting: legacyWithMeeting,
      percent_active_base_legacy: percentActiveBaseLegacy,
    },
  };

  const legacyJsonForExport = legacyRows.map(({ financial, mecanismos_lista, ...rest }) => ({
    ...rest,
    financial,
    mecanismos_lista,
  }));

  await Promise.all([
    fs.writeFile(path.join(EXPORTS_DIR, 'clientes_legado.json'), JSON.stringify(legacyJsonForExport, null, 2)),
    fs.writeFile(path.join(EXPORTS_DIR, 'clientes_legado.csv'), toCsv(legacyRows, legacyCsvColumns), 'utf8'),
    fs.writeFile(path.join(EXPORTS_DIR, 'diagnostico_matches.csv'), toCsv(diagnostics, diagColumns), 'utf8'),
    fs.writeFile(
      path.join(EXPORTS_DIR, 'unmatched_anchor_legacy.csv'),
      toCsv(unmatchedAnchorLegacy, ['anchor_legado_id', 'qv_id', 'data_entrada_qv360', 'link_attempt']),
      'utf8',
    ),
    fs.writeFile(path.join(DATA_DIR, 'clientes-legado.json'), JSON.stringify(legacyJsonForExport, null, 2)),
    fs.writeFile(path.join(DATA_DIR, 'summary.json'), JSON.stringify(summary, null, 2)),
    fs.writeFile(
      path.join(DATA_DIR, 'active-base-population.json'),
      JSON.stringify(activeBasePopulation),
    ),
  ]);

  await setStep('csv_export', 'completed', {
    stage: 'done',
    progress: 100,
    message: 'Build concluído',
  });

  const t = summary.totals;
  console.log(`
==================================================
CLIENTES LEGADO — RESULTADO
==================================================

Total BASEQV (bruto): ${summary.total_baseqv}
Total BASEQV ativos (regra analítica): ${summary.total_active_baseqv}
Removidos por congelamento: ${summary.active_filter.removed_frozen}
Removidos por cancelamento efetivo: ${summary.active_filter.removed_cancellation_effective}
invalid_inactive_legacy_count: ${summary.invalid_inactive_legacy_count}

Total BASEQV: ${t.baseqv}
Total Anchor (cadastro): ${t.anchor_cadastro}
Total Pharus: ${t.pharus_personal_info}

BASEQV encontrados no Anchor: ${t.baseqv_found_anchor}
BASEQV encontrados no Pharus: ${t.baseqv_found_pharus}
Encontrados nos dois: ${t.baseqv_found_both}

Não encontrados nem Anchor nem Pharus: ${t.baseqv_not_found_either}

Legado explícito Anchor: ${t.explicit_anchor_legacy}
Legados explícitos Anchor já presentes no legado calculado: ${t.explicit_already_in_calculated}
Legados explícitos Anchor adicionais: ${t.explicit_additional}

Duplicados removidos: ${t.duplicates_removed}

TOTAL FINAL CLIENTES LEGADO ATIVOS: ${summary.total_legacy_active}
% da base ativa que é legado: ${summary.percent_active_base_legacy}%

Clientes legado com CPF: ${t.legacy_with_cpf}
Clientes legado com email: ${t.legacy_with_email}
Clientes legado com telefone: ${t.legacy_with_phone}

Clientes legado com mecanismos: ${t.legacy_with_mecanismos}
Clientes legado sem mecanismos: ${t.legacy_without_mecanismos}

Clientes legado com reunião: ${t.legacy_with_reuniao}
Clientes legado sem reunião: ${t.legacy_without_reuniao}

Clientes legado com dados financeiros: ${t.legacy_with_financial}
Clientes legado sem dados financeiros: ${t.legacy_without_financial}
`);
}

main().catch(async (err) => {
  console.error(err);
  await updateBuildStatus({
    stage: 'error',
    message: err instanceof Error ? err.message : String(err),
    steps: Object.fromEntries(
      ['baseqv', 'anchor', 'pharus', 'normalization', 'anchor_matching', 'pharus_matching', 'explicit_anchor_legacy', 'deduplication', 'mecanismos', 'reunioes', 'financial', 'csv_export'].map(
        (k) => [k, 'error'],
      ),
    ),
  });
  process.exit(1);
});

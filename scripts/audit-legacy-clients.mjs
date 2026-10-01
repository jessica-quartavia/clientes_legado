import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fetchAllRows } from './lib/pagination.mjs';
import {
  auditAgainstSource,
  buildAuditIndex,
  consolidateAuditoriaStatus,
  isAuditFound,
} from './lib/audit-match.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const EXPORTS_DIR = path.join(ROOT, 'exports');

dotenv.config({ path: path.join(ROOT, '.env') });

const AUDIT_SOURCES = {
  anchor: {
    schema: 'qv_360',
    table: 'clientes_cadastro',
    label: 'Anchor',
    columns: ['qv_id', 'nome_completo', 'cpf', 'email', 'telefone', 'airtable_id'],
  },
  pharus: {
    schema: 'core',
    table: 'personal_info',
    label: 'App Pharus',
    columns: ['user_id', 'name', 'cpf', 'phone', 'alternative_email'],
  },
};

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function writeAuditStatus(patch) {
  const p = path.join(DATA_DIR, 'audit-status.json');
  let cur = {};
  try {
    cur = JSON.parse(await fs.readFile(p, 'utf8'));
  } catch {
    /* */
  }
  await fs.writeFile(p, JSON.stringify({ ...cur, ...patch, updatedAt: new Date().toISOString() }, null, 2));
}

async function main() {
  const legacyPath = path.join(DATA_DIR, 'clientes-legado.json');
  const raw = await fs.readFile(legacyPath, 'utf8');
  /** @type {Record<string, unknown>[]} */
  const clients = JSON.parse(raw);
  if (!clients.length) {
    throw new Error('clientes-legado.json vazio. Execute npm run build:legacy primeiro.');
  }

  const anchor = createClient(
    process.env.ANCHOR_SUPABASE_URL,
    process.env.ANCHOR_SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const pharus = createClient(
    process.env.PHARUS_SUPABASE_URL,
    process.env.PHARUS_SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  await writeAuditStatus({ stage: 'loading_anchor', message: 'Carregando Anchor…', progress: 5 });
  console.log('Carregando Anchor…');
  const anchorRows = await fetchAllRows(anchor, AUDIT_SOURCES.anchor.table, {
    schema: AUDIT_SOURCES.anchor.schema,
    orderBy: 'qv_id',
  });

  await writeAuditStatus({ stage: 'loading_pharus', message: 'Carregando App Pharus…', progress: 25 });
  console.log('Carregando App Pharus…');
  const pharusRows = await fetchAllRows(pharus, AUDIT_SOURCES.pharus.table, {
    schema: AUDIT_SOURCES.pharus.schema,
    orderBy: 'user_id',
  });

  const anchorIndex = buildAuditIndex(anchorRows, {
    id: (r) => String(r.qv_id ?? r.airtable_id ?? ''),
    cpf: (r) => r.cpf,
    email: (r) => r.email,
    phone: (r) => r.telefone,
    qvId: (r) => r.qv_id,
  });

  const pharusIndex = buildAuditIndex(pharusRows, {
    id: (r) => String(r.user_id ?? ''),
    cpf: (r) => r.cpf,
    email: (r) => r.alternative_email,
    phone: (r) => r.phone,
  });

  // index alternative_email separately for Pharus
  for (const row of pharusRows) {
    const alt = row.alternative_email;
    const key = alt ? String(alt).trim().toLowerCase() : null;
    if (!key) continue;
    const list = pharusIndex.byEmail.get(key) ?? [];
    if (!list.includes(row)) {
      list.push(row);
      pharusIndex.byEmail.set(key, list);
    }
  }

  await writeAuditStatus({ stage: 'auditing', message: 'Auditando clientes…', progress: 40 });
  console.log('Auditando clientes…');

  /** @type {Record<string, number>} */
  const matchByCounts = { CPF: 0, EMAIL: 0, TELEFONE: 0, QV_ID: 0, MULTI: 0, NOME_APENAS: 0 };

  let falsePositives = 0;
  let falseNegatives = 0;

  /** @type {Record<string, unknown>[]} */
  const audited = [];
  const total = clients.length;

  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    const a = auditAgainstSource(c, anchorIndex, 'anchor');
    const p = auditAgainstSource(c, pharusIndex, 'pharus');

    const auditoria_status = consolidateAuditoriaStatus(a.anchor_status, p.pharus_status);

    const row = {
      ...c,
      anchor_status: a.anchor_status,
      anchor_match_by: a.anchor_match_by,
      anchor_matched_id: a.anchor_matched_id,
      anchor_audit: a.anchor_audit,
      app_pharus_status: p.pharus_status,
      app_pharus_match_by: p.pharus_match_by,
      app_pharus_matched_id: p.pharus_matched_id,
      app_pharus_audit: p.pharus_audit,
      auditoria_status,
    };
    audited.push(row);

    tallyMatchBy(a.anchor_match_by, matchByCounts);
    tallyMatchBy(p.pharus_match_by, matchByCounts);

    const oldAnchor = c.found_anchor === true;
    const oldPharus = c.found_pharus === true;
    const newAnchor = isAuditFound(a.anchor_status);
    const newPharus = isAuditFound(p.pharus_status);
    if (oldAnchor && !newAnchor && a.anchor_status !== 'AMBIGUO') falsePositives++;
    if (oldPharus && !newPharus && p.pharus_status !== 'AMBIGUO') falsePositives++;
    if (!oldAnchor && newAnchor) falseNegatives++;
    if (!oldPharus && newPharus) falseNegatives++;

    if ((i + 1) % 250 === 0 || i + 1 === total) {
      const msg = `${i + 1} / ${total}`;
      console.log(msg);
      await writeAuditStatus({
        message: msg,
        progress: 40 + Math.round(((i + 1) / total) * 55),
        processed: i + 1,
        total,
      });
    }
  }

  const totals = {
    total_auditado: audited.length,
    nao_em_nenhum: audited.filter((r) => r.auditoria_status === 'NAO_ESTA_EM_NENHUM').length,
    esta_no_anchor: audited.filter((r) => r.auditoria_status === 'ESTA_NO_ANCHOR').length,
    esta_no_app_pharus: audited.filter((r) => r.auditoria_status === 'ESTA_NO_APP_PHARUS').length,
    esta_nos_dois: audited.filter((r) => r.auditoria_status === 'ESTA_NOS_DOIS').length,
    ambiguos: audited.filter((r) => r.auditoria_status === 'AMBIGUO').length,
    anchor_encontrado: audited.filter((r) => isAuditFound(r.anchor_status)).length,
    pharus_encontrado: audited.filter((r) => isAuditFound(r.app_pharus_status)).length,
  };

  const auditSummary = {
    generatedAt: new Date().toISOString(),
    sources: AUDIT_SOURCES,
    totals,
    matchByCounts,
    comparisonWithLegacyMatching: {
      false_positives_vs_old_found_flags: falsePositives,
      false_negatives_vs_old_found_flags: falseNegatives,
      note: 'Falso positivo = found_* antigo true e auditoria não confirma (exceto AMBIGUO). Falso negativo = found_* antigo false e auditoria encontra.',
    },
    multiRowRule: 'N/A — índices em memória sobre snapshot completo das tabelas fonte.',
  };

  await fs.mkdir(EXPORTS_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });

  const auditCsvCols = [
    'baseqv_client_id',
    'nome',
    'cpf',
    'telefone',
    'email',
    'programa',
    'ep',
    'anchor_status',
    'anchor_match_by',
    'anchor_matched_id',
    'app_pharus_status',
    'app_pharus_match_by',
    'app_pharus_matched_id',
    'auditoria_status',
  ];

  const auditCsvRows = audited.map((r) => ({
    baseqv_client_id: r.baseqv_client_id,
    nome: r.nome,
    cpf: r.cpf,
    telefone: r.telefone,
    email: r.email,
    programa: r.programa,
    ep: r.engenheiro_patrimonial ?? r.ep,
    anchor_status: r.anchor_status,
    anchor_match_by: r.anchor_match_by,
    anchor_matched_id: r.anchor_matched_id,
    app_pharus_status: r.app_pharus_status,
    app_pharus_match_by: r.app_pharus_match_by,
    app_pharus_matched_id: r.app_pharus_matched_id,
    auditoria_status: r.auditoria_status,
  }));

  const csvLines = [
    auditCsvCols.join(','),
    ...auditCsvRows.map((r) => auditCsvCols.map((c) => csvEscape(r[c])).join(',')),
  ].join('\n');

  await Promise.all([
    fs.writeFile(path.join(DATA_DIR, 'clientes-legado.json'), JSON.stringify(audited, null, 2)),
    fs.writeFile(path.join(EXPORTS_DIR, 'clientes_legado.json'), JSON.stringify(audited, null, 2)),
    fs.writeFile(path.join(EXPORTS_DIR, 'auditoria_clientes_legado.csv'), csvLines, 'utf8'),
    fs.writeFile(path.join(DATA_DIR, 'audit-summary.json'), JSON.stringify(auditSummary, null, 2)),
  ]);

  // merge audit totals into summary.json if exists
  try {
    const summaryPath = path.join(DATA_DIR, 'summary.json');
    const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
    summary.audit = auditSummary;
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  } catch {
    /* */
  }

  await writeAuditStatus({ stage: 'done', message: 'Concluído.', progress: 100 });

  console.log('\n=== AUDITORIA CONCLUÍDA ===');
  console.log(JSON.stringify(totals, null, 2));
  console.log(`\nCSV: ${path.join(EXPORTS_DIR, 'auditoria_clientes_legado.csv')}`);
  console.log('\nNenhuma escrita foi realizada no BASE QV, Anchor ou App Pharus.');
}

function tallyMatchBy(matchBy, counts) {
  if (!matchBy || matchBy === '-') return;
  if (matchBy === 'NOME_APENAS') {
    counts.NOME_APENAS++;
    return;
  }
  if (matchBy.includes('+')) {
    counts.MULTI++;
    return;
  }
  if (counts[matchBy] != null) counts[matchBy]++;
}

main().catch(async (err) => {
  console.error(err);
  await writeAuditStatus({ stage: 'error', message: String(err.message ?? err) });
  process.exit(1);
});

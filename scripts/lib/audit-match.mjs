import {
  normalizeCpf,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeQvId,
  phonesMatch,
} from './normalize.mjs';

/** @typedef {'ENCONTRADO_EXATO' | 'ENCONTRADO_PROVAVEL' | 'NAO_ENCONTRADO' | 'AMBIGUO'} AuditStatus */

/**
 * @param {Record<string, unknown>[]} rows
 * @param {{
 *   id: (r: Record<string, unknown>) => string | null;
 *   cpf?: (r: Record<string, unknown>) => string | null | undefined;
 *   email?: (r: Record<string, unknown>) => string | null | undefined;
 *   phone?: (r: Record<string, unknown>) => string | null | undefined;
 *   qvId?: (r: Record<string, unknown>) => string | null | undefined;
 * }} getters
 */
export function buildAuditIndex(rows, getters) {
  /** @type {Map<string, Record<string, unknown>[]>} */
  const byCpf = new Map();
  /** @type {Map<string, Record<string, unknown>[]>} */
  const byEmail = new Map();
  /** @type {Map<string, Record<string, unknown>[]>} */
  const byPhone = new Map();
  /** @type {Map<string, Record<string, unknown>[]>} */
  const byQvId = new Map();

  const push = (map, key, row) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  };

  for (const row of rows) {
    push(byCpf, normalizeCpf(getters.cpf?.(row)), row);
    push(byEmail, normalizeEmail(getters.email?.(row)), row);
    const ph = normalizePhone(getters.phone?.(row));
    push(byPhone, ph, row);
    push(byQvId, normalizeQvId(getters.qvId?.(row)), row);
  }

  return { byCpf, byEmail, byPhone, byQvId, all: rows, getters };
}

/**
 * @param {Record<string, unknown>} client
 * @param {ReturnType<typeof buildAuditIndex>} index
 * @param {'anchor' | 'pharus'} source
 */
export function auditAgainstSource(client, index, source) {
  const cpf = normalizeCpf(client.cpf);
  const email = normalizeEmail(client.email);
  const phone = normalizePhone(client.telefone ?? client.phone);
  const qvId = normalizeQvId(client.qv_id);

  /** @type {Record<string, unknown>[]} */
  const candidates = [];
  /** @type {Set<string>} */
  const matchSignals = new Set();

  const addAll = (rows) => {
    for (const r of rows ?? []) candidates.push(r);
  };

  if (source === 'anchor' && qvId) addAll(index.byQvId.get(qvId));
  if (cpf) addAll(index.byCpf.get(cpf));
  if (email) addAll(index.byEmail.get(email));

  if (source === 'pharus' && email) {
    for (const row of index.all) {
      if (normalizeEmail(row.alternative_email) === email) candidates.push(row);
    }
  }

  if (phone) {
    addAll(index.byPhone.get(phone));
    for (const row of index.all) {
      const p = normalizePhone(index.getters.phone?.(row));
      if (p && phonesMatch(phone, p)) candidates.push(row);
    }
  }

  const idOf = (r) => String(index.getters.id(r) ?? '');
  /** @type {Record<string, unknown>[]} */
  const unique = [];
  const seen = new Set();
  for (const c of candidates) {
    const id = idOf(c);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(c);
    if (source === 'anchor' && qvId && normalizeQvId(index.getters.qvId?.(c)) === qvId) {
      matchSignals.add('QV_ID');
    }
    if (cpf && normalizeCpf(index.getters.cpf?.(c)) === cpf) matchSignals.add('CPF');
    const rowEmail = normalizeEmail(index.getters.email?.(c) ?? c.alternative_email);
    if (email && rowEmail === email) matchSignals.add('EMAIL');
    const rowPhone = normalizePhone(index.getters.phone?.(c));
    if (phone && rowPhone && phonesMatch(phone, rowPhone)) matchSignals.add('TELEFONE');
  }

  const nameNorm = normalizeName(client.nome ?? client.name);
  if (unique.length === 0 && nameNorm) {
    const nameHits = index.all.filter(
      (row) => normalizeName(row.nome_completo ?? row.name) === nameNorm,
    );
    if (nameHits.length) {
      return result(source, client, 'AMBIGUO', 'NOME_APENAS', null);
    }
    return result(source, client, 'NAO_ENCONTRADO', '-', null);
  }

  if (unique.length > 1) {
    const cpfs = new Set(unique.map((r) => normalizeCpf(index.getters.cpf?.(r))).filter(Boolean));
    if (cpfs.size > 1) {
      return result(source, client, 'AMBIGUO', combineSignals(matchSignals), null);
    }
  }

  const row = unique[0];
  const rowCpf = normalizeCpf(index.getters.cpf?.(row));
  const rowEmail = normalizeEmail(index.getters.email?.(row) ?? row.alternative_email);
  const rowPhone = normalizePhone(index.getters.phone?.(row));

  const cpfOk = cpf && rowCpf && cpf === rowCpf;
  const emailOk = email && rowEmail && email === rowEmail;
  const phoneOk = phone && rowPhone && phonesMatch(phone, rowPhone);
  const qvOk = source === 'anchor' && qvId && normalizeQvId(index.getters.qvId?.(row)) === qvId;

  let status = /** @type {AuditStatus} */ ('ENCONTRADO_PROVAVEL');

  if (cpfOk || qvOk || (emailOk && phoneOk)) {
    status = 'ENCONTRADO_EXATO';
  } else if (emailOk) {
    status = (index.byEmail.get(email)?.length ?? 0) > 1 ? 'AMBIGUO' : 'ENCONTRADO_PROVAVEL';
  } else if (phoneOk) {
    status = countPhoneMatches(index, phone) > 1 ? 'AMBIGUO' : 'ENCONTRADO_PROVAVEL';
  } else if (matchSignals.has('CPF') || matchSignals.has('QV_ID')) {
    status = 'ENCONTRADO_EXATO';
  } else {
    status = 'AMBIGUO';
  }

  return result(source, client, status, combineSignals(matchSignals), index.getters.id(row));
}

function countPhoneMatches(index, phone) {
  let n = 0;
  const seen = new Set();
  for (const row of index.all) {
    const id = index.getters.id(row);
    if (!id || seen.has(id)) continue;
    if (phonesMatch(phone, index.getters.phone?.(row))) {
      seen.add(id);
      n++;
    }
  }
  return n;
}

function combineSignals(set) {
  if (!set.size) return '-';
  const order = ['QV_ID', 'CPF', 'EMAIL', 'TELEFONE'];
  return [...set].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('+');
}

function result(source, client, status, matchBy, matchedId) {
  return {
    [`${source}_status`]: status,
    [`${source}_match_by`]: matchBy,
    [`${source}_matched_id`]: matchedId,
    [`${source}_audit`]: {
      cpf_compared: normalizeCpf(client.cpf),
      email_compared: normalizeEmail(client.email),
      telefone_compared: normalizePhone(client.telefone ?? client.phone),
    },
  };
}

/** @param {AuditStatus | string | undefined} s */
export function isAuditFound(s) {
  return s === 'ENCONTRADO_EXATO' || s === 'ENCONTRADO_PROVAVEL';
}

/**
 * @param {AuditStatus | string | undefined} anchorStatus
 * @param {AuditStatus | string | undefined} pharusStatus
 */
export function consolidateAuditoriaStatus(anchorStatus, pharusStatus) {
  if (anchorStatus === 'AMBIGUO' || pharusStatus === 'AMBIGUO') return 'AMBIGUO';
  const aFound = isAuditFound(anchorStatus);
  const pFound = isAuditFound(pharusStatus);
  if (aFound && pFound) return 'ESTA_NOS_DOIS';
  if (aFound) return 'ESTA_NO_ANCHOR';
  if (pFound) return 'ESTA_NO_APP_PHARUS';
  return 'NAO_ESTA_EM_NENHUM';
}

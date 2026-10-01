import { normalizeCpf, normalizeEmail, normalizePhone, normalizeName, normalizeQvId, phonesMatch } from './normalize.mjs';

/**
 * @typedef {Object} MatchIndex
 * @property {Map<string, unknown[]>} byQvId
 * @property {Map<string, unknown[]>} byCpf
 * @property {Map<string, unknown[]>} byEmail
 * @property {Map<string, unknown[]>} byPhone
 * @property {unknown[]} all
 */

/**
 * @param {Record<string, unknown>[]} rows
 * @param {{
 *   qvId?: (row: Record<string, unknown>) => string | null | undefined;
 *   cpf?: (row: Record<string, unknown>) => string | null | undefined;
 *   email?: (row: Record<string, unknown>) => string | null | undefined;
 *   phone?: (row: Record<string, unknown>) => string | null | undefined;
 *   name?: (row: Record<string, unknown>) => string | null | undefined;
 * }} getters
 * @returns {MatchIndex & { byName: Map<string, unknown[]> }}
 */
export function buildMatchIndex(rows, getters) {
  /** @type {MatchIndex & { byName: Map<string, unknown[]> }} */
  const index = {
    byQvId: new Map(),
    byCpf: new Map(),
    byEmail: new Map(),
    byPhone: new Map(),
    byName: new Map(),
    all: rows,
  };

  const push = (/** @type {Map<string, unknown[]>} */ map, /** @type {string | null} */ key, row) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  };

  for (const row of rows) {
    push(index.byQvId, normalizeQvId(getters.qvId?.(row)), row);
    push(index.byCpf, normalizeCpf(getters.cpf?.(row)), row);
    push(index.byEmail, normalizeEmail(getters.email?.(row)), row);
    push(index.byPhone, normalizePhone(getters.phone?.(row)), row);
    push(index.byName, normalizeName(getters.name?.(row)), row);
  }

  return index;
}

/**
 * @param {Record<string, unknown>} baseqvClient
 * @param {MatchIndex & { byName?: Map<string, unknown[]> }} anchorIndex
 * @returns {{ found: boolean; matchType: string | null }}
 */
export function matchAnchor(baseqvClient, anchorIndex) {
  const qvId = normalizeQvId(baseqvClient.qv_id);
  if (qvId && anchorIndex.byQvId.has(qvId)) {
    return { found: true, matchType: 'qv_id' };
  }

  const cpf = normalizeCpf(baseqvClient.cpf ?? baseqvClient.cpf_digits);
  if (cpf && anchorIndex.byCpf.has(cpf)) {
    return { found: true, matchType: 'cpf' };
  }

  const email = normalizeEmail(baseqvClient.email);
  if (email && anchorIndex.byEmail.has(email)) {
    return { found: true, matchType: 'email' };
  }

  const phone = normalizePhone(baseqvClient.phone ?? baseqvClient.phone_digits);
  if (phone) {
    for (const row of anchorIndex.all) {
      const p = normalizePhone(row.telefone ?? row.phone);
      if (p && phonesMatch(phone, p)) {
        return { found: true, matchType: 'telefone' };
      }
    }
  }

  const name = normalizeName(baseqvClient.name);
  if (name && email && anchorIndex.byEmail.has(email)) {
    const candidates = anchorIndex.byEmail.get(email) ?? [];
    if (candidates.some((r) => normalizeName(r.nome_completo ?? r.name) === name)) {
      return { found: true, matchType: 'nome_email' };
    }
  }
  if (name && phone) {
    for (const row of anchorIndex.all) {
      if (normalizeName(row.nome_completo ?? row.name) !== name) continue;
      if (phonesMatch(phone, row.telefone ?? row.phone)) {
        return { found: true, matchType: 'nome_telefone' };
      }
    }
  }
  if (name && cpf) {
    for (const row of anchorIndex.all) {
      if (normalizeName(row.nome_completo ?? row.name) !== name) continue;
      if (normalizeCpf(row.cpf) === cpf) {
        return { found: true, matchType: 'nome_cpf' };
      }
    }
  }

  return { found: false, matchType: null };
}

/**
 * @param {Record<string, unknown>} baseqvClient
 * @param {MatchIndex} pharusIndex
 * @returns {{ found: boolean; matchType: string | null }}
 */
export function matchPharus(baseqvClient, pharusIndex) {
  const cpf = normalizeCpf(baseqvClient.cpf ?? baseqvClient.cpf_digits);
  if (cpf && pharusIndex.byCpf.has(cpf)) {
    return { found: true, matchType: 'cpf' };
  }

  const email = normalizeEmail(baseqvClient.email);
  if (email && pharusIndex.byEmail.has(email)) {
    return { found: true, matchType: 'email' };
  }

  const altEmail = normalizeEmail(baseqvClient.email);
  if (altEmail) {
    for (const row of pharusIndex.all) {
      if (normalizeEmail(row.alternative_email) === altEmail) {
        return { found: true, matchType: 'alternative_email' };
      }
    }
  }

  const phone = normalizePhone(baseqvClient.phone ?? baseqvClient.phone_digits);
  if (phone) {
    for (const row of pharusIndex.all) {
      if (phonesMatch(phone, row.phone)) {
        return { found: true, matchType: 'telefone' };
      }
    }
  }

  const name = normalizeName(baseqvClient.name);
  if (name && email) {
    const byEmail = pharusIndex.byEmail.get(email) ?? [];
    if (byEmail.some((r) => normalizeName(r.name) === name)) {
      return { found: true, matchType: 'nome_email' };
    }
  }
  if (name && phone) {
    for (const row of pharusIndex.all) {
      if (normalizeName(row.name) !== name) continue;
      if (phonesMatch(phone, row.phone)) {
        return { found: true, matchType: 'nome_telefone' };
      }
    }
  }
  if (name && cpf) {
    for (const row of pharusIndex.all) {
      if (normalizeName(row.name) !== name) continue;
      if (normalizeCpf(row.cpf) === cpf) {
        return { found: true, matchType: 'nome_cpf' };
      }
    }
  }

  return { found: false, matchType: null };
}

/**
 * @param {Record<string, unknown>} anchorLegacyRow
 * @param {Map<string, Record<string, unknown>>} clientsByQvId
 * @param {Map<string, Record<string, unknown>>} clientsByCpf
 */
export function resolveBaseqvClientForAnchorLegacy(anchorLegacyRow, clientsByQvId, clientsByCpf) {
  const qvId = normalizeQvId(anchorLegacyRow.qv_id);
  if (qvId && clientsByQvId.has(qvId)) {
    return { client: clientsByQvId.get(qvId), linkType: 'qv_id' };
  }
  const cpf = normalizeCpf(anchorLegacyRow.cpf);
  if (cpf && clientsByCpf.has(cpf)) {
    return { client: clientsByCpf.get(cpf), linkType: 'cpf' };
  }
  return { client: null, linkType: null };
}

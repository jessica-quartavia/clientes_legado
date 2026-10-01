/**
 * Regra analítica de cliente ATIVO (BASEQV).
 * Alinhada a vw_clients_ciclo_churn (fl_churn), cancellations e status congelado/churn.
 * Não existe helper no repo base-legado; lógica derivada do schema oficial.
 */

/**
 * @param {string | null | undefined} status
 */
export function normalizeClientStatus(status) {
  return String(status ?? '')
    .trim()
    .toLowerCase();
}

/**
 * @param {Record<string, unknown>} client
 */
export function isFrozenClient(client) {
  if (normalizeClientStatus(client.status) === 'congelado') {
    return true;
  }
  if (!client.data_congelamento) return false;
  if (!client.data_descongelamento) return true;
  const thaw = new Date(String(client.data_descongelamento));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return thaw > today;
}

/**
 * @param {Record<string, unknown>} cancellation
 */
export function isEffectiveCancellationRecord(cancellation) {
  if (cancellation.archived_at) return false;
  if (cancellation.churn_efetivado_at) return true;
  if (cancellation.distrato_assinado_at) return true;
  const distrato = String(cancellation.distrato ?? '').trim().toLowerCase();
  if (!distrato) return false;
  if (distrato === 'assinado' || distrato === 'signed') return true;
  if (distrato.includes('assinado') && !distrato.includes('não') && !distrato.includes('nao')) {
    return true;
  }
  return false;
}

/**
 * @param {string} clientId
 * @param {Map<string, Record<string, unknown>[]>} cancellationsByClient
 */
export function hasEffectiveCancellation(clientId, cancellationsByClient) {
  const rows = cancellationsByClient.get(clientId) ?? [];
  return rows.some(isEffectiveCancellationRecord);
}

/**
 * @param {Record<string, unknown>} client
 * @param {Map<string, Record<string, unknown>[]>} cancellationsByClient
 */
export function hasChurnSignals(client, cancellationsByClient) {
  if (client.data_churn) return true;
  if (normalizeClientStatus(client.status) === 'churn') return true;
  return hasEffectiveCancellation(client.id, cancellationsByClient);
}

/**
 * @param {Record<string, unknown>} client
 * @param {Map<string, Record<string, unknown>[]>} cancellationsByClient
 * @returns {{
 *   isActiveAnalytical: boolean;
 *   frozen: boolean;
 *   cancellationEffective: boolean;
 *   activeRuleReason: string;
 * }}
 */
export function evaluateClientActiveAnalytical(client, cancellationsByClient) {
  const frozen = isFrozenClient(client);
  const cancellationEffective = hasChurnSignals(client, cancellationsByClient);

  if (frozen) {
    return {
      isActiveAnalytical: false,
      frozen: true,
      cancellationEffective,
      activeRuleReason: 'CONGELADO',
    };
  }

  if (cancellationEffective) {
    return {
      isActiveAnalytical: false,
      frozen: false,
      cancellationEffective: true,
      activeRuleReason: 'CANCELAMENTO_EFETIVO',
    };
  }

  const st = normalizeClientStatus(client.status);
  if (st === 'churn') {
    return {
      isActiveAnalytical: false,
      frozen: false,
      cancellationEffective: true,
      activeRuleReason: 'STATUS_CHURN',
    };
  }

  if (st === 'congelado') {
    return {
      isActiveAnalytical: false,
      frozen: true,
      cancellationEffective,
      activeRuleReason: 'STATUS_CONGELADO',
    };
  }

  if (st === 'ativo' || st === 'active') {
    return {
      isActiveAnalytical: true,
      frozen: false,
      cancellationEffective: false,
      activeRuleReason: 'ATIVO_ANALITICO',
    };
  }

  return {
    isActiveAnalytical: false,
    frozen: false,
    cancellationEffective,
    activeRuleReason: `STATUS_NAO_ATIVO:${client.status ?? 'null'}`,
  };
}

/**
 * @param {Record<string, unknown>[]} clients
 * @param {Record<string, unknown>[]} cancellations
 */
export function buildActiveClientSet(clients, cancellations) {
  /** @type {Map<string, Record<string, unknown>[]>} */
  const cancellationsByClient = new Map();
  for (const row of cancellations) {
    const id = row.client_id;
    if (!id) continue;
    const list = cancellationsByClient.get(id) ?? [];
    list.push(row);
    cancellationsByClient.set(id, list);
  }

  /** @type {Map<string, ReturnType<typeof evaluateClientActiveAnalytical>>} */
  const evaluationById = new Map();
  /** @type {Record<string, unknown>[]} */
  const activeClients = [];

  let removedCancellation = 0;
  let removedFrozen = 0;

  for (const client of clients) {
    const ev = evaluateClientActiveAnalytical(client, cancellationsByClient);
    evaluationById.set(client.id, ev);
    if (ev.isActiveAnalytical) {
      activeClients.push(client);
      continue;
    }
    if (ev.frozen) {
      removedFrozen++;
      continue;
    }
    if (
      ev.cancellationEffective ||
      ev.activeRuleReason === 'STATUS_CHURN' ||
      ev.activeRuleReason === 'CANCELAMENTO_EFETIVO'
    ) {
      removedCancellation++;
    }
  }

  return {
    activeClients,
    evaluationById,
    cancellationsByClient,
    stats: {
      totalRaw: clients.length,
      totalActive: activeClients.length,
      removedFrozen,
      removedCancellation,
    },
  };
}

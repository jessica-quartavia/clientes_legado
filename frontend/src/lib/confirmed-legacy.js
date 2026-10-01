export const CONFIRMED_AUDIT_STATUS = 'NAO_ESTA_EM_NENHUM';

/** @param {Record<string, unknown>} client */
export function isConfirmedLegacyClient(client) {
  return client.auditoria_status === CONFIRMED_AUDIT_STATUS;
}

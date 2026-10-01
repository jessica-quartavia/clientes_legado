import { pickLatestFinancialRow } from './financial.mjs';

/**
 * Busca client_financial_data em lote por client_id (sem N+1).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string[]} clientIds
 * @param {{ chunkSize?: number }} [options]
 * @returns {Promise<Map<string, Record<string, unknown>>>}
 */
export async function fetchFinancialByClientIds(client, clientIds, options = {}) {
  const chunkSize = options.chunkSize ?? 120;
  /** @type {Map<string, Record<string, unknown>[]>} */
  const grouped = new Map();

  for (let i = 0; i < clientIds.length; i += chunkSize) {
    const chunk = clientIds.slice(i, i + chunkSize);
    const { data, error } = await client
      .from('client_financial_data')
      .select('*')
      .in('client_id', chunk);

    if (error) {
      throw new Error(`client_financial_data (lote ${i / chunkSize + 1}): ${error.message}`);
    }

    for (const row of data ?? []) {
      const id = row.client_id;
      const list = grouped.get(id) ?? [];
      list.push(row);
      grouped.set(id, list);
    }
  }

  /** @type {Map<string, Record<string, unknown>>} */
  const result = new Map();
  for (const [clientId, rows] of grouped) {
    const picked = pickLatestFinancialRow(rows);
    if (picked) result.set(clientId, picked);
  }
  return result;
}

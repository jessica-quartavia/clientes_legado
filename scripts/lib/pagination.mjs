/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} table
 * @param {{
 *   schema?: string;
 *   select?: string;
 *   pageSize?: number;
 *   orderBy?: string;
 *   ascending?: boolean;
 * }} [options]
 */
export async function fetchAllRows(client, table, options = {}) {
  const {
    schema,
    select = '*',
    pageSize = 1000,
    orderBy = 'id',
    ascending = true,
  } = options;

  /** @type {Record<string, unknown>[]} */
  const rows = [];
  let from = 0;

  while (true) {
    let query = schema
      ? client.schema(schema).from(table).select(select)
      : client.from(table).select(select);

    query = query
      .order(orderBy, { ascending })
      .range(from, from + pageSize - 1);

    const { data, error } = await query;
    if (error) {
      throw new Error(`fetchAllRows ${schema ? schema + '.' : ''}${table}: ${error.message}`);
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

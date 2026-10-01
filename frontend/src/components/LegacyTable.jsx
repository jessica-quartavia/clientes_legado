import { formatCurrencyBRL } from '../lib/financial.js';
import CopyButton from './CopyButton.jsx';

export const TABLE_COLUMNS = [
  { key: 'nome', label: 'Nome', className: 'col-nome' },
  { key: 'telefone', label: 'Telefone', className: 'col-telefone' },
  { key: 'email', label: 'Email', className: 'col-email' },
  { key: 'programa', label: 'Programa', className: 'col-programa nowrap' },
  { key: 'engenheiro_patrimonial', label: 'EP', className: 'col-ep' },
  { key: 'mecanismos', label: 'Mecanismos', className: 'col-mec' },
  { key: 'ultima_reuniao_nome', label: 'Última reunião', className: 'col-reuniao' },
  { key: 'ultima_reuniao_data', label: 'Data última reunião', sortAs: 'date', className: 'col-data nowrap' },
  { key: 'finance_renda', label: 'Renda', sortAs: 'number', className: 'col-fin nowrap' },
  { key: 'finance_patrimonio', label: 'Patrimônio', sortAs: 'number', className: 'col-fin nowrap' },
  { key: 'finance_aporte', label: 'Aporte mensal', sortAs: 'number', className: 'col-fin nowrap' },
  { key: '_actions', label: '', sortable: false, className: 'col-actions nowrap' },
];

/** @deprecated */
export const COLUMNS = TABLE_COLUMNS;

export default function LegacyTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  onExport,
  confirmedTotal,
  filteredTotal,
}) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  const countLabel =
    filteredTotal === confirmedTotal
      ? `${confirmedTotal} cliente(s) legado confirmado(s)`
      : `${filteredTotal} na visão filtrada · ${confirmedTotal} confirmados no total`;

  return (
    <div className="table-panel table-panel--wide">
      <FiltersToolbar
        countLabel={countLabel}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        onExport={onExport}
      />

      <div className="table-wrap table-wrap--wide">
        <table className="legacy-table">
          <colgroup>
            <col className="col-nome" />
            <col className="col-telefone" />
            <col className="col-email" />
            <col className="col-programa" />
            <col className="col-ep" />
            <col className="col-mec" />
            <col className="col-reuniao" />
            <col className="col-data" />
            <col className="col-fin" />
            <col className="col-fin" />
            <col className="col-fin" />
            <col className="col-actions" />
          </colgroup>
          <thead>
            <tr>
              {TABLE_COLUMNS.map((col) => (
                <th key={col.key} className={col.className}>
                  {col.sortable === false ? (
                    col.label
                  ) : (
                    <button type="button" className="th-sort" onClick={() => onSort(col.key, col.sortAs)}>
                      {col.label}
                      {sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={row.baseqv_client_id}
                className="table-row-click"
                onClick={() => onRowClick(row)}
              >
                <td className="col-nome">{row.nome}</td>
                <td>
                  <span className="cell-with-copy nowrap">
                    <span>{row.telefone ?? '—'}</span>
                    {row.telefone ? (
                      <CopyButton
                        value={row.telefone}
                        ariaLabel="Copiar telefone"
                        title="Copiar telefone"
                      />
                    ) : null}
                  </span>
                </td>
                <td className="col-email">
                  <span className="cell-with-copy">
                    <span className="cell-email-text">{row.email ?? '—'}</span>
                    {row.email ? (
                      <CopyButton value={row.email} ariaLabel="Copiar email" title="Copiar email" />
                    ) : null}
                  </span>
                </td>
                <td className="nowrap">{row.programa ?? '—'}</td>
                <td className="col-ep">{row.engenheiro_patrimonial ?? '—'}</td>
                <td className="col-mec">{row.mecanismos || '—'}</td>
                <td className="col-reuniao">{row.ultima_reuniao_nome ?? '—'}</td>
                <td className="nowrap">{formatDate(row.ultima_reuniao_data)}</td>
                <td className="nowrap">{formatCurrencyBRL(row.finance_renda)}</td>
                <td className="nowrap">{formatCurrencyBRL(row.finance_patrimonio)}</td>
                <td className="nowrap">{formatCurrencyBRL(row.finance_aporte)}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRowClick(row);
                    }}
                  >
                    Ver detalhes
                  </button>
                </td>
              </tr>
            ))}
            {!pageRows.length && (
              <tr>
                <td colSpan={TABLE_COLUMNS.length} className="empty-cell">
                  Nenhum cliente confirmado. Execute npm run audit:legacy após o build.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span className="muted pagination__info">
          Página {safePage} de {totalPages}
        </span>
        <button type="button" className="btn btn--ghost" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>
          Anterior
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

function FiltersToolbar({ countLabel, pageSize, onPageSizeChange, onExport }) {
  return (
    <div className="table-toolbar table-toolbar--split">
      <strong className="confirmed-count">{countLabel}</strong>
      <div className="table-toolbar__actions">
        <label className="inline-label">
          Linhas
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <button type="button" className="btn btn--secondary" onClick={onExport}>
          Exportar CSV filtrado
        </button>
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

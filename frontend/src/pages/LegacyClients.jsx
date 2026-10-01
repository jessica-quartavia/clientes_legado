import { useCallback, useEffect, useMemo, useState } from 'react';
import ClientDrawer from '../components/ClientDrawer.jsx';
import Filters from '../components/Filters.jsx';
import LegacyTable, { TABLE_COLUMNS } from '../components/LegacyTable.jsx';
import { exportCsv, loadDashboardData } from '../data/loader.js';
import { buildExportColumns } from '../lib/financial.js';

const DEFAULT_FILTERS = {
  search: '',
  programa: '',
  ep: '',
  hasFin: '',
  hasReuniao: '',
};

function hasValidFinancial(client) {
  return Boolean(client.financial);
}

function hasValidMeeting(client) {
  return Boolean(client.ultima_reuniao_data);
}

function matchBoolFilter(value, filter) {
  if (!filter) return true;
  const yes = filter === 'yes';
  return yes ? Boolean(value) : !value;
}

function applyFilters(clients, filters) {
  const q = filters.search.trim().toLowerCase();
  return clients.filter((c) => {
    if (q) {
      const hay = [c.nome, c.email, c.telefone, c.mecanismos].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.programa && c.programa !== filters.programa) return false;
    if (filters.ep && c.engenheiro_patrimonial !== filters.ep) return false;
    if (!matchBoolFilter(hasValidFinancial(c), filters.hasFin)) return false;
    if (!matchBoolFilter(hasValidMeeting(c), filters.hasReuniao)) return false;
    return true;
  });
}

export default function LegacyClients() {
  const [clients, setClients] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState('nome');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState(null);
  const [auditPending, setAuditPending] = useState(false);

  const refresh = useCallback(async (force = false) => {
    const data = await loadDashboardData({ force });
    setClients(data.clients);
    setAuditPending(data.auditPending ?? false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => refresh(true), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const programas = useMemo(
    () => [...new Set(clients.map((c) => c.programa).filter(Boolean))].sort(),
    [clients],
  );
  const eps = useMemo(
    () => [...new Set(clients.map((c) => c.engenheiro_patrimonial).filter(Boolean))].sort(),
    [clients],
  );

  const filtered = useMemo(() => applyFilters(clients, filters), [clients, filters]);

  const sorted = useMemo(() => {
    const col = TABLE_COLUMNS.find((c) => c.key === sortKey);
    const copy = [...filtered];
    copy.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (col?.sortAs === 'date') {
        av = av ? new Date(av).getTime() : 0;
        bv = bv ? new Date(bv).getTime() : 0;
      } else if (col?.sortAs === 'number') {
        av = av == null || Number.isNaN(Number(av)) ? -Infinity : Number(av);
        bv = bv == null || Number.isNaN(Number(bv)) ? -Infinity : Number(bv);
      } else {
        av = av ?? '';
        bv = bv ?? '';
        av = String(av).toLowerCase();
        bv = String(bv).toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const patchFilter = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const handleSort = (key) => {
    if (key === '_actions') return;
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleExport = () => {
    exportCsv(sorted, buildExportColumns());
  };

  return (
    <div className="app-shell">
      <header className="app-header app-header--compact">
        <div>
          <p className="eyebrow">QuartaVia · BASEQV</p>
          <h1>Clientes legado confirmados</h1>
          <p className="subtitle">Ausentes no Anchor e no App Pharus (auditoria independente)</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => refresh(true)}>
          Atualizar dados
        </button>
      </header>

      {auditPending ? (
        <p className="loading-banner">
          Dados de auditoria ainda não disponíveis. Execute <code>npm run audit:legacy</code>.
        </p>
      ) : null}

      <section className="panel panel--table">
        <Filters filters={filters} onChange={patchFilter} programas={programas} eps={eps} />
        <LegacyTable
          rows={sorted}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          onRowClick={setSelected}
          onExport={handleExport}
          confirmedTotal={clients.length}
          filteredTotal={filtered.length}
        />
      </section>

      <ClientDrawer client={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

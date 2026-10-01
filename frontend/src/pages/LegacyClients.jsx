import { useCallback, useEffect, useMemo, useState } from 'react';
import ClientDrawer from '../components/ClientDrawer.jsx';
import Filters from '../components/Filters.jsx';
import KpiCard from '../components/KpiCard.jsx';
import LegacyTable, { TABLE_COLUMNS } from '../components/LegacyTable.jsx';
import { exportCsv, loadDashboardData } from '../data/loader.js';
import { buildExportColumns } from '../lib/financial.js';
import {
  applyBasePopulationFilters,
  applyLegacyFilters,
  computeLegacyMetrics,
  formatPercentFromMetrics,
} from '../lib/legacy-filters.js';

const DEFAULT_FILTERS = {
  search: '',
  programa: '',
  ep: '',
  status: '',
  hasFin: '',
  hasReuniao: '',
  hasMecanismos: '',
};

function hasPopulationFilter(filters) {
  return Boolean(filters.programa || filters.ep || filters.status);
}

export default function LegacyClients() {
  const [clients, setClients] = useState([]);
  const [summary, setSummary] = useState({});
  const [activeBasePopulation, setActiveBasePopulation] = useState([]);
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
    setSummary(data.summary);
    setActiveBasePopulation(Array.isArray(data.activeBasePopulation) ? data.activeBasePopulation : []);
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

  const filteredClients = useMemo(
    () => applyLegacyFilters(clients, filters),
    [clients, filters],
  );

  const filteredActiveBase = useMemo(() => {
    if (activeBasePopulation.length > 0) {
      return applyBasePopulationFilters(activeBasePopulation, filters);
    }
    if (hasPopulationFilter(filters)) return [];
    const total = summary.total_active_baseqv ?? summary.totals?.baseqv_active ?? 0;
    return total > 0 ? Array.from({ length: total }, () => ({})) : [];
  }, [activeBasePopulation, filters, summary]);

  const activeBasePopulationMissing =
    activeBasePopulation.length === 0 && hasPopulationFilter(filters);

  const heroKpis = useMemo(() => {
    const metrics = computeLegacyMetrics(filteredClients, filteredActiveBase);
    return {
      totalLegacy: metrics.totalLegacy,
      withMechanisms: metrics.withMechanisms,
      withMeeting: metrics.withMeeting,
      withFinancial: metrics.withFinancial,
      percentLegacy: formatPercentFromMetrics(metrics),
    };
  }, [filteredClients, filteredActiveBase]);

  const sorted = useMemo(() => {
    const col = TABLE_COLUMNS.find((c) => c.key === sortKey);
    const copy = [...filteredClients];
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
  }, [filteredClients, sortKey, sortDir]);

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
          <p className="subtitle">Ativos · ausentes no QV360 e no App Pharus (auditoria)</p>
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

      {activeBasePopulationMissing ? (
        <p className="loading-banner">
          Percentual por programa/EP requer <code>active-base-population.json</code>. Execute{' '}
          <code>npm run build:legacy</code>.
        </p>
      ) : null}

      <section className="kpi-grid kpi-grid--hero" aria-label="Indicadores principais">
        <KpiCard hero icon="◆" label="Quantidade de clientes legado" value={heroKpis.totalLegacy} />
        <KpiCard hero icon="⚙" label="Com mecanismos" value={heroKpis.withMechanisms} />
        <KpiCard hero icon="◷" label="Com reunião" value={heroKpis.withMeeting} />
        <KpiCard hero icon="◈" label="Com dado financeiro" value={heroKpis.withFinancial} />
        <KpiCard hero icon="%" label="% da base ativa que é legado" value={heroKpis.percentLegacy} />
      </section>

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
          filteredTotal={filteredClients.length}
        />
      </section>

      <ClientDrawer client={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

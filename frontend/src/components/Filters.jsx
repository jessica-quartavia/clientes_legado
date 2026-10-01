const BOOL_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'yes', label: 'Sim' },
  { value: 'no', label: 'Não' },
];

export default function Filters({ filters, onChange, programas, eps }) {
  return (
    <div className="filters filters--compact">
      <div className="filters__row">
        <label className="filters__field filters__field--search">
          Busca global
          <input
            type="search"
            placeholder="Nome, telefone, email, mecanismos…"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
          />
        </label>
        <label className="filters__field">
          Programa
          <select value={filters.programa} onChange={(e) => onChange({ programa: e.target.value })}>
            <option value="">Todos</option>
            {programas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="filters__field">
          EP
          <select value={filters.ep} onChange={(e) => onChange({ ep: e.target.value })}>
            <option value="">Todos</option>
            {eps.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="filters__field">
          Possui dados financeiros
          <select value={filters.hasFin} onChange={(e) => onChange({ hasFin: e.target.value })}>
            {BOOL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filters__field">
          Com reunião
          <select value={filters.hasReuniao} onChange={(e) => onChange({ hasReuniao: e.target.value })}>
            {BOOL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filters__field">
          Com mecanismos
          <select
            value={filters.hasMecanismos ?? ''}
            onChange={(e) => onChange({ hasMecanismos: e.target.value })}
          >
            {BOOL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

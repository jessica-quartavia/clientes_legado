const STEP_LABELS = {
  baseqv: 'BASEQV carregado',
  anchor: 'Anchor carregado',
  pharus: 'Pharus carregado',
  normalization: 'Identidades normalizadas',
  anchor_matching: 'Matching Anchor concluído',
  pharus_matching: 'Matching Pharus concluído',
  explicit_anchor_legacy: 'Legado explícito Anchor processado',
  deduplication: 'Deduplicação concluída',
  mecanismos: 'Mecanismos carregados',
  reunioes: 'Reuniões carregadas',
  financial: 'Dados financeiros carregados',
  csv_export: 'CSV final gerado',
};

const STATUS_LABEL = {
  pending: 'Pendente',
  processing: 'Processando',
  completed: 'Concluído',
  error: 'Erro',
};

export default function BuildProgress({ buildStatus }) {
  const steps = buildStatus?.steps ?? {};
  const progress = buildStatus?.progress ?? 0;

  return (
    <section className="panel">
      <div className="panel__header">
        <h2>Progresso da construção</h2>
        {buildStatus?.message ? <p className="muted">{buildStatus.message}</p> : null}
      </div>
      <div className="progress-bar">
        <div className="progress-bar__fill" style={{ width: `${Math.min(100, progress)}%` }} />
      </div>
      <ul className="steps-list">
        {Object.entries(STEP_LABELS).map(([key, label]) => {
          const status = steps[key] ?? 'pending';
          return (
            <li key={key} className={`steps-list__item steps-list__item--${status}`}>
              <span className="steps-list__dot" />
              <span className="steps-list__label">{label}</span>
              <span className="steps-list__status">{STATUS_LABEL[status] ?? status}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

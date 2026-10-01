export default function KpiCard({ label, value, accent }) {
  return (
    <div className={`kpi-card ${accent ? 'kpi-card--accent' : ''}`}>
      <span className="kpi-card__label">{label}</span>
      <strong className="kpi-card__value">{value ?? '—'}</strong>
    </div>
  );
}

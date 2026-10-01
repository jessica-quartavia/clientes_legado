export default function KpiCard({ label, value, hero, icon }) {
  return (
    <div className={`kpi-card ${hero ? 'kpi-card--hero' : ''}`}>
      {icon ? (
        <span className="kpi-card__icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="kpi-card__label">{label}</span>
      <strong className="kpi-card__value">{value ?? '—'}</strong>
    </div>
  );
}

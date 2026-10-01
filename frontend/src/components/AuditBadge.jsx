export function auditBadgeKind(status) {
  if (status === 'ENCONTRADO_EXATO' || status === 'ENCONTRADO_PROVAVEL') return 'found';
  if (status === 'AMBIGUO') return 'ambiguous';
  return 'not';
}

export default function AuditBadge({ status }) {
  const kind = auditBadgeKind(status);
  const labels = {
    found: '✓ Encontrado',
    not: '— Não encontrado',
    ambiguous: '? Ambíguo',
  };
  return <span className={`audit-badge audit-badge--${kind}`}>{labels[kind]}</span>;
}

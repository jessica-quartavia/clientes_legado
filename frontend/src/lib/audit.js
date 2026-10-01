import { auditBadgeKind } from '../components/AuditBadge.jsx';

/** @param {string | undefined} status @param {string} filter found|not|ambiguous */
export function matchesAuditFilter(status, filter) {
  if (!filter) return true;
  return auditBadgeKind(status) === filter;
}

export const AUDITORIA_RESULT_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'NAO_ESTA_EM_NENHUM', label: 'Não está em nenhum' },
  { value: 'ESTA_NO_ANCHOR', label: 'Está no Anchor' },
  { value: 'ESTA_NO_APP_PHARUS', label: 'Está no App Pharus' },
  { value: 'ESTA_NOS_DOIS', label: 'Está nos dois' },
  { value: 'AMBIGUO', label: 'Ambíguo' },
];

export const AUDIT_SIDE_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'found', label: 'Encontrado' },
  { value: 'not', label: 'Não encontrado' },
  { value: 'ambiguous', label: 'Ambíguo' },
];

export function auditStatusSortKey(status) {
  const kind = auditBadgeKind(status);
  if (kind === 'found') return 2;
  if (kind === 'ambiguous') return 1;
  return 0;
}

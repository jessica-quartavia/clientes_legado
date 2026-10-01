/** @typedef {{ cpf: string | null, email: string | null, phone: string | null, name: string | null }} NormalizedIdentity */

/**
 * @param {string | null | undefined} cpf
 * @returns {string | null}
 */
export function normalizeCpf(cpf) {
  if (cpf == null || cpf === '') return null;
  const digits = String(cpf).replace(/\D/g, '');
  if (digits.length < 11) return digits.length >= 9 ? digits : null;
  return digits.slice(0, 11);
}

/**
 * @param {string | null | undefined} email
 * @returns {string | null}
 */
export function normalizeEmail(email) {
  if (email == null || email === '') return null;
  const e = String(email).trim().toLowerCase();
  if (!e.includes('@')) return null;
  return e;
}

/**
 * @param {string | null | undefined} phone
 * @returns {string | null}
 */
export function normalizePhone(phone) {
  if (phone == null || phone === '') return null;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length < 8) return null;
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  if (digits.length > 11) {
    digits = digits.slice(-11);
  }
  if (digits.length < 10) return null;
  return digits;
}

/**
 * @param {string | null | undefined} phone
 * @returns {string | null}
 */
export function phoneTail(phone) {
  const n = normalizePhone(phone);
  if (!n) return null;
  if (n.length >= 10) return n.slice(-10);
  return n;
}

/**
 * @param {string | null | undefined} name
 * @returns {string | null}
 */
export function normalizeName(name) {
  if (name == null || name === '') return null;
  return String(name)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/**
 * @param {string | null | undefined} qvId
 * @returns {string | null}
 */
export function normalizeQvId(qvId) {
  if (qvId == null || qvId === '') return null;
  return String(qvId).trim();
}

/**
 * @param {{ cpf?: string | null, email?: string | null, phone?: string | null, name?: string | null }} fields
 * @returns {NormalizedIdentity}
 */
export function normalizeIdentity(fields) {
  return {
    cpf: normalizeCpf(fields.cpf),
    email: normalizeEmail(fields.email),
    phone: normalizePhone(fields.phone),
    name: normalizeName(fields.name),
  };
}

/**
 * @param {string | null} a
 * @param {string | null} b
 * @returns {boolean}
 */
export function phonesMatch(a, b) {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.slice(-10);
  const tb = nb.slice(-10);
  return ta.length >= 10 && ta === tb;
}

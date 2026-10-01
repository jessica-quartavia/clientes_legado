import { useState } from 'react';
import { copyToClipboard } from '../lib/clipboard.js';

function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12l4 4L19 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CopyButton({ value, ariaLabel }) {
  const [state, setState] = useState('idle');

  const handleClick = async (e) => {
    e.stopPropagation();
    if (!value) return;
    const ok = await copyToClipboard(value);
    setState(ok ? 'success' : 'error');
    setTimeout(() => setState('idle'), 1500);
  };

  const tooltip =
    state === 'success' ? 'Copiado!' : state === 'error' ? 'Não foi possível copiar' : 'Copiar';

  return (
    <button
      type="button"
      className={`copy-btn ${state !== 'idle' ? `copy-btn--${state}` : ''}`}
      onClick={handleClick}
      aria-label={ariaLabel}
      title={tooltip}
      disabled={!value}
    >
      {state === 'success' ? <IconCheck /> : state === 'error' ? '!' : <IconCopy />}
    </button>
  );
}

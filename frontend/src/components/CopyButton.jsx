import { useState } from 'react';
import { copyToClipboard } from '../lib/clipboard.js';

export default function CopyButton({ value, ariaLabel, title }) {
  const [state, setState] = useState('idle');

  const handleClick = async (e) => {
    e.stopPropagation();
    if (!value) return;
    const ok = await copyToClipboard(value);
    setState(ok ? 'success' : 'error');
    setTimeout(() => setState('idle'), 1500);
  };

  const icon = state === 'success' ? '✓' : state === 'error' ? '!' : '⎘';
  const tip =
    state === 'success'
      ? ariaLabel.includes('telefone')
        ? 'Telefone copiado'
        : 'Email copiado'
      : state === 'error'
        ? 'Não foi possível copiar'
        : title;

  return (
    <button
      type="button"
      className={`copy-btn ${state !== 'idle' ? `copy-btn--${state}` : ''}`}
      onClick={handleClick}
      aria-label={ariaLabel}
      title={tip}
      disabled={!value}
    >
      {icon}
    </button>
  );
}

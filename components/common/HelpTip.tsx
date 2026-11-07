import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

// Ajuda de campo: um "?" ao lado do rótulo. Tocou, a explicação aparece logo
// abaixo, no fluxo da página — funciona igual no celular e no computador, sem
// balão flutuante que some atrás de outros elementos.

const HelpButton: React.FC<{ open: boolean; onClick: () => void; label?: string }> = ({ open, onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label ? `Ajuda: ${label}` : 'Ajuda'}
    aria-expanded={open}
    className={`inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-full transition-colors ${open ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-brand-50 hover:text-brand-600'}`}
  >
    <HelpCircle size={13} />
  </button>
);

const HelpText: React.FC<{ text: string }> = ({ text }) => (
  <p className="mt-1 mb-1.5 text-[11px] leading-relaxed font-medium text-slate-600 bg-brand-50/70 border border-brand-100 rounded-xl px-3 py-2">
    {text}
  </p>
);

/** "?" solto (ex.: ao lado de um título). */
export const HelpTip: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-block align-middle">
      <HelpButton open={open} onClick={() => setOpen(o => !o)} label={label} />
      {open && <HelpText text={text} />}
    </span>
  );
};

/** Rótulo de campo com o "?" ao lado; a explicação abre embaixo do rótulo. */
export const FieldLabel: React.FC<{ label: string; help: string; htmlFor?: string }> = ({ label, help, htmlFor }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
        <HelpButton open={open} onClick={() => setOpen(o => !o)} label={label} />
      </div>
      {open && <HelpText text={help} />}
    </div>
  );
};

export default HelpTip;

// Validação de CPF/CNPJ para as telas (checkout). A API tem a mesma regra em
// api/_lib/payment/billing-rules.ts — tests/billingRules.test.ts garante que as
// duas respondem igual.

const onlyDigits = (value: string | null | undefined) => String(value || '').replace(/\D/g, '');
const allSameDigit = (digits: string) => /^(\d)\1+$/.test(digits);

function isValidCpf(d: string): boolean {
  if (d.length !== 11 || allSameDigit(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

function isValidCnpj(d: string): boolean {
  if (d.length !== 14 || allSameDigit(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Aceita CPF (11 dígitos) ou CNPJ (14), com ou sem pontuação. */
export function isValidCpfCnpj(value: string | null | undefined): boolean {
  const d = onlyDigits(value);
  if (d.length === 11) return isValidCpf(d);
  if (d.length === 14) return isValidCnpj(d);
  return false;
}

/** Formata enquanto a pessoa digita: 000.000.000-00 ou 00.000.000/0000-00. */
export function formatCpfCnpj(value: string | null | undefined): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

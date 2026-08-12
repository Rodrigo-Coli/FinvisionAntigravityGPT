// Validação de chave Pix e envio de transferência real via Asaas — usado pelo
// pagamento automático de comissão de indicação (ver referral.service.ts,
// autoPayEligiblePayouts) e pela validação da chave no momento do pedido de
// saque (ver affiliate.ts, handleAffiliateRequestPayout).
//
// Autocontido de propósito (mesmo padrão dos outros arquivos de api/_lib/):
// nenhum import de fora de api/_lib/, para não repetir o problema de
// empacotamento da Vercel que já derrubou a function uma vez.

const ASAAS_BASE_URL = process.env.ASAAS_BASE_URL || 'https://sandbox.asaas.com/api/v3';
const ASAAS_KEY = process.env.ASAAS_SANDBOX_KEY || '';

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

const onlyDigits = (s: string) => (s || '').replace(/\D/g, '');

function isValidCPF(raw: string): boolean {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
  let check1 = (sum * 10) % 11;
  if (check1 === 10) check1 = 0;
  if (check1 !== parseInt(cpf[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
  let check2 = (sum * 10) % 11;
  if (check2 === 10) check2 = 0;
  return check2 === parseInt(cpf[10], 10);
}

function isValidCNPJ(raw: string): boolean {
  const cnpj = onlyDigits(raw);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base: string) => {
    const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split('').reduce((acc, digit, i) => acc + parseInt(digit, 10) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const check1 = calc(cnpj.slice(0, 12));
  if (check1 !== parseInt(cnpj[12], 10)) return false;
  const check2 = calc(cnpj.slice(0, 13));
  return check2 === parseInt(cnpj[13], 10);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVP_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Detecta o tipo da chave Pix e valida o formato (com dígito verificador real
 * pra CPF/CNPJ). Não confirma que a chave existe de verdade no Banco Central
 * — isso só o próprio Asaas sabe dizer na hora da transferência.
 */
export function validatePixKey(raw: string): { valid: boolean; type?: PixKeyType; error?: string } {
  const key = (raw || '').trim();
  if (!key) return { valid: false, error: 'Chave Pix não informada.' };

  if (EMAIL_RE.test(key)) return { valid: true, type: 'EMAIL' };
  if (EVP_RE.test(key)) return { valid: true, type: 'EVP' };

  const digits = onlyDigits(key);

  // Telefone: só reconhece com DDI 55 explícito (12-13 dígitos) — é como o
  // Pix normaliza chave de telefone no Brasil. Sem o "55" na frente, um
  // número de 11 dígitos é tratado como CPF (mais comum e mais arriscado
  // de confundir), nunca "tentamos os dois" — isso já causou um bug aqui:
  // um CPF com dígito verificador ERRADO estava caindo como "telefone válido"
  // em vez de ser rejeitado. Ver testes em cima antes de mexer aqui de novo.
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith('55')) {
    return { valid: true, type: 'PHONE' };
  }
  if (digits.length === 11) {
    return isValidCPF(digits)
      ? { valid: true, type: 'CPF' }
      : { valid: false, error: 'CPF inválido (dígito verificador não confere).' };
  }
  if (digits.length === 14) {
    return isValidCNPJ(digits)
      ? { valid: true, type: 'CNPJ' }
      : { valid: false, error: 'CNPJ inválido (dígito verificador não confere).' };
  }

  return { valid: false, error: 'Chave Pix não reconhecida — confira se é CPF, CNPJ, e-mail, telefone (com DDI 55) ou chave aleatória.' };
}

/**
 * Envia uma transferência Pix REAL via Asaas (POST /v3/transfers). Só chame
 * isso depois de validatePixKey() ter dado valid=true, e nunca em resposta a
 * um clique manual do superadmin — o botão manual do Master Console continua
 * só marcando "pago" no banco (assume que o Pix já foi enviado por fora). Esta
 * função é exclusiva do pagamento automático (ver autoPayEligiblePayouts).
 */
export async function createPixTransfer(pixKey: string, pixKeyType: PixKeyType, amountCents: number): Promise<{ success: boolean; transferId?: string; error?: string }> {
  if (!ASAAS_KEY) return { success: false, error: 'ASAAS_SANDBOX_KEY não configurada.' };
  if (amountCents <= 0) return { success: false, error: 'Valor inválido.' };

  try {
    const res = await fetch(`${ASAAS_BASE_URL}/transfers`, {
      method: 'POST',
      headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: Math.round(amountCents) / 100,
        pixAddressKey: pixKey,
        pixAddressKeyType: pixKeyType,
        description: 'Pagamento de comissão de indicação — Zyvion',
      }),
    });
    const data = await res.json();
    if (!res.ok || data?.errors) {
      const msg = data?.errors?.[0]?.description || data?.message || `Falha na transferência (HTTP ${res.status}).`;
      return { success: false, error: msg };
    }
    return { success: true, transferId: data?.id };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro de rede ao chamar o Asaas.' };
  }
}

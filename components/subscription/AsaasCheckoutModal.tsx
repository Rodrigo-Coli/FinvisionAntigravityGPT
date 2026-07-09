import React, { useState } from 'react';
import { X, CreditCard, Check, AlertCircle, Copy, ArrowLeft, CheckCircle2, RotateCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase/client';

interface AsaasCheckoutModalProps {
  plan: {
    id: string;
    name: string;
    slug: string;
    price_cents: number;
    price_cents_annual?: number;
    price_cents_semiannual?: number;
  };
  period: 'monthly' | 'semiannual' | 'annual';
  onClose: () => void;
}

const AsaasCheckoutModal: React.FC<AsaasCheckoutModalProps> = ({ plan, period, onClose }) => {
  const { user } = useAuth();
  const { refreshSubscription } = useSubscription();
  const { toast } = useToast();

  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT_CARD'>('PIX');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pixData, setPixData] = useState<{
    qrCode: string;
    copiaECola: string;
    expirationDate: string;
  } | null>(null);

  // Card Form State
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState(''); // MM/YY
  const [cardCvv, setCardCvv] = useState('');
  const [holderCpf, setHolderCpf] = useState('');
  const [holderPhone, setHolderPhone] = useState('');
  const [holderCep, setHolderCep] = useState('');
  const [holderAddressNum, setHolderAddressNum] = useState('');

  // Polling Pix state
  const [checkingPix, setCheckingPix] = useState(false);

  const getPrice = () => {
    if (period === 'semiannual') return plan.price_cents_semiannual || plan.price_cents * 6;
    if (period === 'annual') return plan.price_cents_annual || plan.price_cents * 12;
    return plan.price_cents;
  };

  const priceInReais = getPrice() / 100;

  const handleCopyPix = () => {
    if (pixData?.copiaECola) {
      navigator.clipboard.writeText(pixData.copiaECola);
      toast('Código Pix Copia e Cola copiado com sucesso!', 'success');
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase!.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

      const payload: any = {
        planSlug: plan.slug,
        period,
        paymentMethod,
      };

      if (paymentMethod === 'CREDIT_CARD') {
        const [expMonth, expYear] = cardExpiry.split('/');
        if (!expMonth || !expYear || expMonth.length !== 2 || expYear.length !== 2) {
          throw new Error('Data de vencimento inválida (formato MM/AA).');
        }

        payload.creditCard = {
          holderName: cardName,
          number: cardNumber.replace(/\s+/g, ''),
          expiryMonth: expMonth,
          expiryYear: '20' + expYear,
          ccv: cardCvv,
        };

        payload.creditCardHolderInfo = {
          name: cardName,
          email: user.email,
          cpfCnpj: holderCpf.replace(/\D/g, ''),
          postalCode: holderCep.replace(/\D/g, ''),
          addressNumber: holderAddressNum,
          phone: holderPhone.replace(/\D/g, ''),
        };
      }

      const res = await fetch('/api/asaas-create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Erro ao processar assinatura no Asaas.');
      }

      if (paymentMethod === 'PIX') {
        if (data.pix) {
          setPixData(data.pix);
        } else {
          throw new Error('Asaas não retornou os dados do Pix. Tente novamente.');
        }
      } else {
        setSuccess(true);
        await refreshSubscription();
      }
    } catch (err: any) {
      setError(err.message || 'Erro inesperado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const checkPaymentStatus = async () => {
    setCheckingPix(true);
    try {
      await refreshSubscription();
      // Let's reload subscription data. If status becomes active, we can show success.
      const response = await fetch('/api/health'); // Just dummy check, we reload subscription provider
      window.location.reload(); // Quick reset of state so Context catches 'active'
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingPix(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Assinar {plan.name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              R$ {priceInReais.toFixed(2).replace('.', ',')} / {period === 'annual' ? 'ano' : period === 'semiannual' ? 'semestre' : 'mês'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[75vh]">
          {success ? (
            <div className="text-center py-8 space-y-4">
              <div className="mx-auto w-16 h-16 bg-emerald-50 dark:bg-emerald-950/30 rounded-full flex items-center justify-center text-emerald-500">
                <CheckCircle2 size={40} />
              </div>
              <h4 className="text-xl font-black text-slate-900 dark:text-white">Pagamento Confirmado!</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Parabéns! Sua assinatura do plano <strong>{plan.name}</strong> está ativa. Seus limites foram redefinidos e todos os recursos premium estão liberados.
              </p>
              <button onClick={onClose} className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-brand-600 transition-colors">
                Ir para o Dashboard
              </button>
            </div>
          ) : pixData ? (
            <div className="text-center space-y-5 py-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-3xl flex flex-col items-center border border-slate-100 dark:border-slate-800">
                <h4 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-3">Pague com Pix</h4>
                {pixData.qrCode ? (
                  <img
                    src={`data:image/jpeg;base64,${pixData.qrCode}`}
                    alt="Pix QR Code"
                    className="w-48 h-48 rounded-2xl border-4 border-white shadow-md mb-4 bg-white"
                  />
                ) : (
                  <div className="w-48 h-48 rounded-2xl bg-slate-200 flex items-center justify-center mb-4">
                    <span className="text-xs text-slate-400">QR Code indisponível</span>
                  </div>
                )}
                <button
                  onClick={handleCopyPix}
                  className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-brand-700 transition-all shadow-md shadow-brand-500/10"
                >
                  <Copy size={14} /> Copiar Código Pix
                </button>
              </div>

              <div className="space-y-3">
                <button
                  onClick={checkPaymentStatus}
                  disabled={checkingPix}
                  className="w-full flex justify-center items-center gap-2 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:opacity-90 transition-all"
                >
                  <RotateCw size={12} className={checkingPix ? 'animate-spin' : ''} />
                  Já Paguei - Confirmar
                </button>
                <button
                  onClick={() => setPixData(null)}
                  className="w-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-bold uppercase tracking-widest text-[9px]"
                >
                  Voltar e Alterar Forma de Pagamento
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCheckout} className="space-y-5">
              
              {/* Payment Methods tabs */}
              <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('PIX')}
                  className={`py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                    paymentMethod === 'PIX'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  Pix Instantâneo
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('CREDIT_CARD')}
                  className={`py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                    paymentMethod === 'CREDIT_CARD'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  Cartão de Crédito
                </button>
              </div>

              {/* Error display */}
              {error && (
                <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/30 rounded-2xl text-rose-600 dark:text-rose-400 text-xs">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <p className="font-bold leading-relaxed">{error}</p>
                </div>
              )}

              {paymentMethod === 'PIX' ? (
                <div className="space-y-4 py-3 text-center">
                  <div className="mx-auto w-12 h-12 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl flex items-center justify-center text-indigo-500">
                    <Check size={24} />
                  </div>
                  <h4 className="font-black text-slate-800 dark:text-slate-200 text-sm">Cobrança Recorrente via Pix</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
                    Ao confirmar, geraremos um QR Code Pix. As faturas seguintes serão enviadas automaticamente para o seu e-mail e estarão disponíveis aqui no painel a cada renovação.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Dados do Cartão</h4>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Nome Impresso no Cartão</label>
                      <input
                        type="text"
                        required
                        value={cardName}
                        onChange={e => setCardName(e.target.value)}
                        placeholder="JOÃO A SILVA"
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Número do Cartão</label>
                      <input
                        type="text"
                        required
                        value={cardNumber}
                        onChange={e => setCardNumber(e.target.value)}
                        placeholder="0000 0000 0000 0000"
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Validade (MM/AA)</label>
                        <input
                          type="text"
                          required
                          value={cardExpiry}
                          onChange={e => setCardExpiry(e.target.value)}
                          placeholder="12/29"
                          maxLength={5}
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-brand-500"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">CVV</label>
                        <input
                          type="text"
                          required
                          value={cardCvv}
                          onChange={e => setCardCvv(e.target.value)}
                          placeholder="123"
                          maxLength={4}
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-brand-500"
                        />
                      </div>
                    </div>
                  </div>

                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 pt-3">Dados de Cobrança (Faturamento)</h4>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">CPF / CNPJ</label>
                        <input
                          type="text"
                          required
                          value={holderCpf}
                          onChange={e => setHolderCpf(e.target.value)}
                          placeholder="000.000.000-00"
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-brand-500"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Celular / WhatsApp</label>
                        <input
                          type="text"
                          required
                          value={holderPhone}
                          onChange={e => setHolderPhone(e.target.value)}
                          placeholder="(11) 99999-9999"
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-brand-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">CEP</label>
                        <input
                          type="text"
                          required
                          value={holderCep}
                          onChange={e => setHolderCep(e.target.value)}
                          placeholder="01234-567"
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-brand-500"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Número do Endereço</label>
                        <input
                          type="text"
                          required
                          value={holderAddressNum}
                          onChange={e => setHolderAddressNum(e.target.value)}
                          placeholder="123"
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-brand-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-brand-600 dark:hover:bg-brand-50 transition-all flex items-center gap-2"
                >
                  {loading ? 'Processando...' : paymentMethod === 'PIX' ? 'Gerar Pix' : 'Confirmar Assinatura'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AsaasCheckoutModal;

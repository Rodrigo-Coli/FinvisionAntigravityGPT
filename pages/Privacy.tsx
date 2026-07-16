import React from 'react';
import { Lock, ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const Privacy: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12 selection:bg-brand-500/30">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-brand-600 font-bold uppercase tracking-widest text-xs hover:text-brand-700 transition-colors">
            <ChevronLeft size={16} /> Voltar
          </Link>
          <div className="flex items-center gap-2 text-slate-900 font-bold italic text-xl">
            <img src="/logo-icon.png" alt="Zyvion" className="w-8 h-8 rounded-lg object-contain" />
          </div>
        </div>

        <div className="bg-white rounded-[40px] p-8 md:p-16 shadow-xl shadow-slate-200/50 border border-slate-100">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-[24px] bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Lock size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Política de Privacidade</h1>
              <p className="text-slate-500 font-medium">Última atualização: Março de 2026</p>
            </div>
          </div>

          <div className="space-y-8 text-slate-600 leading-relaxed font-medium">
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-4">1. Coleta de Dados</h2>
              <p>Coletamos informações essenciais para a prestação do serviço: nome, e-mail, telefone (opcional via WhatsApp) e transações financeiras inseridas voluntariamente por você via upload ou OCR assistido.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-4">2. Segurança e Criptografia (RLS)</h2>
              <p>Seus dados financeiros são sigilosos e protegidos sob arquitetura Row Level Security (RLS) em nossa base PostgreSQL. Nem mesmo administradores da plataforma do Zyvion possuem acesso de visualização aos seus extratos e cartões vinculados.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-4">3. Compartilhamento (Third-Party)</h2>
              <p>Nós NÃO vendemos seus dados. Seus dados cadastrais e de compra trafegam apenas pela Asaas (para processar sua assinatura). Seus uploads em OCR são transitados aos modelos LLM puramente para extração (stateless) sem alimentar treinamento público dos mesmos.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-4">4. Seus Direitos (LGPD)</h2>
              <p>Em conformidade com a LGPD, você possui direito total sobre seus dados. A qualquer momento, solicitando pelo painel, todos os seus dados e históricos são excluídos de nossa infraestrutura permanentemente e de forma automatizada (Hard Delete).</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Privacy;

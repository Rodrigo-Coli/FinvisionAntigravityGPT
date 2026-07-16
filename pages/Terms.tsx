import React from 'react';
import { Shield, ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const Terms: React.FC = () => {
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
            <div className="w-16 h-16 rounded-[24px] bg-brand-50 text-brand-600 flex items-center justify-center">
              <Shield size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Termos de Serviço</h1>
              <p className="text-slate-500 font-medium">Última atualização: Março de 2026</p>
            </div>
          </div>

          <div className="space-y-8 text-slate-600 leading-relaxed font-medium">
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-4">1. Aceitação dos Termos</h2>
              <p>Ao acessar e utilizar a plataforma Zyvion ("SaaS"), você concorda em cumprir e ser regido pelos presentes Termos de Serviço. Se não concordar com qualquer parte destes termos, não utilize nossos serviços.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-4">2. Descrição do Serviço</h2>
              <p>O Zyvion é um software de gestão e inteligência financeira na nuvem. Nós fornecemos ferramentas de conciliação assistida por IA, centralização de patrimônio e emissão de extratos consolidados.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-4">3. Planos e Pagamentos (Asaas)</h2>
              <p>Nossos planos de assinatura são processados pela parceira financeira Asaas. O inadimplemento pode resultar na suspensão temporária do acesso (Lockout) até a devida regularização. Cancelamentos podem ser feitos a qualquer momento via painel, interrompendo a renovação automática.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-4">4. Limitação de Responsabilidade</h2>
              <p>As análises geradas pela Inteligência Artificial e motores do Zyvion têm caráter puramente informativo para organização pessoal ou empresarial. Não constituem aconselhamento financeiro formal ou recomendação de investimentos.</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Terms;

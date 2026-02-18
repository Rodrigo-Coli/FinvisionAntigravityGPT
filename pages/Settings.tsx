import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Tags, 
  Store, 
  Cloud, 
  Coins, 
  Percent, 
  Plus, 
  ChevronRight, 
  Trash2, 
  Edit3, 
  Database, 
  Globe, 
  Check, 
  Clock, 
  Download,
  AlertTriangle,
  Link as LinkIcon,
  XCircle,
  Loader2
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';

const CATEGORIES = [
  { id: '1', name: 'Alimentação', color: 'bg-orange-100 text-orange-600', count: 42 },
  { id: '2', name: 'Transporte', color: 'bg-blue-100 text-blue-600', count: 18 },
  { id: '3', name: 'Lazer', color: 'bg-pink-100 text-pink-600', count: 12 },
  { id: '4', name: 'Saúde', color: 'bg-emerald-100 text-emerald-600', count: 5 },
  { id: '5', name: 'Moradia', color: 'bg-indigo-100 text-indigo-600', count: 3 },
  { id: '6', name: 'Investimentos', color: 'bg-zinc-100 text-zinc-600', count: 25 },
];

const ESTABLISHMENTS = [
  { name: 'Carrefour Bairro', lastActive: '2023-10-25', reliability: '98%' },
  { name: 'Posto Ipiranga', lastActive: '2023-10-22', reliability: '95%' },
  { name: 'Amazon BR', lastActive: '2023-10-20', reliability: '100%' },
  { name: 'Pão de Açúcar', lastActive: '2023-10-24', reliability: '92%' },
];

const SettingsPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'general' | 'categories' | 'establishments' | 'backup' | 'currencies' | 'rates'>('general');
  const [settings, setSettings] = useState({
    email_notifications: true,
    auto_dark_mode: false
  });
  const [loadingSettings, setLoadingSettings] = useState(false);

  useEffect(() => {
    if (activeSection === 'general' && isSupabaseConfigured) {
      fetchSettings();
    }
  }, [activeSection]);

  const fetchSettings = async () => {
    if (!supabase) return;
    setLoadingSettings(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setSettings({
          email_notifications: data.email_notifications,
          auto_dark_mode: data.auto_dark_mode
        });
      } else {
        // Initial insert if settings don't exist
        const { error: insError } = await supabase.from('user_settings').insert([{ user_id: user.id }]);
        if (insError) console.error("Initial settings creation failed", insError);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoadingSettings(false);
    }
  };

  const updateSetting = async (key: 'email_notifications' | 'auto_dark_mode', value: boolean) => {
    if (!supabase) return;
    
    // Optimistic update
    const previousSettings = { ...settings };
    setSettings(prev => ({ ...prev, [key]: value }));
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_settings')
        .upsert({ 
          user_id: user.id, 
          [key]: value,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
    } catch (err) {
      console.error('Error saving setting:', err);
      // Rollback on error
      setSettings(previousSettings);
    }
  };

  const menuItems = [
    { id: 'general', label: 'Geral', icon: <SettingsIcon size={18} /> },
    { id: 'categories', label: 'Categorias', icon: <Tags size={18} /> },
    { id: 'establishments', label: 'Lojas', icon: <Store size={18} /> },
    { id: 'currencies', label: 'Moedas', icon: <Coins size={18} /> },
    { id: 'rates', label: 'Taxas', icon: <Percent size={18} /> },
    { id: 'backup', label: 'Backup', icon: <Cloud size={18} />, divider: true },
  ];

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:py-8 lg:px-8 bg-gray-50 min-h-screen">
      <header className="mb-6 lg:mb-8">
        <h1 className="text-xl lg:text-2xl font-black text-gray-900 tracking-tight uppercase">Configurações</h1>
        <p className="text-gray-500 text-xs lg:text-sm">Personalização de metadados e ajustes de sistema</p>
      </header>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
        {/* Sidebar Navigation - Horizontal on mobile */}
        <aside className="w-full lg:w-64 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 scrollbar-hide shrink-0">
          {menuItems.map((item) => (
            <React.Fragment key={item.id}>
              {item.divider && <div className="hidden lg:block h-px bg-gray-200 my-4 mx-4"></div>}
              <button 
                onClick={() => setActiveSection(item.id as any)}
                className={`flex-1 lg:flex-none flex items-center justify-center lg:justify-start gap-3 px-5 lg:px-4 py-3.5 lg:py-3 rounded-xl text-xs lg:text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                  activeSection === item.id 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' 
                  : 'bg-white lg:bg-transparent text-gray-500 hover:bg-gray-100 lg:hover:bg-gray-200/50 border lg:border-transparent border-gray-100'
                }`}
              >
                {item.icon}
                <span className="hidden sm:inline lg:inline">{item.label}</span>
              </button>
            </React.Fragment>
          ))}
        </aside>

        {/* Content Area */}
        <main className="flex-1 w-full space-y-6">
          {activeSection === 'general' && (
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 lg:p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg lg:text-xl font-black text-gray-900 uppercase tracking-widest">Preferências</h2>
                {loadingSettings && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 lg:p-5 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white transition-all">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">Notificações por Email</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Alertas de vencimento e metas</p>
                  </div>
                  <div 
                    onClick={() => updateSetting('email_notifications', !settings.email_notifications)}
                    className={`w-12 h-6 rounded-full relative p-1 cursor-pointer transition-colors duration-200 ${settings.email_notifications ? 'bg-blue-600' : 'bg-gray-200'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute shadow-sm transition-all duration-200 ${settings.email_notifications ? 'right-1' : 'left-1'}`}></div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 lg:p-5 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white transition-all">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">Modo Dark Automático</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Adapta ao tema do dispositivo</p>
                  </div>
                  <div 
                    onClick={() => updateSetting('auto_dark_mode', !settings.auto_dark_mode)}
                    className={`w-12 h-6 rounded-full relative p-1 cursor-pointer transition-colors duration-200 ${settings.auto_dark_mode ? 'bg-blue-600' : 'bg-gray-200'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute shadow-sm transition-all duration-200 ${settings.auto_dark_mode ? 'right-1' : 'left-1'}`}></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'categories' && (
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-6 lg:p-8 border-b border-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg lg:text-xl font-black text-gray-900 uppercase tracking-widest">Categorias</h2>
                  <p className="text-xs text-gray-500">Gestão de rótulos para o Histórico</p>
                </div>
                <button className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95">
                  <Plus size={18} /> Adicionar
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {CATEGORIES.map(cat => (
                  <div key={cat.id} className="p-4 lg:p-5 flex items-center justify-between hover:bg-gray-50/50 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className={`px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-widest ${cat.color}`}>
                        {cat.name}
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden sm:inline">{cat.count} Movimentações</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-60 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                      <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Edit3 size={18} /></button>
                      <button className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={18} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'establishments' && (
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-6 lg:p-8 border-b border-gray-50">
                <h2 className="text-lg lg:text-xl font-black text-gray-900 uppercase tracking-widest">Estabelecimentos</h2>
                <p className="text-xs text-gray-500">Inteligência de identificação de cupom fiscal</p>
              </div>
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left min-w-[500px]">
                  <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-400 tracking-widest border-b border-gray-100">
                    <tr>
                      <th className="px-6 lg:px-8 py-4">Nome</th>
                      <th className="px-6 lg:px-8 py-4">Confiança IA</th>
                      <th className="px-6 lg:px-8 py-4">Atividade</th>
                      <th className="px-6 lg:px-8 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ESTABLISHMENTS.map((est, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 lg:px-8 py-5 text-sm font-bold text-gray-900">{est.name}</td>
                        <td className="px-6 lg:px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 w-20 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: est.reliability }}></div>
                            </div>
                            <span className="text-[10px] font-black text-emerald-600">{est.reliability}</span>
                          </div>
                        </td>
                        <td className="px-6 lg:px-8 py-5 text-[10px] font-bold text-gray-400 uppercase">{new Date(est.lastActive).toLocaleDateString()}</td>
                        <td className="px-6 lg:px-8 py-5 text-right">
                          <button className="p-2 text-gray-300 hover:text-blue-600 transition-colors"><ChevronRight size={18} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSection === 'currencies' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
              <div className="bg-white p-6 lg:p-8 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 shadow-sm">
                    <Globe size={24} />
                  </div>
                  <h3 className="font-black text-gray-900 uppercase tracking-widest text-sm lg:text-base">Moeda Principal</h3>
                </div>
                <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between group hover:bg-white transition-all">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Símbolo Base</p>
                    <p className="text-xl font-black text-gray-900">BRL (R$)</p>
                  </div>
                  <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center shadow-sm">
                    <Check size={20} />
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 lg:p-8 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <h3 className="font-black text-gray-900 mb-2 uppercase tracking-widest text-sm lg:text-base">Secundárias</h3>
                  <p className="text-xs text-gray-500 mb-8 leading-relaxed">Habilite outras moedas para transações internacionais ou investimentos.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button className="px-4 py-2 bg-gray-50 border border-gray-100 text-gray-400 text-[10px] font-black uppercase rounded-xl tracking-widest">USD</button>
                  <button className="px-4 py-2 bg-gray-50 border border-gray-100 text-gray-400 text-[10px] font-black uppercase rounded-xl tracking-widest">EUR</button>
                  <button className="px-4 py-2 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded-xl border border-blue-100 tracking-widest">+ Adicionar</button>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'rates' && (
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 lg:p-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
                <div>
                  <h2 className="text-lg lg:text-xl font-black text-gray-900 uppercase tracking-widest">Taxas Customizadas</h2>
                  <p className="text-xs text-gray-500">Definições para projeções financeiras</p>
                </div>
                <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 shadow-sm">
                  <Percent size={24} />
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white transition-all shadow-inner hover:shadow-sm">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5 ml-1">IOF Internacional</label>
                    <div className="flex items-center gap-2">
                      <input type="text" value="6,38" className="bg-transparent font-black text-gray-900 text-2xl outline-none w-24" readOnly />
                      <span className="font-black text-gray-300 text-xl">%</span>
                    </div>
                  </div>
                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white transition-all shadow-inner hover:shadow-sm">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5 ml-1">Spread Bancário</label>
                    <div className="flex items-center gap-2">
                      <input type="text" value="4,00" className="bg-transparent font-black text-gray-900 text-2xl outline-none w-24" readOnly />
                      <span className="font-black text-gray-300 text-xl">%</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 lg:p-5 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-4">
                   <AlertTriangle size={20} className="text-amber-600 mt-1 shrink-0" />
                   <p className="text-xs text-amber-800 leading-relaxed font-medium italic">
                     Estas taxas são aplicadas em faturas internacionais e projeções de saldo quando não há cotação oficial em tempo real.
                   </p>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'backup' && (
            <div className="space-y-6">
              <div className="bg-white p-6 lg:p-8 rounded-3xl border border-gray-200 shadow-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
                   <div className="flex items-center gap-3">
                      <div className="p-3.5 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100">
                        <Database size={24} />
                      </div>
                      <h3 className="font-black text-gray-900 uppercase tracking-widest text-sm lg:text-base">Infraestrutura Nuvem</h3>
                   </div>
                   <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border ${
                     isSupabaseConfigured ? 'text-green-600 bg-green-50 border-green-100' : 'text-gray-400 bg-gray-50 border-gray-100'
                   }`}>
                      {isSupabaseConfigured ? <Check size={14} /> : <XCircle size={14} />}
                      {isSupabaseConfigured ? 'Ativa' : 'Desconectada'}
                   </div>
                </div>

                {!isSupabaseConfigured && (
                  <div className="mb-8 p-6 bg-blue-50 border border-blue-100 rounded-3xl flex flex-col sm:flex-row items-start gap-4">
                    <div className="p-2.5 bg-white rounded-xl shadow-sm text-blue-600 shrink-0"><LinkIcon size={20} /></div>
                    <div>
                      <p className="font-bold text-blue-900 text-sm">Integração Necessária</p>
                      <p className="text-xs text-blue-700 mt-1 leading-relaxed font-medium">
                        Para backup e documentos, configure <strong>VITE_SUPABASE_URL</strong> no ambiente.
                      </p>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
                   <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100 hover:bg-white transition-all shadow-inner hover:shadow-sm group">
                      <div className="flex items-center gap-2 text-gray-400 mb-3">
                        <Clock size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Sincronização</span>
                      </div>
                      <p className="text-sm font-bold text-gray-700">Hoje às 14:32</p>
                      <button disabled={!isSupabaseConfigured} className={`mt-5 text-[10px] font-black uppercase tracking-widest transition-all ${isSupabaseConfigured ? 'text-blue-600 hover:underline' : 'text-gray-300 cursor-not-allowed'}`}>Sincronizar Agora</button>
                   </div>
                   <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100 hover:bg-white transition-all shadow-inner hover:shadow-sm group">
                      <div className="flex items-center gap-2 text-gray-400 mb-3">
                        <Download size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Cache Local</span>
                      </div>
                      <p className="text-sm font-bold text-gray-700">2.4 MB utilizados</p>
                      <button className="mt-5 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:underline transition-all">Limpar Tudo</button>
                   </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-gray-900 to-zinc-800 p-8 lg:p-10 rounded-[36px] text-white shadow-2xl relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-10 opacity-5"><Cloud size={160} /></div>
                 <h3 className="text-xl lg:text-2xl font-black uppercase tracking-tighter mb-2">Exportação Universal</h3>
                 <p className="text-xs lg:text-sm opacity-60 mb-8 leading-relaxed max-w-md font-medium">Baixe o dump completo dos seus dados financeiros (JSON/CSV) para custódia própria ou migração externa.</p>
                 <button className="w-full sm:w-auto px-8 py-4 bg-white text-gray-900 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all flex items-center justify-center gap-3 shadow-xl active:scale-95">
                    <Download size={20} /> Baixar Backup Completo
                 </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default SettingsPage;
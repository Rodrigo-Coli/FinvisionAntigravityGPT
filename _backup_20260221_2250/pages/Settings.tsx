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
  Info,
  Check,
  Clock,
  Download,
  AlertTriangle,
  Link as LinkIcon,
  XCircle,
  Loader2,
  Tag,
  Shield,
  Bell,
  Moon,
  Smartphone,
  Search,
  ArrowUpRight,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { DateUtils } from '../lib/dateUtils';

const SettingsPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'general' | 'categories' | 'establishments' | 'products' | 'backup' | 'currencies' | 'rates'>('general');
  const [settings, setSettings] = useState({
    email_notifications: true,
    auto_dark_mode: false,
    iof_rate: 6.38,
    spread_rate: 4.00
  });
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [establishments, setEstablishments] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [isAddingCat, setIsAddingCat] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeSection]);

  const fetchData = async () => {
    // DEV BYPASS
    if (window.location.href.includes('dev=true')) {
      if (activeSection === 'categories') {
        setCategories([
          { id: '1', name: 'Alimentação', color: 'bg-orange-50 text-orange-600' },
          { id: '2', name: 'Transporte', color: 'bg-blue-50 text-blue-600' },
          { id: '3', name: 'Investimentos', color: 'bg-emerald-50 text-emerald-600' }
        ]);
      }
      if (activeSection === 'establishments') {
        setEstablishments([
          { name: 'Apple Services', lastActive: new Date().toISOString(), count: 5, category: 'Assinaturas' },
          { name: 'Uber Trip Help', lastActive: new Date().toISOString(), count: 12, category: 'Transporte' },
          { name: 'Restaurante Zen', lastActive: new Date().toISOString(), count: 3, category: 'Alimentação' }
        ]);
      }
      return;
    }

    if (!supabase) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (activeSection === 'general' || activeSection === 'rates') {
        const { data } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
        if (data) {
          setSettings({
            email_notifications: data.email_notifications,
            auto_dark_mode: data.auto_dark_mode,
            iof_rate: data.iof_rate || 6.38,
            spread_rate: data.spread_rate || 4.00
          });
        }
      }

      if (activeSection === 'categories') {
        const { data } = await supabase.from('categories').select('*').eq('user_id', user.id).order('name');
        setCategories(data || []);
      }

      if (activeSection === 'establishments') {
        const { data: docs } = await supabase.from('ai_documents').select('merchant_raw, date, ocr_structured').eq('user_id', user.id).order('date', { ascending: false });
        const grouped = (docs || []).reduce((acc: any, d: any) => {
          if (!acc[d.merchant_raw]) { acc[d.merchant_raw] = { name: d.merchant_raw, lastActive: d.date, count: 0, category: d.ocr_structured?.merchant_category || 'Mercado' }; }
          acc[d.merchant_raw].count++;
          if (d.date > acc[d.merchant_raw].lastActive) acc[d.merchant_raw].lastActive = d.date;
          return acc;
        }, {});
        setEstablishments(Object.values(grouped));
      }

      if (activeSection === 'products') {
        const { data } = await supabase.from('products').select('*').eq('user_id', user.id).eq('active', true).order('name');
        setProducts(data || []);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const addCategory = async () => {
    if (!newCatName || !supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('categories').insert({ user_id: user.id, name: newCatName, color: 'bg-brand-50 text-brand-600' });
      setNewCatName(''); setIsAddingCat(false); fetchData();
    } catch (err) { alert('Erro ao adicionar'); }
  };

  const deleteCategory = async (id: string) => {
    if (!supabase || !confirm('Deseja excluir?')) return;
    try { await supabase.from('categories').delete().eq('id', id); fetchData(); } catch (err) { alert('Erro ao excluir'); }
  };

  const updateSetting = async (key: string, value: any) => {
    if (!supabase) return;
    const previousSettings = { ...settings };
    setSettings(prev => ({ ...prev, [key]: value }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('user_settings').upsert({ user_id: user.id, [key]: value, updated_at: DateUtils.getNow().toISOString() });
    } catch (err) { setSettings(previousSettings); }
  };

  const menuItems = [
    { id: 'general', label: 'Preferências', icon: <SettingsIcon size={18} /> },
    { id: 'categories', label: 'Categorias', icon: <Tags size={18} /> },
    { id: 'establishments', label: 'Estabelecimentos', icon: <Store size={18} /> },
    { id: 'rates', label: 'Taxas e Conversão', icon: <Percent size={18} /> },
    { id: 'backup', label: 'Backup e Dados', icon: <Cloud size={18} />, divider: true },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ajustes do Sistema</h1>
          <p className="text-sm text-slate-400 font-medium">Configurações globais, metadados e infraestrutura.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-10">
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-full lg:w-72 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-4 lg:pb-0 scrollbar-hide shrink-0">
          {menuItems.map((item) => (
            <React.Fragment key={item.id}>
              {item.divider && <div className="hidden lg:block h-px bg-slate-100 my-4 mx-4"></div>}
              <button
                onClick={() => setActiveSection(item.id as any)}
                className={`flex items-center gap-4 px-6 py-4 rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeSection === item.id
                  ? 'bg-slate-900 text-white shadow-xl shadow-slate-200'
                  : 'bg-white text-slate-400 hover:bg-slate-50 border border-slate-100'
                  }`}
              >
                {item.icon}
                {item.label}
              </button>
            </React.Fragment>
          ))}
        </aside>

        {/* CONTENT AREA */}
        <main className="flex-1 space-y-8 min-w-0">
          {activeSection === 'general' && (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-10 space-y-10">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-900 italic">Interface e Alertas</h2>
                <p className="text-sm text-slate-400 font-medium">Ajuste como o FinVision interage com você.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-50 hover:bg-white transition-all">
                  <div>
                    <p className="font-bold text-slate-900">Notificações por Email</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Vencimentos e alertas críticos.</p>
                  </div>
                  <button onClick={() => updateSetting('email_notifications', !settings.email_notifications)} className={`w-14 h-8 rounded-full p-1 transition-all ${settings.email_notifications ? 'bg-brand-600' : 'bg-slate-200'}`}>
                    <div className={`w-6 h-6 bg-white rounded-full shadow-sm transition-all transform ${settings.email_notifications ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-50 hover:bg-white transition-all">
                  <div>
                    <p className="font-bold text-slate-900">Modo Dark Automático</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Acompanha o sistema operacional.</p>
                  </div>
                  <button onClick={() => updateSetting('auto_dark_mode', !settings.auto_dark_mode)} className={`w-14 h-8 rounded-full p-1 transition-all ${settings.auto_dark_mode ? 'bg-brand-600' : 'bg-slate-200'}`}>
                    <div className={`w-6 h-6 bg-white rounded-full shadow-sm transition-all transform ${settings.auto_dark_mode ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'categories' && (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden border-b-4 border-b-slate-100">
              <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-slate-900">Categorias</h2>
                  <p className="text-sm text-slate-400 font-medium">Lançamentos do histórico.</p>
                </div>
                <button onClick={() => setIsAddingCat(true)} className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-xl hover:bg-brand-600 transition-all font-bold flex items-center gap-2"><Plus size={16} /> Novo</button>
              </div>
              <div className="divide-y divide-slate-50">
                {isAddingCat && (
                  <div className="p-10 flex gap-4 bg-brand-50/30">
                    <input autoFocus className="flex-1 bg-white border border-brand-200 rounded-2xl px-6 py-4 font-bold text-slate-900 outline-none shadow-sm" placeholder="Nome da categoria..." value={newCatName} onChange={e => setNewCatName(e.target.value)} />
                    <button onClick={addCategory} className="w-16 h-16 bg-brand-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><Check size={24} /></button>
                    <button onClick={() => setIsAddingCat(false)} className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center"><XCircle size={24} /></button>
                  </div>
                )}
                {categories.map(cat => (
                  <div key={cat.id} className="p-6 lg:p-8 flex items-center justify-between group hover:bg-slate-50/50 transition-all">
                    <div className="flex items-center gap-4">
                      <div className={`w-4 h-4 rounded-full ${cat.color?.split(' ')[0] || 'bg-brand-500'}`} />
                      <span className="font-bold text-slate-900 uppercase tracking-widest text-sm">{cat.name}</span>
                    </div>
                    <button onClick={() => deleteCategory(cat.id)} className="p-3 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"><Trash2 size={20} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'establishments' && (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden border-b-4 border-b-slate-100">
              <div className="p-10 border-b border-slate-50 space-y-1 bg-slate-50/20">
                <h2 className="text-xl font-bold text-slate-900 italic">Estabelecimentos</h2>
                <p className="text-sm text-slate-400 font-medium">Mapeamento automático de lojas extraídas via IA.</p>
              </div>
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-300 tracking-[0.2em] border-b border-slate-50">
                    <tr>
                      <th className="px-10 py-6 text-left">Marca / Loja</th>
                      <th className="px-10 py-6 text-left">Segmento</th>
                      <th className="px-10 py-6 text-left">Atividade</th>
                      <th className="px-10 py-6 text-right">Volume</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {establishments.map((est, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-10 py-8">
                          <span className="text-sm font-bold text-slate-900 uppercase tracking-tight italic">{est.name}</span>
                        </td>
                        <td className="px-10 py-8">
                          <select className="bg-slate-100 border-none rounded-lg px-3 py-1.5 text-[9px] font-bold uppercase text-slate-500 cursor-pointer">
                            <option>{est.category}</option>
                            <option>Mercado</option>
                            <option>Restaurante</option>
                          </select>
                        </td>
                        <td className="px-10 py-8">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{DateUtils.formatDisplayDate(est.lastActive)}</span>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <span className="text-xs font-bold text-slate-400">{est.count} TX</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSection === 'rates' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-10 space-y-10">
                <div className="space-y-4">
                  <div className="w-16 h-16 bg-slate-900 text-white rounded-[24px] flex items-center justify-center shadow-xl"><Percent size={32} /></div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 italic">Conversão</h2>
                    <p className="text-sm text-slate-400 font-medium">Parâmetros para câmbio internacional.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-50">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 block">IOF em Compras Externas</label>
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.01" className="bg-transparent font-bold text-4xl text-slate-900 w-32 outline-none" value={settings.iof_rate} onChange={e => updateSetting('iof_rate', parseFloat(e.target.value))} />
                      <span className="text-2xl font-bold text-slate-300">%</span>
                    </div>
                  </div>
                  <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-50">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 block">Spread Bancário (Média)</label>
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.01" className="bg-transparent font-bold text-4xl text-slate-900 w-32 outline-none" value={settings.spread_rate} onChange={e => updateSetting('spread_rate', parseFloat(e.target.value))} />
                      <span className="text-2xl font-bold text-slate-300">%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[40px] border border-brand-100 shadow-sm p-10 flex flex-col justify-between">
                <div className="space-y-6">
                  <div className="w-16 h-16 bg-brand-50 text-brand-600 rounded-[24px] flex items-center justify-center border border-brand-100"><Globe size={32} /></div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Moeda Base</h2>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">Sua conta opera primariamente em <span className="text-brand-600 font-bold italic">Real Brasileiro (BRL)</span>. Todas as outras moedas são convertidas para este padrão.</p>
                  </div>
                </div>
                <div className="p-6 bg-slate-50 rounded-2xl flex items-center justify-between">
                  <span className="font-bold text-slate-900">BR - Real</span>
                  <Check className="text-brand-600" />
                </div>
              </div>
            </div>
          )}

          {activeSection === 'backup' && (
            <div className="space-y-8">
              <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-10 flex flex-col md:flex-row items-center justify-between gap-10">
                <div className="space-y-4 max-w-md">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center border border-indigo-100"><Database size={24} /></div>
                    <h3 className="font-bold text-slate-900 text-xl tracking-tight">Infraestrutura</h3>
                  </div>
                  <p className="text-slate-400 font-medium leading-relaxed italic">Seus dados estão sincronizados via <span className="font-bold text-slate-600 uppercase text-xs tracking-widest">Supabase Cloud</span> com segurança de ponta a ponta.</p>

                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border ${isSupabaseConfigured ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                    {isSupabaseConfigured ? <Check size={14} /> : <XCircle size={14} />}
                    {isSupabaseConfigured ? 'Nuvem Conectada' : 'Modo Offline'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
                  <div className="p-8 bg-slate-50 rounded-[32px] text-center space-y-2">
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Cache</p>
                    <p className="text-2xl font-bold text-slate-900">2.4MB</p>
                  </div>
                  <div className="p-8 bg-slate-50 rounded-[32px] text-center space-y-2">
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Sinc</p>
                    <p className="text-2xl font-bold text-emerald-600">OK</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 rounded-[40px] p-12 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute top-[-20px] right-[-20px] opacity-10"><Cloud size={200} /></div>
                <div className="relative z-10 space-y-8">
                  <div className="space-y-2">
                    <h2 className="text-4xl font-bold tracking-tighter italic">Exportação Universal</h2>
                    <p className="text-slate-400 text-lg max-w-md">Baixe todo seu histórico financeiro e configurações em um arquivo portátil.</p>
                  </div>
                  <button className="flex items-center gap-3 px-10 py-5 bg-white text-slate-900 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl hover:bg-brand-400 hover:text-white transition-all">
                    <Download size={20} /> Iniciar Backup Completo
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default SettingsPage;
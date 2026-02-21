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
        const { data: docs } = await supabase
          .from('ai_documents')
          .select('merchant_raw, date, ocr_structured')
          .eq('user_id', user.id)
          .order('date', { ascending: false });

        const grouped = (docs || []).reduce((acc: any, d: any) => {
          if (!acc[d.merchant_raw]) {
            acc[d.merchant_raw] = {
              name: d.merchant_raw,
              lastActive: d.date,
              count: 0,
              category: d.ocr_structured?.merchant_category || 'Mercado'
            };
          }
          acc[d.merchant_raw].count++;
          if (new Date(d.date) > new Date(acc[d.merchant_raw].lastActive)) {
            acc[d.merchant_raw].lastActive = d.date;
          }
          return acc;
        }, {});
        setEstablishments(Object.values(grouped));
      }

      if (activeSection === 'products') {
        const { data } = await supabase.from('products').select('*').eq('user_id', user.id).eq('active', true).order('name');
        setProducts(data || []);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const addCategory = async () => {
    if (!newCatName || !supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('categories').insert({
        user_id: user.id,
        name: newCatName,
        color: 'bg-blue-100 text-blue-600'
      });
      if (error) throw error;
      setNewCatName('');
      setIsAddingCat(false);
      fetchData();
    } catch (err) {
      alert('Erro ao adicionar categoria');
    }
  };

  const deleteCategory = async (id: string) => {
    if (!supabase || !confirm('Deseja excluir esta categoria?')) return;
    try {
      await supabase.from('categories').delete().eq('id', id);
      fetchData();
    } catch (err) {
      alert('Erro ao excluir categoria');
    }
  };

  const seedDefaults = async () => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const defaults = [
        { name: 'Alimentação', color: 'bg-orange-100 text-orange-600' },
        { name: 'Transporte', color: 'bg-blue-100 text-blue-600' },
        { name: 'Lazer', color: 'bg-pink-100 text-pink-600' },
        { name: 'Saúde', color: 'bg-emerald-100 text-emerald-600' },
        { name: 'Moradia', color: 'bg-indigo-100 text-indigo-600' }
      ];
      const { error } = await supabase.from('categories').insert(
        defaults.map(d => ({ ...d, user_id: user.id }))
      );
      if (error) throw error;
      fetchData();
    } catch (err) {
      alert('Erro ao restaurar sugestões');
    }
  };

  const updateEstablishmentCategory = async (merchantName: string, newCategory: string) => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: docs } = await supabase
        .from('ai_documents')
        .select('id, ocr_structured')
        .eq('user_id', user.id)
        .eq('merchant_raw', merchantName);

      if (docs) {
        for (const doc of docs) {
          const updatedOcr = { ...doc.ocr_structured, merchant_category: newCategory };
          await supabase
            .from('ai_documents')
            .update({ ocr_structured: updatedOcr })
            .eq('id', doc.id);
        }
      }

      setEstablishments(prev => prev.map(e => e.name === merchantName ? { ...e, category: newCategory } : e));
    } catch (err) {
      alert('Erro ao atualizar categoria');
    }
  };

  const renameProduct = async (id: string, newName: string | null) => {
    if (!supabase || !newName) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: existing } = await supabase.from('products')
        .select('id')
        .eq('user_id', user.id)
        .ilike('name', newName.trim())
        .neq('id', id)
        .maybeSingle();

      if (existing) {
        if (confirm(`Já existe um produto com o nome "${newName.trim()}". Deseja mesclar os preços de ambos?`)) {
          await supabase.from('product_prices').update({ product_id: existing.id }).eq('product_id', id);
          await supabase.from('ai_document_items').update({ product_id: existing.id }).eq('product_id', id);
          await supabase.from('products').update({ active: false }).eq('id', id);
        }
      } else {
        await supabase.from('products').update({ name: newName.trim().toUpperCase() }).eq('id', id);
      }
      fetchData();
    } catch (err) {
      alert('Erro ao renomear produto');
    }
  };

  const deleteProduct = async (id: string) => {
    if (!supabase || !confirm('Deseja excluir este produto e todo seu histórico de preços?')) return;
    try {
      await supabase.from('products').update({ active: false }).eq('id', id);
      fetchData();
    } catch (err) {
      alert('Erro ao excluir produto');
    }
  };

  const updateSetting = async (key: string, value: any) => {
    if (!supabase) return;

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
      setSettings(previousSettings);
    }
  };

  const menuItems = [
    { id: 'general', label: 'Geral', icon: <SettingsIcon size={18} /> },
    { id: 'categories', label: 'Categorias', icon: <Tags size={18} /> },
    { id: 'establishments', label: 'Estabelecimentos', icon: <Store size={18} /> },
    { id: 'products', label: 'Produtos', icon: <Tag size={18} /> },
    { id: 'rates', label: 'Taxas e Conversão', icon: <Percent size={18} /> },
    { id: 'backup', label: 'Backup', icon: <Cloud size={18} />, divider: true },
  ];

  return (
    <div className="w-full flex justify-center py-6 sm:py-10 px-4 sm:px-6 lg:px-8 animate-in fade-in duration-700 bg-gray-50 min-h-screen">
      <div className="inline-block min-w-min max-w-full space-y-8 sm:space-y-10">
        <header className="mb-6 lg:mb-8">
          <h1 className="text-xl lg:text-2xl font-black text-gray-900 tracking-tight uppercase">Configurações</h1>
          <p className="text-gray-500 text-xs lg:text-sm">Personalização de metadados e ajustes de sistema</p>
        </header>

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
          <aside className="w-full lg:w-64 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 scrollbar-hide shrink-0">
            {menuItems.map((item) => (
              <React.Fragment key={item.id}>
                {item.divider && <div className="hidden lg:block h-px bg-gray-200 my-4 mx-4"></div>}
                <button
                  onClick={() => setActiveSection(item.id as any)}
                  className={`flex-1 lg:flex-none flex items-center justify-center lg:justify-start gap-3 px-5 lg:px-4 py-3.5 lg:py-3 rounded-xl text-xs lg:text-sm font-black uppercase tracking-widest whitespace-nowrap ${activeSection === item.id
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

          <main className="flex-1 w-full space-y-6">
            {activeSection === 'general' && (
              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 lg:p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg lg:text-xl font-black text-gray-900 uppercase tracking-widest font-bold">Preferências</h2>
                  {loading && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
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
                  <button
                    onClick={() => setIsAddingCat(true)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95 font-bold"
                  >
                    <Plus size={18} /> Adicionar
                  </button>
                </div>
                <div className="divide-y divide-gray-50">
                  {isAddingCat && (
                    <div className="p-4 bg-blue-50/50 flex items-center gap-4">
                      <input
                        type="text"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        placeholder="Nome da categoria..."
                        className="flex-1 bg-white border border-blue-200 rounded-lg px-4 py-2 text-sm font-bold placeholder:text-blue-300 outline-none focus:ring-2 focus:ring-blue-400"
                        autoFocus
                      />
                      <button onClick={addCategory} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"><Check size={18} /></button>
                      <button onClick={() => setIsAddingCat(false)} className="p-2 bg-gray-200 text-gray-500 rounded-lg hover:bg-gray-300 transition-all"><XCircle size={18} /></button>
                    </div>
                  )}
                  {categories.map(cat => (
                    <div key={cat.id} className="p-4 lg:p-5 flex items-center justify-between hover:bg-gray-50/50 transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className={`px-4 py-2 rounded-xl font-bold text-[11px] uppercase tracking-widest ${cat.color || 'bg-slate-100 text-slate-600'}`}>
                          {cat.name}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => deleteCategory(cat.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={18} /></button>
                      </div>
                    </div>
                  ))}
                  {categories.length === 0 && !isAddingCat && (
                    <div className="py-20 text-center">
                      <p className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-6">Nenhuma categoria personalizada</p>
                      <button
                        onClick={seedDefaults}
                        className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all border border-gray-200"
                      >
                        Restaurar Sugestões Padrão
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeSection === 'establishments' && (
              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden p-6 lg:p-8">
                <div className="flex flex-col gap-1 mb-6">
                  <h2 className="text-lg lg:text-xl font-black text-gray-900 uppercase tracking-widest">Estabelecimentos</h2>
                  <p className="text-xs text-gray-500">Lojas identificadas automaticamente em seus cupons fiscas</p>
                </div>
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left min-w-[500px]">
                    <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-400 tracking-widest border-b border-gray-100">
                      <tr>
                        <th className="px-6 lg:px-8 py-4">Nome</th>
                        <th className="px-6 lg:px-8 py-4">Categoria</th>
                        <th className="px-6 lg:px-8 py-4">Atividade</th>
                        <th className="px-6 lg:px-8 py-4 text-right">Compras</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {establishments.map((est, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                          <td className="px-6 lg:px-8 py-5 text-sm font-bold text-gray-900 uppercase italic tracking-tighter">{est.name}</td>
                          <td className="px-6 lg:px-8 py-5">
                            <select
                              value={est.category}
                              onChange={(e) => updateEstablishmentCategory(est.name, e.target.value)}
                              className="bg-white border-2 border-gray-100 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 focus:outline-none focus:border-blue-500 transition-all cursor-pointer"
                            >
                              <option value="Mercado">Mercado</option>
                              <option value="Restaurante">Restaurante</option>
                              <option value="Farmácia">Farmácia</option>
                              <option value="Loja">Loja</option>
                              <option value="Posto">Posto</option>
                              <option value="Outros">Outros</option>
                            </select>
                          </td>
                          <td className="px-6 lg:px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(est.lastActive).toLocaleDateString()}</td>
                          <td className="px-6 lg:px-8 py-5 text-right font-black text-xs text-slate-400">
                            {est.count} UN
                          </td>
                        </tr>
                      ))}
                      {establishments.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">
                            Nenhuma loja registrada via cupons ainda.
                          </td>
                        </tr>
                      )}
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
                        <input
                          type="number"
                          step="0.01"
                          value={settings.iof_rate}
                          onChange={(e) => updateSetting('iof_rate', parseFloat(e.target.value))}
                          className="bg-transparent font-black text-gray-900 text-2xl outline-none w-24"
                        />
                        <span className="font-black text-gray-300 text-xl">%</span>
                      </div>
                    </div>
                    <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white transition-all shadow-inner hover:shadow-sm">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5 ml-1">Spread Bancário</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={settings.spread_rate}
                          onChange={(e) => updateSetting('spread_rate', parseFloat(e.target.value))}
                          className="bg-transparent font-black text-gray-900 text-2xl outline-none w-24"
                        />
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
                    <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border ${isSupabaseConfigured ? 'text-green-600 bg-green-50 border-green-100' : 'text-gray-400 bg-gray-50 border-gray-100'
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
    </div>
  );
};

export default SettingsPage;
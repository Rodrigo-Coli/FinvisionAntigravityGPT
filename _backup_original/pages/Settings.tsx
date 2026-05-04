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
  Smartphone,
  Search,
  ArrowUpRight,
  Check,
  XCircle,
  Tag,
  Link as LinkIcon,
  Clock,
  Download,
  Database,
  Shield,
  AlertTriangle,
  Bell,
  Loader2,
  X as XIcon,
  CheckCircle2,
  Moon,
  Info
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
          .select('merchant_raw, document_date, ocr_structured')
          .eq('user_id', user.id)
          .order('document_date', { ascending: false });

        const grouped = (docs || []).reduce((acc: any, d: any) => {
          if (!acc[d.merchant_raw]) {
            acc[d.merchant_raw] = {
              name: d.merchant_raw,
              lastActive: d.document_date,
              count: 0,
              category: d.ocr_structured?.merchant_category || 'Mercado'
            };
          }
          acc[d.merchant_raw].count++;
          if (new Date(d.document_date) > new Date(acc[d.merchant_raw].lastActive)) {
            acc[d.merchant_raw].lastActive = d.document_date;
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

      const { error } = await supabase
        .from('ai_documents')
        .update({ ocr_structured: { merchant_category: newCategory } })
        .eq('user_id', user.id)
        .eq('merchant_raw', merchantName);

      if (error) throw error;

      // Optimistic update
      setEstablishments(prev => prev.map((e: any) => e.name === merchantName ? { ...e, category: newCategory } : e));
      fetchData();
    } catch (err: any) {
      console.error('Error updating establishment category:', err);
      alert('Erro ao atualizar categoria');
    }
  };

  const renameProduct = async (id: string, newName: string | null) => {
    if (!supabase || !newName) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if name already exists to offer merge
      const { data: existing } = await supabase.from('products')
        .select('id')
        .eq('user_id', user.id)
        .ilike('name', newName.trim())
        .neq('id', id)
        .maybeSingle();

      if (existing) {
        if (confirm(`Já existe um produto com o nome "${newName.trim()}". Deseja mesclar os preços de ambos?`)) {
          // Relink all prices to the existing product
          await supabase.from('product_prices').update({ product_id: existing.id }).eq('product_id', id);
          await supabase.from('ai_document_items').update({ product_id: existing.id }).eq('product_id', id);
          // Deactivate the current product
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
    <div className="max-w-7xl mx-auto py-12 sm:py-20 px-6 sm:px-10 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight">Configurações</h1>
            <span className="px-3 py-1 bg-slate-50 text-slate-400 rounded-full text-[10px] font-bold uppercase tracking-widest border border-slate-100 shadow-sm">Sistema</span>
          </div>
          <p className="text-slate-500 font-medium text-lg leading-relaxed max-w-2xl">Ajuste seu ambiente de inteligência financeira e gerencie suas preferências de metadados.</p>
        </div>
        {loading && <Loader2 className="w-6 h-6 animate-spin text-slate-300" />}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start pt-4">
        {/* Sidebar Navigation */}
        <aside className="lg:col-span-3 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-4 lg:pb-0 scrollbar-hide sticky top-28">
          {menuItems.map((item) => (
            <React.Fragment key={item.id}>
              {item.divider && <div className="hidden lg:block h-px bg-slate-100 my-6 mx-4"></div>}
              <button
                onClick={() => setActiveSection(item.id as any)}
                className={`flex-1 lg:flex-none flex items-center gap-4 px-6 py-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeSection === item.id
                  ? 'bg-slate-900 text-white shadow-xl shadow-black/5'
                  : 'bg-white text-slate-400 hover:text-slate-900 hover:bg-slate-50 border border-transparent hover:border-slate-100'
                  }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </React.Fragment>
          ))}
        </aside>

        {/* Content Area */}
        <main className="lg:col-span-9 w-full space-y-12">
          {activeSection === 'general' && (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-soft p-10 sm:p-14 space-y-12 animate-in slide-in-from-bottom-5 duration-500">
              <div className="space-y-2">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Preferências Gerais</h2>
                <p className="text-slate-500 text-lg font-medium leading-relaxed">Personalize a sua experiência de uso e notificações.</p>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {[
                  {
                    id: 'email_notifications',
                    label: 'Notificações por E-mail',
                    desc: 'Receba alertas sobre lançamentos e insights da IA.',
                    icon: <Bell size={20} />,
                    active: settings.email_notifications
                  },
                  {
                    id: 'auto_dark_mode',
                    label: 'Interface Adaptativa',
                    desc: 'Sincroniza automaticamente com o tema do seu sistema.',
                    icon: <Smartphone size={20} />,
                    active: settings.auto_dark_mode
                  }
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-8 bg-slate-50/50 rounded-3xl border border-slate-100 hover:border-slate-200 transition-all group">
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-slate-900 shadow-sm transition-all border border-slate-100">
                        {item.icon}
                      </div>
                      <div className="space-y-1">
                        <p className="font-bold text-slate-900 text-base">{item.label}</p>
                        <p className="text-sm text-slate-400 font-medium leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => updateSetting(item.id, !item.active)}
                      className={`w-14 h-8 rounded-full transition-all relative ${item.active ? 'bg-slate-900' : 'bg-slate-200'}`}
                    >
                      <div className={`absolute top-1.5 w-5 h-5 bg-white rounded-full transition-all shadow-sm ${item.active ? 'left-7.5' : 'left-1.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'categories' && (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-soft overflow-hidden animate-in slide-in-from-bottom-5 duration-500">
              <div className="p-10 sm:p-14 border-b border-slate-50 flex flex-col sm:flex-row items-center justify-between gap-8">
                <div className="space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Categorias</h2>
                  <p className="text-slate-500 font-medium text-lg leading-relaxed">Gestão de rótulos para organização financeira.</p>
                </div>
                <button
                  onClick={() => setIsAddingCat(true)}
                  className="px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-xl shadow-black/5 active:scale-95 flex items-center justify-center gap-3"
                >
                  <Plus size={18} /> Adicionar Nova
                </button>
              </div>

              <div className="divide-y divide-slate-50">
                {isAddingCat && (
                  <div className="p-10 bg-slate-50/50 flex items-center gap-6 animate-in slide-in-from-top-4 duration-500">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={newCatName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCatName(e.target.value)}
                        placeholder="Nome da categoria..."
                        className="w-full bg-white border border-slate-100 rounded-[20px] px-8 py-5 text-base font-semibold placeholder:text-slate-300 outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-300 transition-all shadow-sm"
                        autoFocus
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && addCategory()}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={addCategory} className="w-14 h-14 bg-emerald-500 text-white rounded-[20px] flex items-center justify-center shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all active:scale-90"><Check size={24} /></button>
                      <button onClick={() => setIsAddingCat(false)} className="w-14 h-14 bg-white border border-slate-200 text-slate-400 rounded-[20px] flex items-center justify-center hover:text-slate-900 transition-all active:scale-90"><XCircle size={24} /></button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-50">
                  {categories.map((cat: any) => (
                    <div key={cat.id} className="p-10 bg-white flex flex-col justify-between gap-8 hover:bg-slate-50 transition-all group">
                      <div className="space-y-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${cat.color || 'bg-slate-100 text-slate-600'}`}>
                          <Tag size={20} />
                        </div>
                        <h4 className="font-bold text-slate-900 text-base uppercase tracking-wider">{cat.name}</h4>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 group-hover:bg-white transition-colors">Personalizada</span>
                        <button onClick={() => deleteCategory(cat.id)} className="w-10 h-10 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl flex items-center justify-center transition-all opacity-0 group-hover:opacity-100">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {categories.length === 0 && !isAddingCat && (
                  <div className="py-32 text-center space-y-10">
                    <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-[28px] flex items-center justify-center mx-auto">
                      <Tags size={40} />
                    </div>
                    <div className="space-y-4">
                      <p className="text-slate-500 text-lg font-medium">Nenhuma categoria configurada.</p>
                      <button
                        onClick={seedDefaults}
                        className="px-10 py-5 bg-white border border-slate-200 text-slate-900 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-slate-50 hover:border-slate-300 transition-all shadow-soft"
                      >
                        Restaurar Padrões do Sistema
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'establishments' && (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-soft overflow-hidden p-10 sm:p-14 animate-in slide-in-from-bottom-5 duration-500">
              <div className="space-y-2 mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Estabelecimentos</h2>
                <p className="text-slate-500 text-lg font-medium leading-relaxed">Gestão da rede de inteligência de onde você compra.</p>
              </div>

              <div className="w-full overflow-x-auto -mx-10 sm:-mx-14 px-10 sm:px-14">
                <table className="w-full text-left min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-8 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Ponto de Venda</th>
                      <th className="pb-8 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Classificação</th>
                      <th className="pb-8 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Última Visita</th>
                      <th className="pb-8 text-right text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Monitorados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {establishments.map((est: any, idx: number) => (
                      <tr key={idx} className="group hover:bg-slate-50/50 transition-all">
                        <td className="py-10">
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-black/5">
                              <Store size={20} />
                            </div>
                            <span className="text-base font-bold text-slate-900 uppercase tracking-tight leading-none">{est.name}</span>
                          </div>
                        </td>
                        <td className="py-10">
                          <select
                            value={est.category}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateEstablishmentCategory(est.name, e.target.value)}
                            className="bg-white border border-slate-200 rounded-xl px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-600 focus:outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-300 transition-all cursor-pointer shadow-sm"
                          >
                            <option value="Mercado">Mercado</option>
                            <option value="Restaurante">Restaurante</option>
                            <option value="Farmácia">Farmácia</option>
                            <option value="Loja">Loja</option>
                            <option value="Posto">Posto</option>
                            <option value="Outros">Outros</option>
                          </select>
                        </td>
                        <td className="py-10">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-bold text-slate-900 tracking-tight">{new Date(est.lastActive).toLocaleDateString('pt-BR')}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Registrado</span>
                          </div>
                        </td>
                        <td className="py-10 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xl font-black text-slate-900 tracking-tighter">{est.count}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Lançamentos</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {establishments.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-32 text-center">
                          <div className="space-y-6">
                            <div className="w-16 h-16 bg-slate-50 text-slate-200 rounded-2xl flex items-center justify-center mx-auto">
                              <Database size={32} />
                            </div>
                            <p className="text-slate-400 text-sm font-bold uppercase tracking-[0.2em]">Nenhum estabelecimento detectado</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSection === 'products' && (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-soft overflow-hidden p-10 sm:p-14 animate-in slide-in-from-bottom-5 duration-500">
              <div className="space-y-6 mb-12">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Produtos</h2>
                    <p className="text-slate-500 text-lg font-medium leading-relaxed">Gestão granular da base de dados de itens.</p>
                  </div>
                  <div className="relative group w-full sm:w-80">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors" size={16} />
                    <input
                      type="text"
                      placeholder="Filtrar produtos..."
                      className="w-full bg-slate-50 border-none rounded-2xl pl-12 pr-6 py-4 text-sm font-medium focus:ring-2 focus:ring-slate-100 placeholder:text-slate-400 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {products.map((prod: any) => (
                  <div key={prod.id} className="flex items-center justify-between p-8 bg-slate-50/50 rounded-3xl border border-slate-100 hover:border-slate-200 transition-all group">
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-slate-900 shadow-sm transition-all border border-slate-100">
                        <Tag size={20} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-base font-bold text-slate-900 uppercase tracking-tight">{prod.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ID: {prod.viewId?.slice(0, 8) || prod.id.slice(0, 8)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          const name = prompt('Novo nome para o produto:', prod.name);
                          if (name) renameProduct(prod.id, name);
                        }}
                        className="w-12 h-12 bg-white border border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-300 rounded-xl flex items-center justify-center transition-all shadow-sm active:scale-90"
                      >
                        <Edit3 size={18} />
                      </button>
                      <button
                        onClick={() => deleteProduct(prod.id)}
                        className="w-12 h-12 bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 rounded-xl flex items-center justify-center transition-all shadow-sm active:scale-90"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
                {products.length === 0 && (
                  <div className="py-32 text-center space-y-8">
                    <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-[28px] flex items-center justify-center mx-auto">
                      <Tag size={40} />
                    </div>
                    <p className="text-slate-400 text-sm font-bold uppercase tracking-[0.2em]">Nenhum produto indexado</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'rates' && (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-soft p-10 sm:p-14 space-y-14 animate-in slide-in-from-bottom-5 duration-500">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-8">
                <div className="space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Taxas e Câmbio</h2>
                  <p className="text-slate-500 text-lg font-medium leading-relaxed">Parâmetros globais para transações em moeda estrangeira.</p>
                </div>
                <div className="w-16 h-16 bg-slate-900 text-white rounded-[24px] flex items-center justify-center shadow-xl shadow-black/5">
                  <Percent size={28} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {[
                  { id: 'iof_rate', label: 'IOF Internacional', val: settings.iof_rate, icon: <Shield size={18} /> },
                  { id: 'spread_rate', label: 'Spread Bancário', val: settings.spread_rate, icon: <Coins size={18} /> }
                ].map((rate) => (
                  <div key={rate.id} className="space-y-5">
                    <label className="flex items-center gap-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">
                      {rate.icon} {rate.label}
                    </label>
                    <div className="relative group">
                      <input
                        type="number"
                        step="0.01"
                        value={rate.val}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSetting(rate.id, parseFloat(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-100 rounded-[28px] px-10 py-8 text-4xl font-black text-slate-900 outline-none focus:ring-8 focus:ring-slate-900/5 focus:border-slate-300 focus:bg-white transition-all shadow-sm tracking-tighter"
                      />
                      <span className="absolute right-10 top-1/2 -translate-y-1/2 text-3xl font-bold text-slate-200 group-focus-within:text-slate-400 transition-colors">%</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-8 bg-amber-50/50 rounded-[32px] border border-amber-100 flex items-start gap-6">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-amber-100 shrink-0">
                  <AlertTriangle size={20} className="text-brand-500" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-amber-900 text-sm uppercase tracking-wide">Atenção Crítica</p>
                  <p className="text-sm text-amber-800/80 leading-relaxed font-medium">
                    Estes coeficientes impactam diretamente o cálculo de reconciliation da IA para faturas de cartões internacionais (ex: USD para BRL). Verifique com seu banco os valores atuais.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'backup' && (
            <div className="space-y-12 animate-in slide-in-from-bottom-5 duration-500">
              <div className="bg-white rounded-[40px] border border-slate-100 shadow-soft p-10 sm:p-14">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-14 gap-8">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-slate-50 text-slate-900 rounded-[28px] flex items-center justify-center border border-slate-100 shadow-sm">
                      <Database size={28} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Infraestrutura</h3>
                      <p className="text-slate-500 text-lg font-medium leading-relaxed">Arquitetura de dados e alta disponibilidade.</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] px-6 py-3 rounded-2xl border transition-all ${isSupabaseConfigured ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                    <div className={`w-2 h-2 rounded-full ${isSupabaseConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                    {isSupabaseConfigured ? 'Cluster Ativo' : 'Sem Conexão'}
                  </div>
                </div>

                {!isSupabaseConfigured && (
                  <div className="mb-12 p-8 bg-slate-900 rounded-[32px] border border-slate-800 flex items-start gap-6 animate-in slide-in-from-top-4">
                    <div className="w-14 h-14 bg-white/10 rounded-2xl shadow-sm flex items-center justify-center text-white shrink-0"><LinkIcon size={24} /></div>
                    <div className="space-y-2">
                      <p className="font-bold text-white text-base">Autenticação Pendente</p>
                      <p className="text-sm text-slate-400 leading-relaxed font-medium">
                        O sistema está operando em modo isolado. Configure as chaves de acesso para habilitar o motor de IA e backup em nuvem.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="p-10 bg-slate-50/50 rounded-[32px] border border-slate-100 transition-all hover:border-slate-200 flex flex-col justify-between min-h-[220px]">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 text-slate-400 uppercase tracking-[0.2em] font-bold text-[10px]">
                        <Clock size={16} /> Última Sincronia
                      </div>
                      <p className="text-3xl font-bold text-slate-900 tracking-tight">Hoje, às 14:32</p>
                    </div>
                    <button disabled={!isSupabaseConfigured} className="w-fit text-[10px] font-bold uppercase tracking-[0.3em] text-slate-900 hover:text-brand-600 disabled:text-slate-300 transition-all border-b-2 border-slate-900 hover:border-brand-600 pb-1">Sincronizar Cluster</button>
                  </div>
                  <div className="p-10 bg-slate-50/50 rounded-[32px] border border-slate-100 transition-all hover:border-slate-200 flex flex-col justify-between min-h-[220px]">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 text-slate-400 uppercase tracking-[0.2em] font-bold text-[10px]">
                        <Download size={16} /> Volume de Cache
                      </div>
                      <p className="text-3xl font-bold text-slate-900 tracking-tight">2.4 MB <span className="text-sm text-slate-400 uppercase tracking-widest font-bold ml-1">Local</span></p>
                    </div>
                    <button className="w-fit text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 hover:text-rose-600 transition-all border-b-2 border-transparent hover:border-rose-600 pb-1">Flush Metadata</button>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 p-12 sm:p-20 rounded-[48px] text-white relative overflow-hidden group shadow-2xl border border-slate-800">
                <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
                <div className="relative z-10 max-w-2xl space-y-10">
                  <div className="space-y-4">
                    <h3 className="text-4xl sm:text-5xl font-bold tracking-tighter leading-tight">Câmaras de <br />Custódia Própria</h3>
                    <p className="text-slate-400 font-medium text-lg leading-relaxed">Exporte o dump integral da sua vida financeira em formatos interpretáveis por qualquer sistema (JSON/CSV). Sua privacidade é soberana.</p>
                  </div>
                  <button className="w-full sm:w-auto px-12 py-6 bg-white text-slate-950 rounded-[28px] text-[11px] font-bold uppercase tracking-[0.3em] hover:bg-brand-400 transition-all flex items-center justify-center gap-4 shadow-2xl active:scale-95 group">
                    <Download size={24} className="group-hover:translate-y-0.5 transition-transform" /> Exportar Backup Soberano
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
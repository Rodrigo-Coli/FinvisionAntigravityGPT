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
  Archive,
  Building2,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { DateUtils } from '../lib/dateUtils';

const SettingsPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'general' | 'categories' | 'establishments' | 'products' | 'backup' | 'currencies' | 'rates' | 'entities'>('general');
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
  const [entities, setEntities] = useState<any[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newEntityName, setNewEntityName] = useState('');
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [isAddingEntity, setIsAddingEntity] = useState(false);
  const [categoryTab, setCategoryTab] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [catSearch, setCatSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');

  // Subcategories state
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [newSubcatName, setNewSubcatName] = useState('');
  const [editingSubcatId, setEditingSubcatId] = useState<string | null>(null);
  const [editSubcatName, setEditSubcatName] = useState('');

  useEffect(() => {
    fetchData();
  }, [activeSection, showArchived]);

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
        let query = supabase.from('categories').select('*').eq('user_id', user.id).order('name');
        if (!showArchived) query = query.eq('is_archived', false);
        const { data } = await query;
        setCategories(data || []);

        try {
          const { data: subData } = await supabase.from('subcategories').select('*').eq('user_id', user.id).order('name');
          setSubcategories(subData || []);
        } catch (e) {
          console.warn("Subcategories table might not exist yet", e);
        }
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

      if (activeSection === 'entities') {
        let query = supabase.from('entities').select('*').eq('user_id', user.id).order('name');
        if (!showArchived) query = query.eq('is_archived', false);
        const { data } = await query;
        setEntities(data || []);
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
      await supabase.from('categories').insert({ user_id: user.id, name: newCatName, type: categoryTab, color: 'bg-brand-50 text-brand-600' });
      setNewCatName(''); setIsAddingCat(false); fetchData();
    } catch (err) { alert('Erro ao adicionar'); }
  };

  const archiveCategory = async (id: string, archive: boolean = true) => {
    if (!supabase) return;
    try {
      await supabase.from('categories').update({ is_archived: archive }).eq('id', id);
      fetchData();
    } catch (err) { alert(`Erro ao ${archive ? 'arquivar' : 'desarquivar'}`); }
  };

  const deleteCategory = async (id: string) => {
    if (!supabase || !confirm('Deseja excluir permanentemente? (Transações existentes manterão o nome da categoria mas perderão o vínculo de ID)')) return;
    try { await supabase.from('categories').delete().eq('id', id); fetchData(); } catch (err) { alert('Erro ao excluir'); }
  };

  const startEditingCat = (cat: any) => {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
  };

  const saveEditCat = async () => {
    if (!editingCatId || !editCatName || !supabase) return;
    try {
      await supabase.from('categories').update({ name: editCatName }).eq('id', editingCatId);
      setEditingCatId(null);
      fetchData();
    } catch (err) { alert('Erro ao salvar'); }
  };

  // SUBCATEGORIES CRUD
  const addSubcategory = async (categoryId: string) => {
    if (!newSubcatName || !supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('subcategories').insert({ user_id: user.id, category_id: categoryId, name: newSubcatName });
      setNewSubcatName('');
      fetchData();
    } catch (err) { alert('Erro ao adicionar subcategoria'); }
  };

  const deleteSubcategory = async (id: string) => {
    if (!supabase || !confirm('Deseja excluir permanentemente a subcategoria?')) return;
    try { await supabase.from('subcategories').delete().eq('id', id); fetchData(); } catch (err) { alert('Erro ao excluir subcategoria'); }
  };

  const saveEditSubcat = async () => {
    if (!editingSubcatId || !editSubcatName || !supabase) return;
    try {
      await supabase.from('subcategories').update({ name: editSubcatName }).eq('id', editingSubcatId);
      setEditingSubcatId(null);
      fetchData();
    } catch (err) { alert('Erro ao salvar subcategoria'); }
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

  const addEntity = async () => {
    if (!newEntityName || !supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('entities').upsert({ user_id: user.id, name: newEntityName }, { onConflict: 'user_id, name' });
      setNewEntityName(''); setIsAddingEntity(false); fetchData();
    } catch (err) { alert('Erro ao adicionar'); }
  };

  const deleteEntity = async (id: string, name: string) => {
    if (!supabase || !confirm(`Deseja excluir a entidade "${name}"? Registros existentes não serão alterados.`)) return;
    try {
      await supabase.from('entities').delete().eq('id', id);
      fetchData();
    } catch (err) { alert('Erro ao excluir'); }
  };

  const archiveEntity = async (id: string, archive: boolean = true) => {
    if (!supabase) return;
    try {
      await supabase.from('entities').update({ is_archived: archive }).eq('id', id);
      fetchData();
    } catch (err) { alert(`Erro ao ${archive ? 'arquivar' : 'desarquivar'}`); }
  };

  const menuItems = [
    { id: 'general', label: 'Preferências', icon: <SettingsIcon size={18} /> },
    { id: 'categories', label: 'Categorias', icon: <Tags size={18} /> },
    { id: 'entities', label: 'Entidades / Donos', icon: <Building2 size={18} /> },
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
        {/* SIDEBAR NAVIGATION — Dropdown on mobile, buttons on desktop */}
        <aside className="w-full lg:w-72 shrink-0">
          {/* Mobile: Dropdown select */}
          <div className="block lg:hidden">
            <select
              value={activeSection}
              onChange={e => setActiveSection(e.target.value as any)}
              className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 outline-none shadow-sm appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center' }}
            >
              {menuItems.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>
          {/* Desktop: Full sidebar buttons */}
          <div className="hidden lg:flex flex-col gap-2">
            {menuItems.map((item) => (
              <React.Fragment key={item.id}>
                {item.divider && <div className="h-px bg-slate-100 my-4 mx-4"></div>}
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
          </div>
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
              <div className="p-6 md:p-10 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-slate-50/20">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-slate-900">Categorias</h2>
                  <p className="text-sm text-slate-400 font-medium">Lançamentos do histórico.</p>
                </div>

                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input
                      type="text"
                      placeholder="Buscar categoria..."
                      value={catSearch}
                      onChange={e => setCatSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                  <button
                    onClick={() => setShowArchived(prev => !prev)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${showArchived ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}
                  >
                    {showArchived ? 'Ocultar Arquivadas' : 'Ver Arquivadas'}
                  </button>
                  <div className="flex bg-slate-100 p-1 rounded-xl flex-1 md:flex-none">
                    <button onClick={() => setCategoryTab('INCOME')} className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-xs font-bold transition-all ${categoryTab === 'INCOME' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Receitas</button>
                    <button onClick={() => setCategoryTab('EXPENSE')} className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-xs font-bold transition-all ${categoryTab === 'EXPENSE' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Despesas</button>
                  </div>
                  <button onClick={() => setIsAddingCat(true)} className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-xl hover:bg-brand-600 transition-all flex items-center gap-2"><Plus size={16} /> Novo</button>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {isAddingCat && (
                  <div className="p-6 md:p-10 flex gap-4 bg-brand-50/30">
                    <input autoFocus className="flex-1 bg-white border border-brand-200 rounded-2xl px-6 py-4 font-bold text-slate-900 outline-none shadow-sm" placeholder={`Nome da categoria de ${categoryTab === 'INCOME' ? 'receita' : 'despesa'}...`} value={newCatName} onChange={e => setNewCatName(e.target.value)} />
                    <button onClick={addCategory} className="w-16 h-16 bg-brand-600 text-white rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105"><Check size={24} /></button>
                    <button onClick={() => setIsAddingCat(false)} className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center hover:bg-slate-200"><XCircle size={24} /></button>
                  </div>
                )}
                {categories
                  .filter(c => (c.type === categoryTab || (!c.type && categoryTab === 'EXPENSE')))
                  .filter(c => c.name.toLowerCase().includes(catSearch.toLowerCase()))
                  .map(cat => (
                    <div key={cat.id} className="flex flex-col border-b border-slate-50 last:border-0 group">
                      <div className={`p-6 lg:p-8 flex items-center justify-between hover:bg-slate-50/50 transition-all cursor-pointer ${cat.is_archived ? 'opacity-50 grayscale' : ''}`} onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}>
                        <div className="flex items-center gap-4 flex-1">
                          <div className={`w-4 h-4 rounded-full ${cat.color?.split(' ')[0] || 'bg-brand-500'}`} />
                          {editingCatId === cat.id ? (
                            <div className="flex gap-2 flex-1 max-w-sm" onClick={e => e.stopPropagation()}>
                              <input
                                autoFocus
                                className="flex-1 bg-white border border-brand-200 rounded-xl px-4 py-2 font-bold text-slate-900 outline-none text-sm"
                                value={editCatName}
                                onChange={e => setEditCatName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && saveEditCat()}
                              />
                              <button onClick={saveEditCat} className="p-2 bg-emerald-500 text-white rounded-xl"><Check size={16} /></button>
                              <button onClick={() => setEditingCatId(null)} className="p-2 bg-slate-100 text-slate-400 rounded-xl"><XCircle size={16} /></button>
                            </div>
                          ) : (
                            <span className="font-bold text-slate-900 uppercase tracking-widest text-sm flex items-center gap-2">
                              {cat.name}
                              <ChevronRight size={16} className={`text-slate-300 transition-transform ${expandedCat === cat.id ? 'rotate-90' : ''}`} />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <button onClick={() => startEditingCat(cat)} className="p-3 text-slate-200 hover:text-brand-500 hover:bg-brand-50 rounded-xl transition-all opacity-0 group-hover:opacity-100" title="Editar"><Edit3 size={20} /></button>
                          {cat.is_archived ? (
                            <button onClick={() => archiveCategory(cat.id, false)} className="p-3 text-slate-200 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all opacity-0 group-hover:opacity-100" title="Desarquivar"><Check size={20} /></button>
                          ) : (
                            <button onClick={() => archiveCategory(cat.id, true)} className="p-3 text-slate-200 hover:text-amber-500 hover:bg-amber-50 rounded-xl transition-all opacity-0 group-hover:opacity-100" title="Arquivar"><Archive size={20} /></button>
                          )}
                          <button onClick={() => deleteCategory(cat.id)} className="p-3 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100" title="Excluir"><Trash2 size={20} /></button>
                        </div>
                      </div>

                      {/* Subcategories View */}
                      {expandedCat === cat.id && (
                        <div className="pl-14 pr-6 pb-6 bg-slate-50/30 animate-in slide-in-from-top-2 duration-300">
                          <div className="pl-6 border-l-2 border-slate-200 space-y-2">
                            {subcategories.filter(s => s.category_id === cat.id).map(sub => (
                              <div key={sub.id} className="flex items-center justify-between group/sub py-2 px-4 rounded-xl hover:bg-white transition-all">
                                {editingSubcatId === sub.id ? (
                                  <div className="flex gap-2 flex-1 max-w-sm">
                                    <input
                                      autoFocus
                                      className="flex-1 bg-white border border-brand-200 rounded-xl px-3 py-1 font-bold text-slate-700 outline-none text-xs"
                                      value={editSubcatName}
                                      onChange={e => setEditSubcatName(e.target.value)}
                                      onKeyDown={e => e.key === 'Enter' && saveEditSubcat()}
                                    />
                                    <button onClick={saveEditSubcat} className="p-1.5 bg-emerald-500 text-white rounded-lg"><Check size={14} /></button>
                                    <button onClick={() => setEditingSubcatId(null)} className="p-1.5 bg-slate-100 text-slate-400 rounded-lg"><XCircle size={14} /></button>
                                  </div>
                                ) : (
                                  <span className="text-xs font-bold text-slate-600 tracking-wide">{sub.name}</span>
                                )}
                                <div className="flex items-center gap-1">
                                  <button onClick={() => { setEditingSubcatId(sub.id); setEditSubcatName(sub.name); }} className="p-2 text-slate-300 hover:text-brand-500 transition-colors opacity-0 group-hover/sub:opacity-100" title="Editar"><Edit3 size={14} /></button>
                                  <button onClick={() => deleteSubcategory(sub.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover/sub:opacity-100" title="Excluir"><Trash2 size={14} /></button>
                                </div>
                              </div>
                            ))}

                            <div className="flex gap-2 mt-2 px-4 max-w-sm">
                              <input
                                className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold outline-none placeholder:text-slate-300 focus:border-brand-500/30 transition-colors"
                                placeholder="Nova subcategoria..."
                                value={newSubcatName}
                                onChange={e => setNewSubcatName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addSubcategory(cat.id)}
                              />
                              <button onClick={() => addSubcategory(cat.id)} disabled={!newSubcatName} className="p-2 bg-slate-900 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-600 transition-all"><Plus size={16} /></button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                {categories.filter(c => (c.type === categoryTab || (!c.type && categoryTab === 'EXPENSE'))).filter(c => c.name.toLowerCase().includes(catSearch.toLowerCase())).length === 0 && !isAddingCat && (
                  <div className="p-10 text-center text-slate-400 text-sm font-medium">Nenhuma categoria encontrada.</div>
                )}
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

          {activeSection === 'entities' && (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden border-b-4 border-b-slate-100 animate-in slide-in-from-bottom-4 duration-500">
              <div className="p-6 md:p-10 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-slate-50/20">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-slate-900 italic">Entidades e Donos</h2>
                  <p className="text-sm text-slate-400 font-medium">Gestão global de perfis de gastos.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                  <button
                    onClick={() => setShowArchived(prev => !prev)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${showArchived ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}
                  >
                    {showArchived ? 'Ocultar Arquivadas' : 'Ver Arquivadas'}
                  </button>
                  <button onClick={() => setIsAddingEntity(true)} className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-xl hover:bg-brand-600 transition-all flex items-center gap-2">
                    <Plus size={16} /> Nova Entidade
                  </button>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {isAddingEntity && (
                  <div className="p-10 flex gap-4 bg-brand-50/30">
                    <input autoFocus className="flex-1 bg-white border border-brand-200 rounded-2xl px-6 py-4 font-bold text-slate-900 outline-none shadow-sm" placeholder="Nome da entidade (Ex: Família, Empresa, Pessoal)..." value={newEntityName} onChange={e => setNewEntityName(e.target.value)} />
                    <button onClick={addEntity} className="w-16 h-16 bg-brand-600 text-white rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105"><Check size={24} /></button>
                    <button onClick={() => setIsAddingEntity(false)} className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center hover:bg-slate-200"><XCircle size={24} /></button>
                  </div>
                )}
                {entities.map((ent) => (
                  <div key={ent.id} className={`p-8 flex items-center justify-between group hover:bg-slate-50/50 transition-all ${ent.is_archived ? 'opacity-50 grayscale' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                        <Building2 size={20} />
                      </div>
                      <span className="font-bold text-slate-900 uppercase tracking-widest text-sm">{ent.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {ent.name !== 'Pessoal' && (
                        <>
                          {ent.is_archived ? (
                            <button onClick={() => archiveEntity(ent.id, false)} className="p-3 text-slate-200 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all opacity-0 group-hover:opacity-100" title="Desarquivar"><Check size={20} /></button>
                          ) : (
                            <button onClick={() => archiveEntity(ent.id, true)} className="p-3 text-slate-200 hover:text-amber-500 hover:bg-amber-50 rounded-xl transition-all opacity-0 group-hover:opacity-100" title="Arquivar"><Archive size={20} /></button>
                          )}
                          <button onClick={() => deleteEntity(ent.id, ent.name)} className="p-3 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100" title="Excluir">
                            <Trash2 size={20} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {entities.length === 0 && !isAddingEntity && (
                  <div className="p-10 text-center text-slate-400 text-sm font-medium">Nenhuma entidade cadastrada.</div>
                )}
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
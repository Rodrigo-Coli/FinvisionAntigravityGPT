import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Gem,
  BellRing,
  Navigation,
  Home,
  Landmark,
  CreditCard,
  History as HistoryIcon,
  FileCheck,
  Target,
  PieChart
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { useSubscription } from '../contexts/SubscriptionContext';
import { DateUtils } from '../lib/dateUtils';
import { requestNotificationPermission, showLocalNotification, subscribeUserToPush } from '../lib/pushUtils';
import UsageMeter from '../components/subscription/UsageMeter';
import PlanUpgradeModal from '../components/subscription/PlanUpgradeModal';
import { useToast } from '../contexts/ToastContext';

export const ensureInvestmentCategoriesAndSubcategories = async (userId: string) => {
  if (!supabase) return;
  try {
    // 1. Get existing 'Investimento' categories
    const { data: existingCats } = await supabase
      .from('categories')
      .select('id, name, type')
      .eq('user_id', userId)
      .eq('name', 'Investimento')
      .eq('is_archived', false);

    const cats = existingCats || [];
    let expCat = cats.find((c: any) => c.type === 'EXPENSE');
    let incCat = cats.find((c: any) => c.type === 'INCOME');

    // Create Expense category if missing
    if (!expCat) {
      const { data: newExp, error } = await supabase
        .from('categories')
        .insert({
          user_id: userId,
          name: 'Investimento',
          type: 'EXPENSE',
          color: 'bg-brand-50 text-brand-600',
          is_archived: false
        })
        .select('id')
        .single();
      if (!error && newExp) expCat = { id: newExp.id, name: 'Investimento', type: 'EXPENSE' };
    }

    // Create Income category if missing
    if (!incCat) {
      const { data: newInc, error } = await supabase
        .from('categories')
        .insert({
          user_id: userId,
          name: 'Investimento',
          type: 'INCOME',
          color: 'bg-brand-50 text-brand-600',
          is_archived: false
        })
        .select('id')
        .single();
      if (!error && newInc) incCat = { id: newInc.id, name: 'Investimento', type: 'INCOME' };
    }

    // 2. Fetch existing subcategories under both categories
    const activeCatIds = [];
    if (expCat) activeCatIds.push(expCat.id);
    if (incCat) activeCatIds.push(incCat.id);

    if (activeCatIds.length === 0) return;

    const { data: existingSubs } = await supabase
      .from('subcategories')
      .select('id, name, category_id')
      .eq('user_id', userId)
      .in('category_id', activeCatIds);

    const subs = existingSubs || [];
    const inserts = [];

    // Check expense subcategories
    if (expCat) {
      const hasApp = subs.some((s: any) => s.category_id === expCat.id && s.name === 'Aplicações');
      if (!hasApp) {
        inserts.push({ user_id: userId, category_id: expCat.id, name: 'Aplicações' });
      }
    }

    // Check income subcategories
    if (incCat) {
      const requiredIncomeSubs = ['Resgate de Capital', 'Juros Recebidos', 'Juros Acumulados'];
      for (const subName of requiredIncomeSubs) {
        const hasSub = subs.some((s: any) => s.category_id === incCat.id && s.name === subName);
        if (!hasSub) {
          inserts.push({ user_id: userId, category_id: incCat.id, name: subName });
        }
      }
    }

    // Bulk insert subcategories if any is missing
    if (inserts.length > 0) {
      await supabase.from('subcategories').insert(inserts);
    }
  } catch (err) {
    console.error('Error ensuring investment categories/subcategories:', err);
  }
};

const SettingsPage: React.FC = () => {
  const { toast } = useToast();
  type SettingsSection = 'general' | 'navigation' | 'categories' | 'establishments' | 'products' | 'backup' | 'currencies' | 'rates' | 'entities' | 'subscription' | 'changelog';
  const SETTINGS_SECTIONS: SettingsSection[] = ['general', 'navigation', 'categories', 'establishments', 'products', 'backup', 'currencies', 'rates', 'entities', 'subscription', 'changelog'];
  const { subscription, loadingSub } = useSubscription();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('section') as SettingsSection | null;
  const activeSection: SettingsSection = sectionParam && SETTINGS_SECTIONS.includes(sectionParam) ? sectionParam : 'general';
  const setActiveSection = (section: SettingsSection) => {
    setSearchParams(section === 'general' ? {} : { section }, { replace: false });
  };
  const [changelogHistory, setChangelogHistory] = useState<any[] | null>(null);
  const [loadingChangelog, setLoadingChangelog] = useState(false);

  useEffect(() => {
    if (activeSection === 'changelog' && changelogHistory === null && !loadingChangelog) {
      setLoadingChangelog(true);
      fetch(`/changelog-history.json?cb=${Date.now()}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => setChangelogHistory(Array.isArray(data) ? data : []))
        .catch(() => setChangelogHistory([]))
        .finally(() => setLoadingChangelog(false));
    }
  }, [activeSection, changelogHistory, loadingChangelog]);
  const [settings, setSettings] = useState({
    email_notifications: true,
    dark_mode_force: false,
    auto_dark_mode: false,
    iof_rate: 2.38,
    spread_rate: 4.00,
    whatsapp_enabled: false,
    whatsapp_number: '',
    push_enabled: false
  });
  const [editingIof, setEditingIof] = useState(2.38);
  const [editingSpread, setEditingSpread] = useState(4.00);

  useEffect(() => {
    setEditingIof(settings.iof_rate);
    setEditingSpread(settings.spread_rate);
  }, [settings.iof_rate, settings.spread_rate]);

  const [profile, setProfile] = useState<any>(null);
  const [startHiddenByDefault, setStartHiddenByDefault] = useState(
    localStorage.getItem('finvision_start_hidden_by_default') === 'true'
  );

  const toggleStartHiddenByDefault = (val: boolean) => {
    localStorage.setItem('finvision_start_hidden_by_default', String(val));
    setStartHiddenByDefault(val);
    toast('Configuração de privacidade salva!', 'success');
  };

  const [defaultIncludeNonSumming, setDefaultIncludeNonSumming] = useState(
    localStorage.getItem('finvision_default_include_non_summing') === 'true'
  );

  const toggleDefaultIncludeNonSumming = (val: boolean) => {
    localStorage.setItem('finvision_default_include_non_summing', String(val));
    setDefaultIncludeNonSumming(val);
    toast('Configuração de filtro de contas salva!', 'success');
  };
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
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      if (activeSection === 'general' || activeSection === 'rates' || activeSection === 'navigation') {
        const { data } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
        if (data) {
          setSettings({
            email_notifications: data.email_notifications,
            dark_mode_force: data.dark_mode_force || false,
            auto_dark_mode: data.auto_dark_mode,
            iof_rate: data.iof_rate || 2.38,
            spread_rate: data.spread_rate || 4.00,
            whatsapp_enabled: data.whatsapp_enabled || false,
            whatsapp_number: data.whatsapp_number || '',
            push_enabled: data.push_enabled || false
          });
          // Cache and apply theme on load
          const forceMode = data.dark_mode_force || false;
          const autoDark = data.auto_dark_mode || false;
          localStorage.setItem('finvision_dark_mode_force', String(forceMode));
          localStorage.setItem('finvision_auto_dark_mode', String(autoDark));
          if (forceMode) {
            document.documentElement.classList.add('dark');
          } else if (autoDark) {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDark) {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
        
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (prof) setProfile(prof);
      }

      if (activeSection === 'categories') {
        // Auto-provision dynamic investment categories & subcategories
        await ensureInvestmentCategoriesAndSubcategories(user.id);

        let query = supabase.from('categories').select('*').eq('user_id', user.id).order('name');
        if (!showArchived) query = query.eq('is_archived', false);
        const { data } = await query;

        // Deduplicate categories by name
        const rawCats = data || [];
        const uniqueCats: any[] = [];
        const seenCats = new Set<string>();
        for (const c of rawCats) {
          if (!c.name) continue;
          const nameTrimmed = c.name.trim().toLowerCase();
          if (!seenCats.has(nameTrimmed)) {
            seenCats.add(nameTrimmed);
            uniqueCats.push(c);
          }
        }
        setCategories(uniqueCats);

        try {
          const { data: subData } = await supabase.from('subcategories').select('*').eq('user_id', user.id).order('name');

          // Deduplicate subcategories by name and category_id
          const rawSubs = subData || [];
          const uniqueSubs: any[] = [];
          const seenSubs = new Set<string>();
          for (const s of rawSubs) {
            if (!s.name) continue;
            const key = `${s.name.trim().toLowerCase()}::${s.category_id}`;
            if (!seenSubs.has(key)) {
              seenSubs.add(key);
              uniqueSubs.push(s);
            }
          }
          setSubcategories(uniqueSubs);
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

        // Deduplicate entities by name
        const rawEntities = data || [];
        const uniqueEntities: any[] = [];
        const seenEntities = new Set<string>();
        for (const e of rawEntities) {
          if (!e.name) continue;
          const nameTrimmed = e.name.trim().toLowerCase();
          if (!seenEntities.has(nameTrimmed)) {
            seenEntities.add(nameTrimmed);
            uniqueEntities.push(e);
          }
        }
        setEntities(uniqueEntities);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const addCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) {
      toast('O nome da categoria não pode ser vazio.', 'warning');
      return;
    }
    if (!supabase) return;

    // Check duplicate
    const exists = categories.some(c => c.name.trim().toLowerCase() === trimmed.toLowerCase() && c.type === categoryTab);
    if (exists) {
      toast('Esta categoria já existe.', 'warning');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      await supabase.from('categories').insert({ user_id: user.id, name: trimmed, type: categoryTab, color: 'bg-brand-50 text-brand-600' });
      setNewCatName(''); 
      setIsAddingCat(false); 
      fetchData();
      toast('Categoria adicionada com sucesso!', 'success');
    } catch (err) { 
      toast('Erro ao adicionar categoria.', 'error');
    }
  };

  const archiveCategory = async (id: string, archive: boolean = true) => {
    if (!supabase) return;
    try {
      await supabase.from('categories').update({ is_archived: archive }).eq('id', id);
      fetchData();
      toast(archive ? 'Categoria arquivada com sucesso!' : 'Categoria reativada com sucesso!', 'success');
    } catch (err) { 
      toast(`Erro ao ${archive ? 'arquivar' : 'desarquivar'} categoria.`, 'error');
    }
  };

  const deleteCategory = async (id: string) => {
    const cat = categories.find(c => c.id === id);
    if (cat && cat.name.toLowerCase() === 'investimento') {
      toast("A categoria 'Investimento' é essencial para as análises e não pode ser excluída.", 'warning');
      return;
    }
    if (!supabase || !confirm('Deseja excluir permanentemente? (Transações existentes manterão o nome da categoria mas perderão o vínculo de ID)')) return;
    try { 
      await supabase.from('categories').delete().eq('id', id); 
      fetchData(); 
      toast('Categoria excluída com sucesso!', 'success');
    } catch (err) { 
      toast('Erro ao excluir categoria. Ela pode estar vinculada a lançamentos ativos.', 'error');
    }
  };

  const startEditingCat = (cat: any) => {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
  };

  const saveEditCat = async () => {
    const trimmed = editCatName.trim();
    if (!editingCatId || !supabase) return;
    if (!trimmed) {
      toast('O nome da categoria não pode ser vazio.', 'warning');
      return;
    }

    const cat = categories.find(c => c.id === editingCatId);
    if (cat && cat.name.toLowerCase() === 'investimento') {
      toast("A categoria 'Investimento' é essencial para as análises do Zyvion e não pode ser renomeada.", 'warning');
      setEditingCatId(null);
      return;
    }

    // Check duplicate
    const exists = categories.some(c => c.id !== editingCatId && c.name.trim().toLowerCase() === trimmed.toLowerCase() && c.type === cat?.type);
    if (exists) {
      toast('Esta categoria já existe.', 'warning');
      return;
    }

    try {
      await supabase.from('categories').update({ name: trimmed }).eq('id', editingCatId);
      setEditingCatId(null);
      fetchData();
      toast('Categoria atualizada com sucesso!', 'success');
    } catch (err) { 
      toast('Erro ao salvar categoria.', 'error');
    }
  };

  // SUBCATEGORIES CRUD
  const addSubcategory = async (categoryId: string) => {
    const trimmed = newSubcatName.trim();
    if (!trimmed) {
      toast('O nome da subcategoria não pode ser vazio.', 'warning');
      return;
    }
    if (!supabase) return;

    // Check duplicate
    const exists = subcategories.some(s => s.category_id === categoryId && s.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      toast('Esta subcategoria já existe nesta categoria.', 'warning');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      await supabase.from('subcategories').insert({ user_id: user.id, category_id: categoryId, name: trimmed });
      setNewSubcatName('');
      fetchData();
      toast('Subcategoria adicionada com sucesso!', 'success');
    } catch (err) { 
      toast('Erro ao adicionar subcategoria.', 'error');
    }
  };

  const deleteSubcategory = async (id: string) => {
    const sub = subcategories.find(s => s.id === id);
    if (sub && ['juros recebidos', 'juros acumulados', 'aplicações', 'aplicacoes', 'resgate de capital'].includes(sub.name.toLowerCase())) {
      toast(`A subcategoria '${sub.name}' é essencial para o sistema e não pode ser excluída.`, 'warning');
      return;
    }
    if (!supabase || !confirm('Deseja excluir permanentemente a subcategoria?')) return;
    try { 
      await supabase.from('subcategories').delete().eq('id', id); 
      fetchData(); 
      toast('Subcategoria excluída com sucesso!', 'success');
    } catch (err) { 
      toast('Erro ao excluir subcategoria.', 'error');
    }
  };

  const saveEditSubcat = async () => {
    const trimmed = editSubcatName.trim();
    if (!editingSubcatId || !supabase) return;
    if (!trimmed) {
      toast('O nome da subcategoria não pode ser vazio.', 'warning');
      return;
    }

    const sub = subcategories.find(s => s.id === editingSubcatId);
    if (sub && ['juros recebidos', 'juros acumulados', 'aplicações', 'aplicacoes', 'resgate de capital'].includes(sub.name.toLowerCase())) {
      toast(`A subcategoria '${sub.name}' é essencial para o sistema e não pode ser renomeada.`, 'warning');
      setEditingSubcatId(null);
      return;
    }

    // Check duplicate
    const exists = subcategories.some(s => s.id !== editingSubcatId && s.category_id === sub?.category_id && s.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      toast('Esta subcategoria já existe nesta categoria.', 'warning');
      return;
    }

    try {
      await supabase.from('subcategories').update({ name: trimmed }).eq('id', editingSubcatId);
      setEditingSubcatId(null);
      fetchData();
      toast('Subcategoria atualizada com sucesso!', 'success');
    } catch (err) { 
      toast('Erro ao salvar subcategoria.', 'error');
    }
  };

  const updateSetting = async (key: string, value: any) => {
    if (!supabase) return;
    
    // Sanitizar número do WhatsApp
    if (key === 'whatsapp_number') {
      const digitsOnly = value.replace(/\D/g, '');
      let formatted = digitsOnly;
      if (formatted.length >= 10 && formatted.length <= 11 && !formatted.startsWith('55')) {
        formatted = '55' + formatted;
      }
      value = formatted;
    }

    if (key === 'dark_mode_force') {
      localStorage.setItem('finvision_dark_mode_force', String(value));
      if (value) {
        document.documentElement.classList.add('dark');
        // When forcing dark mode, turn off auto mode to avoid conflicts
        if (settings.auto_dark_mode) {
          setSettings(prev => ({ ...prev, auto_dark_mode: false }));
          localStorage.setItem('finvision_auto_dark_mode', 'false');
          await supabase!.from('user_settings').upsert({ user_id: (await supabase!.auth.getSession()).data.session?.user?.id, auto_dark_mode: false, updated_at: DateUtils.getNow().toISOString() });
        }
      } else {
        // Recheck auto mode when force is disabled
        const autoDark = settings.auto_dark_mode;
        if (autoDark) {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          if (prefersDark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    }

    if (key === 'auto_dark_mode') {
      localStorage.setItem('finvision_auto_dark_mode', String(value));
      if (value) {
        // Turn off force mode when enabling auto
        if (settings.dark_mode_force) {
          setSettings(prev => ({ ...prev, dark_mode_force: false }));
          localStorage.setItem('finvision_dark_mode_force', 'false');
          await supabase!.from('user_settings').upsert({ user_id: (await supabase!.auth.getSession()).data.session?.user?.id, dark_mode_force: false, updated_at: DateUtils.getNow().toISOString() });
        }
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } else {
        document.documentElement.classList.remove('dark');
      }
    }

    const previousSettings = { ...settings };
    setSettings(prev => ({ ...prev, [key]: value }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, [key]: value, updated_at: DateUtils.getNow().toISOString() });
      if (error) throw error;
      toast('Configuração salva com sucesso!', 'success');
    } catch (err) { 
      setSettings(previousSettings); 
      console.error(`Erro ao atualizar configuração [${key}]:`, err);
      toast('Não foi possível salvar a alteração. Verifique sua conexão.', 'error');
    }
  };

  const addEntity = async () => {
    const trimmed = newEntityName.trim();
    if (!trimmed) {
      toast('O nome do perfil não pode ser vazio.', 'warning');
      return;
    }
    if (!supabase) return;

    // Check duplicate
    const exists = entities.some(e => e.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      toast('Este perfil já existe.', 'warning');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      await supabase.from('entities').upsert({ user_id: user.id, name: trimmed }, { onConflict: 'user_id, name' });
      setNewEntityName(''); 
      setIsAddingEntity(false); 
      fetchData();
      toast('Perfil adicionado com sucesso!', 'success');
    } catch (err) { 
      toast('Erro ao adicionar perfil.', 'error');
    }
  };

  const deleteEntity = async (id: string, name: string) => {
    if (name === 'Pessoal') {
      toast('O perfil padrão "Pessoal" é essencial para o sistema e não pode ser excluído.', 'warning');
      return;
    }
    if (!supabase || !confirm(`Deseja excluir o perfil "${name}"? Registros existentes não serão alterados.`)) return;
    try {
      const { error } = await supabase.from('entities').delete().eq('id', id);
      if (error) throw error;
      fetchData();
      toast('Perfil excluído com sucesso!', 'success');
    } catch (err) { 
      toast('Erro ao excluir perfil. Ele pode estar vinculado a contas ou transações ativas. Considere arquivá-lo.', 'error');
    }
  };

  const archiveEntity = async (id: string, archive: boolean = true) => {
    if (!supabase) return;
    try {
      await supabase.from('entities').update({ is_archived: archive }).eq('id', id);
      fetchData();
      toast(archive ? 'Perfil arquivado com sucesso!' : 'Perfil reativado com sucesso!', 'success');
    } catch (err) { 
      toast(`Erro ao ${archive ? 'arquivar' : 'desarquivar'} perfil.`, 'error');
    }
  };

  const toggleEntityTotals = async (id: string, currentStatus: boolean) => {
    if (!supabase) return;
    try {
      await supabase.from('entities').update({ include_in_totals: !currentStatus }).eq('id', id);
      fetchData();
      toast('Configuração de perfil atualizada!', 'success');
    } catch (err) { 
      toast('Erro ao atualizar configuração do perfil.', 'error');
    }
  };

  const menuItems = [
    { id: 'general', label: 'Preferências', icon: <SettingsIcon size={18} /> },
    { id: 'navigation', label: 'Navegação', icon: <Navigation size={18} /> },
    { id: 'subscription', label: 'Meu Plano', icon: <Gem size={18} /> },
    { id: 'categories', label: 'Categorias', icon: <Tags size={18} /> },
    { id: 'entities', label: 'Perfis / Donos', icon: <Building2 size={18} /> },
    { id: 'establishments', label: 'Estabelecimentos', icon: <Store size={18} /> },
    { id: 'rates', label: 'Taxas e Conversão', icon: <Percent size={18} /> },
    { id: 'backup', label: 'Backup e Dados', icon: <Cloud size={18} /> },
    { id: 'changelog', label: 'Novidades', icon: <Bell size={18} />, divider: true },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ajustes do Sistema</h1>
          <p className="text-sm text-slate-500 font-medium">Configurações globais, metadados e infraestrutura.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-10">
        {/* SIDEBAR NAVIGATION — mobile only; no menu lateral tem submenu equivalente no desktop */}
        <aside className="w-full lg:hidden shrink-0">
          {/* Mobile: Horizontal scrollable Pill Tabs */}
          <div className="block lg:hidden overflow-x-auto scrollbar-none py-2 border-b border-slate-100 -mx-4 px-4">
            <div className="flex gap-2.5 whitespace-nowrap">
              {menuItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id as any)}
                  className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                    activeSection === item.id
                      ? 'bg-brand-50 text-brand-700 border-brand-100 shadow-sm font-black'
                      : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-100'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {/* Desktop: Full sidebar buttons */}
          <div className="hidden lg:flex flex-col gap-2">
            {menuItems.map((item) => (
              <React.Fragment key={item.id}>
                {item.divider && <div className="h-px bg-slate-100 my-4 mx-4"></div>}
                <button
                  onClick={() => setActiveSection(item.id as any)}
                  className={`flex items-center gap-4 px-6 py-4 rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-all border whitespace-nowrap ${
                    activeSection === item.id
                      ? 'bg-brand-50 text-brand-700 font-black border-brand-100 shadow-sm'
                      : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-100'
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
          {activeSection === 'changelog' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-xl font-bold text-slate-900 italic">Novidades</h2>
                <p className="text-sm text-slate-500 font-medium">Histórico de tudo que já foi corrigido e melhorado no sistema, na ordem em que aconteceu.</p>
              </div>

              {loadingChangelog && (
                <div className="flex items-center gap-2 text-sm text-slate-400 font-semibold py-8 justify-center">
                  <Loader2 size={16} className="animate-spin" /> Carregando histórico...
                </div>
              )}

              {!loadingChangelog && changelogHistory && changelogHistory.length === 0 && (
                <p className="text-sm text-slate-400 font-medium">Nenhum registro de atualização ainda.</p>
              )}

              {!loadingChangelog && changelogHistory && changelogHistory.map((entry, idx) => (
                <div key={entry.version || idx} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-black text-slate-900">{entry.title}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-brand-600 bg-brand-50 px-2 py-0.5 rounded-lg border border-brand-100">v{entry.version}</span>
                      {entry.date && <span className="text-[10px] font-bold text-slate-400">{entry.date}</span>}
                    </div>
                  </div>

                  {entry.benefits && entry.benefits.length > 0 && (
                    <div className="space-y-2">
                      {entry.benefits.map((b: any, bIdx: number) => (
                        <div key={bIdx} className="flex gap-2.5 items-start bg-slate-50/60 p-3 rounded-2xl border border-slate-100/60">
                          <Check size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[11px] font-black text-slate-900">{b.title}</p>
                            <p className="text-[10px] font-bold text-slate-500 leading-normal">{b.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeSection === 'subscription' && (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              {/* HERO DO PLANO */}
              <div className="bg-brand-900 rounded-[40px] p-10 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl opacity-50" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
                        <Gem size={28} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] bg-white/20 px-4 py-2 rounded-full border border-white/10">
                        {loadingSub ? 'Carregando...' : (subscription?.status === 'trialing' ? 'Periodo Trial' : 'Plano Ativo')}
                      </span>
                    </div>
                    <h2 className="text-4xl font-black tracking-tight">{subscription?.plans?.name || 'Gratuito'}</h2>
                    <div className="flex flex-wrap items-center gap-4 text-brand-200 font-bold text-sm">
                      <div className="flex items-center gap-2">
                        <Shield size={16} />
                        Status: <span className="text-white uppercase tracking-widest text-xs">{subscription?.status || 'ativo'}</span>
                      </div>
                      {subscription?.current_period_end && (
                        <div className="flex items-center gap-2">
                          <Clock size={16} />
                          Renova: <span className="text-white">{DateUtils.formatDisplayDate(subscription.current_period_end)}</span>
                        </div>
                      )}
                      {subscription?.plans?.price_cents != null && (
                        <div className="flex items-center gap-2">
                          <span className="text-white font-black text-lg">R$ {((subscription.plans.price_cents as number) / 100).toFixed(2).replace('.', ',')}/mes</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* METER DE CONSUMO */}
                  <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20 min-w-[260px] space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-brand-300 text-center">Consumo do Mes</p>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold">
                          <span>Escaneamentos IA</span>
                          <span>
                            {(subscription as any)?.ai_scans_used ?? 0} / {subscription?.plans?.ai_scans_limit === -1 ? '∞' : (subscription?.plans?.ai_scans_limit ?? '—')}
                          </span>
                        </div>
                        {(subscription?.plans?.ai_scans_limit ?? 0) !== -1 && (
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${Math.min(100, Math.round(((subscription as any)?.ai_scans_used ?? 0) / (subscription?.plans?.ai_scans_limit ?? 1) * 100))}%`,
                                background: (() => {
                                  const pct = Math.round(((subscription as any)?.ai_scans_used ?? 0) / (subscription?.plans?.ai_scans_limit ?? 1) * 100);
                                  return pct >= 90 ? '#f43f5e' : pct >= 70 ? '#f59e0b' : '#10b981';
                                })()
                              }}
                            />
                          </div>
                        )}
                      </div>
                      {(subscription as any)?.ai_scans_reset_at && (
                        <p className="text-[10px] text-brand-300 font-bold text-center">
                          Resetado em {DateUtils.formatDisplayDate((subscription as any).ai_scans_reset_at)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setShowUpgradeModal(true)}
                      className="w-full py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all border border-white/20 flex items-center justify-center gap-2"
                    >
                      Ver Planos Disponiveis
                    </button>
                  </div>
                </div>
              </div>

              {/* DETALHES + UPGRADE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* FUNCIONALIDADES ATIVAS */}
                <div className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-100 dark:border-slate-800 p-10 shadow-sm">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mb-6 flex items-center gap-3 italic">
                    <Check className="text-brand-600" /> Funcionalidades do Plano
                  </h3>
                  <ul className="space-y-3">
                    {Object.entries(subscription?.plans?.features || {}).filter(([, v]) => v).slice(0, 8).map(([k], i) => {
                      const labels: Record<string, string> = {
                        dashboard: 'Dashboard Financeiro', accounts: 'Contas Bancarias', cards: 'Cartoes de Credito',
                        reconcile: 'Conciliacao Bancaria', ai_scanner: 'Scanner de Cupom IA', ai_comparator: 'Comparador de Precos',
                        ai_diagnosis: 'Diagnostico Patrimonial', goals: 'Metas Financeiras', reports_advanced: 'Relatorios Avancados',
                        multi_user: 'Multi-usuario (Familia)', priority_support: 'Suporte Prioritario',
                        whatsapp_notifications: 'Notificacoes WhatsApp', liabilities: 'Dividas e Passivos',
                        physical_assets: 'Bens Fisicos', budgets: 'Orcamentos', ofx_import: 'Importacao OFX/CSV',
                      };
                      return (
                        <li key={i} className="flex items-center gap-3 text-sm font-bold text-slate-600 dark:text-slate-300">
                          <div className="w-5 h-5 rounded-full bg-brand-50 dark:bg-brand-950/30 flex items-center justify-center flex-shrink-0">
                            <Check size={10} className="text-brand-600" />
                          </div>
                          {labels[k] || k}
                        </li>
                      );
                    })}
                    {!subscription?.plans?.features && (
                      <li className="text-sm text-slate-400 italic">Funcionalidades basicas do plano gratuito.</li>
                    )}
                  </ul>
                </div>

                {/* CONSUMO DETALHADO + CTA UPGRADE */}
                <div className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-100 dark:border-slate-800 p-10 shadow-sm flex flex-col justify-between gap-8">
                  <div className="space-y-6">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white italic">Meu Consumo</h3>
                    <UsageMeter
                      used={(subscription as any)?.ai_scans_used ?? 0}
                      limit={subscription?.plans?.ai_scans_limit ?? 5}
                      resetAt={(subscription as any)?.ai_scans_reset_at}
                      onUpgradeClick={() => setShowUpgradeModal(true)}
                    />
                  </div>
                  <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Precisa de mais capacidade? Faca upgrade para um plano maior e desbloqueie mais funcionalidades.</p>
                    <button
                      onClick={() => setShowUpgradeModal(true)}
                      className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-brand-600 dark:hover:bg-brand-50 transition-all flex items-center justify-center gap-2 shadow-lg"
                    >
                      Ver Opcoes de Upgrade
                    </button>
                  </div>
                </div>
              </div>

              {/* MODAL DE UPGRADE */}
              {showUpgradeModal && (
                <PlanUpgradeModal
                  currentPlanId={subscription?.plan_id}
                  currentPlanSlug={subscription?.plans?.name?.toLowerCase()}
                  onClose={() => setShowUpgradeModal(false)}
                />
              )}
            </div>
          )}

          {activeSection === 'general' && (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-10 space-y-10">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-900 italic">Interface e Alertas</h2>
                <p className="text-sm text-slate-500 font-medium">Ajuste como o Zyvion interage com você.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-50 hover:bg-white transition-all">
                  <div>
                    <p className="font-bold text-slate-900">Notificações por Email</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Vencimentos e alertas críticos.</p>
                  </div>
                  <button onClick={() => updateSetting('email_notifications', !settings.email_notifications)} className={`w-14 h-8 rounded-full p-1 transition-all ${settings.email_notifications ? 'bg-brand-600' : 'bg-slate-200'}`}>
                    <div className={`w-6 h-6 bg-white rounded-full shadow-sm transition-all transform ${settings.email_notifications ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-50 hover:bg-white transition-all gap-4">
                  <div>
                    <p className="font-bold text-slate-900 flex items-center gap-2"><Smartphone size={16} /> Notificações via WhatsApp</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Lembretes de faturas e vencimentos financeiros automáticos.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    {settings.whatsapp_enabled && (
                      <input 
                        type="text" 
                        inputMode="tel"
                        placeholder="+55 11 99999-9999" 
                        value={settings.whatsapp_number} 
                        onChange={e => updateSetting('whatsapp_number', e.target.value)}
                        className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold w-40 outline-none focus:border-brand-500 transition-colors"
                      />
                    )}
                    <button onClick={() => updateSetting('whatsapp_enabled', !settings.whatsapp_enabled)} className={`w-14 h-8 shrink-0 rounded-full p-1 transition-all ${settings.whatsapp_enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                      <div className={`w-6 h-6 bg-white rounded-full shadow-sm transition-all transform ${settings.whatsapp_enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-50 hover:bg-white transition-all space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-slate-900 flex items-center gap-2"><BellRing size={16} /> Notificações do Dispositivo</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Alertas de vencimentos, faturas e recebimentos.</p>
                    </div>
                    <button onClick={async () => {
                      const newStatus = !settings.push_enabled;
                      if (newStatus) {
                        if (Notification.permission === 'denied') {
                          alert('As notificações estão BLOQUEADAS no seu navegador.\n\nPara ativar:\n1. Toque no ícone de cadeado/informações na barra de endereços\n2. Vá em "Permissões do site" ou "Configurações"\n3. Mude "Notificações" para "Permitir"\n4. Recarregue a página.');
                          return;
                        }
                        const permission = await requestNotificationPermission();
                        if (permission === 'granted') {
                          const sub = await subscribeUserToPush();
                          if (sub) {
                            await updateSetting('push_subscription', sub);
                          }
                          await updateSetting('push_enabled', true);
                          await showLocalNotification('Zyvion ✓', 'Notificações ativadas com sucesso! Você será alertado sobre vencimentos.', { url: '/', tag: 'welcome' });
                        } else {
                          alert('Permissão negada. Você pode ativar nas configurações do navegador.');
                        }
                      } else {
                        await updateSetting('push_enabled', false);
                      }
                    }} className={`w-14 h-8 shrink-0 rounded-full p-1 transition-all ${settings.push_enabled && typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'bg-brand-600' : 'bg-slate-200'}`}>
                      <div className={`w-6 h-6 bg-white rounded-full shadow-sm transition-all transform ${settings.push_enabled && typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {/* Status da permissão */}
                  {typeof Notification !== 'undefined' && (
                    <div className={`flex items-center gap-3 p-3 rounded-2xl text-xs font-bold ${
                      Notification.permission === 'granted' ? 'bg-emerald-50 text-emerald-700' :
                      Notification.permission === 'denied' ? 'bg-rose-50 text-rose-700' :
                      'bg-amber-50 text-amber-700'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${
                        Notification.permission === 'granted' ? 'bg-emerald-500' :
                        Notification.permission === 'denied' ? 'bg-rose-500' : 'bg-amber-400'
                      }`} />
                      {Notification.permission === 'granted' ? '✓ Permitido — notificações ativas' :
                       Notification.permission === 'denied' ? '✗ Bloqueado — altere nas configurações do navegador' :
                       '⚠ Aguardando permissão — toque no toggle para ativar'}
                    </div>
                  )}

                  {/* Botão de teste */}
                  {typeof Notification !== 'undefined' && Notification.permission === 'granted' && (
                    <button
                      onClick={async () => {
                        await showLocalNotification('Zyvion ✓', 'Notificações funcionando! Você será alertado sobre vencimentos.', { url: '/', tag: 'test' });
                      }}
                      className="w-full py-2.5 bg-white border border-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-brand-500 hover:text-brand-600 transition-all"
                    >
                      Enviar notificação de teste
                    </button>
                  )}

                  {/* Instrução iOS */}
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-1">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">📱 Para receber notificações no celular:</p>
                    <ol className="text-[10px] font-bold text-amber-600 space-y-1 list-decimal list-inside">
                      <li>Abra o Zyvion no <span className="font-black">Safari (iOS)</span> ou <span className="font-black">Chrome (Android)</span></li>
                      <li>Toque em <span className="font-black">&quot;Compartilhar&quot; → &quot;Adicionar à Tela de Início&quot;</span> (iOS) ou <span className="font-black">&quot;Instalar app&quot;</span> (Android)</li>
                      <li>Abra o app instalado e ative as notificações aqui</li>
                    </ol>
                  </div>
                </div>

                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-50 hover:bg-white transition-all">
                  <div>
                    <p className="font-bold text-slate-900">🌙 Modo Dark Manual</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Força o tema escuro independente do sistema.</p>
                  </div>
                  <button onClick={() => updateSetting('dark_mode_force', !settings.dark_mode_force)} className={`w-14 h-8 rounded-full p-1 transition-all ${settings.dark_mode_force ? 'bg-brand-600' : 'bg-slate-200'}`}>
                    <div className={`w-6 h-6 bg-white rounded-full shadow-sm transition-all transform ${settings.dark_mode_force ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-50 hover:bg-white transition-all">
                  <div>
                    <p className="font-bold text-slate-900">☀️ Modo Dark Automático</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Acompanha o sistema operacional.</p>
                  </div>
                  <button onClick={() => updateSetting('auto_dark_mode', !settings.auto_dark_mode)} className={`w-14 h-8 rounded-full p-1 transition-all ${settings.auto_dark_mode ? 'bg-brand-600' : 'bg-slate-200'}`}>
                    <div className={`w-6 h-6 bg-white rounded-full shadow-sm transition-all transform ${settings.auto_dark_mode ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-50 hover:bg-white transition-all">
                  <div>
                    <p className="font-bold text-slate-900">🔒 Ocultar Números ao Iniciar</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Valores e saldos iniciarão ocultos por padrão na Home.</p>
                  </div>
                  <button onClick={() => toggleStartHiddenByDefault(!startHiddenByDefault)} className={`w-14 h-8 rounded-full p-1 transition-all ${startHiddenByDefault ? 'bg-brand-600' : 'bg-slate-200'}`}>
                    <div className={`w-6 h-6 bg-white rounded-full shadow-sm transition-all transform ${startHiddenByDefault ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-50 hover:bg-white transition-all">
                  <div>
                    <p className="font-bold text-slate-900">💡 Incluir Contas Não Cumulativas nos Filtros</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Por padrão, selecionar e somar todas as contas (incluindo as que não somam no saldo geral).</p>
                  </div>
                  <button onClick={() => toggleDefaultIncludeNonSumming(!defaultIncludeNonSumming)} className={`w-14 h-8 rounded-full p-1 transition-all ${defaultIncludeNonSumming ? 'bg-brand-600' : 'bg-slate-200'}`}>
                    <div className={`w-6 h-6 bg-white rounded-full shadow-sm transition-all transform ${defaultIncludeNonSumming ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'navigation' && (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-10 space-y-10 animate-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-900 italic">Barra de Navegação</h2>
                <p className="text-sm text-slate-500 font-medium">Escolha o que aparece na sua barra inferior (Mobile).</p>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-50 hover:bg-white transition-all">
                  <div>
                    <p className="font-bold text-slate-900">Exibir Barra Inferior</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Ativa ou oculta totalmente a barra flutuante.</p>
                  </div>
                  <button 
                    onClick={async () => {
                      const oldPrefs = profile?.preferences;
                      const newValue = !(profile?.preferences?.show_bottom_nav ?? true);
                      const newPrefs = { ...profile?.preferences, show_bottom_nav: newValue };
                      setProfile({ ...profile, preferences: newPrefs });
                      const { error } = await supabase!.from('profiles').update({ preferences: newPrefs }).eq('id', profile.id);
                      if (error) {
                        setProfile({ ...profile, preferences: oldPrefs });
                        toast('Erro ao salvar preferência. Tente novamente.', 'error');
                      }
                    }}
                    className={`w-14 h-8 rounded-full p-1 transition-all ${profile?.preferences?.show_bottom_nav !== false ? 'bg-brand-600' : 'bg-slate-200'}`}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full shadow-sm transition-all transform ${profile?.preferences?.show_bottom_nav !== false ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">Atalhos Visíveis</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { id: 'home', label: 'Início', icon: <Home size={18} /> },
                      { id: 'accounts', label: 'Contas', icon: <Landmark size={18} /> },
                      { id: 'cards', label: 'Cartões', icon: <CreditCard size={18} /> },
                      { id: 'history', label: 'Histórico', icon: <HistoryIcon size={18} /> },
                      { id: 'assets', label: 'Patrimônio', icon: <Building2 size={18} /> },
                      { id: 'goals', label: 'Metas', icon: <Target size={18} /> },
                      { id: 'budgets', label: 'Orçamentos', icon: <PieChart size={18} /> },
                      { id: 'reconcile', label: 'Conciliar', icon: <FileCheck size={18} /> },
                      { id: 'saas', label: 'Vip Plan', icon: <Gem size={18} /> },
                    ].map(item => {
                      const isSelected = profile?.preferences?.bottom_nav_items?.includes(item.id) ?? true;
                      return (
                        <button
                          key={item.id}
                          onClick={async () => {
                            const oldPrefs = profile?.preferences;
                            let currentItems = profile?.preferences?.bottom_nav_items || ['home', 'accounts', 'cards', 'history', 'reconcile'];
                            if (isSelected) currentItems = currentItems.filter((i: string) => i !== item.id);
                            else currentItems = [...currentItems, item.id];

                            const newPrefs = { ...profile?.preferences, bottom_nav_items: currentItems };
                            setProfile({ ...profile, preferences: newPrefs });
                            const { error } = await supabase!.from('profiles').update({ preferences: newPrefs }).eq('id', profile.id);
                            if (error) {
                              setProfile({ ...profile, preferences: oldPrefs });
                              toast('Erro ao salvar preferência. Tente novamente.', 'error');
                            }
                          }}
                          className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${isSelected ? 'bg-brand-50 border-brand-100 text-brand-900' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}
                        >
                          <div className="flex items-center gap-3">
                            {item.icon}
                            <span className="text-xs font-bold uppercase tracking-wider">{item.label}</span>
                          </div>
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isSelected ? 'bg-brand-600 text-white' : 'bg-slate-100'}`}>
                            {isSelected && <Check size={12} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'categories' && (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden border-b-4 border-b-slate-100">
              <div className="p-6 md:p-10 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-slate-50/20">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-slate-900">Categorias</h2>
                  <p className="text-sm text-slate-500 font-medium">Lançamentos do histórico.</p>
                </div>

                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
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
                    className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${showArchived ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {showArchived ? 'Ocultar Arquivadas' : 'Ver Arquivadas'}
                  </button>
                  <div className="flex bg-slate-100 p-1 rounded-xl flex-1 md:flex-none">
                    <button onClick={() => setCategoryTab('INCOME')} className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-xs font-bold transition-all ${categoryTab === 'INCOME' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-600'}`}>Receitas</button>
                    <button onClick={() => setCategoryTab('EXPENSE')} className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-xs font-bold transition-all ${categoryTab === 'EXPENSE' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-600'}`}>Despesas</button>
                  </div>
                  <button onClick={() => setIsAddingCat(true)} className="px-6 py-3 bg-brand-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-xl hover:bg-brand-600 transition-all flex items-center gap-2"><Plus size={16} /> Novo</button>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {isAddingCat && (
                  <div className="p-6 md:p-10 flex gap-4 bg-brand-50/30">
                    <input autoFocus className="flex-1 bg-white border border-brand-200 rounded-2xl px-6 py-4 font-bold text-slate-900 outline-none shadow-sm" placeholder={`Nome da categoria de ${categoryTab === 'INCOME' ? 'receita' : 'despesa'}...`} value={newCatName} onChange={e => setNewCatName(e.target.value)} />
                    <button onClick={addCategory} className="w-16 h-16 bg-brand-600 text-white rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105" aria-label="Confirmar nova categoria"><Check size={24} /></button>
                    <button onClick={() => setIsAddingCat(false)} className="w-16 h-16 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center hover:bg-slate-200" aria-label="Cancelar nova categoria"><XCircle size={24} /></button>
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
                              <button onClick={saveEditCat} className="p-2 bg-emerald-500 text-white rounded-xl" aria-label="Salvar nome da categoria"><Check size={16} /></button>
                              <button onClick={() => setEditingCatId(null)} className="p-2 bg-slate-100 text-slate-500 rounded-xl" aria-label="Cancelar edição de categoria"><XCircle size={16} /></button>
                            </div>
                          ) : (
                            <span className="font-bold text-slate-900 uppercase tracking-widest text-sm flex items-center gap-2">
                              {cat.name}
                              <ChevronRight size={16} className={`text-slate-400 transition-transform ${expandedCat === cat.id ? 'rotate-90' : ''}`} />
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
                                    <button onClick={saveEditSubcat} className="p-1.5 bg-emerald-500 text-white rounded-lg" aria-label="Salvar subcategoria"><Check size={14} /></button>
                                    <button onClick={() => setEditingSubcatId(null)} className="p-1.5 bg-slate-100 text-slate-500 rounded-lg" aria-label="Cancelar edição de subcategoria"><XCircle size={14} /></button>
                                  </div>
                                ) : (
                                  <span className="text-xs font-bold text-slate-600 tracking-wide">{sub.name}</span>
                                )}
                                <div className="flex items-center gap-1">
                                  <button onClick={() => { setEditingSubcatId(sub.id); setEditSubcatName(sub.name); }} className="p-2 text-slate-400 hover:text-brand-500 transition-colors opacity-0 group-hover/sub:opacity-100" title="Editar"><Edit3 size={14} /></button>
                                  <button onClick={() => deleteSubcategory(sub.id)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors opacity-0 group-hover/sub:opacity-100" title="Excluir"><Trash2 size={14} /></button>
                                </div>
                              </div>
                            ))}

                            <div className="flex gap-2 mt-2 px-4 max-w-sm">
                              <input
                                className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold outline-none placeholder:text-slate-400 focus:border-brand-500/30 transition-colors"
                                placeholder="Nova subcategoria..."
                                value={newSubcatName}
                                onChange={e => setNewSubcatName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addSubcategory(cat.id)}
                              />
                              <button onClick={() => addSubcategory(cat.id)} disabled={!newSubcatName} className="p-2 bg-brand-900 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-600 transition-all"><Plus size={16} /></button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                {categories.filter(c => (c.type === categoryTab || (!c.type && categoryTab === 'EXPENSE'))).filter(c => c.name.toLowerCase().includes(catSearch.toLowerCase())).length === 0 && !isAddingCat && (
                  <div className="p-10 text-center text-slate-500 text-sm font-medium">Nenhuma categoria encontrada.</div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'establishments' && (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden border-b-4 border-b-slate-100">
              <div className="p-10 border-b border-slate-50 space-y-1 bg-slate-50/20">
                <h2 className="text-xl font-bold text-slate-900 italic">Estabelecimentos</h2>
                <p className="text-sm text-slate-500 font-medium">Mapeamento automático de lojas extraídas via IA.</p>
              </div>
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 tracking-[0.2em] border-b border-slate-50">
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
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{DateUtils.formatDisplayDate(est.lastActive)}</span>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <span className="text-xs font-bold text-slate-500">{est.count} TX</span>
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
                  <div className="w-16 h-16 bg-brand-900 text-white rounded-[24px] flex items-center justify-center shadow-xl"><Percent size={32} /></div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 italic">Conversão</h2>
                    <p className="text-sm text-slate-500 font-medium">Parâmetros para câmbio internacional.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-50">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 block">IOF em Compras Externas</label>
                    <div className="flex items-center gap-2">
                      <input type="number" inputMode="decimal" step="0.01" className="bg-transparent font-bold text-4xl text-slate-900 w-32 outline-none" value={editingIof} onChange={e => setEditingIof(parseFloat(e.target.value) || 0)} />
                      <span className="text-2xl font-bold text-slate-500">%</span>
                    </div>
                  </div>
                  <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-50">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 block">Spread Bancário (Média)</label>
                    <div className="flex items-center gap-2">
                      <input type="number" inputMode="decimal" step="0.01" className="bg-transparent font-bold text-4xl text-slate-900 w-32 outline-none" value={editingSpread} onChange={e => setEditingSpread(parseFloat(e.target.value) || 0)} />
                      <span className="text-2xl font-bold text-slate-500">%</span>
                    </div>
                  </div>

                  {(editingIof !== settings.iof_rate || editingSpread !== settings.spread_rate) && (
                    <button
                      onClick={async () => {
                        await updateSetting('iof_rate', editingIof);
                        await updateSetting('spread_rate', editingSpread);
                      }}
                      className="w-full py-4 bg-brand-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-brand-700 transition-all shadow-lg shadow-brand-500/20"
                    >
                      Salvar Taxas
                    </button>
                  )}
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
                  <h2 className="text-xl font-bold text-slate-900 italic">Perfis e Donos</h2>
                  <p className="text-sm text-slate-500 font-medium">Gestão global de perfis de gastos.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                  <button
                    onClick={() => setShowArchived(prev => !prev)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${showArchived ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {showArchived ? 'Ocultar Arquivadas' : 'Ver Arquivadas'}
                  </button>
                  <button onClick={() => setIsAddingEntity(true)} className="px-6 py-3 bg-brand-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-xl hover:bg-brand-600 transition-all flex items-center gap-2">
                    <Plus size={16} /> Novo Perfil
                  </button>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {isAddingEntity && (
                  <div className="p-10 flex gap-4 bg-brand-50/30">
                    <input autoFocus className="flex-1 bg-white border border-brand-200 rounded-2xl px-6 py-4 font-bold text-slate-900 outline-none shadow-sm" placeholder="Nome do perfil (Ex: Família, Empresa, Pessoal)..." value={newEntityName} onChange={e => setNewEntityName(e.target.value)} />
                    <button onClick={addEntity} className="w-16 h-16 bg-brand-600 text-white rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105" aria-label="Confirmar novo perfil"><Check size={24} /></button>
                    <button onClick={() => setIsAddingEntity(false)} className="w-16 h-16 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center hover:bg-slate-200" aria-label="Cancelar novo perfil"><XCircle size={24} /></button>
                  </div>
                )}
                {entities.map((ent) => (
                  <div key={ent.id} className={`p-8 flex items-center justify-between group hover:bg-slate-50/50 transition-all ${ent.is_archived ? 'opacity-50 grayscale' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                        <Building2 size={20} />
                      </div>
                      <span className="font-bold text-slate-900 uppercase tracking-widest text-sm">{ent.name}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100/50 shadow-sm">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Contar nos Totais</span>
                        <button
                          onClick={() => toggleEntityTotals(ent.id, ent.include_in_totals !== false)}
                          className={`w-11 h-6 rounded-full p-0.5 transition-all flex items-center ${ent.include_in_totals !== false ? 'bg-brand-600' : 'bg-slate-200'}`}
                        >
                          <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-all transform ${ent.include_in_totals !== false ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
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
                  </div>
                ))}
                {entities.length === 0 && !isAddingEntity && (
                  <div className="p-10 text-center text-slate-500 text-sm font-medium">Nenhum perfil cadastrado.</div>
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
                  <p className="text-slate-500 font-medium leading-relaxed italic">Seus dados estão sincronizados via <span className="font-bold text-slate-600 uppercase text-xs tracking-widest">Zyvion Vault™</span> com tecnologia de banco de dados inteligente.</p>

                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border ${isSupabaseConfigured ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                    {isSupabaseConfigured ? <Check size={14} /> : <XCircle size={14} />}
                    {isSupabaseConfigured ? 'Vault Conectado' : 'Acesso Local'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
                  <div className="p-8 bg-slate-50 rounded-[32px] text-center space-y-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cache</p>
                    <p className="text-2xl font-bold text-slate-900">2.4MB</p>
                  </div>
                  <div className="p-8 bg-slate-50 rounded-[32px] text-center space-y-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sinc</p>
                    <p className="text-2xl font-bold text-emerald-600">OK</p>
                  </div>
                </div>
              </div>

              <div className="bg-brand-900 rounded-[40px] p-12 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute top-[-20px] right-[-20px] opacity-10"><Cloud size={200} /></div>
                <div className="relative z-10 space-y-8">
                  <div className="space-y-2">
                    <h2 className="text-4xl font-bold tracking-tighter italic">Exportação Universal</h2>
                    <p className="text-slate-500 text-lg max-w-md">Baixe todo seu histórico financeiro e configurações em um arquivo portátil.</p>
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

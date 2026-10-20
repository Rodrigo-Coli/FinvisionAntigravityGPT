import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Check, XCircle, Archive, Trash2, Tag, Loader2, Search, RotateCcw } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { normalizeTag, parseTags } from '../../lib/tagUtils';
import { normalizeStr } from '../../lib/stringUtils';
import { TagEntry, listTags, createTag, setTagArchived, deleteTag } from '../../services/tags.service';

/**
 * Configurações > Tags: criar, arquivar e excluir.
 *
 * - Arquivar: a tag para de aparecer como sugestão nos lançamentos. Quem já tem
 *   a tag continua com ela, e o filtro do Histórico ainda a encontra.
 * - Excluir: tira a tag de TODOS os lançamentos (banco e cartão) e do cadastro.
 */
export const TagsSettings: React.FC = () => {
  const { toast } = useToast();
  const [tags, setTags] = useState<TagEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setTags(await listTags());
    } catch (err: any) {
      console.error('[Tags] Erro ao carregar:', err);
      toast('Não foi possível carregar as tags.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const term = normalizeStr(search || '');
    return tags
      .filter(t => showArchived || !t.archived)
      .filter(t => !term || normalizeStr(t.name).includes(term));
  }, [tags, showArchived, search]);

  const archivedCount = tags.filter(t => t.archived).length;

  const add = async () => {
    const name = parseTags(newName)[0];
    if (!name) {
      toast('Digite o nome da tag.', 'warning');
      return;
    }
    const existing = tags.find(t => normalizeTag(t.name) === normalizeTag(name));
    if (existing && !existing.archived) {
      toast(`"${existing.name}" já existe.`, 'warning');
      return;
    }
    setBusy('__new__');
    try {
      await createTag(name);
      setNewName('');
      setIsAdding(false);
      toast(existing ? `"${existing.name}" foi reativada.` : 'Tag criada!', 'success');
      await load();
    } catch (err: any) {
      toast('Erro ao criar tag: ' + (err?.message || 'erro desconhecido'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const toggleArchive = async (tag: TagEntry) => {
    setBusy(tag.name);
    try {
      await setTagArchived(tag.name, !tag.archived);
      toast(tag.archived ? `"${tag.name}" volta a ser sugerida.` : `"${tag.name}" arquivada: não aparece mais como sugestão.`, 'success');
      await load();
    } catch (err: any) {
      toast('Erro ao arquivar tag: ' + (err?.message || 'erro desconhecido'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (tag: TagEntry) => {
    const msg = tag.entries > 0
      ? `Excluir a tag "${tag.name}"? Ela será retirada de ${tag.entries} lançamento(s). Os lançamentos continuam, só sem essa tag.`
      : `Excluir a tag "${tag.name}"?`;
    if (!confirm(msg)) return;
    setBusy(tag.name);
    try {
      const changed = await deleteTag(tag.name);
      toast(changed > 0 ? `Tag excluída e retirada de ${changed} lançamento(s).` : 'Tag excluída.', 'success');
      await load();
    } catch (err: any) {
      toast('Erro ao excluir tag: ' + (err?.message || 'erro desconhecido'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden border-b-4 border-b-slate-100 animate-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 md:p-10 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-slate-50/20">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900 italic">Tags</h2>
          <p className="text-sm text-slate-500 font-medium">Arquivada não aparece mais como sugestão nos lançamentos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          <button
            onClick={() => setShowArchived(prev => !prev)}
            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${showArchived ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}
          >
            {showArchived ? 'Ocultar Arquivadas' : `Ver Arquivadas${archivedCount ? ` (${archivedCount})` : ''}`}
          </button>
          <button onClick={() => setIsAdding(true)} className="px-6 py-3 bg-brand-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-xl hover:bg-brand-600 transition-all flex items-center gap-2">
            <Plus size={16} /> Nova Tag
          </button>
        </div>
      </div>

      <div className="px-6 md:px-10 pt-6">
        <div className="relative">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar tag..."
            className="w-full pl-10 pr-4 h-11 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-brand-500/10"
          />
        </div>
      </div>

      <div className="divide-y divide-slate-50 mt-4">
        {isAdding && (
          <div className="p-6 md:p-10 flex gap-3 bg-brand-50/30">
            <input
              autoFocus
              className="flex-1 min-w-0 bg-white border border-brand-200 rounded-2xl px-5 py-4 font-bold text-slate-900 outline-none shadow-sm"
              placeholder="Nome da tag (Ex: Viagem.26, Reforma)..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') add(); }}
            />
            <button onClick={add} disabled={busy === '__new__'} className="w-14 h-14 shrink-0 bg-brand-600 text-white rounded-2xl flex items-center justify-center shadow-lg" aria-label="Confirmar nova tag">
              {busy === '__new__' ? <Loader2 size={22} className="animate-spin" /> : <Check size={22} />}
            </button>
            <button onClick={() => { setIsAdding(false); setNewName(''); }} className="w-14 h-14 shrink-0 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center hover:bg-slate-200" aria-label="Cancelar nova tag">
              <XCircle size={22} />
            </button>
          </div>
        )}

        {loading && (
          <div className="p-10 flex justify-center text-slate-400"><Loader2 size={22} className="animate-spin" /></div>
        )}

        {!loading && visible.map(tag => (
          <div key={normalizeTag(tag.name)} className={`px-6 md:px-10 py-5 flex items-center justify-between gap-4 group hover:bg-slate-50/50 transition-all ${tag.archived ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 shrink-0 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                <Tag size={18} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-sm truncate">{tag.name}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {tag.entries > 0 ? `${tag.entries} lançamento${tag.entries === 1 ? '' : 's'}` : 'Sem lançamentos'}
                  {tag.archived ? ' · Arquivada' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {busy === tag.name ? (
                <Loader2 size={18} className="animate-spin text-slate-400 mx-3" />
              ) : (
                <>
                  <button
                    onClick={() => toggleArchive(tag)}
                    className={`p-3 rounded-xl transition-all ${tag.archived ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'}`}
                    title={tag.archived ? 'Desarquivar' : 'Arquivar'}
                    aria-label={tag.archived ? `Desarquivar ${tag.name}` : `Arquivar ${tag.name}`}
                  >
                    {tag.archived ? <RotateCcw size={18} /> : <Archive size={18} />}
                  </button>
                  <button
                    onClick={() => remove(tag)}
                    className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                    title="Excluir"
                    aria-label={`Excluir ${tag.name}`}
                  >
                    <Trash2 size={18} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {!loading && visible.length === 0 && !isAdding && (
          <div className="p-10 text-center text-slate-500 text-sm font-medium">
            {search ? 'Nenhuma tag encontrada.' : showArchived ? 'Nenhuma tag.' : 'Nenhuma tag ativa. Crie uma ou use tags nos lançamentos.'}
          </div>
        )}
      </div>
    </div>
  );
};

export default TagsSettings;

import { supabase } from '../lib/supabase/client';
import { getSessionUser } from '../lib/session';
import { isProbablyOffline } from '../lib/connectivity';
import { normalizeTag, parseTags, getTagSettings, saveTagSettings, forgetTag } from '../lib/tagUtils';

/**
 * Cadastro de tags (tabela `tags`, ver supabase/2026-10-20_tags.sql).
 *
 * Tag usada em lançamento não precisa estar cadastrada: o cadastro guarda só as
 * criadas aqui e as ARQUIVADAS. Arquivar tira a tag das sugestões; excluir a
 * tira também de todos os lançamentos (banco e cartão).
 */

export interface TagEntry {
  id?: string;
  name: string;
  archived: boolean;
  /** Quantos lançamentos (banco + cartão) usam a tag. */
  entries: number;
}

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
let lastSync = 0;
let inflight: Promise<void> | null = null;

/**
 * Traz o cadastro do banco para a cópia do aparelho (que é o que as sugestões
 * leem). No máximo uma vez a cada 5 minutos, a menos que `force`.
 */
export function syncTagSettings(force = false): Promise<void> {
  if (!supabase || isProbablyOffline()) return Promise.resolve();
  if (!force && Date.now() - lastSync < SYNC_INTERVAL_MS) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const user = await getSessionUser(supabase);
      if (!user) return;
      const { data, error } = await supabase.from('tags').select('name, is_archived').eq('user_id', user.id);
      if (error) throw error;
      const rows = data || [];
      saveTagSettings({
        created: rows.filter((r: any) => !r.is_archived).map((r: any) => r.name),
        archived: rows.filter((r: any) => r.is_archived).map((r: any) => r.name)
      });
      lastSync = Date.now();
    } catch (err) {
      // Sem cadastro, as sugestões seguem com a cópia que o aparelho já tem.
      console.warn('[Tags] Falha ao sincronizar cadastro:', err);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Todas as tags: as cadastradas e as que aparecem nos lançamentos. */
export async function listTags(): Promise<TagEntry[]> {
  if (!supabase) return [];
  const user = await getSessionUser(supabase);
  if (!user) return [];
  const [rowsRes, usageRes] = await Promise.all([
    supabase.from('tags').select('id, name, is_archived').eq('user_id', user.id),
    supabase.rpc('tag_usage_counts')
  ]);
  if (rowsRes.error) throw rowsRes.error;
  if (usageRes.error) throw usageRes.error;

  const byKey = new Map<string, TagEntry>();
  for (const u of (usageRes.data || []) as any[]) {
    const key = normalizeTag(u.tag);
    if (key) byKey.set(key, { name: u.tag, archived: false, entries: Number(u.entries) || 0 });
  }
  for (const r of (rowsRes.data || []) as any[]) {
    const key = normalizeTag(r.name);
    if (!key) continue;
    const existing = byKey.get(key);
    byKey.set(key, { id: r.id, name: existing?.name || r.name, archived: !!r.is_archived, entries: existing?.entries || 0 });
  }

  const list = Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  saveTagSettings({
    created: list.filter(t => t.id && !t.archived).map(t => t.name),
    archived: list.filter(t => t.archived).map(t => t.name)
  });
  lastSync = Date.now();
  return list;
}

async function findRow(userId: string, name: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase!.from('tags').select('id, name').eq('user_id', userId);
  if (error) throw error;
  const key = normalizeTag(name);
  return (data || []).find((r: any) => normalizeTag(r.name) === key) || null;
}

/** Cria (ou reativa, se estava arquivada com outra grafia) uma tag. */
export async function createTag(name: string): Promise<void> {
  const clean = parseTags(name)[0];
  if (!supabase || !clean) return;
  const user = await getSessionUser(supabase);
  if (!user) return;
  const row = await findRow(user.id, clean);
  const { error } = row
    ? await supabase.from('tags').update({ is_archived: false }).eq('id', row.id)
    : await supabase.from('tags').insert({ user_id: user.id, name: clean, is_archived: false });
  if (error) throw error;
  const s = getTagSettings();
  saveTagSettings({
    created: [...s.created, row?.name || clean],
    archived: s.archived.filter(t => normalizeTag(t) !== normalizeTag(clean))
  });
}

/** Arquiva (para de sugerir) ou desarquiva. */
export async function setTagArchived(name: string, archived: boolean): Promise<void> {
  if (!supabase || !normalizeTag(name)) return;
  const user = await getSessionUser(supabase);
  if (!user) return;
  const row = await findRow(user.id, name);
  const { error } = row
    ? await supabase.from('tags').update({ is_archived: archived }).eq('id', row.id)
    : await supabase.from('tags').insert({ user_id: user.id, name: name.trim(), is_archived: archived });
  if (error) throw error;
  const key = normalizeTag(name);
  const s = getTagSettings();
  saveTagSettings({
    created: archived ? s.created.filter(t => normalizeTag(t) !== key) : [...s.created, name],
    archived: archived ? [...s.archived, name] : s.archived.filter(t => normalizeTag(t) !== key)
  });
}

/** Exclui: tira dos lançamentos (qualquer grafia) e do cadastro. Devolve quantos lançamentos mudaram. */
export async function deleteTag(name: string): Promise<number> {
  if (!supabase || !normalizeTag(name)) return 0;
  const user = await getSessionUser(supabase);
  if (!user) return 0;
  const { data: changed, error } = await supabase.rpc('remove_tag_from_entries', { p_tag: name });
  if (error) throw error;
  const row = await findRow(user.id, name);
  if (row) {
    const { error: delError } = await supabase.from('tags').delete().eq('id', row.id);
    if (delError) throw delError;
  }
  forgetTag(name);
  return Number(changed) || 0;
}

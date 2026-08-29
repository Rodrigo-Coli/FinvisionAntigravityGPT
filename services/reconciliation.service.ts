import { supabase } from '../lib/supabase/client';
import { getSessionUser } from '../lib/session';

function getLevenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => 
    Array.from({ length: b.length + 1 }, (_, j) => j)
  );
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[a.length][b.length];
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function findCloseMatch(input: string, list: string[]): string | null {
  const normInput = normalize(input);
  if (!normInput) return null;

  // 1. Tenta correspondência exata sem acentos/case
  for (const item of list) {
    if (normalize(item) === normInput) return item;
  }

  // 2. Tenta correspondência por Levenshtein (limiar <= 2 ou 30% do tamanho)
  let bestMatch: string | null = null;
  let minDistance = 999;
  
  for (const item of list) {
    const normItem = normalize(item);
    const dist = getLevenshteinDistance(normInput, normItem);
    
    const threshold = Math.max(1, Math.min(2, Math.floor(normItem.length * 0.3)));
    if (dist <= threshold && dist < minDistance) {
      minDistance = dist;
      bestMatch = item;
    }
  }

  return bestMatch;
}

export const ReconciliationService = {
  async computeFileHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  getMappedType(fileName: string): 'pdf' | 'ofx' | 'xlsx' | 'image' | 'csv' | 'other' {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf': return 'pdf';
      case 'ofx': return 'ofx';
      case 'xlsx':
      case 'xls': return 'xlsx';
      case 'csv': return 'csv';
      case 'png':
      case 'jpg':
      case 'jpeg': return 'image';
      default: return 'other';
    }
  },

  async startImport({
    file,
    importSource,
    accountId,
    accountName,
    onProgress,
    force = false
  }: {
    file: File;
    importSource: 'bank' | 'card' | 'smart';
    accountId: string;
    accountName: string;
    onProgress?: (step: string) => void;
    force?: boolean;
  }) {
    if (!supabase) throw new Error("Supabase não configurado");

    const user = await getSessionUser(supabase);
    if (!user) throw new Error("Usuário não autenticado");

    onProgress?.("Verificando integridade...");
    const fileHash = await this.computeFileHash(file);

    // 1. Verificar deduplicação por hash na tabela direta, considerando a fonte
    const { data: existing } = await supabase
      .from('imports')
      .select('id, status, notes')
      .eq('user_id', user.id)
      .eq('file_sha256', fileHash)
      .eq('source_type', importSource) // Evita deduplicar se mudou de 'bank' para 'smart'
      .maybeSingle();

    if (existing && !force) {
      if (existing.status === 'error') {
        onProgress?.("Reiniciando processamento...");
        await supabase.from('imports').update({
          status: 'processing',
          notes: `${existing.notes || ''} [REPROCESS]`
        }).eq('id', existing.id);

        this.triggerBackend(existing.id, accountId, accountName, importSource);
        return existing.id;
      }

      if (existing.status === 'ready') {
        throw new Error("ALREADY_PROCESSED");
      }
      if (existing.status === 'processing') {
        throw new Error("Este arquivo já está sendo processado no momento. Aguarde a conclusão.");
      }
    }

    // 2. Upload para Storage
    onProgress?.("Fazendo upload...");
    const bucket = 'finvision-documents';
    const cleanName = file.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^\w.-]/g, '_');      // Mantém apenas letras, números, . - e converte o resto para _

    const fileName = `${Date.now()}_${cleanName}`;
    const filePath = `${user.id}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // 3. Registrar Documento
    const { data: doc } = await supabase.from('documents').insert({
      user_id: user.id,
      bucket: bucket,
      path: filePath,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      source: 'statement'
    }).select().single();

    if (!doc) throw new Error("Erro ao registrar documento");

    // 4. Criar Registro de Importação
    const { data: importRec, error: impErr } = await supabase.from('imports').insert({
      user_id: user.id,
      type: this.getMappedType(file.name),
      status: 'processing',
      document_id: doc.id,
      notes: `Source: ${importSource} | Account: ${accountName}`,
      file_sha256: fileHash,
      account_id: accountId === '' ? null : accountId,

      // ✅ ADIÇÕES SEGURAS (não mudam fluxo)
      source_type: importSource,
      parse_meta: {
        account_name: accountName,
        is_mobills: importSource === 'smart' || file.name.toLowerCase().includes('mobills')
      }
    }).select('id').single();

    if (impErr) throw impErr;

    // 5. Disparar processamento no backend (Fire and forget no front)
    this.triggerBackend(importRec.id, accountId, accountName, importSource);

    return importRec.id;
  },

  triggerBackend(
    importId: string,
    accountId: string,
    accountName: string,
    importSource: 'bank' | 'card' | 'smart'
  ) {
    const endpoint = importSource === 'card'
      ? '/api/handle-card-reconcile'
      : '/api/handle-bank-reconcile';

    const payload = importSource === 'card'
      ? {
        import_id: importId,
        card_id: accountId,
        account_name: accountName,
        import_source: importSource
      }
      : {
        import_id: importId,
        account_id: accountId,
        account_name: accountName,
        import_source: importSource
      };

    console.log(`[ReconciliationService] Chamando ${endpoint} para ${importSource} via Proxy`);

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(e => console.error("Erro ao disparar worker:", e));
  },

  async pollImportStatus(importId: string, onUpdate: (imp: any) => void): Promise<any> {
    if (!supabase) return;
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;

        // Consulta em dois passos para evitar erro 409/PGRST201
        const { data: imp, error: impErr } = await supabase!
          .from('imports')
          .select('id, status, document_id, created_at, type, notes')
          .eq('id', importId)
          .single();

        if (impErr) {
          clearInterval(interval);
          return reject(impErr);
        }

        // Buscar nome original se disponível
        let originalName = 'Arquivo';
        if (imp.document_id) {
          const { data: doc } = await supabase!
            .from('documents')
            .select('original_name')
            .eq('id', imp.document_id)
            .single();
          if (doc) originalName = doc.original_name || 'Arquivo';
        }

        const combined = { ...imp, original_name: originalName };
        onUpdate(combined);

        if (imp.status === 'ready') {
          clearInterval(interval);
          resolve(combined);
        } else if (imp.status === 'error') {
          clearInterval(interval);
          const isLimitReached = !!imp.notes?.startsWith('LIMIT_REACHED:');
          const msg = isLimitReached
            ? imp.notes.replace('LIMIT_REACHED:', '').trim()
            : (imp.notes?.startsWith('ERROR:'))
              ? imp.notes.replace('ERROR:', '').trim()
              : (imp.notes || "Erro no processamento");
          const err: any = new Error(msg);
          err.limitReached = isLimitReached;
          reject(err);
        } else if (attempts > 180) { // 6 minutos
          clearInterval(interval);
          reject(new Error("Timeout de processamento"));
        }
      }, 3000);
    });
  },

  async removeTransactionFromQueue(id: string) {
    if (!supabase) return;
    const { error } = await supabase
      .from('imported_transactions')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async updateTransactionStatus(id: string, status: string, owner_name?: string) {
    if (!supabase) return;
    const updateData: any = { status };
    if (owner_name) updateData.owner_name = owner_name;

    const { error } = await supabase
      .from('imported_transactions')
      .update(updateData)
      .eq('id', id);
    if (error) throw error;
  },

  // Inverter sinal na fila de conciliação (despesa ↔ crédito/estorno)
  async updateTransactionAmount(id: string, amount: number) {
    if (!supabase) return;
    const { error } = await supabase
      .from('imported_transactions')
      .update({ amount })
      .eq('id', id);
    if (error) throw error;
  },

  async updateTransaction(id: string, data: {
    description?: string;
    date?: string;
    owner_name?: string;
    category?: string;
    subcategory?: string;
    metadata?: any;
  }) {
    if (!supabase) return;
    const updateData: any = {};
    if (data.description !== undefined) updateData.description = data.description;
    if (data.date !== undefined) updateData.date = data.date;
    if (data.owner_name !== undefined) updateData.owner_name = data.owner_name;

    // Salvar categoria e subcategoria no metadata jsonb para persistência
    const currentMeta = data.metadata || {};
    const updatedMeta = {
      ...currentMeta,
      category: data.category,
      subcategory: data.subcategory
    };
    updateData.metadata = updatedMeta;

    const { error } = await supabase
      .from('imported_transactions')
      .update(updateData)
      .eq('id', id);
    if (error) throw error;
  },

  async ensureCategoryExists(categoryName: string): Promise<string> {
    if (!supabase || !categoryName) return '';
    const user = await getSessionUser(supabase);
    if (!user) return '';

    // 1. Obter todas as categorias existentes
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_archived', false);

    const names = (categories || []).map((c: any) => c.name);
    const matchedName = findCloseMatch(categoryName, names);

    if (matchedName) {
      const match = categories!.find((c: any) => c.name === matchedName);
      if (match) return match.id;
    }

    // Cria nova
    const { data: created, error } = await supabase
      .from('categories')
      .insert({ user_id: user.id, name: categoryName.trim(), is_archived: false })
      .select('id')
      .single();

    if (error) {
      console.error("Erro ao criar categoria auto:", error);
      return '';
    }
    return created.id;
  },

  async ensureSubcategoryExists(categoryId: string, subcategoryName: string): Promise<string> {
    if (!supabase || !categoryId || !subcategoryName) return '';
    const user = await getSessionUser(supabase);
    if (!user) return '';

    // 1. Obter todas as subcategorias existentes desta categoria
    const { data: subcategories } = await supabase
      .from('subcategories')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('category_id', categoryId);

    const names = (subcategories || []).map((s: any) => s.name);
    const matchedName = findCloseMatch(subcategoryName, names);

    if (matchedName) {
      const match = subcategories!.find((s: any) => s.name === matchedName);
      if (match) return match.id;
    }

    // Cria nova
    const { data: created, error } = await supabase
      .from('subcategories')
      .insert({ user_id: user.id, category_id: categoryId, name: subcategoryName.trim() })
      .select('id')
      .single();

    if (error) {
      console.error("Erro ao criar subcategoria auto:", error);
      return '';
    }
    return created.id;
  },

  async ensureAccountExists(accountName: string): Promise<string> {
    if (!supabase || !accountName) return '';
    const user = await getSessionUser(supabase);
    if (!user) return '';

    // 1. Obter todas as contas existentes
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, institution')
      .eq('user_id', user.id)
      .eq('is_archived', false);

    const names = (accounts || []).map((a: any) => a.institution);
    const matchedName = findCloseMatch(accountName, names);

    if (matchedName) {
      const match = accounts!.find((a: any) => a.institution === matchedName);
      if (match) return match.id;
    }

    // Cria nova conta
    const { data: created, error } = await supabase
      .from('accounts')
      .insert({
        user_id: user.id,
        institution: accountName.trim(),
        type: 'CHECKING',
        currency: 'BRL',
        initial_balance: 0,
        current_balance: 0,
        is_archived: false
      })
      .select('id')
      .single();

    if (error) {
      console.error("Erro ao criar conta auto:", error);
      return '';
    }
    return created.id;
  }
};

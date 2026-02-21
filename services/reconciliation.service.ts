import { supabase } from '../lib/supabase/client';

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
    onProgress
  }: {
    file: File;
    importSource: 'bank' | 'card';
    accountId: string;
    accountName: string;
    onProgress?: (step: string) => void;
  }) {
    if (!supabase) throw new Error("Supabase não configurado");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    onProgress?.("Verificando integridade...");
    const fileHash = await this.computeFileHash(file);

    // 1. Verificar deduplicação por hash na tabela direta
    const { data: existing } = await supabase
      .from('imports')
      .select('id, status, notes')
      .eq('user_id', user.id)
      .eq('file_sha256', fileHash)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'error') {
        onProgress?.("Reiniciando processamento...");
        await supabase.from('imports').update({
          status: 'processing',
          notes: `${existing.notes || ''} [REPROCESS]`
        }).eq('id', existing.id);

        this.triggerBackend(existing.id, accountId, accountName, importSource);
        return existing.id;
      }

      if (existing.status === 'ready' || existing.status === 'processing') {
        console.log("Arquivo já processado ou em andamento:", existing.id);
        return existing.id;
      }
    }

    // 2. Upload para Storage
    onProgress?.("Fazendo upload...");
    const bucket = 'finvision-documents';
    const fileName = `${Date.now()}_${file.name.replace(/\s/g, '_')}`;
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
      account_id: accountId,

      // ✅ ADIÇÕES SEGURAS (não mudam fluxo)
      source_type: importSource,
      parse_meta: { account_name: accountName }
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
    importSource: 'bank' | 'card'
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
        const { data: imp, error: impErr } = await supabase
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
          const { data: doc } = await supabase
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
          const msg = (imp.notes?.startsWith('ERROR:'))
            ? imp.notes.replace('ERROR:', '').trim()
            : (imp.notes || "Erro no processamento");
          reject(new Error(msg));
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

  async updateTransactionStatus(id: string, status: string) {
    if (!supabase) return;
    const { error } = await supabase
      .from('imported_transactions')
      .update({ status })
      .eq('id', id);
    if (error) throw error;
  }
};

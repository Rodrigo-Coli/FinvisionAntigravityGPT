// Registro de consumo REAL de IA (erro zero). Lê o usageMetadata que o Gemini devolve
// e grava em ai_usage_logs. É totalmente à prova de falha: NUNCA lança erro nem quebra a
// função de IA que a chama — se algo der errado, apenas ignora silenciosamente.

export async function recordAiUsage(
  supabase: any,
  fn: string,
  userId: string | null | undefined,
  response: any,
  model?: string
): Promise<void> {
  try {
    const usage = response?.usageMetadata || response?.usage_metadata || response?.response?.usageMetadata;
    if (!usage) return;

    const prompt = Number(usage.promptTokenCount ?? usage.prompt_token_count ?? 0) || 0;
    const output = Number(usage.candidatesTokenCount ?? usage.candidates_token_count ?? 0) || 0;
    const total = Number(usage.totalTokenCount ?? usage.total_token_count ?? (prompt + output)) || 0;

    if (total <= 0) return;

    await supabase.from('ai_usage_logs').insert({
      fn,
      user_id: userId || null,
      model: model || null,
      prompt_tokens: prompt,
      output_tokens: output,
      total_tokens: total,
    });
  } catch {
    // Silencioso de propósito: logar consumo nunca pode derrubar a função de IA.
  }
}

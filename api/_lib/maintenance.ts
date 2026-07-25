import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

// Manutenção diária (chamada pelo daily-cron):
// 1. renew_property_recurrences: séries recorrentes de imóveis (aluguel/condomínio/
//    IPTU) com menos de 12 meses de cobertura futura são estendidas até 24 meses,
//    clonando o último lançamento (cadência mensal ou anual detectada automaticamente).
//    Antes, os lançamentos só eram regenerados quando o usuário reabria e salvava o
//    imóvel — quem não mexia mais no cadastro via as recorrências pararem no mês 24.
// 2. cleanup_abandoned_demo_users: usuários demo (demo+...@finvision.app) com mais
//    de 7 dias são apagados. Contas promovidas trocam o e-mail pelo real, então
//    nunca casam com o padrão — ficam protegidas automaticamente.
// As duas funções vivem no Postgres (SECURITY DEFINER) e foram testadas ao vivo;
// aqui só disparamos os RPCs, à prova de falha (um erro não derruba o cron).
export async function handleMaintenance(req: any, res: any) {
  const results: Record<string, any> = {};

  try {
    const { data, error } = await supabaseAdmin.rpc('renew_property_recurrences');
    results.renewRecurrences = error ? { error: error.message } : data;
  } catch (err: any) {
    results.renewRecurrences = { error: err?.message || 'unknown' };
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('cleanup_abandoned_demo_users');
    results.cleanupDemos = error ? { error: error.message } : data;
  } catch (err: any) {
    results.cleanupDemos = { error: err?.message || 'unknown' };
  }

  // Cancelamentos agendados: quem clicou em "cancelar assinatura" continua com o
  // plano pago até current_period_end (ver asaas-cancel-subscription.ts). Só agora,
  // quando essa data efetivamente chega, o status vira 'canceled' de verdade e o
  // usuário é rebaixado para o Starter (via SubscriptionContext).
  try {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('cancel_at_period_end', true)
      .in('status', ['active', 'trialing'])
      .lte('current_period_end', new Date().toISOString())
      .select('id');
    results.expireCanceledSubscriptions = error ? { error: error.message } : { downgraded: data?.length || 0 };
  } catch (err: any) {
    results.expireCanceledSubscriptions = { error: err?.message || 'unknown' };
  }

  return res.status(200).json({ success: true, ...results });
}

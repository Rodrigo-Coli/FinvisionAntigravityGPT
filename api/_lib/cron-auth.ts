// Checagem de autorização compartilhada por todos os handlers de cron/webhook
// agendado (lembrete de contas, engajamento de indicação, resumo semanal).
//
// Fail-closed: se CRON_SECRET não estiver configurado no ambiente, o acesso é
// SEMPRE negado (exceto em desenvolvimento local via IS_LOCAL). Antes, a
// checagem antiga (`header !== 'Bearer ' + secret`) ficava com secret=undefined
// quando a variável faltava, e nesse caso um pedido sem nenhum cabeçalho e sem
// query "key" passava direto sem senha nenhuma — inclusive para a rotina que
// libera comissão de indicação para saque.
let warnedMissingSecret = false;

export function isCronAuthorized(req: any): boolean {
  if (process.env.IS_LOCAL) return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (!warnedMissingSecret) {
      console.error('[cron-auth] CRON_SECRET não configurado — todos os pedidos de cron serão recusados até isso ser corrigido.');
      warnedMissingSecret = true;
    }
    return false;
  }

  if (req.headers?.authorization === `Bearer ${secret}`) return true;
  if (req.query?.key === secret) return true;
  return false;
}

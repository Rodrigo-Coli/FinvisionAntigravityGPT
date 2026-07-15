// Fonte única dos Termos do Programa de Indicação — usada pela tela de
// aceite (pages/ReferralTerms.tsx ou modal equivalente) e carimbada em
// affiliates.terms_version no momento do aceite. Mudar o texto aqui não
// altera o aceite de quem já aceitou uma versão anterior (rastreável via
// affiliates.terms_version).
export const REFERRAL_TERMS_VERSION = '2026.07.12';

export interface ReferralTermsSection {
  title: string;
  body: string[];
}

export const REFERRAL_TERMS_SECTIONS: ReferralTermsSection[] = [
  {
    title: '1. O que é o Programa de Indicação',
    body: [
      'Ao participar, você (o "Indicador") recebe um código e um link únicos para convidar novas pessoas a assinar o Zyvion (o "Indicado"). Quando alguém assina usando o seu link ou código, essa indicação fica registrada e vinculada à sua conta.',
    ],
  },
  {
    title: '2. Quem pode participar',
    body: [
      'Qualquer usuário com conta ativa no Zyvion pode se tornar Indicador, desde que aceite estes termos. Uma pessoa não pode se autoindicar (usar o próprio código para assinar).',
    ],
  },
  {
    title: '3. Como a comissão é calculada',
    body: [
      'Você recebe um percentual sobre cada pagamento confirmado do Indicado, enquanto a indicação estiver dentro do prazo contratado.',
      'O percentual e o prazo aplicados à SUA indicação são definidos no momento em que ela é registrada, com base no padrão vigente naquele momento (ou em uma condição especial combinada com a equipe Zyvion). Se o padrão geral do programa mudar depois, isso vale apenas para indicações NOVAS — a sua já registrada mantém as condições originais, mesmo que o padrão geral suba ou desça.',
      'O percentual pode aumentar automaticamente conforme o número de indicações ativas simultâneas cresce (escalonamento), até um teto definido pelo Zyvion. Esse aumento também vale só para indicações novas feitas a partir do momento em que você atinge cada novo patamar — indicações antigas não sobem de percentual retroativamente.',
    ],
  },
  {
    title: '4. Comissão exige que o SEU plano esteja ativo',
    body: [
      'Só são devidas comissões sobre pagamentos NOVOS do Indicado enquanto a sua própria assinatura do Zyvion estiver ativa. Se a sua assinatura ficar inadimplente, cancelada ou vencer, os pagamentos do Indicado feitos a partir desse momento não geram comissão para você.',
      'Comissões já geradas antes disso não são canceladas nem descontadas por esse motivo — a regra vale apenas para pagamentos futuros. Reativando sua assinatura, novos pagamentos do Indicado voltam a gerar comissão normalmente (respeitado o prazo total contratado na indicação).',
    ],
  },
  {
    title: '5. Carência antes do saque',
    body: [
      'Toda comissão gerada passa por um período de carência (padrão de 30 dias, podendo ser diferente conforme informado no momento da indicação) antes de ficar disponível para saque. Esse prazo existe para cobrir eventuais estornos, cancelamentos ou disputas de pagamento do Indicado.',
    ],
  },
  {
    title: '6. Estorno, reembolso ou chargeback',
    body: [
      'Se um pagamento do Indicado for estornado, reembolsado ou contestado (chargeback) pelo banco/operadora, a comissão referente àquele pagamento específico é cancelada. Se essa comissão já tiver sido liberada ou até paga a você, o valor é descontado do seu próximo saque disponível — nunca cobrado ativamente de você.',
    ],
  },
  {
    title: '7. Saque e uso do saldo',
    body: [
      'Você pode solicitar o saque do saldo já liberado via Pix, respeitando o valor mínimo de saque definido pelo Zyvion.',
      'Alternativamente, você pode autorizar o uso do seu saldo disponível para abater o valor da SUA PRÓPRIA mensalidade do Zyvion. Essa opção é sempre por sua escolha — nunca aplicada automaticamente sem sua autorização explícita.',
    ],
  },
  {
    title: '8. Uso indevido e fraude',
    body: [
      'Indicações feitas com contas falsas, dados fictícios, ou qualquer tentativa de manipular o sistema para gerar comissões indevidas cancelam o direito à comissão correspondente e podem levar à suspensão da conta de afiliado, sem prejuízo de outras medidas cabíveis.',
    ],
  },
  {
    title: '9. Alterações nestes termos',
    body: [
      'O Zyvion pode atualizar estes termos a qualquer momento. Alterações valem apenas para indicações feitas depois da atualização — indicações já registradas continuam com as condições vigentes no momento do seu registro, conforme descrito na seção 3.',
    ],
  },
  {
    title: '10. Impostos',
    body: [
      'Os valores recebidos através do programa podem estar sujeitos a tributação conforme a legislação aplicável à sua situação. A responsabilidade por declarar e recolher eventuais tributos é do Indicador.',
    ],
  },
  {
    title: '11. Encerramento',
    body: [
      'O Zyvion pode encerrar o programa ou a participação de um afiliado específico a qualquer momento, em caso de uso indevido. Saldos já liberados e não sacados continuam disponíveis para saque mesmo após o encerramento, salvo em casos de fraude comprovada.',
    ],
  },
];

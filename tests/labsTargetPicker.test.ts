import { describe, it, expect } from 'vitest';
import { findCloseMatch } from '../lib/stringUtils';

// Rótulos do destino no AI & Insights — devem bater com os das telas de
// lançamento (AddTransactionModal e ManualTransactionModal), porque é assim
// que o usuário reconhece a conta e o cartão que já usa.
const accountLabel = (a: any) => a.institution || a.name || 'Conta';
const cardLabel = (c: any) =>
  `${c.is_default ? '★ ' : ''}${c.name || 'Cartão'}${c.last4 ? ` (**** ${c.last4})` : ''}` +
  `${c.is_additional ? `  • Adicional${c.additional_label ? ': ' + c.additional_label : ''}` : ''}`;

describe('rótulos do destino', () => {
  it('conta mostra a instituição, como na tela de transações', () => {
    expect(accountLabel({ institution: 'Bradesco' })).toBe('Bradesco');
  });

  it('conta sem instituição não fica em branco', () => {
    expect(accountLabel({ institution: null })).toBe('Conta');
  });

  it('cartão padrão vem marcado com estrela e os 4 últimos dígitos', () => {
    expect(cardLabel({ name: 'Bradesco', last4: '4321', is_default: true }))
      .toBe('★ Bradesco (**** 4321)');
  });

  it('cartão adicional é distinguível do titular', () => {
    // Era o caso que o campo de texto antigo não resolvia: dois cartões
    // "Bradesco" apareciam como opções praticamente iguais.
    expect(cardLabel({ name: 'Bradesco', last4: '9876', is_additional: true, additional_label: 'Esposa' }))
      .toBe('Bradesco (**** 9876)  • Adicional: Esposa');
  });

  it('cartão sem last4 não mostra parênteses vazios', () => {
    expect(cardLabel({ name: 'Nubank' })).toBe('Nubank');
  });
});

describe('resolução da categoria digitada', () => {
  const categories = ['Alimentação', 'Lazer', 'Saúde'];

  it('encontra a categoria mesmo digitada sem acento', () => {
    // Antes o AIModule comparava com toLowerCase: "alimentacao" não batia com
    // "Alimentação" e o lançamento ia para o cartão sem categoria nenhuma.
    expect(findCloseMatch('alimentacao', categories)).toBe('Alimentação');
  });

  it('devolve o nome canônico, não o que foi digitado', () => {
    expect(findCloseMatch('LAZER', categories)).toBe('Lazer');
  });

  it('não inventa correspondência para categoria realmente nova', () => {
    expect(findCloseMatch('Combustível', categories)).toBeNull();
  });

  it('subcategoria é resolvida dentro da categoria escolhida', () => {
    const subcategories = [
      { name: 'Supermercado', category_name: 'Alimentação' },
      { name: 'Passeio', category_name: 'Lazer' },
    ];
    const doEscopo = subcategories.filter(s => s.category_name === 'Alimentação').map(s => s.name);
    expect(findCloseMatch('supermercado', doEscopo)).toBe('Supermercado');
    // "Passeio" é de outra categoria: não pode ser sugerida aqui.
    expect(findCloseMatch('Passeio', doEscopo)).toBeNull();
  });
});

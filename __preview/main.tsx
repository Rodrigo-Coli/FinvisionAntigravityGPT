import '../src/index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { CardsMonthSummary } from '../components/cards/CardsMonthSummary';
const cards = [
  { id: 'BRA', name: 'Bradesco', last4: '7732' }, { id: 'INF', name: 'Bradesco Infinite', last4: '5060' },
  { id: 'BTG', name: 'BTG', last4: '8703' }, { id: 'NU', name: 'Nubank', last4: '0000' },
  { id: 'POR', name: 'Porto seguro', last4: '0000' }, { id: 'XP', name: 'XP', last4: '3769' },
  { id: 'CAR', name: 'XP Carol', last4: '7727', is_additional: true, parent_card_id: 'XP', sums_into_invoice: false }];
const R: [string, string, string, string, number, number][] = [
 ['BRA','2026-10-25','PAID','b10',3891.49,3891.49],['INF','2026-10-10','PAID','i9',61,61],['BTG','2026-10-01','PAID','t9',31.90,31.90],['POR','2026-10-10','PAID','p10',895.60,895.60],['XP','2026-10-20','PAID','x10',135.48,135.48],['CAR','2026-10-20','PAID','c10',5039.72,5039.72],
 ['BRA','2026-11-25','OPEN','b11',522.44,0],['INF','2026-11-10','OPEN','i10',61,0],['BTG','2026-11-01','PAID','t10',33.90,33.90],['POR','2026-11-10','OPEN','p11',456.05,0],['CAR','2026-11-20','OPEN','c11',54.54,0],
 ['BRA','2026-12-25','OPEN','b12',72.90,0],['INF','2026-12-10','OPEN','i11',61,0],['BTG','2026-12-01','OPEN','t11',31.90,0],['POR','2026-12-10','OPEN','p12',456.05,0],['CAR','2026-12-20','OPEN','c12',54.54,0]];
const statements = R.map(([card_id, due, status, id, total, paid]) => ({ id, card_id, year: 2026, month: Number(due.slice(5,7)), due_date: due + 'T00:00:00+00:00', status, total_amount: total, paid_amount: paid }));
localStorage.setItem('finvision_cached_cards_month_summary', JSON.stringify({ statements, txTotals: {} }));
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
ReactDOM.createRoot(document.getElementById('root')!).render(<CardsMonthSummary cards={cards} formatCurrency={fmt} />);

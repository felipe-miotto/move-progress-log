import { describe, it, expect } from 'vitest';
import { calculateLoadFromBreakdown } from '../loadCalculation';

describe('calculateLoadFromBreakdown', () => {
  // Null / empty cases
  it('returns null for empty string', () => {
    expect(calculateLoadFromBreakdown('')).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(calculateLoadFromBreakdown('   ')).toBeNull();
  });

  it('returns null for undefined-like input', () => {
    expect(calculateLoadFromBreakdown(null as unknown as string)).toBeNull();
  });

  // Body weight
  it('returns explicit body weight value', () => {
    expect(calculateLoadFromBreakdown('Peso corporal = 75 kg')).toBe(75);
  });

  it('returns student weight for "peso corporal" without value', () => {
    expect(calculateLoadFromBreakdown('Peso corporal', 80)).toBe(80);
  });

  it('returns null for "peso corporal" without student weight', () => {
    expect(calculateLoadFromBreakdown('Peso corporal')).toBeNull();
  });

  // Elastic / bands
  it('returns null for elastic bands', () => {
    expect(calculateLoadFromBreakdown('elástico verde')).toBeNull();
  });

  it('returns null for bands', () => {
    expect(calculateLoadFromBreakdown('banda leve')).toBeNull();
  });

  // Simple weights
  it('parses simple kg value', () => {
    expect(calculateLoadFromBreakdown('20 kg')).toBe(20);
  });

  it('parses simple lb value', () => {
    const result = calculateLoadFromBreakdown('10 lb');
    expect(result).toBeCloseTo(4.5, 1);
  });

  // "De cada lado" pattern
  it('handles "(2kg + 5lb) de cada lado"', () => {
    // 2*2 + 5*0.4536*2 = 4 + 4.536 = 8.536 → 8.5
    expect(calculateLoadFromBreakdown('(2kg + 5lb) de cada lado')).toBe(8.5);
  });

  it('handles "10kg de cada lado"', () => {
    // Without parentheses: 10*2 = 20
    expect(calculateLoadFromBreakdown('10kg de cada lado')).toBe(20);
  });

  it('handles "barra 20kg + 10kg de cada lado"', () => {
    // barra=20 + 10*2=20 → 40
    expect(calculateLoadFromBreakdown('barra 20kg + 10kg de cada lado')).toBe(40);
  });

  it('handles "15lb + 2kg de cada lado + barra 10kg"', () => {
    // barra=10 + (15lb*0.4536*2 + 2kg*2) = 10 + 13.608 + 4 = 27.608 → 27.6
    expect(calculateLoadFromBreakdown('15lb + 2kg de cada lado + barra 10kg')).toBe(27.6);
  });

  it('handles "15lb + 2kg cada lado + barra 10kg" (sem "de") — espelha "de cada lado"', () => {
    // Bug original: sem "de", o regex estrito tratava como pesos
    // simples e dava 25.6 em vez de 27.6.
    expect(calculateLoadFromBreakdown('15lb + 2kg cada lado + barra 10kg')).toBe(27.6);
  });

  it('handles "25 lb + 5 kg cada lado + barra 20kg" (composto sem "de")', () => {
    // 25lb*0.4536*2 + 5kg*2 + barra=20 = 22.68 + 10 + 20 = 52.68 → 52.7
    expect(calculateLoadFromBreakdown('25 lb + 5 kg cada lado + barra 20kg')).toBe(52.7);
  });

  it('handles lb "cada lado" without requiring "de" — REGRESSION GUARD (bug real)', () => {
    // Bug observado em prod: app calculava 46.8 (tratava como sem
    // "cada lado") quando o coach disse "70 lb cada lado + barra 15kg".
    // 70lb por lado × 2 = 140lb × 0.4536 = 63.504kg; + barra 15kg = 78.504 → 78.5
    expect(calculateLoadFromBreakdown('70 lb cada lado + barra 15kg')).toBe(78.5);
  });

  it('handles "70 lb de cada lado + barra 15kg" (canônico) — mesmo resultado', () => {
    expect(calculateLoadFromBreakdown('70 lb de cada lado + barra 15kg')).toBe(78.5);
  });

  it('handles "(70 lb) cada lado + barra 15kg" (parens sem "de")', () => {
    expect(calculateLoadFromBreakdown('(70 lb) cada lado + barra 15kg')).toBe(78.5);
  });

  it('handles "(70 lb) de cada lado + barra 15kg" (parens canônico)', () => {
    expect(calculateLoadFromBreakdown('(70 lb) de cada lado + barra 15kg')).toBe(78.5);
  });

  it('keeps lb as total when "cada lado" is absent', () => {
    // 70lb total × 0.4536 = 31.752kg; barra=15kg → 46.752 → 46.8kg
    expect(calculateLoadFromBreakdown('70 lb + barra 15kg')).toBe(46.8);
  });

  it('handles explicit plate multiplier "2x70lb" without requiring cada lado — REGRESSION GUARD', () => {
    // Bug observado em registro manual: "(2x70lb+2kg)+ barra 15kg"
    // era calculado como 48.8 porque o parser ignorava o "2x" e lia
    // apenas "70lb + 2kg + barra 15kg".
    // 2×70lb = 63.504kg; +2kg + barra 15kg = 80.504 → 80.5
    expect(calculateLoadFromBreakdown('(2x70lb+2kg)+ barra 15kg')).toBe(80.5);
  });

  it('handles spaced explicit multiplier "2 x 70 lb"', () => {
    expect(calculateLoadFromBreakdown('(2 x 70 lb + 2kg) + barra 15kg')).toBe(80.5);
  });

  it('handles multiplication sign "2×70lb"', () => {
    expect(calculateLoadFromBreakdown('(2×70lb + 2kg)+ barra 15kg')).toBe(80.5);
  });

  it('handles multiple explicit multipliers in the same breakdown', () => {
    // 2×70lb = 63.504kg; 2×2kg = 4kg; + barra 15kg = 82.504 → 82.5
    expect(calculateLoadFromBreakdown('2x70lb + 2x2kg + barra 15kg')).toBe(82.5);
  });

  it('combines explicit multipliers with cada lado when the whole group is per-side', () => {
    // (2×25lb + 5kg) cada lado + barra 20kg
    // ((50lb × 0.4536) + 5kg) × 2 + 20kg = 75.36 → 75.4
    expect(calculateLoadFromBreakdown('(2x25lb + 5kg) cada lado + barra 20kg')).toBe(75.4);
  });

  it('handles parenthesized "cada lado" without requiring "de"', () => {
    // 20kg*2 + 10lb*0.4536*2 + barra 15 = 40 + 9.072 + 15 = 64.072 → 64.1
    expect(calculateLoadFromBreakdown('(20kg + 10lb) cada lado + barra 15kg')).toBe(64.1);
  });

  // Kettlebells / dumbbells
  it('handles "2 kettlebells 16kg"', () => {
    expect(calculateLoadFromBreakdown('2 kettlebells 16kg')).toBe(32);
  });

  it('handles "2 kettlebells 24kg" → 48.0', () => {
    expect(calculateLoadFromBreakdown('2 kettlebells 24kg')).toBe(48);
  });

  it('handles "2 halteres 10kg"', () => {
    expect(calculateLoadFromBreakdown('2 halteres 10kg')).toBe(20);
  });

  it('handles "2 halteres 15kg" → 30.0', () => {
    expect(calculateLoadFromBreakdown('2 halteres 15kg')).toBe(30);
  });

  // Sandbag / Landmine — parser não tem alias dedicado; cai no caminho
  // de pesos simples (kg direto, sem multiplicar por 2). Documentado.
  it('handles "sandbag 30kg" como carga direta (cai em pesos simples → 30.0)', () => {
    expect(calculateLoadFromBreakdown('sandbag 30kg')).toBe(30);
  });

  it('handles "landmine 15kg" como carga direta (cai em pesos simples → 15.0)', () => {
    expect(calculateLoadFromBreakdown('landmine 15kg')).toBe(15);
  });

  // FINDING (não alterado neste PR): a regra nova oficial diz
  // "peso corporal → load_kg=null". O cliente atual usa o
  // studentWeight como load_kg quando informado. Mudar isso afeta
  // volumes históricos e PRs. Mantido como follow-up; o teste abaixo
  // documenta o COMPORTAMENTO ATUAL.
  it('"peso corporal" + studentWeight retorna studentWeight (comportamento atual — ver finding no PR)', () => {
    expect(calculateLoadFromBreakdown('peso corporal', 80)).toBe(80);
  });

  it('"elástico roxo" → null (carga não calculável)', () => {
    expect(calculateLoadFromBreakdown('elástico roxo')).toBeNull();
  });

  // Bar only
  it('handles "barra 20 kg"', () => {
    expect(calculateLoadFromBreakdown('barra 20 kg')).toBe(20);
  });

  // Bar should NOT be double-counted (BUG-007)
  it('does not double-count bar weight with simple kg', () => {
    // "barra 20kg + 10kg" → 20 + 10 = 30 (NOT 40)
    expect(calculateLoadFromBreakdown('barra 20kg + 10kg')).toBe(30);
  });

  // Decimal values
  it('handles decimal values', () => {
    expect(calculateLoadFromBreakdown('12.5 kg')).toBe(12.5);
  });

  it('handles comma decimal values', () => {
    expect(calculateLoadFromBreakdown('12,5 kg')).toBe(12.5);
  });
});

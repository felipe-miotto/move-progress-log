/**
 * Utilitário centralizado para cálculo de carga
 * Fonte única de verdade para conversão de descrições de carga para kg
 */

import { POUND_TO_KG_CONVERSION, roundToDecimal } from "@/constants/units";

/**
 * Calcula a carga total em kg baseada na descrição textual
 * 
 * Formatos suportados:
 * - "15lb + 2kg de cada lado + barra 10kg" → 27.6kg
 * - "(2kg + 5lb) de cada lado" → 8.5kg
 * - "2 kettlebells 16kg" → 32kg
 * - "barra 20kg + 10kg de cada lado" → 40kg
 * - "peso corporal" → null (requer peso do aluno)
 * - "elástico" → null
 * 
 * @param breakdown - Descrição textual da carga
 * @param studentWeight - Peso do aluno em kg (opcional, para "peso corporal")
 * @returns Carga em kg ou null se não calculável
 */
export const calculateLoadFromBreakdown = (
  breakdown: string,
  studentWeight?: number | null
): number | null => {
  if (!breakdown || !breakdown.trim()) return null;

  const normalizedBreakdown = breakdown.trim();

  try {
    let total = 0;

    // 1. PESO CORPORAL COM VALOR EXPLÍCITO
    const bodyCorporalWithValue = normalizedBreakdown.match(/Peso corporal\s*=\s*(\d+(?:[.,]\d+)?)\s*kg/i);
    if (bodyCorporalWithValue) {
      const value = parseFloat(bodyCorporalWithValue[1].replace(',', '.'));
      return roundToDecimal(value);
    }

    // 2. PESO CORPORAL SEM VALOR → usar peso do aluno
    if (/peso\s*corporal/i.test(normalizedBreakdown) && !bodyCorporalWithValue) {
      return studentWeight ? roundToDecimal(studentWeight) : null;
    }

    // 3. ELÁSTICO/BANDA → null
    if (/elástico|banda|elastic|band/i.test(normalizedBreakdown)) {
      return null;
    }

    // 4. DETECTAR "CADA LADO" - com ou sem "de", com ou sem parênteses
    const eachSidePattern = /(?:de\s*)?cada\s*lado/i;
    const hasEachSide = eachSidePattern.test(normalizedBreakdown);

    if (hasEachSide) {
      // Verificar se usa parênteses: "(Xkg) de cada lado"
      const parenMatch = normalizedBreakdown.match(/\((.*?)\)\s*(?:de\s*)?cada\s*lado/i);
      
      if (parenMatch) {
        // Formato com parênteses: (2kg + 5lb) de cada lado
        const content = parenMatch[1];
        
        // KG dentro dos parênteses (multiplicar por 2)
        const kgMatches = Array.from(content.matchAll(/(\d+(?:[.,]\d+)?)\s*kg/gi));
        for (const m of kgMatches) {
          const value = parseFloat(m[1].replace(',', '.'));
          total += value * 2;
        }
        
        // LB dentro dos parênteses (multiplicar por 2)
        // Converte SEM arredondamento intermediário — `roundToDecimal`
        // só roda no final (linha do return). Arredondar lb por item
        // antes de somar causa off-by-0.1 (ex.: 70 lb por lado vira 78.6
        // em vez de 78.5 quando combinado com barra).
        const lbMatches = Array.from(content.matchAll(/(\d+(?:[.,]\d+)?)\s*lb/gi));
        for (const m of lbMatches) {
          const value = parseFloat(m[1].replace(',', '.'));
          total += value * POUND_TO_KG_CONVERSION * 2;
        }
        
        // Verificar se há barra FORA dos parênteses
        const afterParen = normalizedBreakdown.split(/\)\s*(?:de\s*)?cada\s*lado/i)[1] || '';
        const beforeParen = normalizedBreakdown.split(/\(/)[0] || '';
        const outsideContent = beforeParen + ' ' + afterParen;
        
        const barraMatch = outsideContent.match(/barra\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*kg/i);
        if (barraMatch) {
          total += parseFloat(barraMatch[1].replace(',', '.'));
        }
      } else {
        // Formato SEM parênteses: "15lb + 2kg cada lado + barra 10kg"
        // Separar a parte "de cada lado" da parte da barra
        const beforeEachSide = normalizedBreakdown.split(eachSidePattern)[0];
        
        // Extrair barra separadamente (não multiplica por 2)
        const barraMatch = normalizedBreakdown.match(/barra\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*kg/i);
        if (barraMatch) {
          total += parseFloat(barraMatch[1].replace(',', '.'));
        }
        
        // Remover a parte da barra do conteúdo para não contar duas vezes
        const contentWithoutBarra = beforeEachSide.replace(/barra\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*kg/gi, '');
        
        // Processar KG antes de "de cada lado" (multiplicar por 2)
        const kgMatches = Array.from(contentWithoutBarra.matchAll(/(\d+(?:[.,]\d+)?)\s*kg/gi));
        for (const m of kgMatches) {
          const value = parseFloat(m[1].replace(',', '.'));
          total += value * 2;
        }

        // Processar LB antes de "de cada lado" (multiplicar por 2).
        // Sem arredondamento intermediário (ver comentário acima).
        const lbMatches = Array.from(contentWithoutBarra.matchAll(/(\d+(?:[.,]\d+)?)\s*lb/gi));
        for (const m of lbMatches) {
          const value = parseFloat(m[1].replace(',', '.'));
          total += value * POUND_TO_KG_CONVERSION * 2;
        }
      }
    } else {
      // 5. KETTLEBELLS/HALTERES DUPLOS (multiplicar por 2)
      const multiKbMatch = normalizedBreakdown.match(/(2\s*kettlebells?|duplo\s*kettlebell|kettlebell\s*duplo|dois\s*halteres|2\s*halteres).*?(\d+(?:[.,]\d+)?)\s*(kg|lb)/i);
      if (multiKbMatch) {
        const value = parseFloat(multiKbMatch[2].replace(',', '.'));
        const unit = multiKbMatch[3].toLowerCase();
        // Sem arredondamento intermediário em lb (ver comentário acima).
        const kg = unit === 'lb' ? value * POUND_TO_KG_CONVERSION : value;
        total += kg * 2;
      }

      // 6. BARRA (sempre soma direta)
      const barraMatch = normalizedBreakdown.match(/barra\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*kg/i);
      if (barraMatch) {
        total += parseFloat(barraMatch[1].replace(',', '.'));
      }

      // 7. PESOS SIMPLES (se não processou kettlebells duplos)
      if (!multiKbMatch) {
        // KG simples
        const kgMatches = Array.from(normalizedBreakdown.matchAll(/(\d+(?:[.,]\d+)?)\s*kg/gi));
        for (const m of kgMatches) {
          // Ignorar se faz parte de "barra X kg"
          const beforeMatch = normalizedBreakdown.substring(Math.max(0, m.index! - 10), m.index!);
          if (!/barra\s*(?:de\s*)?$/i.test(beforeMatch)) {
            const value = parseFloat(m[1].replace(',', '.'));
            total += value;
          }
        }

        // LB simples — sem arredondamento intermediário.
        const lbMatches = Array.from(normalizedBreakdown.matchAll(/(\d+(?:[.,]\d+)?)\s*lb/gi));
        for (const m of lbMatches) {
          const value = parseFloat(m[1].replace(',', '.'));
          total += value * POUND_TO_KG_CONVERSION;
        }
      }
    }

    // 8. ARREDONDAR PARA 1 CASA DECIMAL usando função global
    return total > 0 ? roundToDecimal(total) : null;
  } catch {
    // Silently return null for unparseable formats
    return null;
  }
};

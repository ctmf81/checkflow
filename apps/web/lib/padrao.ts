// Lógica pura de validação do cadastro de Padrão — usada pela tela
// (app/gestao/padrao/criar/page.tsx) e coberta por testes unitários em
// tests/unit/lib/padrao.unit.test.ts.
//
// Um padrão é uma validação combinatória: o valor de referência não é fixo,
// depende da combinação de variáveis escolhida. Cada "instância" é uma
// combinação específica (1 valor por variável) → faixa esperada [min, max].
// Esta validação garante que o que vai ao banco é consistente.

export interface InstanciaInput {
  valores: Record<string, string> // variavel_id → valor_id
  valor_min: string               // string crua do input (pode estar vazia)
  valor_max: string
}

export type ResultadoValidacao = { ok: true } | { ok: false; erro: string }

/**
 * Valida o padrão antes de salvar. Regras:
 *  - nome obrigatório;
 *  - ao menos uma variável selecionada;
 *  - cada instância tem um valor para CADA variável selecionada;
 *  - min/max, quando informados, são numéricos;
 *  - ao menos um entre min/max informado;
 *  - min não pode ser maior que max;
 *  - não pode haver duas instâncias com a mesma combinação de valores.
 */
export function validarPadrao(
  nome: string,
  variaveisSelecionadas: string[],
  instancias: InstanciaInput[],
): ResultadoValidacao {
  if (!nome.trim()) return { ok: false, erro: 'Informe o nome do padrão.' }
  if (variaveisSelecionadas.length === 0) {
    return { ok: false, erro: 'Selecione ao menos uma variável que compõe este padrão.' }
  }

  for (const [idx, inst] of instancias.entries()) {
    const n = idx + 1
    const completo = variaveisSelecionadas.every(vid => inst.valores[vid])
    if (!completo) return { ok: false, erro: `Instância #${n}: escolha um valor para cada variável.` }

    const minVazio = inst.valor_min.trim() === ''
    const maxVazio = inst.valor_max.trim() === ''
    const minOk = minVazio || !isNaN(Number(inst.valor_min))
    const maxOk = maxVazio || !isNaN(Number(inst.valor_max))
    if (!minOk || !maxOk) {
      return { ok: false, erro: `Instância #${n}: valores mínimo/máximo devem ser numéricos.` }
    }
    if (minVazio && maxVazio) {
      return { ok: false, erro: `Instância #${n}: informe ao menos o mínimo ou o máximo.` }
    }
    if (!minVazio && !maxVazio && Number(inst.valor_min) > Number(inst.valor_max)) {
      return { ok: false, erro: `Instância #${n}: o mínimo não pode ser maior que o máximo.` }
    }
  }

  const chaves = instancias.map(inst => variaveisSelecionadas.map(v => inst.valores[v]).join('|'))
  if (new Set(chaves).size !== chaves.length) {
    return { ok: false, erro: 'Há instâncias com a mesma combinação de variáveis.' }
  }

  return { ok: true }
}

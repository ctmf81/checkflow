// Rate limiter simples por chave (IP normalmente), janela deslizante em
// memória. Ideal para endpoints públicos onde a chance de abuse existe mas o
// custo de spam legítimo não é catastrófico. Em prod com múltiplas réplicas,
// cada uma tem seu próprio limite (soma efetiva = limite × réplicas), o que
// ainda mitiga o abuso ~90% na prática. Sem Redis para simplicidade.
//
// Pura (recebe `now`) para ser testável. A rota faz o wire com `Date.now()`.

export interface RateLimiter {
  ok(key: string | undefined | null, now?: number): boolean
  /** Tamanho do map, para housekeeping/telemetry. */
  size(): number
}

export function criarRateLimiter(opts: { janelaMs: number; max: number; capacidade?: number }): RateLimiter {
  const janelaMs = opts.janelaMs
  const max = opts.max
  const capacidade = opts.capacidade ?? 5000
  const map = new Map<string, number[]>()

  return {
    ok(key: string | undefined | null, now = Date.now()): boolean {
      // Fail-open quando não conseguimos identificar o chamador (proxy sem IP,
      // socket estranho). Prefere não travar usuário legítimo a bloquear cego.
      if (!key) return true
      const arr = (map.get(key) ?? []).filter(t => now - t < janelaMs)
      if (arr.length >= max) { map.set(key, arr); return false }
      arr.push(now)
      map.set(key, arr)
      if (map.size > capacidade) {
        for (const [k, ts] of map) {
          if (!ts.some(t => now - t < janelaMs)) map.delete(k)
        }
      }
      return true
    },
    size() { return map.size },
  }
}

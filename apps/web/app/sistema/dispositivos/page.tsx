'use client'

import { Cpu, Download, KeyRound, Radar, Wrench } from 'lucide-react'

// Área de gestão do Agente IoT/IA (câmeras/sensores → checklist automático).
// EM DESENVOLVIMENTO — esta é a porta de entrada da feature. A captura/execução
// automática ainda não está construída no CheckFlow (ver docs/features/CHECKLIST_IOT_IA.md).
// O painel de descoberta roda NO AGENTE (rede local do cliente), não aqui na nuvem.

export default function DispositivosPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Cpu className="text-orange-500" size={22} />
        <div>
          <h1 className="text-xl font-bold text-gray-800">Dispositivos (IoT / IA)</h1>
          <p className="hidden sm:block text-sm text-gray-500 mt-0.5">Câmeras e sensores que alimentam checklists automáticos.</p>
        </div>
        <span className="ml-auto text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">Em desenvolvimento</span>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-6 text-sm text-amber-900">
        Esta área é a <b>porta de entrada</b> da funcionalidade. O agente roda na rede do cliente,
        descobre os dispositivos e valida cada um. A captura e a execução automática ainda estão
        em construção — nada aqui é vendável ainda.
      </div>

      <h2 className="text-sm font-semibold text-gray-700 mb-3">Como funciona (por cliente/local)</h2>
      <div className="space-y-3">
        <Passo icon={Download} n="1" titulo="Instalar o agente" desc="Um instalador (Windows/serviço) ou um aparelho pré-configurado (Raspberry Pi) roda na rede do cliente. Só conexões de saída — nada exposto na internet.">
          <button disabled className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 cursor-not-allowed">Baixar instalador (em breve)</button>
        </Passo>
        <Passo icon={KeyRound} n="2" titulo="Parear com esta empresa" desc="Um código vincula aquele agente à empresa. Gerado aqui, digitado no agente.">
          <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400">código — em breve</span>
        </Passo>
        <Passo icon={Radar} n="3" titulo="Descobrir dispositivos" desc="O agente varre a rede (ONVIF) e lista câmeras/DVR. Para cada um, pede o que falta (usuário/senha) e valida capturando uma imagem de teste.">
          <span className="text-xs text-gray-400">painel roda no agente (local)</span>
        </Passo>
        <Passo icon={Wrench} n="4" titulo="Colocar em operação" desc="Dispositivo validado entra no checklist automático (agendado). Câmera → IA interpreta; sensor → avalia a faixa.">
          <span className="text-xs text-gray-400">—</span>
        </Passo>
      </div>

      <p className="text-xs text-gray-400 mt-6">
        Suporte: câmeras/DVR/NVR compatíveis com <b>ONVIF</b> (mercado profissional). Câmeras de nuvem
        de consumidor (ex.: Mibo) têm suporte limitado. Detalhes técnicos em <code>docs/features/CHECKLIST_IOT_IA.md</code>.
      </p>
    </div>
  )
}

function Passo({ icon: Icon, n, titulo, desc, children }: { icon: any; n: string; titulo: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center flex-shrink-0"><Icon size={15} /></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">{n}. {titulo}</p>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  )
}

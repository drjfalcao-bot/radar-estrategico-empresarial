import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileText,
  Gauge,
  Info,
  Landmark,
  LogIn,
  Presentation,
  RefreshCcw,
  Save,
  Scale,
  ShieldAlert,
  SlidersHorizontal,
  Target,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import {
  calculateScores,
  confidenceBand,
  initialAssessment,
  scoreBand,
  totalDebt,
  type AssessmentData,
} from './domain/model'

const steps = [
  { title: 'Empresa', subtitle: 'Identificação e estrutura', icon: Building2 },
  { title: 'Objetivo', subtitle: 'Contexto da reunião', icon: Target },
  { title: 'Caixa', subtitle: 'Operação e capacidade', icon: WalletCards },
  { title: 'Passivo', subtitle: 'Mapa das obrigações', icon: Landmark },
  { title: 'Cobrança', subtitle: 'Exposição patrimonial', icon: ShieldAlert },
  { title: 'Reforma', subtitle: 'Impacto operacional', icon: RefreshCcw },
  { title: 'Reação', subtitle: 'Estrutura para agir', icon: Gauge },
  { title: 'Decisão', subtitle: 'Limites e prioridades', icon: SlidersHorizontal },
]

const meetingReasons = [
  'Compreender o cenário',
  'Reduzir impacto financeiro',
  'Regularizar débitos',
  'Obter ou preservar certidão',
  'Enfrentar execução ou bloqueio',
  'Reorganizar o passivo',
  'Avaliar garantia',
  'Preparar-se para a Reforma Tributária',
  'Reduzir risco futuro',
]

const collectionStages = [
  'Sem cobrança relevante',
  'Pendências administrativas',
  'Notificações',
  'Execução fiscal',
  'Citação realizada',
  'Busca patrimonial',
  'Bloqueio ou penhora',
  'Atos de expropriação',
  'Bloqueios recorrentes',
]

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function Field({ label, help, children, className = '' }: { label: string; help?: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="field-label">{label}</span>
      {children}
      {help && <span className="field-help">{help}</span>}
    </label>
  )
}

function MoneyInput({ value, onChange, placeholder = 'R$ 0' }: { value: number; onChange: (value: number) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">R$</span>
      <input
        className="field-input pl-11"
        inputMode="decimal"
        min="0"
        placeholder={placeholder.replace('R$ ', '')}
        type="number"
        value={value || ''}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </div>
  )
}

function ChoiceButtons({
  value,
  options,
  onChange,
}: {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex min-h-11 items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition ${
              selected
                ? 'border-brand-400 bg-brand-50 text-navy-900 ring-2 ring-brand-400/15'
                : 'border-slate-200 bg-white text-slate-600 hover:border-brand-400/60 hover:bg-brand-50/50'
            }`}
          >
            <span>{option.label}</span>
            {selected ? <CheckCircle2 className="h-4 w-4 text-brand-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
          </button>
        )
      })}
    </div>
  )
}

function RangeField({
  label,
  help,
  value,
  onChange,
  min = 0,
  max = 4,
  leftLabel = 'Baixo',
  rightLabel = 'Alto',
}: {
  label: string
  help?: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  leftLabel?: string
  rightLabel?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          {help && <p className="mt-1 text-xs leading-relaxed text-slate-500">{help}</p>}
        </div>
        <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-sm font-bold text-brand-600">{value}/{max}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-[#176DB5]"
      />
      <div className="mt-2 flex justify-between text-[11px] font-medium uppercase tracking-wide text-slate-400">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, label, detail }: { checked: boolean; onChange: (checked: boolean) => void; label: string; detail?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-4 rounded-xl border p-3.5 text-left transition ${
        checked ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        {detail && <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-brand-600' : 'bg-slate-200'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  )
}

const toneClasses: Record<string, string> = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  orange: 'border-orange-200 bg-orange-50 text-orange-700',
  red: 'border-red-200 bg-red-50 text-red-700',
}

function Metric({ label, value, positive = false }: { label: string; value: number; positive?: boolean }) {
  const band = positive
    ? value >= 75
      ? { label: 'Estruturada', tone: 'emerald' }
      : value >= 50
        ? { label: 'Parcial', tone: 'amber' }
        : { label: 'Frágil', tone: 'red' }
    : scoreBand(value)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${toneClasses[band.tone]}`}>
          {band.label}
        </span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <strong className="text-3xl font-bold tracking-tight text-navy-950">{value}</strong>
        <span className="pb-1 text-xs font-semibold text-slate-400">/100</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function PresentationView({ data, onClose }: { data: AssessmentData; onClose: () => void }) {
  const scores = calculateScores(data)
  const priorityBand = scoreBand(scores.strategicPriority)

  return (
    <div className="min-h-screen bg-navy-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-8 py-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">Radar Estratégico Empresarial</p>
            <h1 className="mt-2 text-2xl font-semibold">{data.companyName || 'Empresa em análise'}</h1>
          </div>
          <button onClick={onClose} className="rounded-xl border border-white/15 bg-white/5 p-3 transition hover:bg-white/10" aria-label="Sair do modo apresentação">
            <X className="h-5 w-5" />
          </button>
        </header>

        <main className="grid flex-1 gap-8 py-10 lg:grid-cols-[1.05fr_1.4fr]">
          <section className="flex flex-col justify-center rounded-3xl border border-white/10 bg-white/[0.04] p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-400">Índice de Prioridade Estratégica</p>
            <div className="mt-8 flex items-end gap-5">
              <strong className="text-8xl font-bold leading-none tracking-[-0.06em]">{scores.strategicPriority}</strong>
              <div className="pb-2">
                <p className="text-sm text-white/45">de 100</p>
                <p className="mt-2 text-2xl font-bold uppercase">{priorityBand.label}</p>
              </div>
            </div>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-white/70">
              Leitura estratégica baseada nas informações disponíveis. A priorização combina caixa, passivo, cobrança, reforma tributária e capacidade de reação.
            </p>
            <div className="mt-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <ClipboardCheck className="h-5 w-5 text-brand-400" />
              <div>
                <p className="text-xs uppercase tracking-wide text-white/45">Confiança dos dados</p>
                <p className="mt-1 font-semibold">{confidenceBand(scores.confidence)} · {scores.confidence}%</p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            {[
              ['Pressão sobre o caixa', scores.cashPressure],
              ['Pressão do passivo', scores.liabilityPressure],
              ['Risco de cobrança', scores.collectionRisk],
              ['Exposição à reforma', scores.reformExposure],
            ].map(([label, value]) => (
              <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <p className="text-sm font-semibold text-white/55">{label}</p>
                <div className="mt-6 flex items-end justify-between gap-4">
                  <strong className="text-5xl font-bold tracking-tight">{value}</strong>
                  <span className="rounded-lg bg-white/10 px-3 py-1 text-xs font-bold uppercase">{scoreBand(Number(value)).label}</span>
                </div>
                <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-brand-400" style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
            <div className="rounded-3xl border border-brand-400/30 bg-brand-400/10 p-6 sm:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-brand-400">Capacidade de reação</p>
                  <p className="mt-2 text-sm text-white/55">Quanto maior, melhor a condição de implementação.</p>
                </div>
                <strong className="text-5xl font-bold">{scores.reactionCapacity}</strong>
              </div>
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-brand-400" style={{ width: `${scores.reactionCapacity}%` }} />
              </div>
            </div>
          </section>
        </main>

        <footer className="flex items-center justify-between border-t border-white/10 pt-5 text-xs text-white/35">
          <span>Simulação indicativa — apoio à decisão</span>
          <span>{new Date().toLocaleDateString('pt-BR')}</span>
        </footer>
      </div>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState<AssessmentData>(() => {
    const saved = localStorage.getItem('radar-assessment-draft')
    if (!saved) return initialAssessment
    try {
      return { ...initialAssessment, ...JSON.parse(saved) }
    } catch {
      return initialAssessment
    }
  })
  const [currentStep, setCurrentStep] = useState(0)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved')
  const [presentationMode, setPresentationMode] = useState(false)
  const scores = useMemo(() => calculateScores(data), [data])

  useEffect(() => {
    setSaveStatus('saving')
    const timer = window.setTimeout(() => {
      localStorage.setItem('radar-assessment-draft', JSON.stringify(data))
      setSaveStatus('saved')
    }, 500)
    return () => window.clearTimeout(timer)
  }, [data])

  const setField = <K extends keyof AssessmentData>(field: K, value: AssessmentData[K]) => {
    setData((current) => ({ ...current, [field]: value }))
  }

  const resetDraft = () => {
    localStorage.removeItem('radar-assessment-draft')
    setData(initialAssessment)
    setCurrentStep(0)
  }

  if (presentationMode) {
    return <PresentationView data={data} onClose={() => setPresentationMode(false)} />
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <StepCard
            eyebrow="Etapa 1 de 8"
            title="Vamos entender quem é a empresa"
            description="Comece pela identificação e pela estrutura operacional. Campos não informados permanecem distintos de zero."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="CNPJ">
                <input className="field-input" placeholder="00.000.000/0000-00" value={data.cnpj} onChange={(event) => setField('cnpj', formatCnpj(event.target.value))} />
              </Field>
              <Field label="Razão social">
                <input className="field-input" placeholder="Nome empresarial completo" value={data.companyName} onChange={(event) => setField('companyName', event.target.value)} />
              </Field>
              <Field label="Nome utilizado na operação">
                <input className="field-input" placeholder="Nome fantasia" value={data.tradeName} onChange={(event) => setField('tradeName', event.target.value)} />
              </Field>
              <Field label="CNAE ou atividade principal">
                <input className="field-input" placeholder="Ex.: transporte rodoviário de cargas" value={data.cnae} onChange={(event) => setField('cnae', event.target.value)} />
              </Field>
              <Field label="Município">
                <input className="field-input" placeholder="Cidade" value={data.city} onChange={(event) => setField('city', event.target.value)} />
              </Field>
              <Field label="UF">
                <input className="field-input uppercase" maxLength={2} placeholder="RS" value={data.state} onChange={(event) => setField('state', event.target.value.toUpperCase())} />
              </Field>
              <Field label="Regime tributário">
                <select className="field-input" value={data.taxRegime} onChange={(event) => setField('taxRegime', event.target.value as AssessmentData['taxRegime'])}>
                  <option value="nao_informado">Não informado</option>
                  <option value="simples">Simples Nacional</option>
                  <option value="presumido">Lucro Presumido</option>
                  <option value="real">Lucro Real</option>
                </select>
              </Field>
              <Field label="Pertence a grupo econômico?">
                <select className="field-input" value={data.economicGroup} onChange={(event) => setField('economicGroup', event.target.value as AssessmentData['economicGroup'])}>
                  <option value="nao_informado">Não informado</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </Field>
              {data.economicGroup === 'sim' && (
                <Field label="Número aproximado de empresas" className="md:col-span-2">
                  <input className="field-input" min="1" type="number" value={data.groupCompanies} onChange={(event) => setField('groupCompanies', Number(event.target.value) || 1)} />
                </Field>
              )}
            </div>
          </StepCard>
        )
      case 1:
        return (
          <StepCard
            eyebrow="Etapa 2 de 8"
            title="O que trouxe a empresa até esta reunião?"
            description="A finalidade da reunião orienta a prioridade dos cenários, sem transformar o diagnóstico em etapa de funil comercial."
          >
            <Field label="Motivo principal da análise">
              <div className="grid gap-3 md:grid-cols-2">
                {meetingReasons.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setField('meetingReason', reason)}
                    className={`flex min-h-16 items-center justify-between rounded-2xl border p-4 text-left text-sm font-semibold transition ${
                      data.meetingReason === reason
                        ? 'border-brand-400 bg-brand-50 text-navy-900 ring-2 ring-brand-400/15'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-brand-400/50'
                    }`}
                  >
                    <span>{reason}</span>
                    {data.meetingReason === reason && <Check className="h-5 w-5 text-brand-600" />}
                  </button>
                ))}
              </div>
            </Field>

            <div className="mt-7 grid gap-6 lg:grid-cols-2">
              <Field label="Existe evento urgente?">
                <ChoiceButtons
                  value={data.urgency}
                  onChange={(value) => setField('urgency', value as AssessmentData['urgency'])}
                  options={[
                    { value: 'sem_urgencia', label: 'Sem urgência identificada' },
                    { value: 'possivel', label: 'Possível urgência' },
                    { value: 'confirmada', label: 'Urgência confirmada' },
                  ]}
                />
              </Field>
              <Field label="O decisor participa da reunião?">
                <ChoiceButtons
                  value={data.decisionMakerPresent}
                  onChange={(value) => setField('decisionMakerPresent', value as AssessmentData['decisionMakerPresent'])}
                  options={[
                    { value: 'sim', label: 'Sim' },
                    { value: 'parcial', label: 'Parcialmente' },
                    { value: 'nao', label: 'Não' },
                    { value: 'nao_informado', label: 'Não informado' },
                  ]}
                />
              </Field>
            </div>

            <div className="mt-6">
              <Field label="Disposição atual para agir">
                <ChoiceButtons
                  value={data.intentToAct}
                  onChange={(value) => setField('intentToAct', value as AssessmentData['intentToAct'])}
                  options={[
                    { value: 'agora', label: 'Pretende agir agora' },
                    { value: 'apos_analise', label: 'Após compreender o cenário' },
                    { value: 'indefinido', label: 'Ainda sem definição' },
                    { value: 'nao_informado', label: 'Não informado' },
                  ]}
                />
              </Field>
            </div>
          </StepCard>
        )
      case 2:
        return (
          <StepCard
            eyebrow="Etapa 3 de 8"
            title="Como a operação sustenta suas obrigações?"
            description="A leitura de caixa combina comprometimento mensal, folga operacional, prazo de recebimento e reserva financeira."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Faturamento médio mensal" help="Use valor aproximado quando o dado exato ainda não estiver disponível.">
                <MoneyInput value={data.monthlyRevenue} onChange={(value) => setField('monthlyRevenue', value)} />
              </Field>
              <Field label="Tendência do faturamento">
                <select className="field-input" value={data.revenueTrend} onChange={(event) => setField('revenueTrend', event.target.value as AssessmentData['revenueTrend'])}>
                  <option value="nao_informado">Não informado</option>
                  <option value="crescimento">Em crescimento</option>
                  <option value="estavel">Estável</option>
                  <option value="queda">Em queda</option>
                </select>
              </Field>
              <Field label="Folga mensal estimada de caixa" help="Valor que normalmente sobra após custos, folha, fornecedores e despesas.">
                <MoneyInput value={data.monthlyCashSlack} onChange={(value) => setField('monthlyCashSlack', value)} />
              </Field>
              <Field label="Parcelas tributárias mensais atuais">
                <MoneyInput value={data.monthlyTaxInstallments} onChange={(value) => setField('monthlyTaxInstallments', value)} />
              </Field>
              <Field label="Outros compromissos financeiros relevantes">
                <MoneyInput value={data.otherMonthlyCommitments} onChange={(value) => setField('otherMonthlyCommitments', value)} />
              </Field>
              <Field label="Prazo médio de recebimento" help="Informe o prazo médio aproximado em dias.">
                <div className="relative">
                  <input className="field-input pr-14" type="number" min="0" value={data.receivableDays} onChange={(event) => setField('receivableDays', Number(event.target.value) || 0)} />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">dias</span>
                </div>
              </Field>
              <Field label="Reserva financeira disponível" help="Quantidade aproximada de meses de operação que a reserva suportaria.">
                <div className="relative">
                  <input className="field-input pr-16" type="number" min="0" step="0.5" value={data.reserveMonths} onChange={(event) => setField('reserveMonths', Number(event.target.value) || 0)} />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">meses</span>
                </div>
              </Field>
            </div>
          </StepCard>
        )
      case 3:
        return (
          <StepCard
            eyebrow="Etapa 4 de 8"
            title="Qual é o peso atual das obrigações?"
            description="Separe os débitos por origem. Essa classificação alimentará os simuladores Receita, PGFN e comparativos futuros."
          >
            <div className="mb-6 rounded-2xl border border-brand-400/20 bg-brand-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Passivo informado</p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-navy-950">{currency.format(totalDebt(data))}</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {[
                ['Receita Federal', 'rfbDebt'],
                ['PGFN — Dívida Ativa', 'pgfnDebt'],
                ['Simples Nacional', 'simpleDebt'],
                ['Previdenciário', 'socialSecurityDebt'],
                ['FGTS', 'fgtsDebt'],
                ['Estadual', 'stateDebt'],
                ['Municipal', 'municipalDebt'],
                ['Em discussão', 'disputedDebt'],
              ].map(([label, field]) => (
                <Field key={field} label={label}>
                  <MoneyInput value={data[field as keyof AssessmentData] as number} onChange={(value) => setField(field as keyof AssessmentData, value as never)} />
                </Field>
              ))}
              <Field label="Valor mensal dos parcelamentos ativos">
                <MoneyInput value={data.currentInstallments} onChange={(value) => setField('currentInstallments', value)} />
              </Field>
              <Field label="O passivo está integralmente mapeado?">
                <select className="field-input" value={data.debtMapped} onChange={(event) => setField('debtMapped', event.target.value as AssessmentData['debtMapped'])}>
                  <option value="nao_informado">Não informado</option>
                  <option value="integral">Sim, integralmente</option>
                  <option value="parcial">Parcialmente</option>
                  <option value="nao">Não</option>
                </select>
              </Field>
              <Field label="Histórico de reparcelamento">
                <select className="field-input" value={data.priorReparceling} onChange={(event) => setField('priorReparceling', event.target.value as AssessmentData['priorReparceling'])}>
                  <option value="nao_informado">Não informado</option>
                  <option value="sim">Já houve reparcelamento</option>
                  <option value="nao">Não houve</option>
                </select>
              </Field>
              <div className="md:col-span-2">
                <Toggle checked={data.overdueInstallments} onChange={(value) => setField('overdueInstallments', value)} label="Existem parcelas em atraso" detail="Este dado aumenta a pressão do passivo e pode afetar a elegibilidade de cenários." />
              </div>
            </div>
          </StepCard>
        )
      case 4:
        return (
          <StepCard
            eyebrow="Etapa 5 de 8"
            title="Qual é o estágio de exposição patrimonial?"
            description="Escolha a situação mais próxima. A leitura poderá ser refinada depois com processos, documentos e movimentações recentes."
          >
            <Field label="Estágio principal da cobrança">
              <div className="grid gap-2">
                {collectionStages.map((stage, index) => (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => setField('collectionStage', index)}
                    className={`flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition ${
                      data.collectionStage === index ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-400/50'
                    }`}
                  >
                    <span className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-bold ${data.collectionStage === index ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span>
                    <span className="text-sm font-semibold text-slate-700">{stage}</span>
                    {data.collectionStage === index && <CheckCircle2 className="ml-auto h-5 w-5 text-brand-600" />}
                  </button>
                ))}
              </div>
            </Field>

            <div className="mt-7 grid gap-5 md:grid-cols-2">
              <Field label="Número aproximado de execuções">
                <input className="field-input" type="number" min="0" value={data.activeExecutions} onChange={(event) => setField('activeExecutions', Number(event.target.value) || 0)} />
              </Field>
              <Field label="Valor aproximado das garantias">
                <MoneyInput value={data.guaranteeValue} onChange={(value) => setField('guaranteeValue', value)} />
              </Field>
              <Toggle checked={data.blockedLast12Months} onChange={(value) => setField('blockedLast12Months', value)} label="Houve bloqueio nos últimos 12 meses" />
              <Toggle checked={data.activeLien} onChange={(value) => setField('activeLien', value)} label="Existe penhora ativa" />
              <Toggle checked={data.acceptedGuarantee} onChange={(value) => setField('acceptedGuarantee', value)} label="Existe garantia formalmente aceita" detail="Somente garantia aceita reduz parcialmente o indicador." />
              <Field label="Existem bens livres?">
                <select className="field-input" value={data.freeAssets} onChange={(event) => setField('freeAssets', event.target.value as AssessmentData['freeAssets'])}>
                  <option value="nao_informado">Não informado</option>
                  <option value="sim">Sim</option>
                  <option value="parcial">Parcialmente</option>
                  <option value="nao">Não</option>
                </select>
              </Field>
              <div className="md:col-span-2">
                <RangeField label="Dependência de certidão" value={data.certificateDependence} onChange={(value) => setField('certificateDependence', value)} leftLabel="Baixa" rightLabel="Crítica" />
              </div>
            </div>
          </StepCard>
        )
      case 5:
        return (
          <StepCard
            eyebrow="Etapa 6 de 8"
            title="Como a nova tributação poderá afetar a operação?"
            description="Esta etapa mede sensibilidade potencial de caixa, margem, créditos, benefícios e preparação operacional. Não calcula IBS ou CBS."
          >
            <div className="grid gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Participação de vendas B2B</p>
                    <p className="mt-1 text-xs text-slate-500">Percentual aproximado de receitas geradas para outras empresas.</p>
                  </div>
                  <strong className="text-xl text-brand-600">{data.b2bPercent}%</strong>
                </div>
                <input className="mt-4 h-2 w-full cursor-pointer accent-[#176DB5]" type="range" min="0" max="100" step="5" value={data.b2bPercent} onChange={(event) => setField('b2bPercent', Number(event.target.value))} />
              </div>
              <RangeField label="Rigidez de preço e margem" help="Quanto maior, menor a capacidade de repassar mudanças ao preço." value={data.priceRigidity} onChange={(value) => setField('priceRigidity', value)} leftLabel="Flexível" rightLabel="Rígida" />
              <RangeField label="Dependência de benefícios fiscais" value={data.benefitDependence} onChange={(value) => setField('benefitDependence', value)} leftLabel="Baixa" rightLabel="Alta" />
              <RangeField label="Dependência da geração de créditos" value={data.creditDependence} onChange={(value) => setField('creditDependence', value)} leftLabel="Baixa" rightLabel="Alta" />
              <RangeField
                label="Uso temporário do caixa destinado a tributos"
                help="Avalia se valores destinados ao recolhimento futuro ajudam a financiar a operação no período intermediário."
                value={data.splitCashDependence}
                onChange={(value) => setField('splitCashDependence', value)}
                leftLabel="Inexistente"
                rightLabel="Relevante"
              />
              <RangeField label="Preparação para a Reforma Tributária" help="ERP, contabilidade, classificação, contratos e formação de preço." value={data.reformReadiness} onChange={(value) => setField('reformReadiness', value)} leftLabel="Não iniciada" rightLabel="Estruturada" />
            </div>
          </StepCard>
        )
      case 6:
        return (
          <StepCard
            eyebrow="Etapa 7 de 8"
            title="A empresa possui estrutura para reagir?"
            description="Este é o único índice em que uma pontuação mais alta representa condição positiva para implementar uma estratégia."
          >
            <div className="grid gap-4">
              <RangeField label="Qualidade e atualização da informação contábil" value={data.accountingQuality} onChange={(value) => setField('accountingQuality', value)} leftLabel="Frágil" rightLabel="Estruturada" />
              <RangeField label="Organização e disponibilidade documental" value={data.documentQuality} onChange={(value) => setField('documentQuality', value)} leftLabel="Frágil" rightLabel="Estruturada" />
              <RangeField label="Governança e acesso ao decisor" value={data.governanceQuality} onChange={(value) => setField('governanceQuality', value)} leftLabel="Difícil" rightLabel="Direto" />
              <RangeField label="Velocidade de resposta" value={data.responseSpeed} onChange={(value) => setField('responseSpeed', value)} leftLabel="Lenta" rightLabel="Rápida" />
              <RangeField label="Flexibilidade financeira para implementação" value={data.financialFlexibility} onChange={(value) => setField('financialFlexibility', value)} leftLabel="Baixa" rightLabel="Alta" />
              <RangeField label="Alternativas de garantia" value={data.guaranteeAlternatives} onChange={(value) => setField('guaranteeAlternatives', value)} leftLabel="Inexistentes" rightLabel="Diversas" />
            </div>
          </StepCard>
        )
      case 7:
        return (
          <StepCard
            eyebrow="Etapa 8 de 8"
            title="Qual solução seria sustentável para a empresa?"
            description="Esses limites serão transportados para os simuladores e impedirão que o sistema recomende um cenário financeiramente inviável."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Parcela mensal considerada sustentável">
                <MoneyInput value={data.sustainableInstallment} onChange={(value) => setField('sustainableInstallment', value)} />
              </Field>
              <Field label="Limite máximo tolerável">
                <MoneyInput value={data.maximumInstallment} onChange={(value) => setField('maximumInstallment', value)} />
              </Field>
              <Field label="Disponibilidade estimada para entrada">
                <MoneyInput value={data.availableEntry} onChange={(value) => setField('availableEntry', value)} />
              </Field>
              <Field label="Prioridade principal">
                <select className="field-input" value={data.priority} onChange={(event) => setField('priority', event.target.value as AssessmentData['priority'])}>
                  <option value="caixa">Preservação de caixa</option>
                  <option value="desconto">Maior redução possível</option>
                  <option value="prazo">Prazo mais longo</option>
                  <option value="certidao">Certidão e regularidade</option>
                  <option value="protecao">Proteção patrimonial</option>
                  <option value="encerramento">Encerramento do passivo</option>
                </select>
              </Field>
              <Field label="Aceita estratégia em etapas?" className="md:col-span-2">
                <ChoiceButtons
                  value={data.acceptsStagedStrategy}
                  onChange={(value) => setField('acceptsStagedStrategy', value as AssessmentData['acceptsStagedStrategy'])}
                  options={[
                    { value: 'sim', label: 'Sim' },
                    { value: 'analisar', label: 'Depende do cenário' },
                    { value: 'nao', label: 'Não' },
                    { value: 'nao_informado', label: 'Não informado' },
                  ]}
                />
              </Field>
            </div>

            <div className="mt-8 rounded-2xl border border-brand-400/30 bg-brand-50 p-5">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 text-brand-600" />
                <div>
                  <p className="font-semibold text-navy-950">Próxima etapa: Central de Decisão</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">A leitura consolidada será usada para liberar simuladores compatíveis, comparar cenários e gerar o parecer estratégico em PDF.</p>
                </div>
              </div>
            </div>
          </StepCard>
        )
      default:
        return null
    }
  }

  const currentBand = scoreBand(scores.strategicPriority)

  return (
    <div className="min-h-screen text-slate-800">
      <header className="sticky top-0 z-40 border-b border-white/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center justify-between px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-navy-950 text-white shadow-lg shadow-navy-950/15">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-navy-950">Radar Estratégico Empresarial</p>
              <p className="text-xs text-slate-500">Apoio à decisão e leitura de cenários</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="mr-2 hidden items-center gap-2 text-xs text-slate-500 md:flex">
              {saveStatus === 'saving' ? <Save className="h-3.5 w-3.5 animate-pulse" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
              {saveStatus === 'saving' ? 'Salvando rascunho...' : 'Rascunho salvo neste dispositivo'}
            </div>
            <button type="button" onClick={() => setPresentationMode(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600">
              <Presentation className="h-4 w-4" />
              <span className="hidden sm:inline">Apresentar cenário</span>
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-navy-950 px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-900">
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Login Google</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-5 px-4 py-5 lg:grid-cols-[245px_minmax(0,1fr)_320px] lg:px-6">
        <aside className="panel-card h-fit overflow-hidden lg:sticky lg:top-24">
          <div className="border-b border-slate-100 bg-navy-950 px-5 py-5 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-400">Ficha Estratégica</p>
            <p className="mt-2 text-sm text-white/60">Diagnóstico guiado em oito etapas.</p>
          </div>
          <nav className="p-2.5">
            {steps.map((step, index) => {
              const Icon = step.icon
              const active = currentStep === index
              const completed = currentStep > index
              return (
                <button
                  type="button"
                  key={step.title}
                  onClick={() => setCurrentStep(index)}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${active ? 'bg-brand-600 text-white' : completed ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {completed ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${active ? 'text-navy-950' : 'text-slate-600'}`}>{step.title}</span>
                    <span className="block truncate text-[11px] text-slate-400">{step.subtitle}</span>
                  </span>
                </button>
              )
            })}
          </nav>
          <div className="border-t border-slate-100 p-3">
            <button type="button" onClick={resetDraft} className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition hover:bg-red-50 hover:text-red-600">
              <RefreshCcw className="h-3.5 w-3.5" />
              Limpar rascunho de demonstração
            </button>
          </div>
        </aside>

        <main className="min-w-0">
          {renderStep()}
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              disabled={currentStep === 0}
              onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            {currentStep < steps.length - 1 ? (
              <button type="button" onClick={() => setCurrentStep((step) => Math.min(steps.length - 1, step + 1))} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition hover:bg-navy-900">
                Continuar
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy-950 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-navy-950/20 transition hover:bg-navy-900">
                Gerar leitura e avançar
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </main>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <section className="overflow-hidden rounded-2xl bg-navy-950 text-white shadow-panel">
            <div className="border-b border-white/10 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-400">Leitura ao vivo</p>
                  <p className="mt-1 text-xs text-white/45">Indicadores preliminares e explicáveis</p>
                </div>
                <Gauge className="h-5 w-5 text-brand-400" />
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-white/50">Prioridade estratégica</p>
                  <p className="mt-1 text-5xl font-bold tracking-tight">{scores.strategicPriority}</p>
                </div>
                <span className="rounded-lg bg-white/10 px-3 py-1 text-xs font-bold uppercase">{currentBand.label}</span>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-brand-400 transition-all duration-500" style={{ width: `${scores.strategicPriority}%` }} />
              </div>
              <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3.5">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                  <div>
                    <p className="text-xs font-semibold">{confidenceBand(scores.confidence)}</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/45">Confiança atual: {scores.confidence}%. O resultado ganha consistência conforme os dados essenciais são preenchidos.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="panel-card grid gap-2.5 p-3">
            <Metric label="Caixa" value={scores.cashPressure} />
            <Metric label="Passivo" value={scores.liabilityPressure} />
            <Metric label="Cobrança" value={scores.collectionRisk} />
            <Metric label="Reforma" value={scores.reformExposure} />
            <Metric label="Capacidade de reação" value={scores.reactionCapacity} positive />
          </section>

          <section className="panel-card p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600"><UserRound className="h-4 w-4" /></div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Modo demonstração</p>
                <p className="text-xs text-slate-500">Persistência local temporária</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">O login Google, a segregação por consultor e o banco Supabase serão conectados sobre esta estrutura.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}

function StepCard({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <section className="panel-card overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-r from-white to-brand-50/60 px-5 py-6 sm:px-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-navy-950 sm:text-3xl">{title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-500">{description}</p>
      </div>
      <div className="p-5 sm:p-7">{children}</div>
    </section>
  )
}

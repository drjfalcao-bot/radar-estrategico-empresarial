export type TaxRegime = 'nao_informado' | 'simples' | 'presumido' | 'real'
export type Trend = 'nao_informado' | 'crescimento' | 'estavel' | 'queda'
export type Priority = 'caixa' | 'desconto' | 'prazo' | 'certidao' | 'protecao' | 'encerramento'

export interface AssessmentData {
  companyName: string
  tradeName: string
  cnpj: string
  cnae: string
  city: string
  state: string
  taxRegime: TaxRegime
  economicGroup: 'nao_informado' | 'sim' | 'nao'
  groupCompanies: number

  meetingReason: string
  urgency: 'sem_urgencia' | 'possivel' | 'confirmada'
  decisionMakerPresent: 'nao_informado' | 'sim' | 'parcial' | 'nao'
  intentToAct: 'nao_informado' | 'agora' | 'apos_analise' | 'indefinido'

  monthlyRevenue: number
  revenueTrend: Trend
  monthlyCashSlack: number
  monthlyTaxInstallments: number
  otherMonthlyCommitments: number
  receivableDays: number
  reserveMonths: number

  rfbDebt: number
  pgfnDebt: number
  simpleDebt: number
  socialSecurityDebt: number
  fgtsDebt: number
  stateDebt: number
  municipalDebt: number
  disputedDebt: number
  currentInstallments: number
  overdueInstallments: boolean
  priorReparceling: 'nao_informado' | 'sim' | 'nao'
  debtMapped: 'nao_informado' | 'integral' | 'parcial' | 'nao'

  collectionStage: number
  activeExecutions: number
  blockedLast12Months: boolean
  activeLien: boolean
  acceptedGuarantee: boolean
  guaranteeValue: number
  freeAssets: 'nao_informado' | 'sim' | 'parcial' | 'nao'
  certificateDependence: number

  b2bPercent: number
  priceRigidity: number
  benefitDependence: number
  creditDependence: number
  splitCashDependence: number
  reformReadiness: number

  accountingQuality: number
  documentQuality: number
  governanceQuality: number
  responseSpeed: number
  financialFlexibility: number
  guaranteeAlternatives: number

  sustainableInstallment: number
  maximumInstallment: number
  availableEntry: number
  priority: Priority
  acceptsStagedStrategy: 'nao_informado' | 'sim' | 'analisar' | 'nao'
}

export interface ScoreResult {
  cashPressure: number
  liabilityPressure: number
  collectionRisk: number
  reformExposure: number
  reactionCapacity: number
  strategicPriority: number
  confidence: number
}

export const initialAssessment: AssessmentData = {
  companyName: '',
  tradeName: '',
  cnpj: '',
  cnae: '',
  city: '',
  state: '',
  taxRegime: 'nao_informado',
  economicGroup: 'nao_informado',
  groupCompanies: 1,
  meetingReason: '',
  urgency: 'sem_urgencia',
  decisionMakerPresent: 'nao_informado',
  intentToAct: 'nao_informado',
  monthlyRevenue: 0,
  revenueTrend: 'nao_informado',
  monthlyCashSlack: 0,
  monthlyTaxInstallments: 0,
  otherMonthlyCommitments: 0,
  receivableDays: 30,
  reserveMonths: 0,
  rfbDebt: 0,
  pgfnDebt: 0,
  simpleDebt: 0,
  socialSecurityDebt: 0,
  fgtsDebt: 0,
  stateDebt: 0,
  municipalDebt: 0,
  disputedDebt: 0,
  currentInstallments: 0,
  overdueInstallments: false,
  priorReparceling: 'nao_informado',
  debtMapped: 'nao_informado',
  collectionStage: 0,
  activeExecutions: 0,
  blockedLast12Months: false,
  activeLien: false,
  acceptedGuarantee: false,
  guaranteeValue: 0,
  freeAssets: 'nao_informado',
  certificateDependence: 0,
  b2bPercent: 50,
  priceRigidity: 2,
  benefitDependence: 0,
  creditDependence: 0,
  splitCashDependence: 0,
  reformReadiness: 2,
  accountingQuality: 2,
  documentQuality: 2,
  governanceQuality: 2,
  responseSpeed: 2,
  financialFlexibility: 2,
  guaranteeAlternatives: 2,
  sustainableInstallment: 0,
  maximumInstallment: 0,
  availableEntry: 0,
  priority: 'caixa',
  acceptsStagedStrategy: 'nao_informado',
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))
const normalize = (value: number, low: number, high: number) => {
  if (high <= low) return 0
  return clamp(((value - low) / (high - low)) * 100)
}

export const totalDebt = (data: AssessmentData) =>
  data.rfbDebt +
  data.pgfnDebt +
  data.simpleDebt +
  data.socialSecurityDebt +
  data.fgtsDebt +
  data.stateDebt +
  data.municipalDebt +
  data.disputedDebt

export const calculateScores = (data: AssessmentData): ScoreResult => {
  const monthlyCommitments = data.monthlyTaxInstallments + data.otherMonthlyCommitments
  const commitmentRatio = data.monthlyRevenue > 0 ? monthlyCommitments / data.monthlyRevenue : 0
  const cashSlackRatio = data.monthlyRevenue > 0 ? data.monthlyCashSlack / data.monthlyRevenue : 0

  const cashPressure = clamp(
    normalize(commitmentRatio, 0.03, 0.25) * 0.35 +
      (100 - normalize(cashSlackRatio, 0, 0.15)) * 0.3 +
      normalize(data.receivableDays, 30, 120) * 0.2 +
      (100 - normalize(data.reserveMonths, 0, 6)) * 0.15,
  )

  const debt = totalDebt(data)
  const annualRevenue = data.monthlyRevenue * 12
  const debtToRevenue = annualRevenue > 0 ? debt / annualRevenue : 0
  const complexityCount = [
    data.rfbDebt,
    data.pgfnDebt,
    data.simpleDebt,
    data.socialSecurityDebt,
    data.fgtsDebt,
    data.stateDebt,
    data.municipalDebt,
    data.disputedDebt,
  ].filter((value) => value > 0).length

  const liabilityPressure = clamp(
    normalize(debtToRevenue, 0.1, 1.5) * 0.45 +
      (data.overdueInstallments ? 100 : 20) * 0.25 +
      normalize(data.currentInstallments / Math.max(data.monthlyRevenue, 1), 0.02, 0.18) * 0.15 +
      normalize(complexityCount, 1, 6) * 0.15,
  )

  const stageScore = [0, 15, 25, 35, 50, 65, 80, 95, 100][data.collectionStage] ?? 0
  const collectionRisk = clamp(
    stageScore +
      Math.min(data.activeExecutions * 2.5, 10) +
      (data.blockedLast12Months ? 8 : 0) +
      (data.activeLien ? 8 : 0) +
      data.certificateDependence * 2.5 -
      (data.acceptedGuarantee ? 15 : 0),
  )

  const splitSensitivity = clamp(
    data.splitCashDependence * 25 * 0.4 +
      (100 - normalize(data.reserveMonths, 0, 6)) * 0.25 +
      normalize(data.receivableDays, 30, 120) * 0.2 +
      data.b2bPercent * 0.15,
  )

  const reformExposure = clamp(
    splitSensitivity * 0.4 +
      data.priceRigidity * 25 * 0.25 +
      ((data.benefitDependence + data.creditDependence) / 2) * 25 * 0.2 +
      (100 - data.reformReadiness * 25) * 0.15,
  )

  const reactionCapacity = clamp(
    data.accountingQuality * 25 * 0.3 +
      data.governanceQuality * 25 * 0.2 +
      data.documentQuality * 25 * 0.2 +
      data.financialFlexibility * 25 * 0.15 +
      data.guaranteeAlternatives * 25 * 0.15,
  )

  const strategicPriority = clamp(
    cashPressure * 0.27 +
      liabilityPressure * 0.23 +
      collectionRisk * 0.2 +
      reformExposure * 0.18 +
      (100 - reactionCapacity) * 0.12,
  )

  const requiredChecks = [
    data.companyName.length > 2,
    data.cnpj.length >= 14,
    data.taxRegime !== 'nao_informado',
    data.meetingReason.length > 0,
    data.monthlyRevenue > 0,
    debt > 0,
    data.debtMapped !== 'nao_informado',
    data.decisionMakerPresent !== 'nao_informado',
    data.acceptsStagedStrategy !== 'nao_informado',
    data.sustainableInstallment > 0,
  ]
  const confidence = (requiredChecks.filter(Boolean).length / requiredChecks.length) * 100

  return {
    cashPressure: Math.round(cashPressure),
    liabilityPressure: Math.round(liabilityPressure),
    collectionRisk: Math.round(collectionRisk),
    reformExposure: Math.round(reformExposure),
    reactionCapacity: Math.round(reactionCapacity),
    strategicPriority: Math.round(strategicPriority),
    confidence: Math.round(confidence),
  }
}

export const scoreBand = (score: number) => {
  if (score < 35) return { label: 'Controlado', tone: 'emerald' }
  if (score < 55) return { label: 'Atenção', tone: 'amber' }
  if (score < 75) return { label: 'Elevado', tone: 'orange' }
  return { label: 'Crítico', tone: 'red' }
}

export const confidenceBand = (score: number) => {
  if (score >= 80) return 'Leitura robusta'
  if (score >= 60) return 'Leitura consistente'
  if (score >= 40) return 'Leitura preliminar'
  return 'Dados insuficientes'
}

import type { FormulaLine, FormulaVersion, FormulaVersionStatus } from '../../../types/domain'

export const roundFormulaNumber = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000
export const calculatePercentageTotal = (lines: Pick<FormulaLine, 'percentage'>[]) => roundFormulaNumber(lines.reduce((sum, line) => sum + Number(line.percentage || 0), 0))
export const percentageBalance = (lines: Pick<FormulaLine, 'percentage'>[]) => roundFormulaNumber(100 - calculatePercentageTotal(lines))
export const scaleFormula = (lines: FormulaLine[], targetGrams: number) => lines.map((line) => ({ ...line, calculatedWeight: roundFormulaNumber(targetGrams * line.percentage / 100) }))
export const isEditableStatus = (status: FormulaVersionStatus) => status === 'Draft'

export const allowedTransitions: Record<FormulaVersionStatus, FormulaVersionStatus[]> = {
  Draft: ['Candidate'], Candidate: ['Approved', 'Retired'], Approved: ['Retired'], Retired: [],
}
export const canTransition = (from: FormulaVersionStatus, to: FormulaVersionStatus) => allowedTransitions[from].includes(to)

export const nextVersionNumber = (versions: Pick<FormulaVersion, 'version'>[]) => {
  const numbers = versions.map(({ version }) => /^v(\d+)\.(\d+)$/.exec(version)).filter(Boolean).map((match) => ({ major: Number(match![1]), minor: Number(match![2]) }))
  if (!numbers.length) return 'v0.1'
  numbers.sort((a, b) => b.major - a.major || b.minor - a.minor)
  return `v${numbers[0].major}.${numbers[0].minor + 1}`
}

export function duplicateVersion(source: FormulaVersion, sourceLines: FormulaLine[], allFormulaVersions: FormulaVersion[], idFactory: () => string = () => crypto.randomUUID(), now = new Date().toISOString()) {
  const versionId = idFactory()
  const version: FormulaVersion = { ...source, id: versionId, version: nextVersionNumber(allFormulaVersions.filter((item) => item.formulaId === source.formulaId)), status: 'Draft', derivedFromVersionId: source.id, approvedAt: undefined, createdAt: now, updatedAt: now }
  const lines = sourceLines.map((line, index) => ({ ...line, id: idFactory(), formulaVersionId: versionId, sortOrder: index + 1 }))
  return { version, lines }
}

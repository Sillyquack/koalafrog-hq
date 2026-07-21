import type { IntelligenceContext, IntelligenceImage, Observation } from '../Shared/models'

export interface VisionAnalysisRequest { image: IntelligenceImage; context: IntelligenceContext }
export interface ImageAnalyzer { analyze(request: VisionAnalysisRequest): Promise<readonly Observation[]> }
export interface ObservationInsightGenerator { generate(observations: readonly Observation[], context: IntelligenceContext): Promise<import('../Shared/models').Insight[]> }
export interface InsightRecommendationGenerator { generate(insights: readonly import('../Shared/models').Insight[], observations: readonly Observation[], context: IntelligenceContext): Promise<import('../Shared/models').Recommendation[]> }

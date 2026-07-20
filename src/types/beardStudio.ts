export type BeardProfileStatus = 'Draft' | 'Active' | 'Archived'
export type TrimDirection = 'with growth' | 'against growth' | 'across growth' | 'detail only'
export type RecipeStatus = BeardProfileStatus
export type TrimSessionStatus = 'in_progress' | 'paused' | 'completed' | 'abandoned'
export type BeardDensity = 'light' | 'medium' | 'dense' | 'mixed'
export type BeardTexture = 'straight' | 'wavy' | 'curly' | 'coarse' | 'mixed'
export type BeardZoneName = 'upper sideburn' | 'lower sideburn' | 'upper cheek' | 'lower cheek' | 'jaw left' | 'jaw right' | 'chin' | 'under-chin' | 'moustache' | 'soul patch' | 'neckline transition'
export type TrimTechnique = 'full pass' | 'light pass' | 'flick-out' | 'blend' | 'define line' | 'detail' | 'freehand' | 'scissors'
export type GroomingProductRole = 'pre-trim' | 'beard wash' | 'conditioner' | 'beard oil' | 'beard butter' | 'beard balm' | 'styling product' | 'post-trim soothing' | 'fragrance'

export interface BeardProfile {id:string;name:string;status:BeardProfileStatus;styleName:string;description:string;targetLook:string;maintenanceFrequencyDays:number;preferredOverallLengthMm:number;density:BeardDensity;texture:BeardTexture;growthNotes:string;asymmetryNotes:string;weakAreaNotes:string;moustachePreference:string;cheekLinePreference:'natural'|'lightly defined'|'sharply defined';necklinePreference:'natural'|'defined';createdAt:string;updatedAt:string}
export interface GroomingToolAttachment{id:string;name:string}
export interface GroomingTool{id:string;name:string;brand:string;model:string;type:'beard trimmer'|'detail trimmer'|'foil shaver'|'razor'|'scissors'|'comb'|'brush'|'other';minimumLengthMm:number|null;maximumLengthMm:number|null;adjustmentIncrementMm:number|null;attachments:GroomingToolAttachment[];washable:boolean;notes:string;primary:boolean;status:'active'|'retired';createdAt:string;updatedAt:string}
export interface BeardLengthZone{id:string;name:BeardZoneName;targetLengthMm:number;minimumLengthMm:number|null;maximumLengthMm:number|null;trimDirection:TrimDirection;toolId:string|null;attachmentId:string|null;notes:string;order:number;enabled:boolean}
export interface BeardLengthMap{id:string;profileId:string;zones:BeardLengthZone[];createdAt:string;updatedAt:string}
export interface TrimRecipeStep{id:string;order:number;title:string;zones:BeardZoneName[];targetLengthMm:number|null;toolId:string|null;attachmentId:string|null;trimDirection:TrimDirection|null;technique:TrimTechnique;instruction:string;caution:string;completionRequired:boolean}
export interface GroomingProductReference{productId:string|null;nameSnapshot:string;categorySnapshot:string;role:GroomingProductRole}
export interface TrimRecipe{id:string;profileId:string;name:string;status:RecipeStatus;version:number;estimatedDurationMinutes:number;startingCondition:string;preparationInstructions:string;steps:TrimRecipeStep[];finishingInstructions:string;preferredProducts:GroomingProductReference[];notes:string;createdAt:string;updatedAt:string}
export interface BeardTrimSession{id:string;recipeId:string;recipeVersion:number;status:TrimSessionStatus;currentStepIndex:number;completedStepIds:string[];skippedStepIds:string[];startedAt:string;updatedAt:string;completedAt:string|null}
export interface BeardLogSnapshot{schemaVersion:1;profile:BeardProfile;recipe:TrimRecipe;lengthMap:BeardLengthMap|null;tools:GroomingTool[];products:GroomingProductReference[]}
export interface BeardLogEntry{id:string;sessionId:string|null;occurredAt:string;profileId:string;recipeId:string|null;recipeVersion:number|null;startingCondition:string;daysSincePreviousTrim:number|null;durationMinutes:number|null;overallRating:number;fadeRating:number|null;lineSharpnessRating:number|null;symmetryRating:number|null;comfortRating:number|null;notes:string;whatWorked:string;changeNextTime:string;snapshot:BeardLogSnapshot;createdAt:string;updatedAt:string}
export interface BeardStudioState{revision:number;profiles:BeardProfile[];lengthMaps:BeardLengthMap[];tools:GroomingTool[];recipes:TrimRecipe[];sessions:BeardTrimSession[];logs:BeardLogEntry[]}

export type ScentCheckpointKind =
  | "immediate"
  | "15_minutes"
  | "1_hour"
  | "4_hours"
  | "next_day"
  | "custom";
export interface ScentMemorySession {
  id: string;
  title: string;
  status: "active" | "completed";
  product_id: string | null;
  formula_version_id: string | null;
  lab_batch_id: string | null;
  ingredient_id: string | null;
  test_session_id: string | null;
  overall_score: number | null;
  archived_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}
export interface ScentMemoryCheckpoint {
  id: string;
  logical_id: string;
  session_id: string;
  revision: number;
  supersedes_id: string | null;
  is_current: boolean;
  checkpoint_kind: ScentCheckpointKind;
  custom_minutes: number | null;
  observed_at: string;
  descriptors: string[];
  notes: string | null;
  archived_at: string | null;
  [key: string]: unknown;
}
export const currentScentMemoryEvidence = (
  checkpoints: ScentMemoryCheckpoint[],
) => checkpoints.filter((item) => item.is_current && !item.archived_at);

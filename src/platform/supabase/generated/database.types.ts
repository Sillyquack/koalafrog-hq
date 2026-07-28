export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      batch_material_consumptions: {
        Row: {
          actor_id: string
          allocation_id: string
          batch_id: string
          batch_kind: string
          consumed_at: string
          consumed_quantity: number
          cost_confidence: string
          cost_currency_snapshot: string | null
          cost_state: string
          formula_id_snapshot: string
          formula_line_id_snapshot: string
          formula_version_id_snapshot: string
          id: string
          idempotency_key: string
          ingredient_id_snapshot: string
          ingredient_name_snapshot: string
          inventory_lot_id: string
          landed_cost_source: Json
          movement_id: string
          normalized_quantity: number
          owner_id: string
          payload_fingerprint: string
          quality_release_review_id: string | null
          reason: string
          requirement_id: string
          reservation_id: string
          revision: number
          total_cost_snapshot: number | null
          unit: string
          unit_cost_snapshot: number | null
          weighing_id: string
          workspace_id: string
        }
        Insert: {
          actor_id: string
          allocation_id: string
          batch_id: string
          batch_kind: string
          consumed_at?: string
          consumed_quantity: number
          cost_confidence: string
          cost_currency_snapshot?: string | null
          cost_state: string
          formula_id_snapshot: string
          formula_line_id_snapshot: string
          formula_version_id_snapshot: string
          id?: string
          idempotency_key: string
          ingredient_id_snapshot: string
          ingredient_name_snapshot: string
          inventory_lot_id: string
          landed_cost_source?: Json
          movement_id: string
          normalized_quantity: number
          owner_id: string
          payload_fingerprint: string
          quality_release_review_id?: string | null
          reason: string
          requirement_id: string
          reservation_id: string
          revision?: number
          total_cost_snapshot?: number | null
          unit: string
          unit_cost_snapshot?: number | null
          weighing_id: string
          workspace_id: string
        }
        Update: {
          actor_id?: string
          allocation_id?: string
          batch_id?: string
          batch_kind?: string
          consumed_at?: string
          consumed_quantity?: number
          cost_confidence?: string
          cost_currency_snapshot?: string | null
          cost_state?: string
          formula_id_snapshot?: string
          formula_line_id_snapshot?: string
          formula_version_id_snapshot?: string
          id?: string
          idempotency_key?: string
          ingredient_id_snapshot?: string
          ingredient_name_snapshot?: string
          inventory_lot_id?: string
          landed_cost_source?: Json
          movement_id?: string
          normalized_quantity?: number
          owner_id?: string
          payload_fingerprint?: string
          quality_release_review_id?: string | null
          reason?: string
          requirement_id?: string
          reservation_id?: string
          revision?: number
          total_cost_snapshot?: number | null
          unit?: string
          unit_cost_snapshot?: number | null
          weighing_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_material_consumptions_weighing_id_fkey"
            columns: ["weighing_id"]
            isOneToOne: false
            referencedRelation: "batch_material_weighings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_material_consumptions_workspace_id_allocation_id_fkey"
            columns: ["workspace_id", "allocation_id"]
            isOneToOne: false
            referencedRelation: "batch_material_lot_allocations"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "batch_material_consumptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_material_consumptions_workspace_id_inventory_lot_id_fkey"
            columns: ["workspace_id", "inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "batch_material_consumptions_workspace_id_movement_id_fkey"
            columns: ["workspace_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "inventory_movements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "batch_material_consumptions_workspace_id_reservation_id_fkey"
            columns: ["workspace_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "inventory_reservations"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      batch_material_events: {
        Row: {
          actor_id: string
          allocation_id: string | null
          batch_id: string
          batch_kind: string
          consumption_id: string | null
          event_key: string
          event_type: string
          formula_version_id: string
          id: string
          inventory_lot_id: string | null
          metadata: Json
          movement_id: string | null
          occurred_at: string
          owner_id: string
          policy_version: string
          quantity: number | null
          requirement_id: string | null
          reservation_id: string | null
          unit: string | null
          weighing_id: string | null
          workspace_id: string
        }
        Insert: {
          actor_id: string
          allocation_id?: string | null
          batch_id: string
          batch_kind: string
          consumption_id?: string | null
          event_key: string
          event_type: string
          formula_version_id: string
          id?: string
          inventory_lot_id?: string | null
          metadata?: Json
          movement_id?: string | null
          occurred_at?: string
          owner_id: string
          policy_version?: string
          quantity?: number | null
          requirement_id?: string | null
          reservation_id?: string | null
          unit?: string | null
          weighing_id?: string | null
          workspace_id: string
        }
        Update: {
          actor_id?: string
          allocation_id?: string | null
          batch_id?: string
          batch_kind?: string
          consumption_id?: string | null
          event_key?: string
          event_type?: string
          formula_version_id?: string
          id?: string
          inventory_lot_id?: string | null
          metadata?: Json
          movement_id?: string | null
          occurred_at?: string
          owner_id?: string
          policy_version?: string
          quantity?: number | null
          requirement_id?: string | null
          reservation_id?: string | null
          unit?: string | null
          weighing_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_material_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_material_lot_allocations: {
        Row: {
          allocated_quantity: number
          allocation_method: string
          batch_kind: string
          cost_confidence: string
          cost_currency_snapshot: string | null
          created_at: string
          fefo_rank_snapshot: number | null
          id: string
          idempotency_key: string
          inventory_lot_id: string
          lab_batch_id: string | null
          lab_batch_line_id: string | null
          lot_available_snapshot: number
          lot_balance_snapshot: number
          lot_expiry_snapshot: string | null
          lot_status_snapshot: string
          normalized_quantity: number
          owner_id: string
          payload_fingerprint: string
          production_run_id: string | null
          production_run_line_id: string | null
          quality_release_review_id: string | null
          revision: number
          selected_at: string
          selected_by: string
          status: string
          supplier_lot_snapshot: string | null
          supplier_name_snapshot: string | null
          supplier_product_snapshot: string | null
          unit: string
          unit_cost_snapshot: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          allocated_quantity: number
          allocation_method: string
          batch_kind: string
          cost_confidence?: string
          cost_currency_snapshot?: string | null
          created_at?: string
          fefo_rank_snapshot?: number | null
          id?: string
          idempotency_key: string
          inventory_lot_id: string
          lab_batch_id?: string | null
          lab_batch_line_id?: string | null
          lot_available_snapshot: number
          lot_balance_snapshot: number
          lot_expiry_snapshot?: string | null
          lot_status_snapshot: string
          normalized_quantity: number
          owner_id: string
          payload_fingerprint: string
          production_run_id?: string | null
          production_run_line_id?: string | null
          quality_release_review_id?: string | null
          revision?: number
          selected_at?: string
          selected_by: string
          status?: string
          supplier_lot_snapshot?: string | null
          supplier_name_snapshot?: string | null
          supplier_product_snapshot?: string | null
          unit: string
          unit_cost_snapshot?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          allocated_quantity?: number
          allocation_method?: string
          batch_kind?: string
          cost_confidence?: string
          cost_currency_snapshot?: string | null
          created_at?: string
          fefo_rank_snapshot?: number | null
          id?: string
          idempotency_key?: string
          inventory_lot_id?: string
          lab_batch_id?: string | null
          lab_batch_line_id?: string | null
          lot_available_snapshot?: number
          lot_balance_snapshot?: number
          lot_expiry_snapshot?: string | null
          lot_status_snapshot?: string
          normalized_quantity?: number
          owner_id?: string
          payload_fingerprint?: string
          production_run_id?: string | null
          production_run_line_id?: string | null
          quality_release_review_id?: string | null
          revision?: number
          selected_at?: string
          selected_by?: string
          status?: string
          supplier_lot_snapshot?: string | null
          supplier_name_snapshot?: string | null
          supplier_product_snapshot?: string | null
          unit?: string
          unit_cost_snapshot?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_material_lot_allocatio_workspace_id_production_run__fkey1"
            columns: ["workspace_id", "production_run_line_id"]
            isOneToOne: false
            referencedRelation: "production_run_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "batch_material_lot_allocation_workspace_id_inventory_lot_i_fkey"
            columns: ["workspace_id", "inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "batch_material_lot_allocation_workspace_id_lab_batch_line__fkey"
            columns: ["workspace_id", "lab_batch_line_id"]
            isOneToOne: false
            referencedRelation: "lab_batch_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "batch_material_lot_allocation_workspace_id_production_run__fkey"
            columns: ["workspace_id", "production_run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "batch_material_lot_allocations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_material_lot_allocations_workspace_id_lab_batch_id_fkey"
            columns: ["workspace_id", "lab_batch_id"]
            isOneToOne: false
            referencedRelation: "lab_batches"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      batch_material_reconciliations: {
        Row: {
          actual_weighed_quantity: number
          batch_id: string
          batch_kind: string
          id: string
          idempotency_key: string
          owner_id: string
          payload_fingerprint: string
          policy_version: string
          productive_consumption: number
          reconciled_at: string
          reconciled_by: string
          released_quantity: number
          remaining_reservation: number
          requirement_id: string
          reserved_quantity: number
          returned_quantity: number
          revision: number
          state: string
          target_quantity: number
          tolerance_quantity: number
          unexplained_variance: number
          unit: string
          variance_id: string | null
          waste_quantity: number
          workspace_id: string
        }
        Insert: {
          actual_weighed_quantity: number
          batch_id: string
          batch_kind: string
          id?: string
          idempotency_key: string
          owner_id: string
          payload_fingerprint: string
          policy_version?: string
          productive_consumption: number
          reconciled_at?: string
          reconciled_by: string
          released_quantity: number
          remaining_reservation: number
          requirement_id: string
          reserved_quantity: number
          returned_quantity: number
          revision?: number
          state: string
          target_quantity: number
          tolerance_quantity: number
          unexplained_variance: number
          unit: string
          variance_id?: string | null
          waste_quantity: number
          workspace_id: string
        }
        Update: {
          actual_weighed_quantity?: number
          batch_id?: string
          batch_kind?: string
          id?: string
          idempotency_key?: string
          owner_id?: string
          payload_fingerprint?: string
          policy_version?: string
          productive_consumption?: number
          reconciled_at?: string
          reconciled_by?: string
          released_quantity?: number
          remaining_reservation?: number
          requirement_id?: string
          reserved_quantity?: number
          returned_quantity?: number
          revision?: number
          state?: string
          target_quantity?: number
          tolerance_quantity?: number
          unexplained_variance?: number
          unit?: string
          variance_id?: string | null
          waste_quantity?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_material_reconciliations_variance_id_fkey"
            columns: ["variance_id"]
            isOneToOne: false
            referencedRelation: "batch_material_variances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_material_reconciliations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_material_returns: {
        Row: {
          actor_id: string
          batch_id: string
          batch_kind: string
          condition_assessment: string
          evidence_reference: string | null
          id: string
          idempotency_key: string
          inventory_lot_id: string
          movement_id: string | null
          normalized_quantity: number
          original_consumption_id: string | null
          owner_id: string
          payload_fingerprint: string
          policy_version: string
          quantity: number
          reason: string
          requirement_id: string
          reservation_id: string
          return_kind: string
          returned_at: string
          unit: string
          weighing_id: string
          workspace_id: string
        }
        Insert: {
          actor_id: string
          batch_id: string
          batch_kind: string
          condition_assessment: string
          evidence_reference?: string | null
          id?: string
          idempotency_key: string
          inventory_lot_id: string
          movement_id?: string | null
          normalized_quantity: number
          original_consumption_id?: string | null
          owner_id: string
          payload_fingerprint: string
          policy_version?: string
          quantity: number
          reason: string
          requirement_id: string
          reservation_id: string
          return_kind: string
          returned_at?: string
          unit: string
          weighing_id: string
          workspace_id: string
        }
        Update: {
          actor_id?: string
          batch_id?: string
          batch_kind?: string
          condition_assessment?: string
          evidence_reference?: string | null
          id?: string
          idempotency_key?: string
          inventory_lot_id?: string
          movement_id?: string | null
          normalized_quantity?: number
          original_consumption_id?: string | null
          owner_id?: string
          payload_fingerprint?: string
          policy_version?: string
          quantity?: number
          reason?: string
          requirement_id?: string
          reservation_id?: string
          return_kind?: string
          returned_at?: string
          unit?: string
          weighing_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_material_returns_original_consumption_id_fkey"
            columns: ["original_consumption_id"]
            isOneToOne: false
            referencedRelation: "batch_material_consumptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_material_returns_weighing_id_fkey"
            columns: ["weighing_id"]
            isOneToOne: false
            referencedRelation: "batch_material_weighings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_material_returns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_material_returns_workspace_id_inventory_lot_id_fkey"
            columns: ["workspace_id", "inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "batch_material_returns_workspace_id_movement_id_fkey"
            columns: ["workspace_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "batch_material_returns_workspace_id_reservation_id_fkey"
            columns: ["workspace_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "inventory_reservations"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      batch_material_variances: {
        Row: {
          actor_id: string
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          batch_id: string
          batch_kind: string
          evidence_reference: string | null
          id: string
          idempotency_key: string
          owner_id: string
          payload_fingerprint: string
          policy_version: string
          quantity: number
          reason: string
          recorded_at: string
          requirement_id: string
          unit: string
          workspace_id: string
        }
        Insert: {
          actor_id: string
          approval_state: string
          approved_at?: string | null
          approved_by?: string | null
          batch_id: string
          batch_kind: string
          evidence_reference?: string | null
          id?: string
          idempotency_key: string
          owner_id: string
          payload_fingerprint: string
          policy_version?: string
          quantity: number
          reason: string
          recorded_at?: string
          requirement_id: string
          unit: string
          workspace_id: string
        }
        Update: {
          actor_id?: string
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          batch_id?: string
          batch_kind?: string
          evidence_reference?: string | null
          id?: string
          idempotency_key?: string
          owner_id?: string
          payload_fingerprint?: string
          policy_version?: string
          quantity?: number
          reason?: string
          recorded_at?: string
          requirement_id?: string
          unit?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_material_variances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_material_waste: {
        Row: {
          actor_id: string
          batch_id: string
          batch_kind: string
          cost_currency_snapshot: string | null
          evidence_reference: string | null
          id: string
          idempotency_key: string
          inventory_lot_id: string
          movement_id: string
          normalized_quantity: number
          owner_id: string
          payload_fingerprint: string
          quantity: number
          reason: string
          recorded_at: string
          requirement_id: string
          reservation_id: string
          total_cost_snapshot: number | null
          unit: string
          unit_cost_snapshot: number | null
          waste_category: string
          weighing_id: string
          workspace_id: string
        }
        Insert: {
          actor_id: string
          batch_id: string
          batch_kind: string
          cost_currency_snapshot?: string | null
          evidence_reference?: string | null
          id?: string
          idempotency_key: string
          inventory_lot_id: string
          movement_id: string
          normalized_quantity: number
          owner_id: string
          payload_fingerprint: string
          quantity: number
          reason: string
          recorded_at?: string
          requirement_id: string
          reservation_id: string
          total_cost_snapshot?: number | null
          unit: string
          unit_cost_snapshot?: number | null
          waste_category: string
          weighing_id: string
          workspace_id: string
        }
        Update: {
          actor_id?: string
          batch_id?: string
          batch_kind?: string
          cost_currency_snapshot?: string | null
          evidence_reference?: string | null
          id?: string
          idempotency_key?: string
          inventory_lot_id?: string
          movement_id?: string
          normalized_quantity?: number
          owner_id?: string
          payload_fingerprint?: string
          quantity?: number
          reason?: string
          recorded_at?: string
          requirement_id?: string
          reservation_id?: string
          total_cost_snapshot?: number | null
          unit?: string
          unit_cost_snapshot?: number | null
          waste_category?: string
          weighing_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_material_waste_weighing_id_fkey"
            columns: ["weighing_id"]
            isOneToOne: false
            referencedRelation: "batch_material_weighings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_material_waste_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_material_waste_workspace_id_inventory_lot_id_fkey"
            columns: ["workspace_id", "inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "batch_material_waste_workspace_id_movement_id_fkey"
            columns: ["workspace_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "inventory_movements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "batch_material_waste_workspace_id_reservation_id_fkey"
            columns: ["workspace_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "inventory_reservations"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      batch_material_weighings: {
        Row: {
          actor_id: string
          actual_quantity: number | null
          allocation_id: string
          batch_id: string
          batch_kind: string
          deviation_from_target: number | null
          equipment_reference: string | null
          evidence_reference: string | null
          id: string
          idempotency_key: string
          inventory_lot_id: string
          normalized_quantity: number
          operator_note: string
          owner_id: string
          payload_fingerprint: string
          planned_container: string | null
          planned_quantity: number | null
          planned_sequence: number | null
          record_type: string
          recorded_at: string
          requirement_id: string
          reservation_id: string
          revision: number
          supersedes_weighing_id: string | null
          unit: string
          workspace_id: string
        }
        Insert: {
          actor_id: string
          actual_quantity?: number | null
          allocation_id: string
          batch_id: string
          batch_kind: string
          deviation_from_target?: number | null
          equipment_reference?: string | null
          evidence_reference?: string | null
          id?: string
          idempotency_key: string
          inventory_lot_id: string
          normalized_quantity: number
          operator_note?: string
          owner_id: string
          payload_fingerprint: string
          planned_container?: string | null
          planned_quantity?: number | null
          planned_sequence?: number | null
          record_type: string
          recorded_at?: string
          requirement_id: string
          reservation_id: string
          revision?: number
          supersedes_weighing_id?: string | null
          unit: string
          workspace_id: string
        }
        Update: {
          actor_id?: string
          actual_quantity?: number | null
          allocation_id?: string
          batch_id?: string
          batch_kind?: string
          deviation_from_target?: number | null
          equipment_reference?: string | null
          evidence_reference?: string | null
          id?: string
          idempotency_key?: string
          inventory_lot_id?: string
          normalized_quantity?: number
          operator_note?: string
          owner_id?: string
          payload_fingerprint?: string
          planned_container?: string | null
          planned_quantity?: number | null
          planned_sequence?: number | null
          record_type?: string
          recorded_at?: string
          requirement_id?: string
          reservation_id?: string
          revision?: number
          supersedes_weighing_id?: string | null
          unit?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_material_weighings_supersedes_weighing_id_fkey"
            columns: ["supersedes_weighing_id"]
            isOneToOne: false
            referencedRelation: "batch_material_weighings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_material_weighings_workspace_id_allocation_id_fkey"
            columns: ["workspace_id", "allocation_id"]
            isOneToOne: false
            referencedRelation: "batch_material_lot_allocations"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "batch_material_weighings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_material_weighings_workspace_id_inventory_lot_id_fkey"
            columns: ["workspace_id", "inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "batch_material_weighings_workspace_id_reservation_id_fkey"
            columns: ["workspace_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "inventory_reservations"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      beard_length_map_zones: {
        Row: {
          attachment_id: string | null
          display_order: number
          enabled: boolean
          id: string
          length_map_id: string
          maximum_length_mm: number | null
          minimum_length_mm: number | null
          notes: string
          target_length_mm: number
          tool_id: string | null
          trim_direction: string
          workspace_id: string
          zone_name: string
        }
        Insert: {
          attachment_id?: string | null
          display_order: number
          enabled?: boolean
          id: string
          length_map_id: string
          maximum_length_mm?: number | null
          minimum_length_mm?: number | null
          notes?: string
          target_length_mm: number
          tool_id?: string | null
          trim_direction: string
          workspace_id: string
          zone_name: string
        }
        Update: {
          attachment_id?: string | null
          display_order?: number
          enabled?: boolean
          id?: string
          length_map_id?: string
          maximum_length_mm?: number | null
          minimum_length_mm?: number | null
          notes?: string
          target_length_mm?: number
          tool_id?: string | null
          trim_direction?: string
          workspace_id?: string
          zone_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "beard_length_map_zones_attachment_workspace_fkey"
            columns: ["attachment_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "grooming_tool_attachments"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "beard_length_map_zones_length_map_id_workspace_id_fkey"
            columns: ["length_map_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "beard_length_maps"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "beard_length_map_zones_tool_id_workspace_id_fkey"
            columns: ["tool_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "grooming_tools"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      beard_length_maps: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          profile_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id: string
          owner_id: string
          profile_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          profile_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beard_length_maps_profile_id_workspace_id_fkey"
            columns: ["profile_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "beard_profiles"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "beard_length_maps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      beard_log_entries: {
        Row: {
          change_next_time: string
          comfort_rating: number | null
          created_at: string
          days_since_previous_trim: number | null
          duration_minutes: number | null
          fade_rating: number | null
          id: string
          image_references: Json
          immutable_snapshot: Json
          line_sharpness_rating: number | null
          notes: string
          occurred_at: string
          overall_rating: number
          owner_id: string
          profile_id: string
          recipe_id: string | null
          recipe_version: number | null
          session_id: string | null
          snapshot_schema_version: number
          starting_condition: string
          symmetry_rating: number | null
          updated_at: string
          what_worked: string
          workspace_id: string
        }
        Insert: {
          change_next_time?: string
          comfort_rating?: number | null
          created_at?: string
          days_since_previous_trim?: number | null
          duration_minutes?: number | null
          fade_rating?: number | null
          id: string
          image_references?: Json
          immutable_snapshot: Json
          line_sharpness_rating?: number | null
          notes?: string
          occurred_at: string
          overall_rating: number
          owner_id: string
          profile_id: string
          recipe_id?: string | null
          recipe_version?: number | null
          session_id?: string | null
          snapshot_schema_version?: number
          starting_condition?: string
          symmetry_rating?: number | null
          updated_at?: string
          what_worked?: string
          workspace_id: string
        }
        Update: {
          change_next_time?: string
          comfort_rating?: number | null
          created_at?: string
          days_since_previous_trim?: number | null
          duration_minutes?: number | null
          fade_rating?: number | null
          id?: string
          image_references?: Json
          immutable_snapshot?: Json
          line_sharpness_rating?: number | null
          notes?: string
          occurred_at?: string
          overall_rating?: number
          owner_id?: string
          profile_id?: string
          recipe_id?: string | null
          recipe_version?: number | null
          session_id?: string | null
          snapshot_schema_version?: number
          starting_condition?: string
          symmetry_rating?: number | null
          updated_at?: string
          what_worked?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beard_log_entries_profile_id_workspace_id_fkey"
            columns: ["profile_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "beard_profiles"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "beard_log_entries_recipe_id_workspace_id_fkey"
            columns: ["recipe_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "trim_recipes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "beard_log_entries_session_workspace_fkey"
            columns: ["session_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "beard_trim_sessions"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "beard_log_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      beard_log_product_links: {
        Row: {
          beard_log_entry_id: string
          display_order: number
          id: string
          owner_id: string
          product_category_snapshot: string
          product_id: string | null
          product_name_snapshot: string
          usage_role: string
          workspace_id: string
        }
        Insert: {
          beard_log_entry_id: string
          display_order: number
          id: string
          owner_id: string
          product_category_snapshot?: string
          product_id?: string | null
          product_name_snapshot: string
          usage_role: string
          workspace_id: string
        }
        Update: {
          beard_log_entry_id?: string
          display_order?: number
          id?: string
          owner_id?: string
          product_category_snapshot?: string
          product_id?: string | null
          product_name_snapshot?: string
          usage_role?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beard_log_product_links_log_workspace_fkey"
            columns: ["beard_log_entry_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "beard_log_entries"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "beard_log_product_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beard_log_product_links_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      beard_profiles: {
        Row: {
          created_at: string
          density: string
          description: string
          id: string
          maintenance_frequency_days: number
          name: string
          owner_id: string
          preferred_overall_length_mm: number
          profile_details: Json
          status: string
          style_name: string
          target_look: string
          texture: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          density: string
          description?: string
          id: string
          maintenance_frequency_days: number
          name: string
          owner_id: string
          preferred_overall_length_mm: number
          profile_details?: Json
          status: string
          style_name: string
          target_look?: string
          texture: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          density?: string
          description?: string
          id?: string
          maintenance_frequency_days?: number
          name?: string
          owner_id?: string
          preferred_overall_length_mm?: number
          profile_details?: Json
          status?: string
          style_name?: string
          target_look?: string
          texture?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beard_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      beard_studio_revisions: {
        Row: {
          owner_id: string
          revision: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          owner_id: string
          revision?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          owner_id?: string
          revision?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beard_studio_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      beard_trim_sessions: {
        Row: {
          completed_at: string | null
          completed_step_ids: string[]
          current_step_index: number
          id: string
          owner_id: string
          recipe_id: string
          recipe_version: number
          skipped_step_ids: string[]
          started_at: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_step_ids?: string[]
          current_step_index?: number
          id: string
          owner_id: string
          recipe_id: string
          recipe_version: number
          skipped_step_ids?: string[]
          started_at?: string
          status: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          completed_step_ids?: string[]
          current_step_index?: number
          id?: string
          owner_id?: string
          recipe_id?: string
          recipe_version?: number
          skipped_step_ids?: string[]
          started_at?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beard_trim_sessions_recipe_id_workspace_id_fkey"
            columns: ["recipe_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "trim_recipes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "beard_trim_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_evidence: {
        Row: {
          claim_id: string
          document_id: string | null
          evidence_type: string
          id: string
          owner_id: string
          relevance_notes: string
          reviewed_at: string | null
          reviewed_by: string
          workspace_id: string
        }
        Insert: {
          claim_id: string
          document_id?: string | null
          evidence_type: string
          id: string
          owner_id: string
          relevance_notes: string
          reviewed_at?: string | null
          reviewed_by: string
          workspace_id: string
        }
        Update: {
          claim_id?: string
          document_id?: string | null
          evidence_type?: string
          id?: string
          owner_id?: string
          relevance_notes?: string
          reviewed_at?: string | null
          reviewed_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_evidence_workspace_id_claim_id_fkey"
            columns: ["workspace_id", "claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "claim_evidence_workspace_id_document_id_fkey"
            columns: ["workspace_id", "document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "claim_evidence_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          channel: string
          claim_text: string
          compliance_dossier_id: string | null
          created_at: string
          evidence_summary: string
          id: string
          market: string
          owner_id: string
          product_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel: string
          claim_text: string
          compliance_dossier_id?: string | null
          created_at: string
          evidence_summary: string
          id: string
          market: string
          owner_id: string
          product_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          channel?: string
          claim_text?: string
          compliance_dossier_id?: string | null
          created_at?: string
          evidence_summary?: string
          id?: string
          market?: string
          owner_id?: string
          product_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_workspace_id_compliance_dossier_id_fkey"
            columns: ["workspace_id", "compliance_dossier_id"]
            isOneToOne: false
            referencedRelation: "compliance_dossiers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "claims_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      compliance_composition_snapshots: {
        Row: {
          compliance_dossier_id: string
          concentration: number
          formula_line_id: string
          inci_name_snapshot: string
          ingredient_id: string
          ingredient_name_snapshot: string
          owner_id: string
          workspace_id: string
        }
        Insert: {
          compliance_dossier_id: string
          concentration: number
          formula_line_id: string
          inci_name_snapshot: string
          ingredient_id: string
          ingredient_name_snapshot: string
          owner_id: string
          workspace_id: string
        }
        Update: {
          compliance_dossier_id?: string
          concentration?: number
          formula_line_id?: string
          inci_name_snapshot?: string
          ingredient_id?: string
          ingredient_name_snapshot?: string
          owner_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_composition_snapsh_workspace_id_compliance_doss_fkey"
            columns: ["workspace_id", "compliance_dossier_id"]
            isOneToOne: false
            referencedRelation: "compliance_dossiers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "compliance_composition_snapsh_workspace_id_formula_line_id_fkey"
            columns: ["workspace_id", "formula_line_id"]
            isOneToOne: false
            referencedRelation: "formula_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "compliance_composition_snapshot_workspace_id_ingredient_id_fkey"
            columns: ["workspace_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      compliance_documents: {
        Row: {
          author: string
          created_at: string
          document_type: string
          expiry_date: string | null
          external_reference: string | null
          external_url: string | null
          file_name: string | null
          id: string
          issue_date: string | null
          issued_by: string
          linked_entity_id: string
          linked_entity_type: string
          notes: string
          owner_id: string
          review_date: string | null
          status: string
          title: string
          updated_at: string
          version: string
          workspace_id: string
        }
        Insert: {
          author: string
          created_at: string
          document_type: string
          expiry_date?: string | null
          external_reference?: string | null
          external_url?: string | null
          file_name?: string | null
          id: string
          issue_date?: string | null
          issued_by: string
          linked_entity_id: string
          linked_entity_type: string
          notes: string
          owner_id: string
          review_date?: string | null
          status: string
          title: string
          updated_at: string
          version: string
          workspace_id: string
        }
        Update: {
          author?: string
          created_at?: string
          document_type?: string
          expiry_date?: string | null
          external_reference?: string | null
          external_url?: string | null
          file_name?: string | null
          id?: string
          issue_date?: string | null
          issued_by?: string
          linked_entity_id?: string
          linked_entity_type?: string
          notes?: string
          owner_id?: string
          review_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          version?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_dossiers: {
        Row: {
          created_at: string
          derived_from_dossier_id: string | null
          formula_version_id: string
          id: string
          internal_owner: string
          label_artwork_version_id: string | null
          notes: string
          owner_id: string
          packaging_specification_version_id: string | null
          product_id: string
          responsible_person_id: string | null
          status: string
          target_language: string
          target_market: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at: string
          derived_from_dossier_id?: string | null
          formula_version_id: string
          id: string
          internal_owner: string
          label_artwork_version_id?: string | null
          notes: string
          owner_id: string
          packaging_specification_version_id?: string | null
          product_id: string
          responsible_person_id?: string | null
          status: string
          target_language: string
          target_market: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          derived_from_dossier_id?: string | null
          formula_version_id?: string
          id?: string
          internal_owner?: string
          label_artwork_version_id?: string | null
          notes?: string
          owner_id?: string
          packaging_specification_version_id?: string | null
          product_id?: string
          responsible_person_id?: string | null
          status?: string
          target_language?: string
          target_market?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_dossiers_workspace_id_derived_from_dossier_id_fkey"
            columns: ["workspace_id", "derived_from_dossier_id"]
            isOneToOne: false
            referencedRelation: "compliance_dossiers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "compliance_dossiers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_dossiers_workspace_id_formula_version_id_fkey"
            columns: ["workspace_id", "formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "compliance_dossiers_workspace_id_label_artwork_version_id_fkey"
            columns: ["workspace_id", "label_artwork_version_id"]
            isOneToOne: false
            referencedRelation: "label_artwork_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "compliance_dossiers_workspace_id_packaging_specification_v_fkey"
            columns: ["workspace_id", "packaging_specification_version_id"]
            isOneToOne: false
            referencedRelation: "packaging_specification_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "compliance_dossiers_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "compliance_dossiers_workspace_id_responsible_person_id_fkey"
            columns: ["workspace_id", "responsible_person_id"]
            isOneToOne: false
            referencedRelation: "responsible_persons"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      cost_lines: {
        Row: {
          amount: number
          category: string
          created_at: string
          currency: string
          description: string
          id: string
          notes: string
          owner_id: string
          quantity: number
          reference_id: string
          scope: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at: string
          currency: string
          description: string
          id: string
          notes: string
          owner_id: string
          quantity: number
          reference_id: string
          scope: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          description?: string
          id?: string
          notes?: string
          owner_id?: string
          quantity?: number
          reference_id?: string
          scope?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cpnp_records: {
        Row: {
          compliance_dossier_id: string
          confirmation_document_id: string | null
          external_reference: string | null
          id: string
          last_reviewed_at: string | null
          notes: string
          notification_date: string | null
          owner_id: string
          responsible_person_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          compliance_dossier_id: string
          confirmation_document_id?: string | null
          external_reference?: string | null
          id: string
          last_reviewed_at?: string | null
          notes: string
          notification_date?: string | null
          owner_id: string
          responsible_person_id?: string | null
          status: string
          workspace_id: string
        }
        Update: {
          compliance_dossier_id?: string
          confirmation_document_id?: string | null
          external_reference?: string | null
          id?: string
          last_reviewed_at?: string | null
          notes?: string
          notification_date?: string | null
          owner_id?: string
          responsible_person_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cpnp_records_workspace_id_compliance_dossier_id_fkey"
            columns: ["workspace_id", "compliance_dossier_id"]
            isOneToOne: false
            referencedRelation: "compliance_dossiers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "cpnp_records_workspace_id_confirmation_document_id_fkey"
            columns: ["workspace_id", "confirmation_document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "cpnp_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cpnp_records_workspace_id_responsible_person_id_fkey"
            columns: ["workspace_id", "responsible_person_id"]
            isOneToOne: false
            referencedRelation: "responsible_persons"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      cpsr_records: {
        Row: {
          assessed_formula_version_id: string
          assessed_packaging_specification_version_id: string | null
          assessor_name: string
          assessor_organisation: string
          compliance_dossier_id: string
          cpsr_document_id: string | null
          credential_document_id: string | null
          id: string
          issued_date: string | null
          owner_id: string
          restrictions: string
          review_notes: string
          status: string
          workspace_id: string
        }
        Insert: {
          assessed_formula_version_id: string
          assessed_packaging_specification_version_id?: string | null
          assessor_name: string
          assessor_organisation: string
          compliance_dossier_id: string
          cpsr_document_id?: string | null
          credential_document_id?: string | null
          id: string
          issued_date?: string | null
          owner_id: string
          restrictions: string
          review_notes: string
          status: string
          workspace_id: string
        }
        Update: {
          assessed_formula_version_id?: string
          assessed_packaging_specification_version_id?: string | null
          assessor_name?: string
          assessor_organisation?: string
          compliance_dossier_id?: string
          cpsr_document_id?: string | null
          credential_document_id?: string | null
          id?: string
          issued_date?: string | null
          owner_id?: string
          restrictions?: string
          review_notes?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cpsr_records_workspace_id_assessed_formula_version_id_fkey"
            columns: ["workspace_id", "assessed_formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "cpsr_records_workspace_id_assessed_packaging_specification_fkey"
            columns: [
              "workspace_id",
              "assessed_packaging_specification_version_id",
            ]
            isOneToOne: false
            referencedRelation: "packaging_specification_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "cpsr_records_workspace_id_compliance_dossier_id_fkey"
            columns: ["workspace_id", "compliance_dossier_id"]
            isOneToOne: false
            referencedRelation: "compliance_dossiers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "cpsr_records_workspace_id_cpsr_document_id_fkey"
            columns: ["workspace_id", "cpsr_document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "cpsr_records_workspace_id_credential_document_id_fkey"
            columns: ["workspace_id", "credential_document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "cpsr_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_comparison_rates: {
        Row: {
          created_at: string
          effective_at: string
          from_currency: string
          id: string
          owner_id: string
          rate: number
          source_label: string
          to_currency: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          effective_at: string
          from_currency: string
          id?: string
          owner_id: string
          rate: number
          source_label: string
          to_currency: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          effective_at?: string
          from_currency?: string
          id?: string
          owner_id?: string
          rate?: number
          source_label?: string
          to_currency?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "currency_comparison_rates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      development_experiment_changes: {
        Row: {
          change_type: string
          concept_material_name: string | null
          created_at: string
          current_value: number | null
          display_order: number
          experiment_id: string
          id: string
          ingredient_id: string | null
          owner_user_id: string
          proposed_value: number | null
          qualitative_guidance: string | null
          rationale: string
          unit: string | null
          updated_at: string
          variant_id: string
          workspace_id: string
        }
        Insert: {
          change_type: string
          concept_material_name?: string | null
          created_at?: string
          current_value?: number | null
          display_order: number
          experiment_id: string
          id?: string
          ingredient_id?: string | null
          owner_user_id: string
          proposed_value?: number | null
          qualitative_guidance?: string | null
          rationale?: string
          unit?: string | null
          updated_at?: string
          variant_id: string
          workspace_id: string
        }
        Update: {
          change_type?: string
          concept_material_name?: string | null
          created_at?: string
          current_value?: number | null
          display_order?: number
          experiment_id?: string
          id?: string
          ingredient_id?: string | null
          owner_user_id?: string
          proposed_value?: number | null
          qualitative_guidance?: string | null
          rationale?: string
          unit?: string | null
          updated_at?: string
          variant_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_experiment_changes_workspace_id_experiment_id_fkey"
            columns: ["workspace_id", "experiment_id"]
            isOneToOne: false
            referencedRelation: "development_experiments"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "development_experiment_changes_workspace_id_ingredient_id_fkey"
            columns: ["workspace_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "development_experiment_changes_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "development_experiment_changes_workspace_id_variant_id_fkey"
            columns: ["workspace_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "development_experiment_variants"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      development_experiment_handoffs: {
        Row: {
          created_at: string
          experiment_id: string
          formula_version_id: string | null
          handoff_type: string
          id: string
          idempotency_key: string
          lab_batch_id: string | null
          owner_user_id: string
          variant_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          experiment_id: string
          formula_version_id?: string | null
          handoff_type: string
          id?: string
          idempotency_key: string
          lab_batch_id?: string | null
          owner_user_id: string
          variant_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          experiment_id?: string
          formula_version_id?: string | null
          handoff_type?: string
          id?: string
          idempotency_key?: string
          lab_batch_id?: string | null
          owner_user_id?: string
          variant_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_experiment_handof_workspace_id_formula_version_fkey"
            columns: ["workspace_id", "formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "development_experiment_handoffs_workspace_id_experiment_id_fkey"
            columns: ["workspace_id", "experiment_id"]
            isOneToOne: false
            referencedRelation: "development_experiments"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "development_experiment_handoffs_workspace_id_lab_batch_id_fkey"
            columns: ["workspace_id", "lab_batch_id"]
            isOneToOne: false
            referencedRelation: "lab_batches"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "development_experiment_handoffs_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "development_experiment_handoffs_workspace_id_variant_id_fkey"
            columns: ["workspace_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "development_experiment_variants"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      development_experiment_observation_prompts: {
        Row: {
          category: string
          checkpoint_type: string | null
          created_at: string
          display_order: number
          experiment_id: string
          id: string
          is_required: boolean
          owner_user_id: string
          prompt: string
          variant_id: string | null
          workspace_id: string
        }
        Insert: {
          category: string
          checkpoint_type?: string | null
          created_at?: string
          display_order: number
          experiment_id: string
          id?: string
          is_required?: boolean
          owner_user_id: string
          prompt: string
          variant_id?: string | null
          workspace_id: string
        }
        Update: {
          category?: string
          checkpoint_type?: string | null
          created_at?: string
          display_order?: number
          experiment_id?: string
          id?: string
          is_required?: boolean
          owner_user_id?: string
          prompt?: string
          variant_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_experiment_observat_workspace_id_experiment_id_fkey"
            columns: ["workspace_id", "experiment_id"]
            isOneToOne: false
            referencedRelation: "development_experiments"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "development_experiment_observat_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "development_experiment_observation_workspace_id_variant_id_fkey"
            columns: ["workspace_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "development_experiment_variants"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      development_experiment_status_events: {
        Row: {
          created_at: string
          experiment_id: string
          from_status: string | null
          id: string
          note: string | null
          owner_user_id: string
          to_status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          experiment_id: string
          from_status?: string | null
          id?: string
          note?: string | null
          owner_user_id: string
          to_status: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          experiment_id?: string
          from_status?: string | null
          id?: string
          note?: string | null
          owner_user_id?: string
          to_status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_experiment_status_e_workspace_id_experiment_id_fkey"
            columns: ["workspace_id", "experiment_id"]
            isOneToOne: false
            referencedRelation: "development_experiments"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "development_experiment_status_e_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      development_experiment_variants: {
        Row: {
          created_at: string
          display_order: number
          experiment_id: string
          id: string
          is_control: boolean
          linked_formula_version_id: string | null
          linked_lab_batch_id: string | null
          name: string
          owner_user_id: string
          purpose: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          display_order: number
          experiment_id: string
          id?: string
          is_control?: boolean
          linked_formula_version_id?: string | null
          linked_lab_batch_id?: string | null
          name: string
          owner_user_id: string
          purpose?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          experiment_id?: string
          id?: string
          is_control?: boolean
          linked_formula_version_id?: string | null
          linked_lab_batch_id?: string | null
          name?: string
          owner_user_id?: string
          purpose?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_experiment_varian_workspace_id_linked_formula__fkey"
            columns: ["workspace_id", "linked_formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "development_experiment_varian_workspace_id_linked_lab_batc_fkey"
            columns: ["workspace_id", "linked_lab_batch_id"]
            isOneToOne: false
            referencedRelation: "lab_batches"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "development_experiment_variants_workspace_id_experiment_id_fkey"
            columns: ["workspace_id", "experiment_id"]
            isOneToOne: false
            referencedRelation: "development_experiments"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "development_experiment_variants_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      development_experiments: {
        Row: {
          acceptance_criteria: string | null
          approved_at: string | null
          archived_at: string | null
          base_formula_version_id: string | null
          completed_at: string | null
          conclusion: string | null
          created_at: string
          creation_idempotency_key: string
          experiment_type: string
          hypothesis: string
          hypothesis_outcome: string | null
          id: string
          next_step: string | null
          notes: string | null
          objective: string
          outcome_summary: string | null
          owner_user_id: string
          preferred_variant_id: string | null
          product_id: string | null
          revision: number
          source_intelligence_run_id: string | null
          source_intelligence_thread_id: string | null
          source_response_item_id: string | null
          source_response_item_type: string | null
          status: string
          title: string
          updated_at: string
          user_rationale: string | null
          workspace_id: string
        }
        Insert: {
          acceptance_criteria?: string | null
          approved_at?: string | null
          archived_at?: string | null
          base_formula_version_id?: string | null
          completed_at?: string | null
          conclusion?: string | null
          created_at?: string
          creation_idempotency_key: string
          experiment_type: string
          hypothesis: string
          hypothesis_outcome?: string | null
          id?: string
          next_step?: string | null
          notes?: string | null
          objective: string
          outcome_summary?: string | null
          owner_user_id: string
          preferred_variant_id?: string | null
          product_id?: string | null
          revision?: number
          source_intelligence_run_id?: string | null
          source_intelligence_thread_id?: string | null
          source_response_item_id?: string | null
          source_response_item_type?: string | null
          status?: string
          title: string
          updated_at?: string
          user_rationale?: string | null
          workspace_id: string
        }
        Update: {
          acceptance_criteria?: string | null
          approved_at?: string | null
          archived_at?: string | null
          base_formula_version_id?: string | null
          completed_at?: string | null
          conclusion?: string | null
          created_at?: string
          creation_idempotency_key?: string
          experiment_type?: string
          hypothesis?: string
          hypothesis_outcome?: string | null
          id?: string
          next_step?: string | null
          notes?: string | null
          objective?: string
          outcome_summary?: string | null
          owner_user_id?: string
          preferred_variant_id?: string | null
          product_id?: string | null
          revision?: number
          source_intelligence_run_id?: string | null
          source_intelligence_thread_id?: string | null
          source_response_item_id?: string | null
          source_response_item_type?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_rationale?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_experiments_preferred_variant_fk"
            columns: ["workspace_id", "preferred_variant_id"]
            isOneToOne: false
            referencedRelation: "development_experiment_variants"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "development_experiments_workspace_id_base_formula_version__fkey"
            columns: ["workspace_id", "base_formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "development_experiments_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "development_experiments_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "development_experiments_workspace_id_source_intelligence_r_fkey"
            columns: ["workspace_id", "source_intelligence_run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "development_experiments_workspace_id_source_intelligence_t_fkey"
            columns: ["workspace_id", "source_intelligence_thread_id"]
            isOneToOne: false
            referencedRelation: "intelligence_threads"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      document_objects: {
        Row: {
          bucket: string
          checksum: string | null
          compliance_dossier_id: string | null
          document_record_id: string
          file_version: number
          id: string
          mime_type: string
          object_path: string
          original_file_name: string
          owner_id: string
          removed_at: string | null
          replaced_by: string | null
          size: number
          state: string
          uploaded_at: string
          uploader_id: string | null
          workspace_id: string
        }
        Insert: {
          bucket?: string
          checksum?: string | null
          compliance_dossier_id?: string | null
          document_record_id: string
          file_version?: number
          id?: string
          mime_type: string
          object_path: string
          original_file_name: string
          owner_id: string
          removed_at?: string | null
          replaced_by?: string | null
          size: number
          state?: string
          uploaded_at?: string
          uploader_id?: string | null
          workspace_id: string
        }
        Update: {
          bucket?: string
          checksum?: string | null
          compliance_dossier_id?: string | null
          document_record_id?: string
          file_version?: number
          id?: string
          mime_type?: string
          object_path?: string
          original_file_name?: string
          owner_id?: string
          removed_at?: string | null
          replaced_by?: string | null
          size?: number
          state?: string
          uploaded_at?: string
          uploader_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_objects_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "document_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_objects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_capabilities: {
        Row: {
          capability_type: string
          created_at: string
          equipment_item_id: string
          id: string
          maximum_value: number | null
          minimum_value: number | null
          notes: string
          owner_id: string
          precision: number | null
          unit: string | null
          workspace_id: string
        }
        Insert: {
          capability_type: string
          created_at?: string
          equipment_item_id: string
          id?: string
          maximum_value?: number | null
          minimum_value?: number | null
          notes?: string
          owner_id: string
          precision?: number | null
          unit?: string | null
          workspace_id: string
        }
        Update: {
          capability_type?: string
          created_at?: string
          equipment_item_id?: string
          id?: string
          maximum_value?: number | null
          minimum_value?: number | null
          notes?: string
          owner_id?: string
          precision?: number | null
          unit?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_capabilities_workspace_id_equipment_item_id_fkey"
            columns: ["workspace_id", "equipment_item_id"]
            isOneToOne: false
            referencedRelation: "equipment_items"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      equipment_items: {
        Row: {
          archived_at: string | null
          capacity_unit: string | null
          capacity_value: number | null
          created_at: string
          equipment_type: string
          food_cosmetic_contact: boolean | null
          id: string
          internal_notes: string
          location: string | null
          manufacturer: string | null
          maximum_value: number | null
          minimum_value: number | null
          model: string | null
          name: string
          owner_id: string
          power_requirement: string | null
          precision_unit: string | null
          precision_value: number | null
          purchase_cost: number | null
          purchase_currency: string | null
          purchase_date: string | null
          revision: number
          serial_number: string | null
          status: string
          supplier_id: string | null
          supplier_product_id: string | null
          updated_at: string
          warranty_until: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          capacity_unit?: string | null
          capacity_value?: number | null
          created_at?: string
          equipment_type: string
          food_cosmetic_contact?: boolean | null
          id?: string
          internal_notes?: string
          location?: string | null
          manufacturer?: string | null
          maximum_value?: number | null
          minimum_value?: number | null
          model?: string | null
          name: string
          owner_id: string
          power_requirement?: string | null
          precision_unit?: string | null
          precision_value?: number | null
          purchase_cost?: number | null
          purchase_currency?: string | null
          purchase_date?: string | null
          revision?: number
          serial_number?: string | null
          status?: string
          supplier_id?: string | null
          supplier_product_id?: string | null
          updated_at?: string
          warranty_until?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          capacity_unit?: string | null
          capacity_value?: number | null
          created_at?: string
          equipment_type?: string
          food_cosmetic_contact?: boolean | null
          id?: string
          internal_notes?: string
          location?: string | null
          manufacturer?: string | null
          maximum_value?: number | null
          minimum_value?: number | null
          model?: string | null
          name?: string
          owner_id?: string
          power_requirement?: string | null
          precision_unit?: string | null
          precision_value?: number | null
          purchase_cost?: number | null
          purchase_currency?: string | null
          purchase_date?: string | null
          revision?: number
          serial_number?: string | null
          status?: string
          supplier_id?: string | null
          supplier_product_id?: string | null
          updated_at?: string
          warranty_until?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_items_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      equipment_policies: {
        Row: {
          calibration_interval_days: number | null
          cleaning_required_after_use: boolean
          cleaning_required_before_use: boolean
          created_at: string
          equipment_item_id: string
          id: string
          inspection_interval_days: number | null
          maintenance_interval_days: number | null
          owner_id: string
          revision: number
          status: string
          updated_at: string
          verification_notes: string
          workspace_id: string
        }
        Insert: {
          calibration_interval_days?: number | null
          cleaning_required_after_use?: boolean
          cleaning_required_before_use?: boolean
          created_at?: string
          equipment_item_id: string
          id?: string
          inspection_interval_days?: number | null
          maintenance_interval_days?: number | null
          owner_id: string
          revision?: number
          status?: string
          updated_at?: string
          verification_notes?: string
          workspace_id: string
        }
        Update: {
          calibration_interval_days?: number | null
          cleaning_required_after_use?: boolean
          cleaning_required_before_use?: boolean
          created_at?: string
          equipment_item_id?: string
          id?: string
          inspection_interval_days?: number | null
          maintenance_interval_days?: number | null
          owner_id?: string
          revision?: number
          status?: string
          updated_at?: string
          verification_notes?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_policies_workspace_id_equipment_item_id_fkey"
            columns: ["workspace_id", "equipment_item_id"]
            isOneToOne: false
            referencedRelation: "equipment_items"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      equipment_service_events: {
        Row: {
          created_at: string
          equipment_item_id: string
          event_type: string
          id: string
          next_due_at: string | null
          notes: string
          owner_id: string
          performed_at: string
          performed_by: string | null
          result_status: string
          source_document_id: string | null
          supersedes_event_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          equipment_item_id: string
          event_type: string
          id?: string
          next_due_at?: string | null
          notes?: string
          owner_id: string
          performed_at: string
          performed_by?: string | null
          result_status: string
          source_document_id?: string | null
          supersedes_event_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          equipment_item_id?: string
          event_type?: string
          id?: string
          next_due_at?: string | null
          notes?: string
          owner_id?: string
          performed_at?: string
          performed_by?: string | null
          result_status?: string
          source_document_id?: string | null
          supersedes_event_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_service_events_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "supplier_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_service_events_supersedes_event_id_fkey"
            columns: ["supersedes_event_id"]
            isOneToOne: false
            referencedRelation: "equipment_service_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_service_events_workspace_id_equipment_item_id_fkey"
            columns: ["workspace_id", "equipment_item_id"]
            isOneToOne: false
            referencedRelation: "equipment_items"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      finished_goods_batches: {
        Row: {
          cost_currency_snapshot: string | null
          created_at: string
          finished_goods_batch_number: string
          formula_version_id: string
          id: string
          initial_quantity: number
          notes: string
          owner_id: string
          packaging_cost_snapshot: number | null
          packaging_specification_version_id: string | null
          product_id: string
          production_cost_per_unit_snapshot: number | null
          production_date: string
          production_run_id: string
          status: string
          unit: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cost_currency_snapshot?: string | null
          created_at: string
          finished_goods_batch_number: string
          formula_version_id: string
          id: string
          initial_quantity: number
          notes: string
          owner_id: string
          packaging_cost_snapshot?: number | null
          packaging_specification_version_id?: string | null
          product_id: string
          production_cost_per_unit_snapshot?: number | null
          production_date: string
          production_run_id: string
          status: string
          unit: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          cost_currency_snapshot?: string | null
          created_at?: string
          finished_goods_batch_number?: string
          formula_version_id?: string
          id?: string
          initial_quantity?: number
          notes?: string
          owner_id?: string
          packaging_cost_snapshot?: number | null
          packaging_specification_version_id?: string | null
          product_id?: string
          production_cost_per_unit_snapshot?: number | null
          production_date?: string
          production_run_id?: string
          status?: string
          unit?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finished_goods_batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finished_goods_batches_workspace_id_formula_version_id_fkey"
            columns: ["workspace_id", "formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "finished_goods_batches_workspace_id_packaging_specificatio_fkey"
            columns: ["workspace_id", "packaging_specification_version_id"]
            isOneToOne: false
            referencedRelation: "packaging_specification_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "finished_goods_batches_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "finished_goods_batches_workspace_id_production_run_id_fkey"
            columns: ["workspace_id", "production_run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      finished_goods_movements: {
        Row: {
          created_at: string
          finished_goods_batch_id: string
          id: string
          notes: string
          occurred_at: string
          owner_id: string
          quantity: number
          reason: string
          reference_id: string | null
          reference_type: string | null
          type: string
          unit: string
          workspace_id: string
        }
        Insert: {
          created_at: string
          finished_goods_batch_id: string
          id: string
          notes: string
          occurred_at: string
          owner_id: string
          quantity: number
          reason: string
          reference_id?: string | null
          reference_type?: string | null
          type: string
          unit: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          finished_goods_batch_id?: string
          id?: string
          notes?: string
          occurred_at?: string
          owner_id?: string
          quantity?: number
          reason?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          unit?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finished_goods_movements_workspace_id_finished_goods_batch_fkey"
            columns: ["workspace_id", "finished_goods_batch_id"]
            isOneToOne: false
            referencedRelation: "finished_goods_batches"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "finished_goods_movements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      formula_lines: {
        Row: {
          formula_version_id: string
          formulation_role: string | null
          id: string
          ingredient_id: string
          notes: string
          owner_id: string
          percentage: number
          phase: string
          sort_order: number
          workspace_id: string
        }
        Insert: {
          formula_version_id: string
          formulation_role?: string | null
          id: string
          ingredient_id: string
          notes: string
          owner_id: string
          percentage: number
          phase: string
          sort_order: number
          workspace_id: string
        }
        Update: {
          formula_version_id?: string
          formulation_role?: string | null
          id?: string
          ingredient_id?: string
          notes?: string
          owner_id?: string
          percentage?: number
          phase?: string
          sort_order?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "formula_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formula_lines_workspace_id_formula_version_id_fkey"
            columns: ["workspace_id", "formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "formula_lines_workspace_id_ingredient_id_fkey"
            columns: ["workspace_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      formula_versions: {
        Row: {
          approved_at: string | null
          created_at: string
          derived_from_version_id: string | null
          description: string
          development_experiment_id: string | null
          development_experiment_variant_id: string | null
          development_notes: string | null
          formula_id: string
          id: string
          manufacturing_process: Json | null
          owner_id: string
          phase_definitions: Json | null
          process_instructions: string | null
          status: string
          target_characteristics: string
          updated_at: string
          version: string
          workspace_id: string
        }
        Insert: {
          approved_at?: string | null
          created_at: string
          derived_from_version_id?: string | null
          description: string
          development_experiment_id?: string | null
          development_experiment_variant_id?: string | null
          development_notes?: string | null
          formula_id: string
          id: string
          manufacturing_process?: Json | null
          owner_id: string
          phase_definitions?: Json | null
          process_instructions?: string | null
          status: string
          target_characteristics: string
          updated_at: string
          version: string
          workspace_id: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          derived_from_version_id?: string | null
          description?: string
          development_experiment_id?: string | null
          development_experiment_variant_id?: string | null
          development_notes?: string | null
          formula_id?: string
          id?: string
          manufacturing_process?: Json | null
          owner_id?: string
          phase_definitions?: Json | null
          process_instructions?: string | null
          status?: string
          target_characteristics?: string
          updated_at?: string
          version?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "formula_versions_experiment_fk"
            columns: ["workspace_id", "development_experiment_id"]
            isOneToOne: false
            referencedRelation: "development_experiments"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "formula_versions_experiment_variant_fk"
            columns: ["workspace_id", "development_experiment_variant_id"]
            isOneToOne: false
            referencedRelation: "development_experiment_variants"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "formula_versions_workspace_id_derived_from_version_id_fkey"
            columns: ["workspace_id", "derived_from_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "formula_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formula_versions_workspace_id_formula_id_fkey"
            columns: ["workspace_id", "formula_id"]
            isOneToOne: false
            referencedRelation: "formulas"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      formulas: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
          product_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
          product_id: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string
          product_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "formulas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formulas_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      grooming_tool_attachments: {
        Row: {
          display_order: number
          id: string
          name: string
          tool_id: string
          workspace_id: string
        }
        Insert: {
          display_order?: number
          id: string
          name: string
          tool_id: string
          workspace_id: string
        }
        Update: {
          display_order?: number
          id?: string
          name?: string
          tool_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grooming_tool_attachments_tool_id_workspace_id_fkey"
            columns: ["tool_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "grooming_tools"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      grooming_tools: {
        Row: {
          adjustment_increment_mm: number | null
          brand: string
          created_at: string
          id: string
          is_primary: boolean
          maximum_length_mm: number | null
          minimum_length_mm: number | null
          model: string
          name: string
          notes: string
          owner_id: string
          status: string
          tool_type: string
          updated_at: string
          washable: boolean
          workspace_id: string
        }
        Insert: {
          adjustment_increment_mm?: number | null
          brand?: string
          created_at?: string
          id: string
          is_primary?: boolean
          maximum_length_mm?: number | null
          minimum_length_mm?: number | null
          model?: string
          name: string
          notes?: string
          owner_id: string
          status: string
          tool_type: string
          updated_at?: string
          washable?: boolean
          workspace_id: string
        }
        Update: {
          adjustment_increment_mm?: number | null
          brand?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          maximum_length_mm?: number | null
          minimum_length_mm?: number | null
          model?: string
          name?: string
          notes?: string
          owner_id?: string
          status?: string
          tool_type?: string
          updated_at?: string
          washable?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grooming_tools_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inci_declarations: {
        Row: {
          compliance_dossier_id: string
          created_at: string
          final_text_snapshot: string | null
          id: string
          owner_id: string
          status: string
          unresolved_items: string[]
          updated_at: string
          version: string
          working_text: string
          workspace_id: string
        }
        Insert: {
          compliance_dossier_id: string
          created_at: string
          final_text_snapshot?: string | null
          id: string
          owner_id: string
          status: string
          unresolved_items: string[]
          updated_at: string
          version: string
          working_text: string
          workspace_id: string
        }
        Update: {
          compliance_dossier_id?: string
          created_at?: string
          final_text_snapshot?: string | null
          id?: string
          owner_id?: string
          status?: string
          unresolved_items?: string[]
          updated_at?: string
          version?: string
          working_text?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inci_declarations_workspace_id_compliance_dossier_id_fkey"
            columns: ["workspace_id", "compliance_dossier_id"]
            isOneToOne: false
            referencedRelation: "compliance_dossiers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "inci_declarations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_knowledge_compatibility: {
        Row: {
          confidence: string
          context: string
          created_at: string
          evidence_ids: Json
          id: string
          ingredient_knowledge_profile_id: string
          notes: string
          owner_id: string
          rating: string
          target_id: string | null
          target_label: string
          target_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          confidence: string
          context?: string
          created_at: string
          evidence_ids?: Json
          id: string
          ingredient_knowledge_profile_id: string
          notes?: string
          owner_id: string
          rating: string
          target_id?: string | null
          target_label: string
          target_type: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          confidence?: string
          context?: string
          created_at?: string
          evidence_ids?: Json
          id?: string
          ingredient_knowledge_profile_id?: string
          notes?: string
          owner_id?: string
          rating?: string
          target_id?: string | null
          target_label?: string
          target_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_knowledge_compatib_workspace_id_ingredient_know_fkey"
            columns: ["workspace_id", "ingredient_knowledge_profile_id"]
            isOneToOne: false
            referencedRelation: "ingredient_knowledge_profiles"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "ingredient_knowledge_compatibility_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_knowledge_evidence: {
        Row: {
          author_or_organisation: string | null
          confidence: string
          created_at: string
          document_id: string | null
          document_revision: string | null
          evidence_date: string | null
          external_url: string | null
          id: string
          ingredient_knowledge_profile_id: string
          notes: string
          owner_id: string
          provenance: string
          source_type: string
          summary: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          author_or_organisation?: string | null
          confidence: string
          created_at: string
          document_id?: string | null
          document_revision?: string | null
          evidence_date?: string | null
          external_url?: string | null
          id: string
          ingredient_knowledge_profile_id: string
          notes?: string
          owner_id: string
          provenance: string
          source_type: string
          summary?: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          author_or_organisation?: string | null
          confidence?: string
          created_at?: string
          document_id?: string | null
          document_revision?: string | null
          evidence_date?: string | null
          external_url?: string | null
          id?: string
          ingredient_knowledge_profile_id?: string
          notes?: string
          owner_id?: string
          provenance?: string
          source_type?: string
          summary?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_knowledge_evidence_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_knowledge_evidence_workspace_id_ingredient_know_fkey"
            columns: ["workspace_id", "ingredient_knowledge_profile_id"]
            isOneToOne: false
            referencedRelation: "ingredient_knowledge_profiles"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      ingredient_knowledge_profiles: {
        Row: {
          created_at: string
          id: string
          identity: Json
          ingredient_id: string
          last_edited_source: string | null
          owner_id: string
          physical_properties: Json
          prediction_inputs: Json
          sensory_profile: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at: string
          id: string
          identity?: Json
          ingredient_id: string
          last_edited_source?: string | null
          owner_id: string
          physical_properties?: Json
          prediction_inputs?: Json
          sensory_profile?: Json
          updated_at: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          identity?: Json
          ingredient_id?: string
          last_edited_source?: string | null
          owner_id?: string
          physical_properties?: Json
          prediction_inputs?: Json
          sensory_profile?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_knowledge_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_knowledge_profiles_workspace_id_ingredient_id_fkey"
            columns: ["workspace_id", "ingredient_id"]
            isOneToOne: true
            referencedRelation: "ingredients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      ingredient_knowledge_roles: {
        Row: {
          confidence: string
          context: string
          created_at: string
          evidence_ids: Json
          id: string
          ingredient_knowledge_profile_id: string
          level: string
          notes: string
          owner_id: string
          role: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          confidence: string
          context: string
          created_at: string
          evidence_ids?: Json
          id: string
          ingredient_knowledge_profile_id: string
          level: string
          notes?: string
          owner_id: string
          role: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          confidence?: string
          context?: string
          created_at?: string
          evidence_ids?: Json
          id?: string
          ingredient_knowledge_profile_id?: string
          level?: string
          notes?: string
          owner_id?: string
          role?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_knowledge_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_knowledge_roles_workspace_id_ingredient_knowled_fkey"
            columns: ["workspace_id", "ingredient_knowledge_profile_id"]
            isOneToOne: false
            referencedRelation: "ingredient_knowledge_profiles"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      ingredients: {
        Row: {
          adopted_reference_snapshot: Json | null
          adopted_reference_version: number | null
          category: string
          common_name: string
          cosing_functions: string[] | null
          cosing_source_reference: string | null
          cosing_verification_status: string | null
          cosing_verified_at: string | null
          created_at: string
          default_unit: string
          description: string
          functions: string[]
          id: string
          inci_name: string
          notes: string
          owner_id: string
          reference_adoption_key: string | null
          reference_entry_id: string | null
          reorder_threshold: number | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          adopted_reference_snapshot?: Json | null
          adopted_reference_version?: number | null
          category: string
          common_name: string
          cosing_functions?: string[] | null
          cosing_source_reference?: string | null
          cosing_verification_status?: string | null
          cosing_verified_at?: string | null
          created_at: string
          default_unit: string
          description: string
          functions: string[]
          id: string
          inci_name: string
          notes: string
          owner_id: string
          reference_adoption_key?: string | null
          reference_entry_id?: string | null
          reorder_threshold?: number | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          adopted_reference_snapshot?: Json | null
          adopted_reference_version?: number | null
          category?: string
          common_name?: string
          cosing_functions?: string[] | null
          cosing_source_reference?: string | null
          cosing_verification_status?: string | null
          cosing_verified_at?: string | null
          created_at?: string
          default_unit?: string
          description?: string
          functions?: string[]
          id?: string
          inci_name?: string
          notes?: string
          owner_id?: string
          reference_adoption_key?: string | null
          reference_entry_id?: string | null
          reorder_threshold?: number | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_analyses: {
        Row: {
          analysis_type: string
          analysis_version: string | null
          completed_at: string | null
          context_manifest: Json
          contract_version: string | null
          correlation_id: string
          created_at: string
          edge_function_elapsed_ms: number | null
          error_code: string | null
          failure_expected_category: string | null
          failure_json_path: string | null
          failure_received_category: string | null
          failure_recommendation_index: number | null
          failure_rule_code: string | null
          failure_schema_version: number | null
          failure_stage: string | null
          failure_trace_version: string | null
          failure_validator: string | null
          id: string
          idempotency_key: string
          model_name: string | null
          owner_user_id: string
          persistence_failure_constraint: string | null
          persistence_failure_diagnostic_version: string | null
          persistence_failure_entity_index: number | null
          persistence_failure_entity_type: string | null
          persistence_failure_operation: string | null
          persistence_failure_sqlstate: string | null
          persistence_failure_step: string | null
          persistence_failure_table: string | null
          profile_id: string
          prompt_version: string
          provider_abort_reason_code: string | null
          provider_abort_signal_aborted: boolean | null
          provider_attempt_count: number
          provider_attempted_at: string | null
          provider_elapsed_ms: number | null
          provider_extraction_diagnostic: Json | null
          provider_failure_classification: string | null
          provider_http_status_class: string | null
          provider_name: string | null
          provider_request_dispatched: boolean | null
          provider_request_id_present: boolean | null
          provider_response_body_completed: boolean | null
          provider_response_headers_received: boolean | null
          provider_response_present: boolean | null
          provider_stage: string | null
          provider_timeout_budget_ms: number | null
          provider_timeout_source: string | null
          provider_trace_usage_present: boolean | null
          provider_transport_error_category: string | null
          provider_usage: Json | null
          result_payload: Json | null
          review_finished_at: string | null
          schema_version: number
          semantic_rule_version: string | null
          source_module: string
          status: string
          summary_snapshot: Json | null
          target_style: Json | null
          trim_plan_snapshot: Json | null
          workspace_id: string
        }
        Insert: {
          analysis_type: string
          analysis_version?: string | null
          completed_at?: string | null
          context_manifest?: Json
          contract_version?: string | null
          correlation_id: string
          created_at?: string
          edge_function_elapsed_ms?: number | null
          error_code?: string | null
          failure_expected_category?: string | null
          failure_json_path?: string | null
          failure_received_category?: string | null
          failure_recommendation_index?: number | null
          failure_rule_code?: string | null
          failure_schema_version?: number | null
          failure_stage?: string | null
          failure_trace_version?: string | null
          failure_validator?: string | null
          id: string
          idempotency_key: string
          model_name?: string | null
          owner_user_id: string
          persistence_failure_constraint?: string | null
          persistence_failure_diagnostic_version?: string | null
          persistence_failure_entity_index?: number | null
          persistence_failure_entity_type?: string | null
          persistence_failure_operation?: string | null
          persistence_failure_sqlstate?: string | null
          persistence_failure_step?: string | null
          persistence_failure_table?: string | null
          profile_id: string
          prompt_version: string
          provider_abort_reason_code?: string | null
          provider_abort_signal_aborted?: boolean | null
          provider_attempt_count?: number
          provider_attempted_at?: string | null
          provider_elapsed_ms?: number | null
          provider_extraction_diagnostic?: Json | null
          provider_failure_classification?: string | null
          provider_http_status_class?: string | null
          provider_name?: string | null
          provider_request_dispatched?: boolean | null
          provider_request_id_present?: boolean | null
          provider_response_body_completed?: boolean | null
          provider_response_headers_received?: boolean | null
          provider_response_present?: boolean | null
          provider_stage?: string | null
          provider_timeout_budget_ms?: number | null
          provider_timeout_source?: string | null
          provider_trace_usage_present?: boolean | null
          provider_transport_error_category?: string | null
          provider_usage?: Json | null
          result_payload?: Json | null
          review_finished_at?: string | null
          schema_version: number
          semantic_rule_version?: string | null
          source_module: string
          status: string
          summary_snapshot?: Json | null
          target_style?: Json | null
          trim_plan_snapshot?: Json | null
          workspace_id: string
        }
        Update: {
          analysis_type?: string
          analysis_version?: string | null
          completed_at?: string | null
          context_manifest?: Json
          contract_version?: string | null
          correlation_id?: string
          created_at?: string
          edge_function_elapsed_ms?: number | null
          error_code?: string | null
          failure_expected_category?: string | null
          failure_json_path?: string | null
          failure_received_category?: string | null
          failure_recommendation_index?: number | null
          failure_rule_code?: string | null
          failure_schema_version?: number | null
          failure_stage?: string | null
          failure_trace_version?: string | null
          failure_validator?: string | null
          id?: string
          idempotency_key?: string
          model_name?: string | null
          owner_user_id?: string
          persistence_failure_constraint?: string | null
          persistence_failure_diagnostic_version?: string | null
          persistence_failure_entity_index?: number | null
          persistence_failure_entity_type?: string | null
          persistence_failure_operation?: string | null
          persistence_failure_sqlstate?: string | null
          persistence_failure_step?: string | null
          persistence_failure_table?: string | null
          profile_id?: string
          prompt_version?: string
          provider_abort_reason_code?: string | null
          provider_abort_signal_aborted?: boolean | null
          provider_attempt_count?: number
          provider_attempted_at?: string | null
          provider_elapsed_ms?: number | null
          provider_extraction_diagnostic?: Json | null
          provider_failure_classification?: string | null
          provider_http_status_class?: string | null
          provider_name?: string | null
          provider_request_dispatched?: boolean | null
          provider_request_id_present?: boolean | null
          provider_response_body_completed?: boolean | null
          provider_response_headers_received?: boolean | null
          provider_response_present?: boolean | null
          provider_stage?: string | null
          provider_timeout_budget_ms?: number | null
          provider_timeout_source?: string | null
          provider_trace_usage_present?: boolean | null
          provider_transport_error_category?: string | null
          provider_usage?: Json | null
          result_payload?: Json | null
          review_finished_at?: string | null
          schema_version?: number
          semantic_rule_version?: string | null
          source_module?: string
          status?: string
          summary_snapshot?: Json | null
          target_style?: Json | null
          trim_plan_snapshot?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_analyses_profile_id_workspace_id_fkey"
            columns: ["profile_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "beard_profiles"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "intelligence_analyses_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      intelligence_analysis_inputs: {
        Row: {
          analysis_id: string
          bucket: string
          byte_size: number
          cleaned_at: string | null
          cleanup_state: string
          created_at: string
          id: string
          mime_type: string
          object_path: string
          owner_user_id: string
          view: string
          workspace_id: string
        }
        Insert: {
          analysis_id: string
          bucket: string
          byte_size: number
          cleaned_at?: string | null
          cleanup_state?: string
          created_at?: string
          id: string
          mime_type: string
          object_path: string
          owner_user_id: string
          view: string
          workspace_id: string
        }
        Update: {
          analysis_id?: string
          bucket?: string
          byte_size?: number
          cleaned_at?: string | null
          cleanup_state?: string
          created_at?: string
          id?: string
          mime_type?: string
          object_path?: string
          owner_user_id?: string
          view?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_analysis_inputs_workspace_id_analysis_id_fkey"
            columns: ["workspace_id", "analysis_id"]
            isOneToOne: false
            referencedRelation: "intelligence_analyses"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "intelligence_analysis_inputs_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      intelligence_observations: {
        Row: {
          analysis_id: string
          category: string
          confidence: number
          created_at: string
          evidence_description: string
          id: string
          limitations: string[]
          owner_user_id: string
          provenance: string
          provider_observation_key: string | null
          related_beard_zones: string[]
          statement: string
          supporting_views: string[]
          workspace_id: string
        }
        Insert: {
          analysis_id: string
          category: string
          confidence: number
          created_at?: string
          evidence_description: string
          id: string
          limitations?: string[]
          owner_user_id: string
          provenance: string
          provider_observation_key?: string | null
          related_beard_zones?: string[]
          statement: string
          supporting_views: string[]
          workspace_id: string
        }
        Update: {
          analysis_id?: string
          category?: string
          confidence?: number
          created_at?: string
          evidence_description?: string
          id?: string
          limitations?: string[]
          owner_user_id?: string
          provenance?: string
          provider_observation_key?: string | null
          related_beard_zones?: string[]
          statement?: string
          supporting_views?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_observations_workspace_id_analysis_id_fkey"
            columns: ["workspace_id", "analysis_id"]
            isOneToOne: false
            referencedRelation: "intelligence_analyses"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "intelligence_observations_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      intelligence_recommendation_observations: {
        Row: {
          analysis_id: string
          created_at: string
          observation_id: string
          owner_user_id: string
          recommendation_id: string
          workspace_id: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          observation_id: string
          owner_user_id: string
          recommendation_id: string
          workspace_id: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          observation_id?: string
          owner_user_id?: string
          recommendation_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_recommendation_o_analysis_id_recommendation_i_fkey"
            columns: ["analysis_id", "recommendation_id"]
            isOneToOne: false
            referencedRelation: "intelligence_recommendations"
            referencedColumns: ["analysis_id", "id"]
          },
          {
            foreignKeyName: "intelligence_recommendation_obs_analysis_id_observation_id_fkey"
            columns: ["analysis_id", "observation_id"]
            isOneToOne: false
            referencedRelation: "intelligence_observations"
            referencedColumns: ["analysis_id", "id"]
          },
          {
            foreignKeyName: "intelligence_recommendation_obs_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "intelligence_recommendation_obser_workspace_id_analysis_id_fkey"
            columns: ["workspace_id", "analysis_id"]
            isOneToOne: false
            referencedRelation: "intelligence_analyses"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      intelligence_recommendations: {
        Row: {
          affected_zones: string[]
          analysis_id: string
          confidence: number
          created_at: string
          expected_benefit: string
          id: string
          owner_user_id: string
          priority: string
          proposed_guard_strategy: string | null
          provenance: string
          reason: string
          review_status: string
          supporting_observation_ids: string[]
          title: string
          tool_constraints: string[]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          affected_zones?: string[]
          analysis_id: string
          confidence: number
          created_at?: string
          expected_benefit: string
          id: string
          owner_user_id: string
          priority: string
          proposed_guard_strategy?: string | null
          provenance: string
          reason: string
          review_status?: string
          supporting_observation_ids: string[]
          title: string
          tool_constraints?: string[]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          affected_zones?: string[]
          analysis_id?: string
          confidence?: number
          created_at?: string
          expected_benefit?: string
          id?: string
          owner_user_id?: string
          priority?: string
          proposed_guard_strategy?: string | null
          provenance?: string
          reason?: string
          review_status?: string
          supporting_observation_ids?: string[]
          title?: string
          tool_constraints?: string[]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_recommendations_workspace_id_analysis_id_fkey"
            columns: ["workspace_id", "analysis_id"]
            isOneToOne: false
            referencedRelation: "intelligence_analyses"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "intelligence_recommendations_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      intelligence_runs: {
        Row: {
          cached_input_tokens: number | null
          completed_at: string | null
          context_manifest: Json
          context_selection: Json
          context_version: number
          created_at: string
          error_code: string | null
          error_message: string | null
          estimated_cost_usd: number | null
          id: string
          input_tokens: number | null
          model_name: string | null
          output_tokens: number | null
          owner_user_id: string
          pricing_snapshot_version: string | null
          prompt_version: string
          provider_name: string | null
          provider_usage_version: string | null
          reasoning_tokens: number | null
          request_schema_version: number
          response_payload: Json | null
          response_schema_version: number | null
          status: string
          thread_id: string
          total_tokens: number | null
          user_prompt: string
          workspace_id: string
        }
        Insert: {
          cached_input_tokens?: number | null
          completed_at?: string | null
          context_manifest: Json
          context_selection: Json
          context_version: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          id: string
          input_tokens?: number | null
          model_name?: string | null
          output_tokens?: number | null
          owner_user_id: string
          pricing_snapshot_version?: string | null
          prompt_version: string
          provider_name?: string | null
          provider_usage_version?: string | null
          reasoning_tokens?: number | null
          request_schema_version: number
          response_payload?: Json | null
          response_schema_version?: number | null
          status: string
          thread_id: string
          total_tokens?: number | null
          user_prompt: string
          workspace_id: string
        }
        Update: {
          cached_input_tokens?: number | null
          completed_at?: string | null
          context_manifest?: Json
          context_selection?: Json
          context_version?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          model_name?: string | null
          output_tokens?: number | null
          owner_user_id?: string
          pricing_snapshot_version?: string | null
          prompt_version?: string
          provider_name?: string | null
          provider_usage_version?: string | null
          reasoning_tokens?: number | null
          request_schema_version?: number
          response_payload?: Json | null
          response_schema_version?: number | null
          status?: string
          thread_id?: string
          total_tokens?: number | null
          user_prompt?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_runs_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "intelligence_runs_workspace_id_thread_id_fkey"
            columns: ["workspace_id", "thread_id"]
            isOneToOne: false
            referencedRelation: "intelligence_threads"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      intelligence_threads: {
        Row: {
          created_at: string
          id: string
          mode: string
          owner_user_id: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id: string
          mode: string
          owner_user_id: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          owner_user_id?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_threads_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          acquisition_cost_currency: string | null
          best_before_date: string | null
          blocked_at: string | null
          cost_notes: string | null
          created_at: string
          expiry_date: string | null
          id: string
          ingredient_id: string
          internal_lot_number: string
          location: string
          mandatory_retest_date: string | null
          notes: string
          opening_quantity: number
          owner_id: string
          quality_release_review_id: string | null
          quarantine_intake_id: string | null
          recalled_at: string | null
          received_date: string
          released_at: string | null
          restriction_snapshot: Json
          status: string
          supplier_lot_number: string | null
          supplier_product_id: string | null
          total_acquisition_cost: number | null
          unit: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          acquisition_cost_currency?: string | null
          best_before_date?: string | null
          blocked_at?: string | null
          cost_notes?: string | null
          created_at: string
          expiry_date?: string | null
          id: string
          ingredient_id: string
          internal_lot_number: string
          location: string
          mandatory_retest_date?: string | null
          notes: string
          opening_quantity: number
          owner_id: string
          quality_release_review_id?: string | null
          quarantine_intake_id?: string | null
          recalled_at?: string | null
          received_date: string
          released_at?: string | null
          restriction_snapshot?: Json
          status: string
          supplier_lot_number?: string | null
          supplier_product_id?: string | null
          total_acquisition_cost?: number | null
          unit: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          acquisition_cost_currency?: string | null
          best_before_date?: string | null
          blocked_at?: string | null
          cost_notes?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          ingredient_id?: string
          internal_lot_number?: string
          location?: string
          mandatory_retest_date?: string | null
          notes?: string
          opening_quantity?: number
          owner_id?: string
          quality_release_review_id?: string | null
          quarantine_intake_id?: string | null
          recalled_at?: string | null
          received_date?: string
          released_at?: string | null
          restriction_snapshot?: Json
          status?: string
          supplier_lot_number?: string | null
          supplier_product_id?: string | null
          total_acquisition_cost?: number | null
          unit?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_quality_review_fk"
            columns: ["quality_release_review_id"]
            isOneToOne: false
            referencedRelation: "inventory_quality_release_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_quarantine_intake_fk"
            columns: ["workspace_id", "quarantine_intake_id"]
            isOneToOne: false
            referencedRelation: "inventory_quarantine_intakes"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "inventory_lots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_workspace_id_ingredient_id_fkey"
            columns: ["workspace_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "inventory_lots_workspace_id_supplier_product_id_fkey"
            columns: ["workspace_id", "supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          id: string
          inventory_lot_id: string
          notes: string
          occurred_at: string
          owner_id: string
          quantity: number
          reason: string
          reference_id: string | null
          reference_type: string | null
          type: string
          unit: string
          workspace_id: string
        }
        Insert: {
          created_at: string
          id: string
          inventory_lot_id: string
          notes: string
          occurred_at: string
          owner_id: string
          quantity: number
          reason: string
          reference_id?: string | null
          reference_type?: string | null
          type: string
          unit: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_lot_id?: string
          notes?: string
          occurred_at?: string
          owner_id?: string
          quantity?: number
          reason?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          unit?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_workspace_id_inventory_lot_id_fkey"
            columns: ["workspace_id", "inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      inventory_quality_release_reviews: {
        Row: {
          acquisition_cost_currency: string | null
          acquisition_cost_evidence: Json
          acquisition_cost_source: string
          checklist_snapshot: Json
          created_at: string
          decision: string
          decision_reason: string
          disposition_quantity: number
          evidence: Json
          id: string
          idempotency_key: string
          internal_lot_number: string | null
          inventory_kind: string | null
          inventory_lot_id: string | null
          opening_movement_id: string | null
          owner_id: string
          payload_fingerprint: string
          policy_version: string
          quarantine_intake_id: string
          review_version: number
          reviewed_at: string
          reviewed_by: string
          total_acquisition_cost: number | null
          unit: string
          workspace_id: string
        }
        Insert: {
          acquisition_cost_currency?: string | null
          acquisition_cost_evidence?: Json
          acquisition_cost_source?: string
          checklist_snapshot: Json
          created_at?: string
          decision: string
          decision_reason: string
          disposition_quantity: number
          evidence: Json
          id?: string
          idempotency_key: string
          internal_lot_number?: string | null
          inventory_kind?: string | null
          inventory_lot_id?: string | null
          opening_movement_id?: string | null
          owner_id: string
          payload_fingerprint: string
          policy_version: string
          quarantine_intake_id: string
          review_version: number
          reviewed_at?: string
          reviewed_by: string
          total_acquisition_cost?: number | null
          unit: string
          workspace_id: string
        }
        Update: {
          acquisition_cost_currency?: string | null
          acquisition_cost_evidence?: Json
          acquisition_cost_source?: string
          checklist_snapshot?: Json
          created_at?: string
          decision?: string
          decision_reason?: string
          disposition_quantity?: number
          evidence?: Json
          id?: string
          idempotency_key?: string
          internal_lot_number?: string | null
          inventory_kind?: string | null
          inventory_lot_id?: string | null
          opening_movement_id?: string | null
          owner_id?: string
          payload_fingerprint?: string
          policy_version?: string
          quarantine_intake_id?: string
          review_version?: number
          reviewed_at?: string
          reviewed_by?: string
          total_acquisition_cost?: number | null
          unit?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_quality_release_rev_workspace_id_quarantine_inta_fkey"
            columns: ["workspace_id", "quarantine_intake_id"]
            isOneToOne: false
            referencedRelation: "inventory_quarantine_intakes"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      inventory_quarantine_intakes: {
        Row: {
          canonical_ingredient_id: string | null
          container_count: number
          created_at: string
          created_by: string
          discrepancy_snapshot: Json
          documentation_snapshot: Json
          expiry_or_retest_date: string | null
          hazard_snapshot: Json
          id: string
          idempotency_key: string
          inspection_summary: Json
          manufacturing_date: string | null
          owner_id: string
          package_count: number
          packaging_component_id: string | null
          payload_fingerprint: string
          purchase_order_line_id: string
          quarantine_location: string
          quarantine_quantity: number
          quarantine_reason: string
          quarantine_status: string
          receipt_id: string
          receipt_line_id: string
          rejected_quantity: number
          released_quantity: number
          revision: number
          storage_requirement_snapshot: Json
          supplier_batch_number: string
          supplier_id: string
          supplier_lot_number: string
          supplier_product_snapshot: Json
          unit: string
          workspace_id: string
        }
        Insert: {
          canonical_ingredient_id?: string | null
          container_count: number
          created_at?: string
          created_by: string
          discrepancy_snapshot: Json
          documentation_snapshot: Json
          expiry_or_retest_date?: string | null
          hazard_snapshot?: Json
          id?: string
          idempotency_key: string
          inspection_summary: Json
          manufacturing_date?: string | null
          owner_id: string
          package_count: number
          packaging_component_id?: string | null
          payload_fingerprint: string
          purchase_order_line_id: string
          quarantine_location: string
          quarantine_quantity: number
          quarantine_reason: string
          quarantine_status?: string
          receipt_id: string
          receipt_line_id: string
          rejected_quantity?: number
          released_quantity?: number
          revision?: number
          storage_requirement_snapshot?: Json
          supplier_batch_number?: string
          supplier_id: string
          supplier_lot_number: string
          supplier_product_snapshot: Json
          unit: string
          workspace_id: string
        }
        Update: {
          canonical_ingredient_id?: string | null
          container_count?: number
          created_at?: string
          created_by?: string
          discrepancy_snapshot?: Json
          documentation_snapshot?: Json
          expiry_or_retest_date?: string | null
          hazard_snapshot?: Json
          id?: string
          idempotency_key?: string
          inspection_summary?: Json
          manufacturing_date?: string | null
          owner_id?: string
          package_count?: number
          packaging_component_id?: string | null
          payload_fingerprint?: string
          purchase_order_line_id?: string
          quarantine_location?: string
          quarantine_quantity?: number
          quarantine_reason?: string
          quarantine_status?: string
          receipt_id?: string
          receipt_line_id?: string
          rejected_quantity?: number
          released_quantity?: number
          revision?: number
          storage_requirement_snapshot?: Json
          supplier_batch_number?: string
          supplier_id?: string
          supplier_lot_number?: string
          supplier_product_snapshot?: Json
          unit?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_quarantine_intakes_workspace_id_purchase_order_l_fkey"
            columns: ["workspace_id", "purchase_order_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "inventory_quarantine_intakes_workspace_id_receipt_id_fkey"
            columns: ["workspace_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_receipts"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "inventory_quarantine_intakes_workspace_id_receipt_line_id_fkey"
            columns: ["workspace_id", "receipt_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_receipt_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "inventory_quarantine_intakes_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          allocation_id: string
          batch_id: string
          batch_kind: string
          consumed_quantity: number
          created_at: string
          id: string
          idempotency_key: string
          inventory_lot_id: string
          normalized_quantity: number
          owner_id: string
          payload_fingerprint: string
          released_at: string | null
          released_by: string | null
          released_quantity: number
          remaining_quantity: number
          requirement_id: string
          reserved_at: string
          reserved_by: string
          reserved_quantity: number
          revision: number
          status: string
          unit: string
          updated_at: string
          wasted_quantity: number
          workspace_id: string
        }
        Insert: {
          allocation_id: string
          batch_id: string
          batch_kind: string
          consumed_quantity?: number
          created_at?: string
          id?: string
          idempotency_key: string
          inventory_lot_id: string
          normalized_quantity: number
          owner_id: string
          payload_fingerprint: string
          released_at?: string | null
          released_by?: string | null
          released_quantity?: number
          remaining_quantity: number
          requirement_id: string
          reserved_at?: string
          reserved_by: string
          reserved_quantity: number
          revision?: number
          status?: string
          unit: string
          updated_at?: string
          wasted_quantity?: number
          workspace_id: string
        }
        Update: {
          allocation_id?: string
          batch_id?: string
          batch_kind?: string
          consumed_quantity?: number
          created_at?: string
          id?: string
          idempotency_key?: string
          inventory_lot_id?: string
          normalized_quantity?: number
          owner_id?: string
          payload_fingerprint?: string
          released_at?: string | null
          released_by?: string | null
          released_quantity?: number
          remaining_quantity?: number
          requirement_id?: string
          reserved_at?: string
          reserved_by?: string
          reserved_quantity?: number
          revision?: number
          status?: string
          unit?: string
          updated_at?: string
          wasted_quantity?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_workspace_id_allocation_id_fkey"
            columns: ["workspace_id", "allocation_id"]
            isOneToOne: false
            referencedRelation: "batch_material_lot_allocations"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "inventory_reservations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_workspace_id_inventory_lot_id_fkey"
            columns: ["workspace_id", "inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      knowledge_references: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          is_pinned: boolean
          owner_user_id: string
          revision: number
          source_intelligence_thread_id: string
          source_type: string
          tags: string[]
          title: string | null
          updated_at: string
          user_note: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          is_pinned?: boolean
          owner_user_id: string
          revision?: number
          source_intelligence_thread_id: string
          source_type: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_note?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          is_pinned?: boolean
          owner_user_id?: string
          revision?: number
          source_intelligence_thread_id?: string
          source_type?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_note?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_references_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "knowledge_references_workspace_id_source_intelligence_thre_fkey"
            columns: ["workspace_id", "source_intelligence_thread_id"]
            isOneToOne: true
            referencedRelation: "intelligence_threads"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      lab_batch_lines: {
        Row: {
          actual_quantity: number | null
          formula_id_snapshot: string
          formula_line_id: string
          formula_version_id_snapshot: string
          functions_snapshot: string[]
          id: string
          inci_snapshot: string
          ingredient_id: string
          ingredient_name_snapshot: string
          lab_batch_id: string
          notes: string
          owner_id: string
          phase: string
          planned_percentage: number
          planned_quantity: number
          processing_instructions_snapshot: string
          required_material_profile: Json
          revision: number
          sort_order_snapshot: number | null
          status: string
          substitution_rule: string
          tolerance_quantity: number
          unit: string
          variance: number | null
          workspace_id: string
        }
        Insert: {
          actual_quantity?: number | null
          formula_id_snapshot: string
          formula_line_id: string
          formula_version_id_snapshot: string
          functions_snapshot?: string[]
          id: string
          inci_snapshot?: string
          ingredient_id: string
          ingredient_name_snapshot: string
          lab_batch_id: string
          notes: string
          owner_id: string
          phase: string
          planned_percentage: number
          planned_quantity: number
          processing_instructions_snapshot?: string
          required_material_profile?: Json
          revision?: number
          sort_order_snapshot?: number | null
          status: string
          substitution_rule?: string
          tolerance_quantity?: number
          unit: string
          variance?: number | null
          workspace_id: string
        }
        Update: {
          actual_quantity?: number | null
          formula_id_snapshot?: string
          formula_line_id?: string
          formula_version_id_snapshot?: string
          functions_snapshot?: string[]
          id?: string
          inci_snapshot?: string
          ingredient_id?: string
          ingredient_name_snapshot?: string
          lab_batch_id?: string
          notes?: string
          owner_id?: string
          phase?: string
          planned_percentage?: number
          planned_quantity?: number
          processing_instructions_snapshot?: string
          required_material_profile?: Json
          revision?: number
          sort_order_snapshot?: number | null
          status?: string
          substitution_rule?: string
          tolerance_quantity?: number
          unit?: string
          variance?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_batch_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_batch_lines_workspace_id_formula_line_id_fkey"
            columns: ["workspace_id", "formula_line_id"]
            isOneToOne: false
            referencedRelation: "formula_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "lab_batch_lines_workspace_id_ingredient_id_fkey"
            columns: ["workspace_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "lab_batch_lines_workspace_id_lab_batch_id_fkey"
            columns: ["workspace_id", "lab_batch_id"]
            isOneToOne: false
            referencedRelation: "lab_batches"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      lab_batches: {
        Row: {
          actual_yield: number | null
          batch_number: string
          completed_at: string | null
          created_at: string
          development_experiment_id: string | null
          development_experiment_variant_id: string | null
          deviations: string | null
          fill_count: number | null
          final_texture_observations: string | null
          formula_id: string
          formula_version_id: string
          id: string
          material_policy_version: string
          notes: string
          owner_id: string
          packaging_used: string | null
          planned_batch_size: number
          planned_batch_unit: string
          product_id: string
          purpose: string
          revision: number
          started_at: string | null
          status: string
          summary: string
          target_characteristics: string
          updated_at: string
          workspace_id: string
          yield_unit: string | null
        }
        Insert: {
          actual_yield?: number | null
          batch_number: string
          completed_at?: string | null
          created_at: string
          development_experiment_id?: string | null
          development_experiment_variant_id?: string | null
          deviations?: string | null
          fill_count?: number | null
          final_texture_observations?: string | null
          formula_id: string
          formula_version_id: string
          id: string
          material_policy_version?: string
          notes: string
          owner_id: string
          packaging_used?: string | null
          planned_batch_size: number
          planned_batch_unit: string
          product_id: string
          purpose: string
          revision?: number
          started_at?: string | null
          status: string
          summary: string
          target_characteristics: string
          updated_at: string
          workspace_id: string
          yield_unit?: string | null
        }
        Update: {
          actual_yield?: number | null
          batch_number?: string
          completed_at?: string | null
          created_at?: string
          development_experiment_id?: string | null
          development_experiment_variant_id?: string | null
          deviations?: string | null
          fill_count?: number | null
          final_texture_observations?: string | null
          formula_id?: string
          formula_version_id?: string
          id?: string
          material_policy_version?: string
          notes?: string
          owner_id?: string
          packaging_used?: string | null
          planned_batch_size?: number
          planned_batch_unit?: string
          product_id?: string
          purpose?: string
          revision?: number
          started_at?: string | null
          status?: string
          summary?: string
          target_characteristics?: string
          updated_at?: string
          workspace_id?: string
          yield_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_batches_experiment_fk"
            columns: ["workspace_id", "development_experiment_id"]
            isOneToOne: false
            referencedRelation: "development_experiments"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "lab_batches_experiment_variant_fk"
            columns: ["workspace_id", "development_experiment_variant_id"]
            isOneToOne: false
            referencedRelation: "development_experiment_variants"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "lab_batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_batches_workspace_id_formula_id_fkey"
            columns: ["workspace_id", "formula_id"]
            isOneToOne: false
            referencedRelation: "formulas"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "lab_batches_workspace_id_formula_version_id_fkey"
            columns: ["workspace_id", "formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "lab_batches_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      lab_lot_allocations: {
        Row: {
          id: string
          inventory_lot_id: string | null
          inventory_movement_id: string | null
          lab_batch_line_id: string
          owner_id: string
          quantity: number
          unit: string
          workspace_id: string
        }
        Insert: {
          id: string
          inventory_lot_id?: string | null
          inventory_movement_id?: string | null
          lab_batch_line_id: string
          owner_id: string
          quantity: number
          unit: string
          workspace_id: string
        }
        Update: {
          id?: string
          inventory_lot_id?: string | null
          inventory_movement_id?: string | null
          lab_batch_line_id?: string
          owner_id?: string
          quantity?: number
          unit?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_lot_allocations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_lot_allocations_workspace_id_inventory_lot_id_fkey"
            columns: ["workspace_id", "inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "lab_lot_allocations_workspace_id_inventory_movement_id_fkey"
            columns: ["workspace_id", "inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "lab_lot_allocations_workspace_id_lab_batch_line_id_fkey"
            columns: ["workspace_id", "lab_batch_line_id"]
            isOneToOne: false
            referencedRelation: "lab_batch_lines"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      lab_observations: {
        Row: {
          appearance: string
          created_at: string
          id: string
          lab_batch_id: string
          notes: string
          observation_type: string
          observed_at: string | null
          owner_id: string
          packaging: string
          rating: number | null
          scent: string
          stability: string
          target_date: string | null
          texture: string
          workspace_id: string
        }
        Insert: {
          appearance: string
          created_at: string
          id: string
          lab_batch_id: string
          notes: string
          observation_type: string
          observed_at?: string | null
          owner_id: string
          packaging: string
          rating?: number | null
          scent: string
          stability: string
          target_date?: string | null
          texture: string
          workspace_id: string
        }
        Update: {
          appearance?: string
          created_at?: string
          id?: string
          lab_batch_id?: string
          notes?: string
          observation_type?: string
          observed_at?: string | null
          owner_id?: string
          packaging?: string
          rating?: number | null
          scent?: string
          stability?: string
          target_date?: string | null
          texture?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_observations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_observations_workspace_id_lab_batch_id_fkey"
            columns: ["workspace_id", "lab_batch_id"]
            isOneToOne: false
            referencedRelation: "lab_batches"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      lab_process_steps: {
        Row: {
          actual_temperature: number | null
          completed_at: string | null
          completion_criteria: string | null
          critical: boolean | null
          duration_minutes: number | null
          id: string
          instruction: string
          lab_batch_id: string
          maximum_temperature: number | null
          minimum_temperature: number | null
          mixing_intensity: string | null
          mixing_method: string | null
          notes: string
          operator_note: string | null
          owner_id: string
          phase_code: string | null
          status: string
          step_number: number
          target_temperature: number | null
          title: string | null
          workspace_id: string
        }
        Insert: {
          actual_temperature?: number | null
          completed_at?: string | null
          completion_criteria?: string | null
          critical?: boolean | null
          duration_minutes?: number | null
          id: string
          instruction: string
          lab_batch_id: string
          maximum_temperature?: number | null
          minimum_temperature?: number | null
          mixing_intensity?: string | null
          mixing_method?: string | null
          notes: string
          operator_note?: string | null
          owner_id: string
          phase_code?: string | null
          status: string
          step_number: number
          target_temperature?: number | null
          title?: string | null
          workspace_id: string
        }
        Update: {
          actual_temperature?: number | null
          completed_at?: string | null
          completion_criteria?: string | null
          critical?: boolean | null
          duration_minutes?: number | null
          id?: string
          instruction?: string
          lab_batch_id?: string
          maximum_temperature?: number | null
          minimum_temperature?: number | null
          mixing_intensity?: string | null
          mixing_method?: string | null
          notes?: string
          operator_note?: string | null
          owner_id?: string
          phase_code?: string | null
          status?: string
          step_number?: number
          target_temperature?: number | null
          title?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_process_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_process_steps_workspace_id_lab_batch_id_fkey"
            columns: ["workspace_id", "lab_batch_id"]
            isOneToOne: false
            referencedRelation: "lab_batches"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      label_artwork_versions: {
        Row: {
          artwork_document_id: string | null
          created_at: string
          formula_version_id: string
          id: string
          language: string
          market: string
          notes: string
          owner_id: string
          packaging_specification_version_id: string | null
          product_id: string
          status: string
          updated_at: string
          version: string
          workspace_id: string
        }
        Insert: {
          artwork_document_id?: string | null
          created_at: string
          formula_version_id: string
          id: string
          language: string
          market: string
          notes: string
          owner_id: string
          packaging_specification_version_id?: string | null
          product_id: string
          status: string
          updated_at: string
          version: string
          workspace_id: string
        }
        Update: {
          artwork_document_id?: string | null
          created_at?: string
          formula_version_id?: string
          id?: string
          language?: string
          market?: string
          notes?: string
          owner_id?: string
          packaging_specification_version_id?: string | null
          product_id?: string
          status?: string
          updated_at?: string
          version?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "label_artwork_versions_workspace_id_artwork_document_id_fkey"
            columns: ["workspace_id", "artwork_document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "label_artwork_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_artwork_versions_workspace_id_formula_version_id_fkey"
            columns: ["workspace_id", "formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "label_artwork_versions_workspace_id_packaging_specificatio_fkey"
            columns: ["workspace_id", "packaging_specification_version_id"]
            isOneToOne: false
            referencedRelation: "packaging_specification_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "label_artwork_versions_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      label_checklist_items: {
        Row: {
          compliance_dossier_id: string
          id: string
          item: string
          notes: string
          owner_id: string
          status: string
          workspace_id: string
        }
        Insert: {
          compliance_dossier_id: string
          id: string
          item: string
          notes: string
          owner_id: string
          status: string
          workspace_id: string
        }
        Update: {
          compliance_dossier_id?: string
          id?: string
          item?: string
          notes?: string
          owner_id?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "label_checklist_items_workspace_id_compliance_dossier_id_fkey"
            columns: ["workspace_id", "compliance_dossier_id"]
            isOneToOne: false
            referencedRelation: "compliance_dossiers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "label_checklist_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      launch_decisions: {
        Row: {
          acknowledged_risks: string
          compliance_dossier_id: string
          decided_at: string
          decided_by: string
          decision: string
          id: string
          launch_plan_id: string
          notes: string
          owner_id: string
          unresolved_blocking_issues: string[]
          workspace_id: string
        }
        Insert: {
          acknowledged_risks: string
          compliance_dossier_id: string
          decided_at: string
          decided_by: string
          decision: string
          id: string
          launch_plan_id: string
          notes: string
          owner_id: string
          unresolved_blocking_issues: string[]
          workspace_id: string
        }
        Update: {
          acknowledged_risks?: string
          compliance_dossier_id?: string
          decided_at?: string
          decided_by?: string
          decision?: string
          id?: string
          launch_plan_id?: string
          notes?: string
          owner_id?: string
          unresolved_blocking_issues?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "launch_decisions_workspace_id_compliance_dossier_id_fkey"
            columns: ["workspace_id", "compliance_dossier_id"]
            isOneToOne: false
            referencedRelation: "compliance_dossiers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "launch_decisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "launch_decisions_workspace_id_launch_plan_id_fkey"
            columns: ["workspace_id", "launch_plan_id"]
            isOneToOne: false
            referencedRelation: "launch_plans"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      launch_milestones: {
        Row: {
          id: string
          kind: string
          launch_plan_id: string
          notes: string
          owner_id: string
          status: string
          title: string
          workspace_id: string
        }
        Insert: {
          id: string
          kind: string
          launch_plan_id: string
          notes: string
          owner_id: string
          status: string
          title: string
          workspace_id: string
        }
        Update: {
          id?: string
          kind?: string
          launch_plan_id?: string
          notes?: string
          owner_id?: string
          status?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "launch_milestones_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "launch_milestones_workspace_id_launch_plan_id_fkey"
            columns: ["workspace_id", "launch_plan_id"]
            isOneToOne: false
            referencedRelation: "launch_plans"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      launch_plans: {
        Row: {
          compliance_dossier_id: string
          created_at: string
          id: string
          notes: string
          owner: string
          owner_id: string
          product_id: string
          status: string
          target_launch_date: string
          target_market: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          compliance_dossier_id: string
          created_at: string
          id: string
          notes: string
          owner: string
          owner_id: string
          product_id: string
          status: string
          target_launch_date: string
          target_market: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          compliance_dossier_id?: string
          created_at?: string
          id?: string
          notes?: string
          owner?: string
          owner_id?: string
          product_id?: string
          status?: string
          target_launch_date?: string
          target_market?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "launch_plans_workspace_id_compliance_dossier_id_fkey"
            columns: ["workspace_id", "compliance_dossier_id"]
            isOneToOne: false
            referencedRelation: "compliance_dossiers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "launch_plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "launch_plans_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      migration_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          entity_counts: Json
          errors: Json
          id: string
          imported_counts: Json
          owner_id: string
          reconciliation: Json
          skipped_counts: Json
          source_version: string
          stage: string
          state: string
          warnings: Json
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          entity_counts?: Json
          errors?: Json
          id?: string
          imported_counts?: Json
          owner_id: string
          reconciliation?: Json
          skipped_counts?: Json
          source_version: string
          stage?: string
          state: string
          warnings?: Json
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          entity_counts?: Json
          errors?: Json
          id?: string
          imported_counts?: Json
          owner_id?: string
          reconciliation?: Json
          skipped_counts?: Json
          source_version?: string
          stage?: string
          state?: string
          warnings?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_allocations: {
        Row: {
          cost_currency_snapshot: string | null
          finished_goods_batch_id: string
          id: string
          owner_id: string
          packaging_inventory_lot_id: string | null
          packaging_inventory_movement_id: string | null
          packaging_specification_line_id: string
          quantity: number
          unit: string
          unit_cost_snapshot: number | null
          workspace_id: string
        }
        Insert: {
          cost_currency_snapshot?: string | null
          finished_goods_batch_id: string
          id: string
          owner_id: string
          packaging_inventory_lot_id?: string | null
          packaging_inventory_movement_id?: string | null
          packaging_specification_line_id: string
          quantity: number
          unit: string
          unit_cost_snapshot?: number | null
          workspace_id: string
        }
        Update: {
          cost_currency_snapshot?: string | null
          finished_goods_batch_id?: string
          id?: string
          owner_id?: string
          packaging_inventory_lot_id?: string | null
          packaging_inventory_movement_id?: string | null
          packaging_specification_line_id?: string
          quantity?: number
          unit?: string
          unit_cost_snapshot?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_allocations_workspace_id_finished_goods_batch_id_fkey"
            columns: ["workspace_id", "finished_goods_batch_id"]
            isOneToOne: false
            referencedRelation: "finished_goods_batches"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_allocations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_allocations_workspace_id_packaging_inventory_lot_fkey"
            columns: ["workspace_id", "packaging_inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "packaging_inventory_lots"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_allocations_workspace_id_packaging_inventory_mov_fkey"
            columns: ["workspace_id", "packaging_inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "packaging_inventory_movements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_allocations_workspace_id_packaging_specification_fkey"
            columns: ["workspace_id", "packaging_specification_line_id"]
            isOneToOne: false
            referencedRelation: "packaging_specification_lines"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      packaging_components: {
        Row: {
          capacity: number | null
          capacity_unit: string | null
          category: string
          colour: string
          created_at: string
          default_unit: string
          description: string
          id: string
          material: string
          name: string
          notes: string
          owner_id: string
          reorder_threshold: number | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          capacity?: number | null
          capacity_unit?: string | null
          category: string
          colour: string
          created_at: string
          default_unit: string
          description: string
          id: string
          material: string
          name: string
          notes: string
          owner_id: string
          reorder_threshold?: number | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          capacity?: number | null
          capacity_unit?: string | null
          category?: string
          colour?: string
          created_at?: string
          default_unit?: string
          description?: string
          id?: string
          material?: string
          name?: string
          notes?: string
          owner_id?: string
          reorder_threshold?: number | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_components_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_inventory_lots: {
        Row: {
          acquisition_cost_currency: string | null
          cost_notes: string | null
          created_at: string
          id: string
          internal_lot_number: string
          location: string
          notes: string
          opening_quantity: number
          owner_id: string
          packaging_component_id: string
          packaging_supplier_product_id: string | null
          quality_release_review_id: string | null
          quarantine_intake_id: string | null
          received_date: string
          status: string
          supplier_lot_number: string | null
          total_acquisition_cost: number | null
          unit: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          acquisition_cost_currency?: string | null
          cost_notes?: string | null
          created_at: string
          id: string
          internal_lot_number: string
          location: string
          notes: string
          opening_quantity: number
          owner_id: string
          packaging_component_id: string
          packaging_supplier_product_id?: string | null
          quality_release_review_id?: string | null
          quarantine_intake_id?: string | null
          received_date: string
          status: string
          supplier_lot_number?: string | null
          total_acquisition_cost?: number | null
          unit: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          acquisition_cost_currency?: string | null
          cost_notes?: string | null
          created_at?: string
          id?: string
          internal_lot_number?: string
          location?: string
          notes?: string
          opening_quantity?: number
          owner_id?: string
          packaging_component_id?: string
          packaging_supplier_product_id?: string | null
          quality_release_review_id?: string | null
          quarantine_intake_id?: string | null
          received_date?: string
          status?: string
          supplier_lot_number?: string | null
          total_acquisition_cost?: number | null
          unit?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_inventory_lots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_inventory_lots_workspace_id_packaging_component__fkey"
            columns: ["workspace_id", "packaging_component_id"]
            isOneToOne: false
            referencedRelation: "packaging_components"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_inventory_lots_workspace_id_packaging_supplier_p_fkey"
            columns: ["workspace_id", "packaging_supplier_product_id"]
            isOneToOne: false
            referencedRelation: "packaging_supplier_products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_lots_quality_review_fk"
            columns: ["quality_release_review_id"]
            isOneToOne: false
            referencedRelation: "inventory_quality_release_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_lots_quarantine_intake_fk"
            columns: ["workspace_id", "quarantine_intake_id"]
            isOneToOne: false
            referencedRelation: "inventory_quarantine_intakes"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      packaging_inventory_movements: {
        Row: {
          created_at: string
          id: string
          notes: string
          occurred_at: string
          owner_id: string
          packaging_inventory_lot_id: string
          quantity: number
          reason: string
          reference_id: string | null
          reference_type: string | null
          type: string
          unit: string
          workspace_id: string
        }
        Insert: {
          created_at: string
          id: string
          notes: string
          occurred_at: string
          owner_id: string
          packaging_inventory_lot_id: string
          quantity: number
          reason: string
          reference_id?: string | null
          reference_type?: string | null
          type: string
          unit: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string
          occurred_at?: string
          owner_id?: string
          packaging_inventory_lot_id?: string
          quantity?: number
          reason?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          unit?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_inventory_movements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_inventory_movements_workspace_id_packaging_inven_fkey"
            columns: ["workspace_id", "packaging_inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "packaging_inventory_lots"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      packaging_run_bulk_allocations: {
        Row: {
          allocated_at: string
          allocated_by: string
          allocated_quantity: number
          allocation_method: string
          id: string
          idempotency_key: string
          normalized_quantity: number
          normalized_unit: string
          output_available_after_snapshot: number
          output_available_before_snapshot: number
          owner_id: string
          packaging_run_id: string
          payload_fingerprint: string
          production_output_id: string
          release_idempotency_key: string | null
          release_payload_fingerprint: string | null
          released_at: string | null
          released_by: string | null
          revision: number
          status: string
          transferred_normalized_quantity: number
          unit: string
          workspace_id: string
        }
        Insert: {
          allocated_at: string
          allocated_by: string
          allocated_quantity: number
          allocation_method: string
          id?: string
          idempotency_key: string
          normalized_quantity: number
          normalized_unit: string
          output_available_after_snapshot: number
          output_available_before_snapshot: number
          owner_id: string
          packaging_run_id: string
          payload_fingerprint: string
          production_output_id: string
          release_idempotency_key?: string | null
          release_payload_fingerprint?: string | null
          released_at?: string | null
          released_by?: string | null
          revision?: number
          status?: string
          transferred_normalized_quantity?: number
          unit: string
          workspace_id: string
        }
        Update: {
          allocated_at?: string
          allocated_by?: string
          allocated_quantity?: number
          allocation_method?: string
          id?: string
          idempotency_key?: string
          normalized_quantity?: number
          normalized_unit?: string
          output_available_after_snapshot?: number
          output_available_before_snapshot?: number
          owner_id?: string
          packaging_run_id?: string
          payload_fingerprint?: string
          production_output_id?: string
          release_idempotency_key?: string | null
          release_payload_fingerprint?: string | null
          released_at?: string | null
          released_by?: string | null
          revision?: number
          status?: string
          transferred_normalized_quantity?: number
          unit?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_run_bulk_allocation_workspace_id_packaging_run_i_fkey"
            columns: ["workspace_id", "packaging_run_id"]
            isOneToOne: true
            referencedRelation: "packaging_runs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_bulk_allocation_workspace_id_production_outp_fkey"
            columns: ["workspace_id", "production_output_id"]
            isOneToOne: false
            referencedRelation: "production_outputs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_bulk_allocations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_run_bulk_transfers: {
        Row: {
          bulk_allocation_id: string
          created_at: string
          destination_vessel: string | null
          equipment_reference: string | null
          evidence_reference: string | null
          id: string
          idempotency_key: string
          measurement_method: string
          normalized_quantity: number
          normalized_unit: string
          note: string
          owner_id: string
          packaging_run_id: string
          payload_fingerprint: string
          production_output_id: string
          quantity: number
          revision: number
          source_vessel: string | null
          transferred_at: string
          transferred_by: string
          unit: string
          workspace_id: string
        }
        Insert: {
          bulk_allocation_id: string
          created_at?: string
          destination_vessel?: string | null
          equipment_reference?: string | null
          evidence_reference?: string | null
          id?: string
          idempotency_key: string
          measurement_method: string
          normalized_quantity: number
          normalized_unit: string
          note?: string
          owner_id: string
          packaging_run_id: string
          payload_fingerprint: string
          production_output_id: string
          quantity: number
          revision?: number
          source_vessel?: string | null
          transferred_at: string
          transferred_by: string
          unit: string
          workspace_id: string
        }
        Update: {
          bulk_allocation_id?: string
          created_at?: string
          destination_vessel?: string | null
          equipment_reference?: string | null
          evidence_reference?: string | null
          id?: string
          idempotency_key?: string
          measurement_method?: string
          normalized_quantity?: number
          normalized_unit?: string
          note?: string
          owner_id?: string
          packaging_run_id?: string
          payload_fingerprint?: string
          production_output_id?: string
          quantity?: number
          revision?: number
          source_vessel?: string | null
          transferred_at?: string
          transferred_by?: string
          unit?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_run_bulk_transfers_workspace_id_bulk_allocation__fkey"
            columns: ["workspace_id", "bulk_allocation_id"]
            isOneToOne: false
            referencedRelation: "packaging_run_bulk_allocations"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_bulk_transfers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_run_bulk_transfers_workspace_id_packaging_run_id_fkey"
            columns: ["workspace_id", "packaging_run_id"]
            isOneToOne: false
            referencedRelation: "packaging_runs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_bulk_transfers_workspace_id_production_outpu_fkey"
            columns: ["workspace_id", "production_output_id"]
            isOneToOne: false
            referencedRelation: "production_outputs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      packaging_run_events: {
        Row: {
          actor_id: string
          event_key: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          owner_id: string
          packaging_inventory_lot_id: string | null
          packaging_requirement_id: string | null
          packaging_run_id: string
          policy_version: string
          production_output_id: string
          production_run_id: string
          quantity: number | null
          revision: number | null
          unit: string | null
          workspace_id: string
        }
        Insert: {
          actor_id: string
          event_key: string
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          owner_id: string
          packaging_inventory_lot_id?: string | null
          packaging_requirement_id?: string | null
          packaging_run_id: string
          policy_version: string
          production_output_id: string
          production_run_id: string
          quantity?: number | null
          revision?: number | null
          unit?: string | null
          workspace_id: string
        }
        Update: {
          actor_id?: string
          event_key?: string
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          owner_id?: string
          packaging_inventory_lot_id?: string | null
          packaging_requirement_id?: string | null
          packaging_run_id?: string
          policy_version?: string
          production_output_id?: string
          production_run_id?: string
          quantity?: number | null
          revision?: number | null
          unit?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_run_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_run_events_workspace_id_packaging_inventory_lot__fkey"
            columns: ["workspace_id", "packaging_inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "packaging_inventory_lots"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_events_workspace_id_packaging_requirement_id_fkey"
            columns: ["workspace_id", "packaging_requirement_id"]
            isOneToOne: false
            referencedRelation: "packaging_run_requirements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_events_workspace_id_packaging_run_id_fkey"
            columns: ["workspace_id", "packaging_run_id"]
            isOneToOne: false
            referencedRelation: "packaging_runs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_events_workspace_id_production_output_id_fkey"
            columns: ["workspace_id", "production_output_id"]
            isOneToOne: false
            referencedRelation: "production_outputs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_events_workspace_id_production_run_id_fkey"
            columns: ["workspace_id", "production_run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      packaging_run_inventory_uses: {
        Row: {
          actor_id: string
          category: string | null
          cost_confidence: string
          created_at: string
          currency: string | null
          evidence_reference: string | null
          id: string
          idempotency_key: string
          occurred_at: string
          owner_id: string
          packaging_inventory_lot_id: string
          packaging_inventory_movement_id: string
          packaging_requirement_id: string
          packaging_reservation_id: string
          packaging_run_id: string
          payload_fingerprint: string
          quantity: number
          quantity_in_lot_unit: number
          reason: string
          revision: number
          total_cost_snapshot: number | null
          unit: string
          unit_cost_snapshot: number | null
          use_type: string
          workspace_id: string
        }
        Insert: {
          actor_id: string
          category?: string | null
          cost_confidence: string
          created_at?: string
          currency?: string | null
          evidence_reference?: string | null
          id?: string
          idempotency_key: string
          occurred_at: string
          owner_id: string
          packaging_inventory_lot_id: string
          packaging_inventory_movement_id: string
          packaging_requirement_id: string
          packaging_reservation_id: string
          packaging_run_id: string
          payload_fingerprint: string
          quantity: number
          quantity_in_lot_unit: number
          reason: string
          revision?: number
          total_cost_snapshot?: number | null
          unit: string
          unit_cost_snapshot?: number | null
          use_type: string
          workspace_id: string
        }
        Update: {
          actor_id?: string
          category?: string | null
          cost_confidence?: string
          created_at?: string
          currency?: string | null
          evidence_reference?: string | null
          id?: string
          idempotency_key?: string
          occurred_at?: string
          owner_id?: string
          packaging_inventory_lot_id?: string
          packaging_inventory_movement_id?: string
          packaging_requirement_id?: string
          packaging_reservation_id?: string
          packaging_run_id?: string
          payload_fingerprint?: string
          quantity?: number
          quantity_in_lot_unit?: number
          reason?: string
          revision?: number
          total_cost_snapshot?: number | null
          unit?: string
          unit_cost_snapshot?: number | null
          use_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_run_inventory_uses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_run_inventory_uses_workspace_id_packaging_inven_fkey1"
            columns: ["workspace_id", "packaging_inventory_movement_id"]
            isOneToOne: true
            referencedRelation: "packaging_inventory_movements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_inventory_uses_workspace_id_packaging_invent_fkey"
            columns: ["workspace_id", "packaging_inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "packaging_inventory_lots"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_inventory_uses_workspace_id_packaging_requir_fkey"
            columns: ["workspace_id", "packaging_requirement_id"]
            isOneToOne: false
            referencedRelation: "packaging_run_requirements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_inventory_uses_workspace_id_packaging_reserv_fkey"
            columns: ["workspace_id", "packaging_reservation_id"]
            isOneToOne: false
            referencedRelation: "packaging_run_reservations"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_inventory_uses_workspace_id_packaging_run_id_fkey"
            columns: ["workspace_id", "packaging_run_id"]
            isOneToOne: false
            referencedRelation: "packaging_runs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      packaging_run_reconciliations: {
        Row: {
          bulk_waste_normalized_quantity: number
          created_at: string
          evidence_reference: string | null
          id: string
          idempotency_key: string
          owner_id: string
          packaging_run_id: string
          payload_fingerprint: string
          pending_finished_goods_normalized_quantity: number
          policy_version: string
          reason: string | null
          reconciled_at: string
          reconciled_by: string
          reconciliation_version: number
          retained_bulk_normalized_quantity: number
          state: string
          unexplained_bulk_variance: number
          unexplained_packaging_variance: number
          workspace_id: string
        }
        Insert: {
          bulk_waste_normalized_quantity: number
          created_at?: string
          evidence_reference?: string | null
          id?: string
          idempotency_key: string
          owner_id: string
          packaging_run_id: string
          payload_fingerprint: string
          pending_finished_goods_normalized_quantity: number
          policy_version: string
          reason?: string | null
          reconciled_at: string
          reconciled_by: string
          reconciliation_version: number
          retained_bulk_normalized_quantity: number
          state: string
          unexplained_bulk_variance: number
          unexplained_packaging_variance: number
          workspace_id: string
        }
        Update: {
          bulk_waste_normalized_quantity?: number
          created_at?: string
          evidence_reference?: string | null
          id?: string
          idempotency_key?: string
          owner_id?: string
          packaging_run_id?: string
          payload_fingerprint?: string
          pending_finished_goods_normalized_quantity?: number
          policy_version?: string
          reason?: string | null
          reconciled_at?: string
          reconciled_by?: string
          reconciliation_version?: number
          retained_bulk_normalized_quantity?: number
          state?: string
          unexplained_bulk_variance?: number
          unexplained_packaging_variance?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_run_reconciliations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_run_reconciliations_workspace_id_packaging_run_i_fkey"
            columns: ["workspace_id", "packaging_run_id"]
            isOneToOne: false
            referencedRelation: "packaging_runs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      packaging_run_requirements: {
        Row: {
          component_name_snapshot: string
          component_role_snapshot: string
          created_at: string
          eligibility_policy_version: string
          expected_waste_allowance: number
          id: string
          instructions: string
          normalized_quantity: number
          owner_id: string
          packaging_component_id: string
          packaging_run_id: string
          packaging_specification_line_id: string
          packaging_specification_version_id: string
          planned_unit_count: number
          revision: number
          sequence: number
          total_required_quantity: number
          unit: string
          units_required_per_finished_unit: number
          workspace_id: string
        }
        Insert: {
          component_name_snapshot: string
          component_role_snapshot: string
          created_at?: string
          eligibility_policy_version: string
          expected_waste_allowance?: number
          id?: string
          instructions?: string
          normalized_quantity: number
          owner_id: string
          packaging_component_id: string
          packaging_run_id: string
          packaging_specification_line_id: string
          packaging_specification_version_id: string
          planned_unit_count: number
          revision?: number
          sequence: number
          total_required_quantity: number
          unit: string
          units_required_per_finished_unit: number
          workspace_id: string
        }
        Update: {
          component_name_snapshot?: string
          component_role_snapshot?: string
          created_at?: string
          eligibility_policy_version?: string
          expected_waste_allowance?: number
          id?: string
          instructions?: string
          normalized_quantity?: number
          owner_id?: string
          packaging_component_id?: string
          packaging_run_id?: string
          packaging_specification_line_id?: string
          packaging_specification_version_id?: string
          planned_unit_count?: number
          revision?: number
          sequence?: number
          total_required_quantity?: number
          unit?: string
          units_required_per_finished_unit?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_run_requirements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_run_requirements_workspace_id_packaging_componen_fkey"
            columns: ["workspace_id", "packaging_component_id"]
            isOneToOne: false
            referencedRelation: "packaging_components"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_requirements_workspace_id_packaging_run_id_fkey"
            columns: ["workspace_id", "packaging_run_id"]
            isOneToOne: false
            referencedRelation: "packaging_runs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_requirements_workspace_id_packaging_specifi_fkey1"
            columns: ["workspace_id", "packaging_specification_line_id"]
            isOneToOne: false
            referencedRelation: "packaging_specification_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_requirements_workspace_id_packaging_specific_fkey"
            columns: ["workspace_id", "packaging_specification_version_id"]
            isOneToOne: false
            referencedRelation: "packaging_specification_versions"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      packaging_run_reservations: {
        Row: {
          consumed_in_lot_unit: number
          id: string
          idempotency_key: string
          owner_id: string
          packaging_inventory_lot_id: string
          packaging_requirement_id: string
          packaging_run_id: string
          payload_fingerprint: string
          released_at: string | null
          released_by: string | null
          reserved_at: string
          reserved_by: string
          reserved_in_lot_unit: number
          reserved_quantity: number
          revision: number
          status: string
          unit: string
          waste_in_lot_unit: number
          workspace_id: string
        }
        Insert: {
          consumed_in_lot_unit?: number
          id?: string
          idempotency_key: string
          owner_id: string
          packaging_inventory_lot_id: string
          packaging_requirement_id: string
          packaging_run_id: string
          payload_fingerprint: string
          released_at?: string | null
          released_by?: string | null
          reserved_at: string
          reserved_by: string
          reserved_in_lot_unit: number
          reserved_quantity: number
          revision?: number
          status?: string
          unit: string
          waste_in_lot_unit?: number
          workspace_id: string
        }
        Update: {
          consumed_in_lot_unit?: number
          id?: string
          idempotency_key?: string
          owner_id?: string
          packaging_inventory_lot_id?: string
          packaging_requirement_id?: string
          packaging_run_id?: string
          payload_fingerprint?: string
          released_at?: string | null
          released_by?: string | null
          reserved_at?: string
          reserved_by?: string
          reserved_in_lot_unit?: number
          reserved_quantity?: number
          revision?: number
          status?: string
          unit?: string
          waste_in_lot_unit?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_run_reservations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_run_reservations_workspace_id_packaging_inventor_fkey"
            columns: ["workspace_id", "packaging_inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "packaging_inventory_lots"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_reservations_workspace_id_packaging_requirem_fkey"
            columns: ["workspace_id", "packaging_requirement_id"]
            isOneToOne: false
            referencedRelation: "packaging_run_requirements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_run_reservations_workspace_id_packaging_run_id_fkey"
            columns: ["workspace_id", "packaging_run_id"]
            isOneToOne: false
            referencedRelation: "packaging_runs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      packaging_runs: {
        Row: {
          actual_transferred_normalized_quantity: number
          bulk_cost_confidence: string
          bulk_material_cost_currency: string | null
          bulk_material_cost_snapshot: number | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          creation_idempotency_key: string
          creation_payload_fingerprint: string
          formula_version_id: string
          formula_version_snapshot: string
          id: string
          internal_run_code: string
          location: string
          nominal_fill_quantity: number
          nominal_fill_unit: string
          owner_id: string
          packaging_specification_name_snapshot: string
          packaging_specification_snapshot: Json
          packaging_specification_version_id: string
          packaging_specification_version_snapshot: string
          planned_bulk_normalized_quantity: number
          planned_bulk_normalized_unit: string
          planned_bulk_quantity: number
          planned_bulk_unit: string
          planned_unit_count: number
          product_id: string
          product_name_snapshot: string
          production_output_code_snapshot: string
          production_output_id: string
          production_run_id: string
          revision: number
          run_label: string
          run_sequence: number
          started_at: string | null
          started_by: string | null
          status: string
          target_packaging_format: string
          workspace_id: string
        }
        Insert: {
          actual_transferred_normalized_quantity?: number
          bulk_cost_confidence: string
          bulk_material_cost_currency?: string | null
          bulk_material_cost_snapshot?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          creation_idempotency_key: string
          creation_payload_fingerprint: string
          formula_version_id: string
          formula_version_snapshot: string
          id?: string
          internal_run_code: string
          location: string
          nominal_fill_quantity: number
          nominal_fill_unit: string
          owner_id: string
          packaging_specification_name_snapshot: string
          packaging_specification_snapshot: Json
          packaging_specification_version_id: string
          packaging_specification_version_snapshot: string
          planned_bulk_normalized_quantity: number
          planned_bulk_normalized_unit: string
          planned_bulk_quantity: number
          planned_bulk_unit: string
          planned_unit_count: number
          product_id: string
          product_name_snapshot: string
          production_output_code_snapshot: string
          production_output_id: string
          production_run_id: string
          revision?: number
          run_label: string
          run_sequence: number
          started_at?: string | null
          started_by?: string | null
          status?: string
          target_packaging_format: string
          workspace_id: string
        }
        Update: {
          actual_transferred_normalized_quantity?: number
          bulk_cost_confidence?: string
          bulk_material_cost_currency?: string | null
          bulk_material_cost_snapshot?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          creation_idempotency_key?: string
          creation_payload_fingerprint?: string
          formula_version_id?: string
          formula_version_snapshot?: string
          id?: string
          internal_run_code?: string
          location?: string
          nominal_fill_quantity?: number
          nominal_fill_unit?: string
          owner_id?: string
          packaging_specification_name_snapshot?: string
          packaging_specification_snapshot?: Json
          packaging_specification_version_id?: string
          packaging_specification_version_snapshot?: string
          planned_bulk_normalized_quantity?: number
          planned_bulk_normalized_unit?: string
          planned_bulk_quantity?: number
          planned_bulk_unit?: string
          planned_unit_count?: number
          product_id?: string
          product_name_snapshot?: string
          production_output_code_snapshot?: string
          production_output_id?: string
          production_run_id?: string
          revision?: number
          run_label?: string
          run_sequence?: number
          started_at?: string | null
          started_by?: string | null
          status?: string
          target_packaging_format?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_runs_workspace_id_formula_version_id_fkey"
            columns: ["workspace_id", "formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_runs_workspace_id_packaging_specification_versio_fkey"
            columns: ["workspace_id", "packaging_specification_version_id"]
            isOneToOne: false
            referencedRelation: "packaging_specification_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_runs_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_runs_workspace_id_production_output_id_fkey"
            columns: ["workspace_id", "production_output_id"]
            isOneToOne: false
            referencedRelation: "production_outputs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_runs_workspace_id_production_run_id_fkey"
            columns: ["workspace_id", "production_run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      packaging_specification_lines: {
        Row: {
          id: string
          notes: string
          owner_id: string
          packaging_component_id: string
          packaging_specification_version_id: string
          purpose: string
          quantity_per_unit: number
          sort_order: number
          unit: string
          workspace_id: string
        }
        Insert: {
          id: string
          notes: string
          owner_id: string
          packaging_component_id: string
          packaging_specification_version_id: string
          purpose: string
          quantity_per_unit: number
          sort_order: number
          unit: string
          workspace_id: string
        }
        Update: {
          id?: string
          notes?: string
          owner_id?: string
          packaging_component_id?: string
          packaging_specification_version_id?: string
          purpose?: string
          quantity_per_unit?: number
          sort_order?: number
          unit?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_specification_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_specification_lines_workspace_id_packaging_compo_fkey"
            columns: ["workspace_id", "packaging_component_id"]
            isOneToOne: false
            referencedRelation: "packaging_components"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_specification_lines_workspace_id_packaging_speci_fkey"
            columns: ["workspace_id", "packaging_specification_version_id"]
            isOneToOne: false
            referencedRelation: "packaging_specification_versions"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      packaging_specification_versions: {
        Row: {
          created_at: string
          derived_from_version_id: string | null
          description: string
          id: string
          notes: string
          owner_id: string
          packaging_specification_id: string
          status: string
          updated_at: string
          version: string
          workspace_id: string
        }
        Insert: {
          created_at: string
          derived_from_version_id?: string | null
          description: string
          id: string
          notes: string
          owner_id: string
          packaging_specification_id: string
          status: string
          updated_at: string
          version: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          derived_from_version_id?: string | null
          description?: string
          id?: string
          notes?: string
          owner_id?: string
          packaging_specification_id?: string
          status?: string
          updated_at?: string
          version?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_specification_versi_workspace_id_derived_from_ve_fkey"
            columns: ["workspace_id", "derived_from_version_id"]
            isOneToOne: false
            referencedRelation: "packaging_specification_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_specification_versi_workspace_id_packaging_speci_fkey"
            columns: ["workspace_id", "packaging_specification_id"]
            isOneToOne: false
            referencedRelation: "packaging_specifications"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_specification_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_specifications: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
          product_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
          product_id: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string
          product_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_specifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_specifications_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      packaging_supplier_products: {
        Row: {
          availability_status: string | null
          created_at: string
          currency: string
          discontinued: boolean
          id: string
          is_preferred: boolean
          last_verified_date: string | null
          lead_time_days: number | null
          moq: number | null
          notes: string
          order_multiple: number | null
          owner_id: string
          package_quantity: number
          package_unit: string
          packaging_component_id: string
          price: number
          product_name: string
          product_url: string | null
          sample_available: boolean | null
          supplier_id: string | null
          supplier_name: string
          supplier_sku: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          availability_status?: string | null
          created_at: string
          currency: string
          discontinued?: boolean
          id: string
          is_preferred: boolean
          last_verified_date?: string | null
          lead_time_days?: number | null
          moq?: number | null
          notes: string
          order_multiple?: number | null
          owner_id: string
          package_quantity: number
          package_unit: string
          packaging_component_id: string
          price: number
          product_name: string
          product_url?: string | null
          sample_available?: boolean | null
          supplier_id?: string | null
          supplier_name: string
          supplier_sku?: string | null
          updated_at: string
          workspace_id: string
        }
        Update: {
          availability_status?: string | null
          created_at?: string
          currency?: string
          discontinued?: boolean
          id?: string
          is_preferred?: boolean
          last_verified_date?: string | null
          lead_time_days?: number | null
          moq?: number | null
          notes?: string
          order_multiple?: number | null
          owner_id?: string
          package_quantity?: number
          package_unit?: string
          packaging_component_id?: string
          price?: number
          product_name?: string
          product_url?: string | null
          sample_available?: boolean | null
          supplier_id?: string | null
          supplier_name?: string
          supplier_sku?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_supplier_products_supplier_fk"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "packaging_supplier_products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_supplier_products_workspace_id_packaging_compone_fkey"
            columns: ["workspace_id", "packaging_component_id"]
            isOneToOne: false
            referencedRelation: "packaging_components"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      pif_evidence_sections: {
        Row: {
          area: string
          compliance_dossier_id: string
          id: string
          missing_items_summary: string
          notes: string
          owner: string
          owner_id: string
          reviewed_at: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          area: string
          compliance_dossier_id: string
          id: string
          missing_items_summary: string
          notes: string
          owner: string
          owner_id: string
          reviewed_at?: string | null
          status: string
          workspace_id: string
        }
        Update: {
          area?: string
          compliance_dossier_id?: string
          id?: string
          missing_items_summary?: string
          notes?: string
          owner?: string
          owner_id?: string
          reviewed_at?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pif_evidence_sections_workspace_id_compliance_dossier_id_fkey"
            columns: ["workspace_id", "compliance_dossier_id"]
            isOneToOne: false
            referencedRelation: "compliance_dossiers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "pif_evidence_sections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pif_section_documents: {
        Row: {
          document_id: string
          owner_id: string
          pif_section_id: string
          workspace_id: string
        }
        Insert: {
          document_id: string
          owner_id: string
          pif_section_id: string
          workspace_id: string
        }
        Update: {
          document_id?: string
          owner_id?: string
          pif_section_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pif_section_documents_workspace_id_document_id_fkey"
            columns: ["workspace_id", "document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "pif_section_documents_workspace_id_pif_section_id_fkey"
            columns: ["workspace_id", "pif_section_id"]
            isOneToOne: false
            referencedRelation: "pif_evidence_sections"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      process_equipment_requirements: {
        Row: {
          created_at: string
          id: string
          minimum_capacity: number | null
          notes: string
          owner_id: string
          quantity_required: number
          required_capability: string | null
          required_equipment_type: string | null
          required_precision: number | null
          requirement_level: string
          source_id: string
          source_type: string
          unit: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          minimum_capacity?: number | null
          notes?: string
          owner_id: string
          quantity_required?: number
          required_capability?: string | null
          required_equipment_type?: string | null
          required_precision?: number | null
          requirement_level: string
          source_id: string
          source_type: string
          unit?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          minimum_capacity?: number | null
          notes?: string
          owner_id?: string
          quantity_required?: number
          required_capability?: string | null
          required_equipment_type?: string | null
          required_precision?: number | null
          requirement_level?: string
          source_id?: string
          source_type?: string
          unit?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_equipment_requirements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_background_operations: {
        Row: {
          acknowledgement_returned_at: string | null
          attempt_id: string
          client_request_id: string
          generation: number
          intent_created_at: string
          job_id: string
          last_reconciled_at: string | null
          last_safe_failure_code: string | null
          lease_acquired_at: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          next_reconciliation_at: string
          owner_id: string
          processing_stage: string | null
          provider: string
          provider_attached_at: string | null
          provider_operation_id: string | null
          provider_status: string | null
          published_at: string | null
          reconciliation_attempt_count: number
          row_version: number
          submission_completed_at: string | null
          submission_started_at: string | null
          submission_state: string
          terminal_at: string | null
          terminal_code: string | null
          terminal_source: string | null
          transient_failure_count: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          acknowledgement_returned_at?: string | null
          attempt_id?: string
          client_request_id?: string
          generation?: number
          intent_created_at?: string
          job_id: string
          last_reconciled_at?: string | null
          last_safe_failure_code?: string | null
          lease_acquired_at?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          next_reconciliation_at?: string
          owner_id: string
          processing_stage?: string | null
          provider: string
          provider_attached_at?: string | null
          provider_operation_id?: string | null
          provider_status?: string | null
          published_at?: string | null
          reconciliation_attempt_count?: number
          row_version?: number
          submission_completed_at?: string | null
          submission_started_at?: string | null
          submission_state: string
          terminal_at?: string | null
          terminal_code?: string | null
          terminal_source?: string | null
          transient_failure_count?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          acknowledgement_returned_at?: string | null
          attempt_id?: string
          client_request_id?: string
          generation?: number
          intent_created_at?: string
          job_id?: string
          last_reconciled_at?: string | null
          last_safe_failure_code?: string | null
          lease_acquired_at?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          next_reconciliation_at?: string
          owner_id?: string
          processing_stage?: string | null
          provider?: string
          provider_attached_at?: string | null
          provider_operation_id?: string | null
          provider_status?: string | null
          published_at?: string | null
          reconciliation_attempt_count?: number
          row_version?: number
          submission_completed_at?: string | null
          submission_started_at?: string | null
          submission_state?: string
          terminal_at?: string | null
          terminal_code?: string | null
          terminal_source?: string | null
          transient_failure_count?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_background_operations_workspace_id_job_id_fkey"
            columns: ["workspace_id", "job_id"]
            isOneToOne: false
            referencedRelation: "procurement_research_jobs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      procurement_background_webhook_inbox: {
        Row: {
          created_at: string
          event_id: string
          last_safe_error_code: string | null
          next_attempt_at: string
          processed_at: string | null
          processing_attempt_count: number
          processing_state: string
          provider_operation_id: string
          received_at: string
          signature_verified_at: string
          terminal_event_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          last_safe_error_code?: string | null
          next_attempt_at?: string
          processed_at?: string | null
          processing_attempt_count?: number
          processing_state?: string
          provider_operation_id: string
          received_at?: string
          signature_verified_at?: string
          terminal_event_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          last_safe_error_code?: string | null
          next_attempt_at?: string
          processed_at?: string | null
          processing_attempt_count?: number
          processing_state?: string
          provider_operation_id?: string
          received_at?: string
          signature_verified_at?: string
          terminal_event_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      procurement_cart_scenario_items: {
        Row: {
          created_at: string
          display_order: number
          id: string
          line_discount: number
          notes: string
          owner_id: string
          package_count: number
          requested_item_id: string
          scenario_id: string
          supplier_offer_id: string
          unit_price: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          line_discount?: number
          notes?: string
          owner_id: string
          package_count: number
          requested_item_id: string
          scenario_id: string
          supplier_offer_id: string
          unit_price: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          line_discount?: number
          notes?: string
          owner_id?: string
          package_count?: number
          requested_item_id?: string
          scenario_id?: string
          supplier_offer_id?: string
          unit_price?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_cart_scenario_ite_workspace_id_supplier_offer__fkey"
            columns: ["workspace_id", "supplier_offer_id", "requested_item_id"]
            isOneToOne: false
            referencedRelation: "procurement_supplier_offers"
            referencedColumns: ["workspace_id", "id", "requested_item_id"]
          },
          {
            foreignKeyName: "procurement_cart_scenario_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_cart_scenario_items_workspace_id_scenario_id_fkey"
            columns: ["workspace_id", "scenario_id"]
            isOneToOne: false
            referencedRelation: "procurement_cart_scenarios"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      procurement_cart_scenarios: {
        Row: {
          additional_cost: number | null
          calculated_at: string | null
          created_at: string
          currency: string
          destination_country_code: string
          discount_id: string | null
          id: string
          manual_duty_estimate: number | null
          manual_shipping_cost: number | null
          manual_tax_estimate: number | null
          name: string
          notes: string
          owner_id: string
          payment_fee: number | null
          shipping_rule_id: string | null
          status: string
          supplier_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          additional_cost?: number | null
          calculated_at?: string | null
          created_at?: string
          currency: string
          destination_country_code?: string
          discount_id?: string | null
          id?: string
          manual_duty_estimate?: number | null
          manual_shipping_cost?: number | null
          manual_tax_estimate?: number | null
          name: string
          notes?: string
          owner_id: string
          payment_fee?: number | null
          shipping_rule_id?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          additional_cost?: number | null
          calculated_at?: string | null
          created_at?: string
          currency?: string
          destination_country_code?: string
          discount_id?: string | null
          id?: string
          manual_duty_estimate?: number | null
          manual_shipping_cost?: number | null
          manual_tax_estimate?: number | null
          name?: string
          notes?: string
          owner_id?: string
          payment_fee?: number | null
          shipping_rule_id?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_cart_scenarios_workspace_id_discount_id_fkey"
            columns: ["workspace_id", "discount_id"]
            isOneToOne: false
            referencedRelation: "procurement_supplier_discounts"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "procurement_cart_scenarios_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_cart_scenarios_workspace_id_shipping_rule_id_fkey"
            columns: ["workspace_id", "shipping_rule_id"]
            isOneToOne: false
            referencedRelation: "procurement_supplier_shipping_rules"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "procurement_cart_scenarios_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      procurement_offer_candidates: {
        Row: {
          accepted_offer_id: string | null
          coa_availability: string
          confidence: string
          created_at: string
          currency: string | null
          delivery_estimate_days: number | null
          duplicate_of_candidate_id: string | null
          evidence_snippets: string[]
          field_evidence: Json
          field_states: Json
          first_order_discount: number | null
          freshness: string
          id: string
          is_marketplace_listing: boolean
          item_price: number | null
          matched_supplier_id: string | null
          merged_into_offer_id: string | null
          moq: number | null
          owner_id: string
          package_quantity: number | null
          package_unit: string | null
          procurement_request_id: string
          product_title: string
          requested_item_id: string
          research_job_id: string
          review_notes: string
          review_status: string
          reviewed_at: string | null
          sds_availability: string
          shipping_cost: number | null
          source_date: string
          source_notes: string
          source_url: string
          stock_status: string
          supplier_name: string
          technical_document_availability: string
          unresolved_fields: string[]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_offer_id?: string | null
          coa_availability?: string
          confidence?: string
          created_at?: string
          currency?: string | null
          delivery_estimate_days?: number | null
          duplicate_of_candidate_id?: string | null
          evidence_snippets?: string[]
          field_evidence?: Json
          field_states?: Json
          first_order_discount?: number | null
          freshness?: string
          id?: string
          is_marketplace_listing?: boolean
          item_price?: number | null
          matched_supplier_id?: string | null
          merged_into_offer_id?: string | null
          moq?: number | null
          owner_id: string
          package_quantity?: number | null
          package_unit?: string | null
          procurement_request_id: string
          product_title: string
          requested_item_id: string
          research_job_id: string
          review_notes?: string
          review_status?: string
          reviewed_at?: string | null
          sds_availability?: string
          shipping_cost?: number | null
          source_date: string
          source_notes?: string
          source_url: string
          stock_status?: string
          supplier_name: string
          technical_document_availability?: string
          unresolved_fields?: string[]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_offer_id?: string | null
          coa_availability?: string
          confidence?: string
          created_at?: string
          currency?: string | null
          delivery_estimate_days?: number | null
          duplicate_of_candidate_id?: string | null
          evidence_snippets?: string[]
          field_evidence?: Json
          field_states?: Json
          first_order_discount?: number | null
          freshness?: string
          id?: string
          is_marketplace_listing?: boolean
          item_price?: number | null
          matched_supplier_id?: string | null
          merged_into_offer_id?: string | null
          moq?: number | null
          owner_id?: string
          package_quantity?: number | null
          package_unit?: string | null
          procurement_request_id?: string
          product_title?: string
          requested_item_id?: string
          research_job_id?: string
          review_notes?: string
          review_status?: string
          reviewed_at?: string | null
          sds_availability?: string
          shipping_cost?: number | null
          source_date?: string
          source_notes?: string
          source_url?: string
          stock_status?: string
          supplier_name?: string
          technical_document_availability?: string
          unresolved_fields?: string[]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_offer_candidates_duplicate_workspace_fkey"
            columns: ["workspace_id", "duplicate_of_candidate_id"]
            isOneToOne: false
            referencedRelation: "procurement_offer_candidates"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "procurement_offer_candidates_workspace_id_accepted_offer_i_fkey"
            columns: ["workspace_id", "accepted_offer_id"]
            isOneToOne: false
            referencedRelation: "procurement_supplier_offers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "procurement_offer_candidates_workspace_id_matched_supplier_fkey"
            columns: ["workspace_id", "matched_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "procurement_offer_candidates_workspace_id_merged_into_offe_fkey"
            columns: ["workspace_id", "merged_into_offer_id"]
            isOneToOne: false
            referencedRelation: "procurement_supplier_offers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "procurement_offer_candidates_workspace_id_procurement_requ_fkey"
            columns: ["workspace_id", "procurement_request_id"]
            isOneToOne: false
            referencedRelation: "procurement_requests"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "procurement_offer_candidates_workspace_id_requested_item_i_fkey"
            columns: [
              "workspace_id",
              "requested_item_id",
              "procurement_request_id",
            ]
            isOneToOne: false
            referencedRelation: "procurement_requested_items"
            referencedColumns: ["workspace_id", "id", "procurement_request_id"]
          },
          {
            foreignKeyName: "procurement_offer_candidates_workspace_id_research_job_id_fkey"
            columns: ["workspace_id", "research_job_id"]
            isOneToOne: false
            referencedRelation: "procurement_research_jobs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      procurement_provider_diagnostics: {
        Row: {
          abort_source: string | null
          created_at: string
          diagnostic_version: number
          function_elapsed_ms: number | null
          job_id: string
          owner_id: string
          provider_body_completed_at: string | null
          provider_called: boolean
          provider_elapsed_ms: number | null
          provider_headers_at: string | null
          provider_http_status: number | null
          provider_parse_completed_at: string | null
          provider_stage: string | null
          provider_started_at: string | null
          provider_validation_completed_at: string | null
          terminal_error_code: string | null
          timeout_limit_ms: number | null
          timeout_stage: string | null
          updated_at: string
          usage_present: boolean | null
          validated_candidate_count: number | null
          workspace_id: string
        }
        Insert: {
          abort_source?: string | null
          created_at?: string
          diagnostic_version?: number
          function_elapsed_ms?: number | null
          job_id: string
          owner_id: string
          provider_body_completed_at?: string | null
          provider_called?: boolean
          provider_elapsed_ms?: number | null
          provider_headers_at?: string | null
          provider_http_status?: number | null
          provider_parse_completed_at?: string | null
          provider_stage?: string | null
          provider_started_at?: string | null
          provider_validation_completed_at?: string | null
          terminal_error_code?: string | null
          timeout_limit_ms?: number | null
          timeout_stage?: string | null
          updated_at?: string
          usage_present?: boolean | null
          validated_candidate_count?: number | null
          workspace_id: string
        }
        Update: {
          abort_source?: string | null
          created_at?: string
          diagnostic_version?: number
          function_elapsed_ms?: number | null
          job_id?: string
          owner_id?: string
          provider_body_completed_at?: string | null
          provider_called?: boolean
          provider_elapsed_ms?: number | null
          provider_headers_at?: string | null
          provider_http_status?: number | null
          provider_parse_completed_at?: string | null
          provider_stage?: string | null
          provider_started_at?: string | null
          provider_validation_completed_at?: string | null
          terminal_error_code?: string | null
          timeout_limit_ms?: number | null
          timeout_stage?: string | null
          updated_at?: string
          usage_present?: boolean | null
          validated_candidate_count?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_provider_diagnostics_workspace_id_job_id_fkey"
            columns: ["workspace_id", "job_id"]
            isOneToOne: false
            referencedRelation: "procurement_research_jobs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      procurement_recommendations: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          procurement_request_id: string
          rationale: string
          recommended_purchase_quantity: number | null
          requested_item_id: string
          status: string
          summary: string
          supplier_offer_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          procurement_request_id: string
          rationale?: string
          recommended_purchase_quantity?: number | null
          requested_item_id: string
          status?: string
          summary: string
          supplier_offer_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          procurement_request_id?: string
          rationale?: string
          recommended_purchase_quantity?: number | null
          requested_item_id?: string
          status?: string
          summary?: string
          supplier_offer_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_recommendations_workspace_id_procurement_reque_fkey"
            columns: ["workspace_id", "procurement_request_id"]
            isOneToOne: false
            referencedRelation: "procurement_requests"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "procurement_recommendations_workspace_id_requested_item_id_fkey"
            columns: [
              "workspace_id",
              "requested_item_id",
              "procurement_request_id",
            ]
            isOneToOne: false
            referencedRelation: "procurement_requested_items"
            referencedColumns: ["workspace_id", "id", "procurement_request_id"]
          },
          {
            foreignKeyName: "procurement_recommendations_workspace_id_supplier_offer_id_fkey"
            columns: ["workspace_id", "supplier_offer_id", "requested_item_id"]
            isOneToOne: false
            referencedRelation: "procurement_supplier_offers"
            referencedColumns: ["workspace_id", "id", "requested_item_id"]
          },
        ]
      }
      procurement_requested_items: {
        Row: {
          acceptable_substitutes: string[]
          category: string
          created_at: string
          display_order: number
          id: string
          intended_formula_ids: string[]
          intended_product_ids: string[]
          name: string
          needed_by: string | null
          notes: string
          owner_id: string
          priority: string
          procurement_request_id: string
          requested_quantity: number
          required_specifications: string[]
          unit: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          acceptable_substitutes?: string[]
          category: string
          created_at?: string
          display_order?: number
          id?: string
          intended_formula_ids?: string[]
          intended_product_ids?: string[]
          name: string
          needed_by?: string | null
          notes?: string
          owner_id: string
          priority?: string
          procurement_request_id: string
          requested_quantity: number
          required_specifications?: string[]
          unit: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          acceptable_substitutes?: string[]
          category?: string
          created_at?: string
          display_order?: number
          id?: string
          intended_formula_ids?: string[]
          intended_product_ids?: string[]
          name?: string
          needed_by?: string | null
          notes?: string
          owner_id?: string
          priority?: string
          procurement_request_id?: string
          requested_quantity?: number
          required_specifications?: string[]
          unit?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_requested_items_workspace_id_procurement_reque_fkey"
            columns: ["workspace_id", "procurement_request_id"]
            isOneToOne: false
            referencedRelation: "procurement_requests"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      procurement_requests: {
        Row: {
          category: string
          created_at: string
          id: string
          needed_by: string | null
          notes: string
          owner_id: string
          priority: string
          revision: number
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          needed_by?: string | null
          notes?: string
          owner_id: string
          priority?: string
          revision?: number
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          needed_by?: string | null
          notes?: string
          owner_id?: string
          priority?: string
          revision?: number
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_research_jobs: {
        Row: {
          attempt_count: number
          background_lifecycle_status: string | null
          background_status_updated_at: string | null
          cancellation_requested_at: string | null
          completed_at: string | null
          correlation_id: string
          created_at: string
          error_code: string | null
          error_details: string | null
          id: string
          live_invocation_started_at: string | null
          owner_id: string
          procurement_request_id: string
          provider: string
          provider_invocation_count: number
          provider_request_id: string | null
          provider_stopped_at: string | null
          result_count: number
          retry_of_job_id: string | null
          reviewed_count: number
          started_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempt_count?: number
          background_lifecycle_status?: string | null
          background_status_updated_at?: string | null
          cancellation_requested_at?: string | null
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          error_details?: string | null
          id?: string
          live_invocation_started_at?: string | null
          owner_id: string
          procurement_request_id: string
          provider: string
          provider_invocation_count?: number
          provider_request_id?: string | null
          provider_stopped_at?: string | null
          result_count?: number
          retry_of_job_id?: string | null
          reviewed_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempt_count?: number
          background_lifecycle_status?: string | null
          background_status_updated_at?: string | null
          cancellation_requested_at?: string | null
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          error_details?: string | null
          id?: string
          live_invocation_started_at?: string | null
          owner_id?: string
          procurement_request_id?: string
          provider?: string
          provider_invocation_count?: number
          provider_request_id?: string | null
          provider_stopped_at?: string | null
          result_count?: number
          retry_of_job_id?: string | null
          reviewed_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_research_jobs_retry_workspace_fkey"
            columns: ["workspace_id", "retry_of_job_id"]
            isOneToOne: false
            referencedRelation: "procurement_research_jobs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "procurement_research_jobs_workspace_id_procurement_request_fkey"
            columns: ["workspace_id", "procurement_request_id"]
            isOneToOne: false
            referencedRelation: "procurement_requests"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      procurement_supplier_discounts: {
        Row: {
          coupon_code: string | null
          created_at: string
          currency: string | null
          discount_type: string
          eligibility_state: string
          evidence_notes: string
          excluded_supplier_product_ids: string[]
          expires_at: string | null
          first_purchase_only: boolean
          fixed_amount: number | null
          id: string
          included_supplier_product_ids: string[]
          maximum_discount: number | null
          minimum_order_value: number | null
          name: string
          owner_id: string
          percentage: number | null
          requires_newsletter: boolean
          single_use: boolean
          source_url: string | null
          stacking_allowed: boolean | null
          status: string
          supplier_id: string
          threshold_basis: string | null
          updated_at: string
          used_at: string | null
          valid_from: string | null
          verified_at: string | null
          workspace_id: string
        }
        Insert: {
          coupon_code?: string | null
          created_at?: string
          currency?: string | null
          discount_type: string
          eligibility_state?: string
          evidence_notes?: string
          excluded_supplier_product_ids?: string[]
          expires_at?: string | null
          first_purchase_only?: boolean
          fixed_amount?: number | null
          id?: string
          included_supplier_product_ids?: string[]
          maximum_discount?: number | null
          minimum_order_value?: number | null
          name: string
          owner_id: string
          percentage?: number | null
          requires_newsletter?: boolean
          single_use?: boolean
          source_url?: string | null
          stacking_allowed?: boolean | null
          status?: string
          supplier_id: string
          threshold_basis?: string | null
          updated_at?: string
          used_at?: string | null
          valid_from?: string | null
          verified_at?: string | null
          workspace_id: string
        }
        Update: {
          coupon_code?: string | null
          created_at?: string
          currency?: string | null
          discount_type?: string
          eligibility_state?: string
          evidence_notes?: string
          excluded_supplier_product_ids?: string[]
          expires_at?: string | null
          first_purchase_only?: boolean
          fixed_amount?: number | null
          id?: string
          included_supplier_product_ids?: string[]
          maximum_discount?: number | null
          minimum_order_value?: number | null
          name?: string
          owner_id?: string
          percentage?: number | null
          requires_newsletter?: boolean
          single_use?: boolean
          source_url?: string | null
          stacking_allowed?: boolean | null
          status?: string
          supplier_id?: string
          threshold_basis?: string | null
          updated_at?: string
          used_at?: string | null
          valid_from?: string | null
          verified_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_supplier_discounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_supplier_discounts_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      procurement_supplier_offers: {
        Row: {
          certification_claims: string[]
          coa_availability: string
          confidence: string
          country_code: string | null
          created_at: string
          currency: string | null
          date_checked: string
          delivery_estimate_days: number | null
          first_order_discount: number | null
          id: string
          item_price: number | null
          moq: number | null
          notes: string
          owner_id: string
          package_quantity: number
          package_unit: string
          product_title: string
          product_url: string | null
          requested_item_id: string
          sds_availability: string
          shipping_cost: number | null
          source_supplier_product_domain: string | null
          source_supplier_product_id: string | null
          stock_status: string
          supplier_id: string
          tax_duty_estimate: number | null
          technical_document_availability: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          certification_claims?: string[]
          coa_availability?: string
          confidence?: string
          country_code?: string | null
          created_at?: string
          currency?: string | null
          date_checked: string
          delivery_estimate_days?: number | null
          first_order_discount?: number | null
          id?: string
          item_price?: number | null
          moq?: number | null
          notes?: string
          owner_id: string
          package_quantity: number
          package_unit: string
          product_title: string
          product_url?: string | null
          requested_item_id: string
          sds_availability?: string
          shipping_cost?: number | null
          source_supplier_product_domain?: string | null
          source_supplier_product_id?: string | null
          stock_status?: string
          supplier_id: string
          tax_duty_estimate?: number | null
          technical_document_availability?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          certification_claims?: string[]
          coa_availability?: string
          confidence?: string
          country_code?: string | null
          created_at?: string
          currency?: string | null
          date_checked?: string
          delivery_estimate_days?: number | null
          first_order_discount?: number | null
          id?: string
          item_price?: number | null
          moq?: number | null
          notes?: string
          owner_id?: string
          package_quantity?: number
          package_unit?: string
          product_title?: string
          product_url?: string | null
          requested_item_id?: string
          sds_availability?: string
          shipping_cost?: number | null
          source_supplier_product_domain?: string | null
          source_supplier_product_id?: string | null
          stock_status?: string
          supplier_id?: string
          tax_duty_estimate?: number | null
          technical_document_availability?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_supplier_offers_workspace_id_requested_item_id_fkey"
            columns: ["workspace_id", "requested_item_id"]
            isOneToOne: false
            referencedRelation: "procurement_requested_items"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "procurement_supplier_offers_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      procurement_supplier_shipping_rules: {
        Row: {
          checkout_only: boolean
          created_at: string
          currency: string | null
          dangerous_goods_fee: number | null
          delivery_estimate_max_days: number | null
          delivery_estimate_min_days: number | null
          destination_country_code: string | null
          destination_region: string | null
          duty_estimate: number | null
          duty_handling: string
          estimate_max: number | null
          estimate_min: number | null
          evidence_notes: string
          excluded_regions: string[]
          flat_rate: number | null
          free_shipping_threshold: number | null
          id: string
          minimum_order_value: number | null
          order_value_tiers: Json
          owner_id: string
          remote_area_fee: number | null
          shipping_method: string | null
          source_url: string | null
          status: string
          supplier_id: string
          tax_estimate: number | null
          tax_handling: string
          threshold_basis: string | null
          updated_at: string
          vat_included: boolean | null
          verified_at: string | null
          weight_tiers: Json
          workspace_id: string
        }
        Insert: {
          checkout_only?: boolean
          created_at?: string
          currency?: string | null
          dangerous_goods_fee?: number | null
          delivery_estimate_max_days?: number | null
          delivery_estimate_min_days?: number | null
          destination_country_code?: string | null
          destination_region?: string | null
          duty_estimate?: number | null
          duty_handling?: string
          estimate_max?: number | null
          estimate_min?: number | null
          evidence_notes?: string
          excluded_regions?: string[]
          flat_rate?: number | null
          free_shipping_threshold?: number | null
          id?: string
          minimum_order_value?: number | null
          order_value_tiers?: Json
          owner_id: string
          remote_area_fee?: number | null
          shipping_method?: string | null
          source_url?: string | null
          status?: string
          supplier_id: string
          tax_estimate?: number | null
          tax_handling?: string
          threshold_basis?: string | null
          updated_at?: string
          vat_included?: boolean | null
          verified_at?: string | null
          weight_tiers?: Json
          workspace_id: string
        }
        Update: {
          checkout_only?: boolean
          created_at?: string
          currency?: string | null
          dangerous_goods_fee?: number | null
          delivery_estimate_max_days?: number | null
          delivery_estimate_min_days?: number | null
          destination_country_code?: string | null
          destination_region?: string | null
          duty_estimate?: number | null
          duty_handling?: string
          estimate_max?: number | null
          estimate_min?: number | null
          evidence_notes?: string
          excluded_regions?: string[]
          flat_rate?: number | null
          free_shipping_threshold?: number | null
          id?: string
          minimum_order_value?: number | null
          order_value_tiers?: Json
          owner_id?: string
          remote_area_fee?: number | null
          shipping_method?: string | null
          source_url?: string | null
          status?: string
          supplier_id?: string
          tax_estimate?: number | null
          tax_handling?: string
          threshold_basis?: string | null
          updated_at?: string
          vat_included?: boolean | null
          verified_at?: string | null
          weight_tiers?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_supplier_shipping_rul_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "procurement_supplier_shipping_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      product_studio_concepts: {
        Row: {
          analysis: Json
          candidate_substitutes: Json
          created_at: string
          desired_properties: string[]
          generated_formula_id: string | null
          generated_formula_version_id: string | null
          generated_product_id: string | null
          id: string
          intent_mode: string
          name: string
          notes: string
          owner_id: string
          procurement_plan_id: string | null
          product_type: string
          scent_directions: string[]
          selected_ingredients: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis?: Json
          candidate_substitutes?: Json
          created_at?: string
          desired_properties?: string[]
          generated_formula_id?: string | null
          generated_formula_version_id?: string | null
          generated_product_id?: string | null
          id: string
          intent_mode: string
          name: string
          notes?: string
          owner_id: string
          procurement_plan_id?: string | null
          product_type: string
          scent_directions?: string[]
          selected_ingredients?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis?: Json
          candidate_substitutes?: Json
          created_at?: string
          desired_properties?: string[]
          generated_formula_id?: string | null
          generated_formula_version_id?: string | null
          generated_product_id?: string | null
          id?: string
          intent_mode?: string
          name?: string
          notes?: string
          owner_id?: string
          procurement_plan_id?: string | null
          product_type?: string
          scent_directions?: string[]
          selected_ingredients?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_studio_concepts_workspace_id_generated_formula_id_fkey"
            columns: ["workspace_id", "generated_formula_id"]
            isOneToOne: false
            referencedRelation: "formulas"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "product_studio_concepts_workspace_id_generated_formula_ver_fkey"
            columns: ["workspace_id", "generated_formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "product_studio_concepts_workspace_id_generated_product_id_fkey"
            columns: ["workspace_id", "generated_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "product_studio_concepts_workspace_id_owner_id_fkey"
            columns: ["workspace_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "product_studio_concepts_workspace_id_procurement_plan_id_fkey"
            columns: ["workspace_id", "procurement_plan_id"]
            isOneToOne: false
            referencedRelation: "purchase_plans"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_lot_allocations: {
        Row: {
          cost_currency_snapshot: string | null
          id: string
          inventory_lot_id: string | null
          inventory_movement_id: string | null
          owner_id: string
          production_run_line_id: string
          quantity: number
          unit: string
          unit_cost_snapshot: number | null
          workspace_id: string
        }
        Insert: {
          cost_currency_snapshot?: string | null
          id: string
          inventory_lot_id?: string | null
          inventory_movement_id?: string | null
          owner_id: string
          production_run_line_id: string
          quantity: number
          unit: string
          unit_cost_snapshot?: number | null
          workspace_id: string
        }
        Update: {
          cost_currency_snapshot?: string | null
          id?: string
          inventory_lot_id?: string | null
          inventory_movement_id?: string | null
          owner_id?: string
          production_run_line_id?: string
          quantity?: number
          unit?: string
          unit_cost_snapshot?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_lot_allocations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_lot_allocations_workspace_id_inventory_lot_id_fkey"
            columns: ["workspace_id", "inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_lot_allocations_workspace_id_inventory_movement_fkey"
            columns: ["workspace_id", "inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_lot_allocations_workspace_id_production_run_lin_fkey"
            columns: ["workspace_id", "production_run_line_id"]
            isOneToOne: false
            referencedRelation: "production_run_lines"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_output_components: {
        Row: {
          approval_state: string
          component_type: string
          created_at: string
          evidence_reference: string | null
          id: string
          idempotency_key: string
          normalized_quantity: number
          normalized_unit: string
          owner_id: string
          payload_fingerprint: string
          production_output_id: string
          quantity: number
          reason: string
          recorded_at: string
          recorded_by: string
          revision: number
          unit: string
          workspace_id: string
        }
        Insert: {
          approval_state?: string
          component_type: string
          created_at?: string
          evidence_reference?: string | null
          id?: string
          idempotency_key: string
          normalized_quantity: number
          normalized_unit: string
          owner_id: string
          payload_fingerprint: string
          production_output_id: string
          quantity: number
          reason: string
          recorded_at: string
          recorded_by: string
          revision?: number
          unit: string
          workspace_id: string
        }
        Update: {
          approval_state?: string
          component_type?: string
          created_at?: string
          evidence_reference?: string | null
          id?: string
          idempotency_key?: string
          normalized_quantity?: number
          normalized_unit?: string
          owner_id?: string
          payload_fingerprint?: string
          production_output_id?: string
          quantity?: number
          reason?: string
          recorded_at?: string
          recorded_by?: string
          revision?: number
          unit?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_output_components_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_output_components_workspace_id_production_outpu_fkey"
            columns: ["workspace_id", "production_output_id"]
            isOneToOne: false
            referencedRelation: "production_outputs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_output_events: {
        Row: {
          actor_id: string
          event_key: string
          event_type: string
          formula_version_id: string
          id: string
          metadata: Json
          occurred_at: string
          output_revision: number | null
          owner_id: string
          policy_version: string
          production_output_id: string | null
          production_run_id: string
          quantity: number | null
          unit: string | null
          workspace_id: string
        }
        Insert: {
          actor_id: string
          event_key: string
          event_type: string
          formula_version_id: string
          id?: string
          metadata?: Json
          occurred_at?: string
          output_revision?: number | null
          owner_id: string
          policy_version: string
          production_output_id?: string | null
          production_run_id: string
          quantity?: number | null
          unit?: string | null
          workspace_id: string
        }
        Update: {
          actor_id?: string
          event_key?: string
          event_type?: string
          formula_version_id?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          output_revision?: number | null
          owner_id?: string
          policy_version?: string
          production_output_id?: string | null
          production_run_id?: string
          quantity?: number | null
          unit?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_output_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_output_events_workspace_id_formula_version_id_fkey"
            columns: ["workspace_id", "formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_output_events_workspace_id_production_output_id_fkey"
            columns: ["workspace_id", "production_output_id"]
            isOneToOne: false
            referencedRelation: "production_outputs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_output_events_workspace_id_production_run_id_fkey"
            columns: ["workspace_id", "production_run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_output_measurements: {
        Row: {
          created_at: string
          equipment_reference: string | null
          evidence_reference: string | null
          gross_quantity: number | null
          id: string
          idempotency_key: string
          measured_at: string
          measured_by: string
          measurement_method: string
          measurement_version: number
          normalized_quantity: number
          normalized_unit: string
          note: string
          owner_id: string
          payload_fingerprint: string
          production_output_id: string
          quantity: number
          supersedes_measurement_id: string | null
          tare_quantity: number | null
          unit: string
          vessel_reference: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          equipment_reference?: string | null
          evidence_reference?: string | null
          gross_quantity?: number | null
          id?: string
          idempotency_key: string
          measured_at: string
          measured_by: string
          measurement_method: string
          measurement_version: number
          normalized_quantity: number
          normalized_unit: string
          note?: string
          owner_id: string
          payload_fingerprint: string
          production_output_id: string
          quantity: number
          supersedes_measurement_id?: string | null
          tare_quantity?: number | null
          unit: string
          vessel_reference?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          equipment_reference?: string | null
          evidence_reference?: string | null
          gross_quantity?: number | null
          id?: string
          idempotency_key?: string
          measured_at?: string
          measured_by?: string
          measurement_method?: string
          measurement_version?: number
          normalized_quantity?: number
          normalized_unit?: string
          note?: string
          owner_id?: string
          payload_fingerprint?: string
          production_output_id?: string
          quantity?: number
          supersedes_measurement_id?: string | null
          tare_quantity?: number | null
          unit?: string
          vessel_reference?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_output_measurement_workspace_id_production_outp_fkey"
            columns: ["workspace_id", "production_output_id"]
            isOneToOne: false
            referencedRelation: "production_outputs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_output_measurements_supersedes_measurement_id_fkey"
            columns: ["supersedes_measurement_id"]
            isOneToOne: false
            referencedRelation: "production_output_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_output_measurements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      production_output_reconciliations: {
        Row: {
          actual_normalized_quantity: number
          approved_by: string | null
          created_at: string
          equation_difference: number
          evidence_reference: string | null
          id: string
          idempotency_key: string
          owner_id: string
          payload_fingerprint: string
          policy_version: string
          production_output_id: string
          reason: string | null
          reconciled_at: string
          reconciled_by: string
          reconciliation_version: number
          retained_normalized_quantity: number
          state: string
          theoretical_variance: number
          tolerance_quantity: number
          transferred_normalized_quantity: number
          unexplained_normalized_quantity: number
          waste_normalized_quantity: number
          workspace_id: string
          yield_percentage: number
        }
        Insert: {
          actual_normalized_quantity: number
          approved_by?: string | null
          created_at?: string
          equation_difference: number
          evidence_reference?: string | null
          id?: string
          idempotency_key: string
          owner_id: string
          payload_fingerprint: string
          policy_version: string
          production_output_id: string
          reason?: string | null
          reconciled_at: string
          reconciled_by: string
          reconciliation_version: number
          retained_normalized_quantity: number
          state: string
          theoretical_variance: number
          tolerance_quantity: number
          transferred_normalized_quantity: number
          unexplained_normalized_quantity: number
          waste_normalized_quantity: number
          workspace_id: string
          yield_percentage: number
        }
        Update: {
          actual_normalized_quantity?: number
          approved_by?: string | null
          created_at?: string
          equation_difference?: number
          evidence_reference?: string | null
          id?: string
          idempotency_key?: string
          owner_id?: string
          payload_fingerprint?: string
          policy_version?: string
          production_output_id?: string
          reason?: string | null
          reconciled_at?: string
          reconciled_by?: string
          reconciliation_version?: number
          retained_normalized_quantity?: number
          state?: string
          theoretical_variance?: number
          tolerance_quantity?: number
          transferred_normalized_quantity?: number
          unexplained_normalized_quantity?: number
          waste_normalized_quantity?: number
          workspace_id?: string
          yield_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_output_reconciliat_workspace_id_production_outp_fkey"
            columns: ["workspace_id", "production_output_id"]
            isOneToOne: false
            referencedRelation: "production_outputs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_output_reconciliations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      production_outputs: {
        Row: {
          batch_number_snapshot: string
          batch_scale_quantity_snapshot: number
          batch_scale_unit_snapshot: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          creation_idempotency_key: string
          creation_payload_fingerprint: string
          formula_id: string
          formula_name_snapshot: string
          formula_version_id: string
          formula_version_snapshot: string
          id: string
          internal_output_code: string
          location: string
          material_cost_confidence: string
          material_cost_currency: string | null
          material_cost_snapshot: number | null
          measurement_basis: string
          output_label: string
          output_sequence: number
          output_type: string
          owner_id: string
          product_id: string
          product_name_snapshot: string
          production_completion_policy_version: string
          production_run_id: string
          revision: number
          status: string
          theoretical_normalized_quantity: number
          theoretical_normalized_unit: string
          theoretical_override_evidence: string | null
          theoretical_override_reason: string | null
          theoretical_quantity: number
          theoretical_unit: string
          theoretical_yield_basis: string
          unresolved_cost_count: number
          workspace_id: string
        }
        Insert: {
          batch_number_snapshot: string
          batch_scale_quantity_snapshot: number
          batch_scale_unit_snapshot: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          creation_idempotency_key: string
          creation_payload_fingerprint: string
          formula_id: string
          formula_name_snapshot: string
          formula_version_id: string
          formula_version_snapshot: string
          id?: string
          internal_output_code: string
          location: string
          material_cost_confidence: string
          material_cost_currency?: string | null
          material_cost_snapshot?: number | null
          measurement_basis: string
          output_label: string
          output_sequence: number
          output_type?: string
          owner_id: string
          product_id: string
          product_name_snapshot: string
          production_completion_policy_version: string
          production_run_id: string
          revision?: number
          status?: string
          theoretical_normalized_quantity: number
          theoretical_normalized_unit: string
          theoretical_override_evidence?: string | null
          theoretical_override_reason?: string | null
          theoretical_quantity: number
          theoretical_unit: string
          theoretical_yield_basis: string
          unresolved_cost_count?: number
          workspace_id: string
        }
        Update: {
          batch_number_snapshot?: string
          batch_scale_quantity_snapshot?: number
          batch_scale_unit_snapshot?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          creation_idempotency_key?: string
          creation_payload_fingerprint?: string
          formula_id?: string
          formula_name_snapshot?: string
          formula_version_id?: string
          formula_version_snapshot?: string
          id?: string
          internal_output_code?: string
          location?: string
          material_cost_confidence?: string
          material_cost_currency?: string | null
          material_cost_snapshot?: number | null
          measurement_basis?: string
          output_label?: string
          output_sequence?: number
          output_type?: string
          owner_id?: string
          product_id?: string
          product_name_snapshot?: string
          production_completion_policy_version?: string
          production_run_id?: string
          revision?: number
          status?: string
          theoretical_normalized_quantity?: number
          theoretical_normalized_unit?: string
          theoretical_override_evidence?: string | null
          theoretical_override_reason?: string | null
          theoretical_quantity?: number
          theoretical_unit?: string
          theoretical_yield_basis?: string
          unresolved_cost_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_outputs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_outputs_workspace_id_formula_id_fkey"
            columns: ["workspace_id", "formula_id"]
            isOneToOne: false
            referencedRelation: "formulas"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_outputs_workspace_id_formula_version_id_fkey"
            columns: ["workspace_id", "formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_outputs_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_outputs_workspace_id_production_run_id_fkey"
            columns: ["workspace_id", "production_run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_process_steps: {
        Row: {
          completed_at: string | null
          id: string
          instruction: string
          notes: string
          owner_id: string
          production_run_id: string
          status: string
          step_number: number
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          id: string
          instruction: string
          notes: string
          owner_id: string
          production_run_id: string
          status: string
          step_number: number
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          instruction?: string
          notes?: string
          owner_id?: string
          production_run_id?: string
          status?: string
          step_number?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_process_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_process_steps_workspace_id_production_run_id_fkey"
            columns: ["workspace_id", "production_run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_procurement_inventory_gaps: {
        Row: {
          allocated_quantity: number
          calculation_version: string
          created_at: string
          expired_quantity: number
          id: string
          incoming_unreceived_quantity: number | null
          net_usable_quantity: number
          on_hand_quantity: number
          owner_id: string
          purchasing_gap: number
          quarantined_quantity: number
          requirement_id: string
          reserved_quantity: number
          snapshot_at: string
          unavailable_quantity: number
          unit: string
          usable_quantity: number
          warnings: string[]
          workspace_id: string
        }
        Insert: {
          allocated_quantity?: number
          calculation_version: string
          created_at?: string
          expired_quantity?: number
          id?: string
          incoming_unreceived_quantity?: number | null
          net_usable_quantity?: number
          on_hand_quantity?: number
          owner_id: string
          purchasing_gap?: number
          quarantined_quantity?: number
          requirement_id: string
          reserved_quantity?: number
          snapshot_at: string
          unavailable_quantity?: number
          unit: string
          usable_quantity?: number
          warnings?: string[]
          workspace_id: string
        }
        Update: {
          allocated_quantity?: number
          calculation_version?: string
          created_at?: string
          expired_quantity?: number
          id?: string
          incoming_unreceived_quantity?: number | null
          net_usable_quantity?: number
          on_hand_quantity?: number
          owner_id?: string
          purchasing_gap?: number
          quarantined_quantity?: number
          requirement_id?: string
          reserved_quantity?: number
          snapshot_at?: string
          unavailable_quantity?: number
          unit?: string
          usable_quantity?: number
          warnings?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_procurement_invento_workspace_id_requirement_id_fkey"
            columns: ["workspace_id", "requirement_id"]
            isOneToOne: true
            referencedRelation: "production_procurement_requirements"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_procurement_requirement_sources: {
        Row: {
          calculation_path: string
          contribution_quantity: number
          contribution_unit: string
          created_at: string
          formula_id: string
          formula_line_id: string
          formula_version_id: string
          id: string
          overage_quantity: number
          owner_id: string
          percentage: number
          phase: string
          product_id: string
          quantity_before_overage: number
          requirement_id: string
          round_product_id: string
          workspace_id: string
        }
        Insert: {
          calculation_path: string
          contribution_quantity: number
          contribution_unit: string
          created_at?: string
          formula_id: string
          formula_line_id: string
          formula_version_id: string
          id?: string
          overage_quantity: number
          owner_id: string
          percentage: number
          phase: string
          product_id: string
          quantity_before_overage: number
          requirement_id: string
          round_product_id: string
          workspace_id: string
        }
        Update: {
          calculation_path?: string
          contribution_quantity?: number
          contribution_unit?: string
          created_at?: string
          formula_id?: string
          formula_line_id?: string
          formula_version_id?: string
          id?: string
          overage_quantity?: number
          owner_id?: string
          percentage?: number
          phase?: string
          product_id?: string
          quantity_before_overage?: number
          requirement_id?: string
          round_product_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_procurement_requir_workspace_id_formula_line_id_fkey"
            columns: ["workspace_id", "formula_line_id"]
            isOneToOne: false
            referencedRelation: "formula_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_procurement_requir_workspace_id_formula_version_fkey"
            columns: ["workspace_id", "formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_procurement_requir_workspace_id_round_product_i_fkey"
            columns: ["workspace_id", "round_product_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_round_products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_procurement_require_workspace_id_requirement_id_fkey"
            columns: ["workspace_id", "requirement_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_requirements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_procurement_requirement_workspace_id_formula_id_fkey"
            columns: ["workspace_id", "formula_id"]
            isOneToOne: false
            referencedRelation: "formulas"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_procurement_requirement_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_procurement_requirements: {
        Row: {
          calculated_at: string
          calculation_version: string
          created_at: string
          id: string
          ingredient_id: string
          ingredient_name_snapshot: string
          overage_quantity: number
          owner_id: string
          purchasing_unit: string
          reference_entry_id: string | null
          required_quantity: number
          round_id: string
          state: string
          total_planned_quantity: number
          warnings: string[]
          workspace_id: string
        }
        Insert: {
          calculated_at: string
          calculation_version: string
          created_at?: string
          id?: string
          ingredient_id: string
          ingredient_name_snapshot: string
          overage_quantity: number
          owner_id: string
          purchasing_unit: string
          reference_entry_id?: string | null
          required_quantity: number
          round_id: string
          state?: string
          total_planned_quantity: number
          warnings?: string[]
          workspace_id: string
        }
        Update: {
          calculated_at?: string
          calculation_version?: string
          created_at?: string
          id?: string
          ingredient_id?: string
          ingredient_name_snapshot?: string
          overage_quantity?: number
          owner_id?: string
          purchasing_unit?: string
          reference_entry_id?: string | null
          required_quantity?: number
          round_id?: string
          state?: string
          total_planned_quantity?: number
          warnings?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_procurement_requirem_workspace_id_ingredient_id_fkey"
            columns: ["workspace_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_procurement_requirements_workspace_id_round_id_fkey"
            columns: ["workspace_id", "round_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_rounds"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_procurement_round_products: {
        Row: {
          batch_size: number
          batch_unit: string
          category: string
          created_at: string
          deodorant_structure: string | null
          expected_yield: number | null
          formula_id: string | null
          formula_readiness_codes: string[]
          formula_readiness_reasons: string[]
          formula_readiness_status: string
          formula_version_id: string | null
          formula_version_label_snapshot: string | null
          formula_version_snapshot: Json | null
          formula_version_status_snapshot: string | null
          id: string
          inclusion_status: string
          overage_percentage: number
          owner_id: string
          planned_batch_count: number
          product_category_snapshot: string | null
          product_id: string | null
          product_name_snapshot: string | null
          readiness_rule_version: string
          round_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          batch_size?: number
          batch_unit?: string
          category: string
          created_at?: string
          deodorant_structure?: string | null
          expected_yield?: number | null
          formula_id?: string | null
          formula_readiness_codes?: string[]
          formula_readiness_reasons?: string[]
          formula_readiness_status?: string
          formula_version_id?: string | null
          formula_version_label_snapshot?: string | null
          formula_version_snapshot?: Json | null
          formula_version_status_snapshot?: string | null
          id?: string
          inclusion_status?: string
          overage_percentage?: number
          owner_id: string
          planned_batch_count?: number
          product_category_snapshot?: string | null
          product_id?: string | null
          product_name_snapshot?: string | null
          readiness_rule_version?: string
          round_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          batch_size?: number
          batch_unit?: string
          category?: string
          created_at?: string
          deodorant_structure?: string | null
          expected_yield?: number | null
          formula_id?: string | null
          formula_readiness_codes?: string[]
          formula_readiness_reasons?: string[]
          formula_readiness_status?: string
          formula_version_id?: string | null
          formula_version_label_snapshot?: string | null
          formula_version_snapshot?: Json | null
          formula_version_status_snapshot?: string | null
          id?: string
          inclusion_status?: string
          overage_percentage?: number
          owner_id?: string
          planned_batch_count?: number
          product_category_snapshot?: string | null
          product_id?: string | null
          product_name_snapshot?: string | null
          readiness_rule_version?: string
          round_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_procurement_round__workspace_id_formula_version_fkey"
            columns: ["workspace_id", "formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_procurement_round_produ_workspace_id_formula_id_fkey"
            columns: ["workspace_id", "formula_id"]
            isOneToOne: false
            referencedRelation: "formulas"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_procurement_round_produ_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_procurement_round_product_workspace_id_round_id_fkey"
            columns: ["workspace_id", "round_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_rounds"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_procurement_rounds: {
        Row: {
          base_currency: string
          calculation_versions: Json
          cancelled_at: string | null
          created_at: string
          id: string
          last_calculated_at: string | null
          locked_at: string | null
          notes: string
          owner_id: string
          revision: number
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          base_currency?: string
          calculation_versions?: Json
          cancelled_at?: string | null
          created_at?: string
          id?: string
          last_calculated_at?: string | null
          locked_at?: string | null
          notes?: string
          owner_id: string
          revision?: number
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          base_currency?: string
          calculation_versions?: Json
          cancelled_at?: string | null
          created_at?: string
          id?: string
          last_calculated_at?: string | null
          locked_at?: string | null
          notes?: string
          owner_id?: string
          revision?: number
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_procurement_rounds_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      production_procurement_scenario_baskets: {
        Row: {
          assumption_snapshot: Json
          confirmed_discount: number
          confirmed_total: number | null
          created_at: string
          currency: string
          customs: number | null
          customs_state: string
          eligible_subtotal: number
          estimated_discount: number
          estimated_total: number | null
          free_shipping_progress: Json
          freshness_states: Json
          handling: number | null
          handling_state: string
          id: string
          import_vat: number | null
          import_vat_state: string
          known_minimum: number
          merchandise_subtotal: number
          owner_id: string
          post_discount_subtotal: number
          range_maximum: number | null
          range_minimum: number | null
          scenario_id: string
          shipping: number | null
          shipping_state: string
          supplier_id: string
          supplier_name_snapshot: string
          supplier_url_snapshot: string | null
          vat: number | null
          vat_state: string
          warnings: string[]
          workspace_id: string
        }
        Insert: {
          assumption_snapshot?: Json
          confirmed_discount?: number
          confirmed_total?: number | null
          created_at?: string
          currency: string
          customs?: number | null
          customs_state: string
          eligible_subtotal: number
          estimated_discount?: number
          estimated_total?: number | null
          free_shipping_progress?: Json
          freshness_states?: Json
          handling?: number | null
          handling_state: string
          id?: string
          import_vat?: number | null
          import_vat_state: string
          known_minimum: number
          merchandise_subtotal: number
          owner_id: string
          post_discount_subtotal: number
          range_maximum?: number | null
          range_minimum?: number | null
          scenario_id: string
          shipping?: number | null
          shipping_state: string
          supplier_id: string
          supplier_name_snapshot: string
          supplier_url_snapshot?: string | null
          vat?: number | null
          vat_state: string
          warnings?: string[]
          workspace_id: string
        }
        Update: {
          assumption_snapshot?: Json
          confirmed_discount?: number
          confirmed_total?: number | null
          created_at?: string
          currency?: string
          customs?: number | null
          customs_state?: string
          eligible_subtotal?: number
          estimated_discount?: number
          estimated_total?: number | null
          free_shipping_progress?: Json
          freshness_states?: Json
          handling?: number | null
          handling_state?: string
          id?: string
          import_vat?: number | null
          import_vat_state?: string
          known_minimum?: number
          merchandise_subtotal?: number
          owner_id?: string
          post_discount_subtotal?: number
          range_maximum?: number | null
          range_minimum?: number | null
          scenario_id?: string
          shipping?: number | null
          shipping_state?: string
          supplier_id?: string
          supplier_name_snapshot?: string
          supplier_url_snapshot?: string | null
          vat?: number | null
          vat_state?: string
          warnings?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_procurement_scenario_b_workspace_id_scenario_id_fkey"
            columns: ["workspace_id", "scenario_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_scenarios"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_procurement_scenario_b_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_procurement_scenario_lines: {
        Row: {
          allocated_discount: number
          allocated_shipping: number | null
          assumption_snapshot: Json
          basket_id: string
          created_at: string
          currency: string
          discount_eligibility: string
          effective_cost_per_required_unit: number | null
          effective_landed_cost: number | null
          id: string
          ingredient_id: string
          ingredient_name_snapshot: string
          merchandise_line_total: number
          moq_adjusted_count: number
          owner_id: string
          package_count: number
          package_size: number
          package_unit: string
          product_url_snapshot: string | null
          purchased_quantity: number
          required_quantity: number
          required_unit: string
          requirement_id: string
          scenario_id: string
          source_selection_revision: number
          supplier_product_id: string
          supplier_product_name_snapshot: string
          surplus: number
          uncertainty: string[]
          unit_price: number
          warnings: string[]
          workspace_id: string
        }
        Insert: {
          allocated_discount?: number
          allocated_shipping?: number | null
          assumption_snapshot?: Json
          basket_id: string
          created_at?: string
          currency: string
          discount_eligibility: string
          effective_cost_per_required_unit?: number | null
          effective_landed_cost?: number | null
          id?: string
          ingredient_id: string
          ingredient_name_snapshot: string
          merchandise_line_total: number
          moq_adjusted_count: number
          owner_id: string
          package_count: number
          package_size: number
          package_unit: string
          product_url_snapshot?: string | null
          purchased_quantity: number
          required_quantity: number
          required_unit: string
          requirement_id: string
          scenario_id: string
          source_selection_revision: number
          supplier_product_id: string
          supplier_product_name_snapshot: string
          surplus: number
          uncertainty?: string[]
          unit_price: number
          warnings?: string[]
          workspace_id: string
        }
        Update: {
          allocated_discount?: number
          allocated_shipping?: number | null
          assumption_snapshot?: Json
          basket_id?: string
          created_at?: string
          currency?: string
          discount_eligibility?: string
          effective_cost_per_required_unit?: number | null
          effective_landed_cost?: number | null
          id?: string
          ingredient_id?: string
          ingredient_name_snapshot?: string
          merchandise_line_total?: number
          moq_adjusted_count?: number
          owner_id?: string
          package_count?: number
          package_size?: number
          package_unit?: string
          product_url_snapshot?: string | null
          purchased_quantity?: number
          required_quantity?: number
          required_unit?: string
          requirement_id?: string
          scenario_id?: string
          source_selection_revision?: number
          supplier_product_id?: string
          supplier_product_name_snapshot?: string
          surplus?: number
          uncertainty?: string[]
          unit_price?: number
          warnings?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_procurement_scenar_workspace_id_supplier_produc_fkey"
            columns: ["workspace_id", "supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_procurement_scenari_workspace_id_requirement_id_fkey"
            columns: ["workspace_id", "requirement_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_requirements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_procurement_scenario_l_workspace_id_scenario_id_fkey"
            columns: ["workspace_id", "scenario_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_scenarios"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_procurement_scenario_lin_workspace_id_basket_id_fkey"
            columns: ["workspace_id", "basket_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_scenario_baskets"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_procurement_scenario_workspace_id_ingredient_id_fkey"
            columns: ["workspace_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_procurement_scenarios: {
        Row: {
          base_currency: string
          blocker_count: number
          calculation_version: string
          created_at: string
          feasibility: string
          generated_at: string
          id: string
          line_count: number
          mixed_currency: boolean
          original_currency_totals: Json
          owner_id: string
          published_at: string | null
          published_by: string | null
          ranking_explanation: string[]
          ranking_score: number | null
          revision: number
          round_id: string
          source_fingerprint: string
          source_round_revision: number
          stale_at: string | null
          stale_data_count: number
          status: string
          strategy: string
          strategy_weights: Json
          supplier_count: number
          total_confirmed: number | null
          total_estimated: number | null
          total_known_minimum: number | null
          total_range_maximum: number | null
          total_range_minimum: number | null
          unknown_commercial_components: string[]
          updated_at: string
          warning_count: number
          workspace_id: string
        }
        Insert: {
          base_currency: string
          blocker_count?: number
          calculation_version?: string
          created_at?: string
          feasibility: string
          generated_at?: string
          id?: string
          line_count?: number
          mixed_currency?: boolean
          original_currency_totals?: Json
          owner_id: string
          published_at?: string | null
          published_by?: string | null
          ranking_explanation?: string[]
          ranking_score?: number | null
          revision?: number
          round_id: string
          source_fingerprint: string
          source_round_revision: number
          stale_at?: string | null
          stale_data_count?: number
          status?: string
          strategy: string
          strategy_weights?: Json
          supplier_count?: number
          total_confirmed?: number | null
          total_estimated?: number | null
          total_known_minimum?: number | null
          total_range_maximum?: number | null
          total_range_minimum?: number | null
          unknown_commercial_components?: string[]
          updated_at?: string
          warning_count?: number
          workspace_id: string
        }
        Update: {
          base_currency?: string
          blocker_count?: number
          calculation_version?: string
          created_at?: string
          feasibility?: string
          generated_at?: string
          id?: string
          line_count?: number
          mixed_currency?: boolean
          original_currency_totals?: Json
          owner_id?: string
          published_at?: string | null
          published_by?: string | null
          ranking_explanation?: string[]
          ranking_score?: number | null
          revision?: number
          round_id?: string
          source_fingerprint?: string
          source_round_revision?: number
          stale_at?: string | null
          stale_data_count?: number
          status?: string
          strategy?: string
          strategy_weights?: Json
          supplier_count?: number
          total_confirmed?: number | null
          total_estimated?: number | null
          total_known_minimum?: number | null
          total_range_maximum?: number | null
          total_range_minimum?: number | null
          unknown_commercial_components?: string[]
          updated_at?: string
          warning_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_procurement_scenarios_workspace_id_round_id_fkey"
            columns: ["workspace_id", "round_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_rounds"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_purchasing_specifications: {
        Row: {
          calculation_version: string
          created_at: string
          id: string
          ingredient_id: string
          owner_id: string
          provenance: Json
          requirement_id: string
          revision: number
          specification: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          calculation_version?: string
          created_at?: string
          id?: string
          ingredient_id: string
          owner_id: string
          provenance?: Json
          requirement_id: string
          revision?: number
          specification: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          calculation_version?: string
          created_at?: string
          id?: string
          ingredient_id?: string
          owner_id?: string
          provenance?: Json
          requirement_id?: string
          revision?: number
          specification?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_purchasing_specific_workspace_id_requirement_id_fkey"
            columns: ["workspace_id", "requirement_id"]
            isOneToOne: true
            referencedRelation: "production_procurement_requirements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_purchasing_specifica_workspace_id_ingredient_id_fkey"
            columns: ["workspace_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_requirement_supplier_candidates: {
        Row: {
          candidate_version: string
          classification: string
          commercial_snapshot: Json
          created_at: string
          documentation_snapshot: Json
          freshness_snapshot: Json
          id: string
          mapping_id: string | null
          match_reasons: string[]
          mismatch_reasons: string[]
          owner_id: string
          owner_note: string
          package_snapshot: Json
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requirement_id: string
          score: number
          source_type: string
          status: string
          supplier_product_id: string
          updated_at: string
          warnings: string[]
          workspace_id: string
        }
        Insert: {
          candidate_version?: string
          classification: string
          commercial_snapshot?: Json
          created_at?: string
          documentation_snapshot?: Json
          freshness_snapshot?: Json
          id?: string
          mapping_id?: string | null
          match_reasons?: string[]
          mismatch_reasons?: string[]
          owner_id: string
          owner_note?: string
          package_snapshot: Json
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requirement_id: string
          score: number
          source_type?: string
          status?: string
          supplier_product_id: string
          updated_at?: string
          warnings?: string[]
          workspace_id: string
        }
        Update: {
          candidate_version?: string
          classification?: string
          commercial_snapshot?: Json
          created_at?: string
          documentation_snapshot?: Json
          freshness_snapshot?: Json
          id?: string
          mapping_id?: string | null
          match_reasons?: string[]
          mismatch_reasons?: string[]
          owner_id?: string
          owner_note?: string
          package_snapshot?: Json
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requirement_id?: string
          score?: number
          source_type?: string
          status?: string
          supplier_product_id?: string
          updated_at?: string
          warnings?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_requirement_suppli_workspace_id_supplier_produc_fkey"
            columns: ["workspace_id", "supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_requirement_supplie_workspace_id_requirement_id_fkey"
            columns: ["workspace_id", "requirement_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_requirements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_requirement_supplier_ca_workspace_id_mapping_id_fkey"
            columns: ["workspace_id", "mapping_id"]
            isOneToOne: false
            referencedRelation: "supplier_product_ingredient_mappings"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_requirement_supplier_matches: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          calculation_version: string
          created_at: string
          estimated_package_count: number | null
          expected_purchased_quantity: number | null
          expected_surplus: number | null
          id: string
          match_explanation: string[]
          match_score: number | null
          owner_id: string
          owner_note: string
          requirement_id: string
          revision: number
          selected_candidate_id: string | null
          selected_package_size: number | null
          selected_package_unit: string | null
          selected_supplier_product_id: string | null
          status: string
          unresolved_reason: string | null
          updated_at: string
          warnings: string[]
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          calculation_version?: string
          created_at?: string
          estimated_package_count?: number | null
          expected_purchased_quantity?: number | null
          expected_surplus?: number | null
          id?: string
          match_explanation?: string[]
          match_score?: number | null
          owner_id: string
          owner_note?: string
          requirement_id: string
          revision?: number
          selected_candidate_id?: string | null
          selected_package_size?: number | null
          selected_package_unit?: string | null
          selected_supplier_product_id?: string | null
          status?: string
          unresolved_reason?: string | null
          updated_at?: string
          warnings?: string[]
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          calculation_version?: string
          created_at?: string
          estimated_package_count?: number | null
          expected_purchased_quantity?: number | null
          expected_surplus?: number | null
          id?: string
          match_explanation?: string[]
          match_score?: number | null
          owner_id?: string
          owner_note?: string
          requirement_id?: string
          revision?: number
          selected_candidate_id?: string | null
          selected_package_size?: number | null
          selected_package_unit?: string | null
          selected_supplier_product_id?: string | null
          status?: string
          unresolved_reason?: string | null
          updated_at?: string
          warnings?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_requirement_suppli_workspace_id_requirement_id_fkey1"
            columns: ["workspace_id", "requirement_id"]
            isOneToOne: true
            referencedRelation: "production_procurement_requirements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_requirement_suppli_workspace_id_selected_candid_fkey"
            columns: ["workspace_id", "selected_candidate_id"]
            isOneToOne: false
            referencedRelation: "production_requirement_supplier_candidates"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_requirement_suppli_workspace_id_selected_suppli_fkey"
            columns: ["workspace_id", "selected_supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_run_lines: {
        Row: {
          actual_quantity: number | null
          formula_id_snapshot: string
          formula_line_id: string
          formula_version_id_snapshot: string
          functions_snapshot: string[]
          id: string
          inci_snapshot: string
          ingredient_id: string
          ingredient_name_snapshot: string
          notes: string
          owner_id: string
          phase: string
          planned_percentage: number
          planned_quantity: number
          processing_instructions_snapshot: string
          production_run_id: string
          required_material_profile: Json
          revision: number
          sort_order_snapshot: number | null
          status: string
          substitution_rule: string
          tolerance_quantity: number
          unit: string
          variance: number | null
          workspace_id: string
        }
        Insert: {
          actual_quantity?: number | null
          formula_id_snapshot: string
          formula_line_id: string
          formula_version_id_snapshot: string
          functions_snapshot?: string[]
          id: string
          inci_snapshot?: string
          ingredient_id: string
          ingredient_name_snapshot: string
          notes: string
          owner_id: string
          phase: string
          planned_percentage: number
          planned_quantity: number
          processing_instructions_snapshot?: string
          production_run_id: string
          required_material_profile?: Json
          revision?: number
          sort_order_snapshot?: number | null
          status: string
          substitution_rule?: string
          tolerance_quantity?: number
          unit: string
          variance?: number | null
          workspace_id: string
        }
        Update: {
          actual_quantity?: number | null
          formula_id_snapshot?: string
          formula_line_id?: string
          formula_version_id_snapshot?: string
          functions_snapshot?: string[]
          id?: string
          inci_snapshot?: string
          ingredient_id?: string
          ingredient_name_snapshot?: string
          notes?: string
          owner_id?: string
          phase?: string
          planned_percentage?: number
          planned_quantity?: number
          processing_instructions_snapshot?: string
          production_run_id?: string
          required_material_profile?: Json
          revision?: number
          sort_order_snapshot?: number | null
          status?: string
          substitution_rule?: string
          tolerance_quantity?: number
          unit?: string
          variance?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_run_lines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_run_lines_workspace_id_formula_line_id_fkey"
            columns: ["workspace_id", "formula_line_id"]
            isOneToOne: false
            referencedRelation: "formula_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_run_lines_workspace_id_ingredient_id_fkey"
            columns: ["workspace_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_run_lines_workspace_id_production_run_id_fkey"
            columns: ["workspace_id", "production_run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      production_runs: {
        Row: {
          actual_units_produced: number | null
          actual_yield: number | null
          actual_yield_unit: string | null
          completed_at: string | null
          created_at: string
          formula_id: string
          formula_version_id: string
          id: string
          material_policy_version: string
          notes: string
          output_stage_completed_at: string | null
          output_stage_completed_by: string | null
          output_stage_status: string
          owner_id: string
          planned_batch_size: number
          planned_batch_unit: string
          planned_units: number | null
          product_id: string
          production_run_number: string
          purpose: string
          revision: number
          started_at: string | null
          status: string
          summary: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actual_units_produced?: number | null
          actual_yield?: number | null
          actual_yield_unit?: string | null
          completed_at?: string | null
          created_at: string
          formula_id: string
          formula_version_id: string
          id: string
          material_policy_version?: string
          notes: string
          output_stage_completed_at?: string | null
          output_stage_completed_by?: string | null
          output_stage_status?: string
          owner_id: string
          planned_batch_size: number
          planned_batch_unit: string
          planned_units?: number | null
          product_id: string
          production_run_number: string
          purpose: string
          revision?: number
          started_at?: string | null
          status: string
          summary: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          actual_units_produced?: number | null
          actual_yield?: number | null
          actual_yield_unit?: string | null
          completed_at?: string | null
          created_at?: string
          formula_id?: string
          formula_version_id?: string
          id?: string
          material_policy_version?: string
          notes?: string
          output_stage_completed_at?: string | null
          output_stage_completed_by?: string | null
          output_stage_status?: string
          owner_id?: string
          planned_batch_size?: number
          planned_batch_unit?: string
          planned_units?: number | null
          product_id?: string
          production_run_number?: string
          purpose?: string
          revision?: number
          started_at?: string | null
          status?: string
          summary?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_workspace_id_formula_id_fkey"
            columns: ["workspace_id", "formula_id"]
            isOneToOne: false
            referencedRelation: "formulas"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_runs_workspace_id_formula_version_id_fkey"
            columns: ["workspace_id", "formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "production_runs_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          created_at: string
          current_approved_formula_version_id: string | null
          current_development_formula_version_id: string | null
          description: string
          development_stage: string
          id: string
          name: string
          owner_id: string
          scent_profile: string
          status: string
          target_launch_date: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category: string
          created_at: string
          current_approved_formula_version_id?: string | null
          current_development_formula_version_id?: string | null
          description: string
          development_stage: string
          id: string
          name: string
          owner_id: string
          scent_profile: string
          status: string
          target_launch_date?: string | null
          updated_at: string
          workspace_id: string
        }
        Update: {
          category?: string
          created_at?: string
          current_approved_formula_version_id?: string | null
          current_development_formula_version_id?: string | null
          description?: string
          development_stage?: string
          id?: string
          name?: string
          owner_id?: string
          scent_profile?: string
          status?: string
          target_launch_date?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_workspace_id_current_approved_formula_version_id_fkey"
            columns: ["workspace_id", "current_approved_formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "products_workspace_id_current_development_formula_version__fkey"
            columns: ["workspace_id", "current_development_formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_audit_events: {
        Row: {
          actor_id: string
          event_type: string
          handoff_key: string | null
          id: string
          metadata: Json
          new_state: string | null
          occurred_at: string
          owner_id: string
          prior_state: string | null
          purchase_order_id: string
          reason: string
          source_purchase_plan_basket_id: string | null
          source_purchase_plan_id: string
          source_purchase_plan_version: number | null
          supplier_id: string
          workspace_id: string
        }
        Insert: {
          actor_id: string
          event_type: string
          handoff_key?: string | null
          id?: string
          metadata?: Json
          new_state?: string | null
          occurred_at?: string
          owner_id: string
          prior_state?: string | null
          purchase_order_id: string
          reason?: string
          source_purchase_plan_basket_id?: string | null
          source_purchase_plan_id: string
          source_purchase_plan_version?: number | null
          supplier_id: string
          workspace_id: string
        }
        Update: {
          actor_id?: string
          event_type?: string
          handoff_key?: string | null
          id?: string
          metadata?: Json
          new_state?: string | null
          occurred_at?: string
          owner_id?: string
          prior_state?: string | null
          purchase_order_id?: string
          reason?: string
          source_purchase_plan_basket_id?: string | null
          source_purchase_plan_id?: string
          source_purchase_plan_version?: number | null
          supplier_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_audit_events_workspace_id_purchase_order_id_fkey"
            columns: ["workspace_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_audit_events_workspace_id_source_purchase__fkey1"
            columns: ["workspace_id", "source_purchase_plan_basket_id"]
            isOneToOne: false
            referencedRelation: "purchase_plan_baskets"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_audit_events_workspace_id_source_purchase_p_fkey"
            columns: ["workspace_id", "source_purchase_plan_id"]
            isOneToOne: false
            referencedRelation: "purchase_plans"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_audit_events_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_order_confirmation_lines: {
        Row: {
          availability_state: string
          compatibility_evidence: Json
          confirmation_id: string
          confirmed_line_subtotal: number
          confirmed_package_count: number
          confirmed_package_size: number
          confirmed_package_unit: string
          confirmed_product_identity: string
          confirmed_quantity: number
          confirmed_sku: string
          confirmed_snapshot: Json
          confirmed_unit_price: number
          confirmed_variant: string
          created_at: string
          expected_dispatch_date: string | null
          expected_restock_date: string | null
          id: string
          mismatch_classification: string
          ordered_package_count: number
          ordered_package_size: number
          ordered_product_snapshot: Json
          ordered_quantity: number
          ordered_unit: string
          owner_decision: string
          owner_decision_reason: string
          owner_id: string
          placement_line_subtotal: number | null
          placement_unit_price: number | null
          purchase_order_id: string
          purchase_order_line_id: string
          supplier_line_note: string
          supplier_product_id: string | null
          workspace_id: string
        }
        Insert: {
          availability_state: string
          compatibility_evidence?: Json
          confirmation_id: string
          confirmed_line_subtotal: number
          confirmed_package_count: number
          confirmed_package_size: number
          confirmed_package_unit: string
          confirmed_product_identity: string
          confirmed_quantity: number
          confirmed_sku?: string
          confirmed_snapshot: Json
          confirmed_unit_price: number
          confirmed_variant?: string
          created_at?: string
          expected_dispatch_date?: string | null
          expected_restock_date?: string | null
          id?: string
          mismatch_classification: string
          ordered_package_count: number
          ordered_package_size: number
          ordered_product_snapshot: Json
          ordered_quantity: number
          ordered_unit: string
          owner_decision?: string
          owner_decision_reason?: string
          owner_id: string
          placement_line_subtotal?: number | null
          placement_unit_price?: number | null
          purchase_order_id: string
          purchase_order_line_id: string
          supplier_line_note?: string
          supplier_product_id?: string | null
          workspace_id: string
        }
        Update: {
          availability_state?: string
          compatibility_evidence?: Json
          confirmation_id?: string
          confirmed_line_subtotal?: number
          confirmed_package_count?: number
          confirmed_package_size?: number
          confirmed_package_unit?: string
          confirmed_product_identity?: string
          confirmed_quantity?: number
          confirmed_sku?: string
          confirmed_snapshot?: Json
          confirmed_unit_price?: number
          confirmed_variant?: string
          created_at?: string
          expected_dispatch_date?: string | null
          expected_restock_date?: string | null
          id?: string
          mismatch_classification?: string
          ordered_package_count?: number
          ordered_package_size?: number
          ordered_product_snapshot?: Json
          ordered_quantity?: number
          ordered_unit?: string
          owner_decision?: string
          owner_decision_reason?: string
          owner_id?: string
          placement_line_subtotal?: number | null
          placement_unit_price?: number | null
          purchase_order_id?: string
          purchase_order_line_id?: string
          supplier_line_note?: string
          supplier_product_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_confirmation__workspace_id_purchase_order__fkey1"
            columns: ["workspace_id", "purchase_order_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_confirmation_l_workspace_id_confirmation_id_fkey"
            columns: ["workspace_id", "confirmation_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_confirmations"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_confirmation_l_workspace_id_purchase_order__fkey"
            columns: ["workspace_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_order_confirmations: {
        Row: {
          acceptance_status: string
          classification: string
          confirmation_type: string
          confirmation_version: number
          confirmed_currency: string
          confirmed_discount: number | null
          confirmed_grand_total: number
          confirmed_merchandise_subtotal: number | null
          confirmed_shipping: number | null
          confirmed_tax: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string
          estimated_delivery_date: string | null
          estimated_dispatch_date: string | null
          evidence_reference: string
          evidence_type: string
          id: string
          idempotency_key: string
          lifecycle_status: string
          owner_id: string
          payload_fingerprint: string
          payment_acknowledgement_state: string
          policy_version: string
          purchase_order_id: string
          recorded_at: string
          recorded_by: string
          response_channel: string
          revision: number
          source_placement_revision: number
          source_url: string | null
          superseded_at: string | null
          supersedes_confirmation_id: string | null
          supplier_confirmation_date: string
          supplier_confirmation_reference: string
          supplier_id: string
          supplier_message_summary: string
          supplier_notes: string
          supplier_representative: string
          unresolved_post_shipment_costs: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          acceptance_status?: string
          classification: string
          confirmation_type?: string
          confirmation_version: number
          confirmed_currency: string
          confirmed_discount?: number | null
          confirmed_grand_total: number
          confirmed_merchandise_subtotal?: number | null
          confirmed_shipping?: number | null
          confirmed_tax?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string
          estimated_delivery_date?: string | null
          estimated_dispatch_date?: string | null
          evidence_reference: string
          evidence_type: string
          id?: string
          idempotency_key: string
          lifecycle_status?: string
          owner_id: string
          payload_fingerprint: string
          payment_acknowledgement_state?: string
          policy_version?: string
          purchase_order_id: string
          recorded_at?: string
          recorded_by: string
          response_channel?: string
          revision?: number
          source_placement_revision: number
          source_url?: string | null
          superseded_at?: string | null
          supersedes_confirmation_id?: string | null
          supplier_confirmation_date: string
          supplier_confirmation_reference: string
          supplier_id: string
          supplier_message_summary?: string
          supplier_notes?: string
          supplier_representative?: string
          unresolved_post_shipment_costs?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          acceptance_status?: string
          classification?: string
          confirmation_type?: string
          confirmation_version?: number
          confirmed_currency?: string
          confirmed_discount?: number | null
          confirmed_grand_total?: number
          confirmed_merchandise_subtotal?: number | null
          confirmed_shipping?: number | null
          confirmed_tax?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string
          estimated_delivery_date?: string | null
          estimated_dispatch_date?: string | null
          evidence_reference?: string
          evidence_type?: string
          id?: string
          idempotency_key?: string
          lifecycle_status?: string
          owner_id?: string
          payload_fingerprint?: string
          payment_acknowledgement_state?: string
          policy_version?: string
          purchase_order_id?: string
          recorded_at?: string
          recorded_by?: string
          response_channel?: string
          revision?: number
          source_placement_revision?: number
          source_url?: string | null
          superseded_at?: string | null
          supersedes_confirmation_id?: string | null
          supplier_confirmation_date?: string
          supplier_confirmation_reference?: string
          supplier_id?: string
          supplier_message_summary?: string
          supplier_notes?: string
          supplier_representative?: string
          unresolved_post_shipment_costs?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_confirmations_supersedes_confirmation_id_fkey"
            columns: ["supersedes_confirmation_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_confirmations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_confirmations_workspace_id_purchase_order_i_fkey"
            columns: ["workspace_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_confirmations_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          actual_discount_allocation: number | null
          actual_line_subtotal: number | null
          actual_package_count: number | null
          actual_stock_state: string | null
          actual_tax_allocation: number | null
          actual_unit_price: number | null
          canonical_ingredient_id: string | null
          created_at: string
          currency: string | null
          discount_allocation: number | null
          documentation_snapshot: Json
          effective_cost_per_unit: number | null
          effective_unit_price: number | null
          effective_value_source: string | null
          expected_landed_cost: number | null
          expected_surplus: number | null
          expected_unit_price: number | null
          id: string
          inci_snapshot: string | null
          ingredient_name_snapshot: string | null
          legacy_received_quantity: number | null
          legacy_receiving_state: string | null
          line_subtotal: number | null
          moq_adjusted_package_count: number | null
          notes: string
          ordered_package_count: number | null
          ordered_quantity: number
          ordered_unit: string
          owner_id: string
          package_size: number | null
          package_unit: string | null
          placement_actual_snapshot: Json
          placement_mismatch_state: string | null
          product_name_snapshot: string
          product_snapshot: Json
          product_url_snapshot: string | null
          purchase_order_id: string
          required_quantity: number | null
          required_unit: string | null
          shipping_allocation: number | null
          source_purchase_plan_basket_id: string | null
          source_purchase_plan_line_id: string
          source_requirement_id: string | null
          source_scenario_line_id: string | null
          supplier_product_id: string | null
          supplier_sku_snapshot: string | null
          tax_allocation: number | null
          unit_price: number | null
          variant_snapshot: string | null
          verification_snapshot: Json
          verified_unit_price: number | null
          workspace_id: string
        }
        Insert: {
          actual_discount_allocation?: number | null
          actual_line_subtotal?: number | null
          actual_package_count?: number | null
          actual_stock_state?: string | null
          actual_tax_allocation?: number | null
          actual_unit_price?: number | null
          canonical_ingredient_id?: string | null
          created_at?: string
          currency?: string | null
          discount_allocation?: number | null
          documentation_snapshot?: Json
          effective_cost_per_unit?: number | null
          effective_unit_price?: number | null
          effective_value_source?: string | null
          expected_landed_cost?: number | null
          expected_surplus?: number | null
          expected_unit_price?: number | null
          id?: string
          inci_snapshot?: string | null
          ingredient_name_snapshot?: string | null
          legacy_received_quantity?: number | null
          legacy_receiving_state?: string | null
          line_subtotal?: number | null
          moq_adjusted_package_count?: number | null
          notes?: string
          ordered_package_count?: number | null
          ordered_quantity: number
          ordered_unit: string
          owner_id: string
          package_size?: number | null
          package_unit?: string | null
          placement_actual_snapshot?: Json
          placement_mismatch_state?: string | null
          product_name_snapshot: string
          product_snapshot?: Json
          product_url_snapshot?: string | null
          purchase_order_id: string
          required_quantity?: number | null
          required_unit?: string | null
          shipping_allocation?: number | null
          source_purchase_plan_basket_id?: string | null
          source_purchase_plan_line_id: string
          source_requirement_id?: string | null
          source_scenario_line_id?: string | null
          supplier_product_id?: string | null
          supplier_sku_snapshot?: string | null
          tax_allocation?: number | null
          unit_price?: number | null
          variant_snapshot?: string | null
          verification_snapshot?: Json
          verified_unit_price?: number | null
          workspace_id: string
        }
        Update: {
          actual_discount_allocation?: number | null
          actual_line_subtotal?: number | null
          actual_package_count?: number | null
          actual_stock_state?: string | null
          actual_tax_allocation?: number | null
          actual_unit_price?: number | null
          canonical_ingredient_id?: string | null
          created_at?: string
          currency?: string | null
          discount_allocation?: number | null
          documentation_snapshot?: Json
          effective_cost_per_unit?: number | null
          effective_unit_price?: number | null
          effective_value_source?: string | null
          expected_landed_cost?: number | null
          expected_surplus?: number | null
          expected_unit_price?: number | null
          id?: string
          inci_snapshot?: string | null
          ingredient_name_snapshot?: string | null
          legacy_received_quantity?: number | null
          legacy_receiving_state?: string | null
          line_subtotal?: number | null
          moq_adjusted_package_count?: number | null
          notes?: string
          ordered_package_count?: number | null
          ordered_quantity?: number
          ordered_unit?: string
          owner_id?: string
          package_size?: number | null
          package_unit?: string | null
          placement_actual_snapshot?: Json
          placement_mismatch_state?: string | null
          product_name_snapshot?: string
          product_snapshot?: Json
          product_url_snapshot?: string | null
          purchase_order_id?: string
          required_quantity?: number | null
          required_unit?: string | null
          shipping_allocation?: number | null
          source_purchase_plan_basket_id?: string | null
          source_purchase_plan_line_id?: string
          source_requirement_id?: string | null
          source_scenario_line_id?: string | null
          supplier_product_id?: string | null
          supplier_sku_snapshot?: string | null
          tax_allocation?: number | null
          unit_price?: number | null
          variant_snapshot?: string | null
          verification_snapshot?: Json
          verified_unit_price?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_plan_basket_fk"
            columns: ["workspace_id", "source_purchase_plan_basket_id"]
            isOneToOne: false
            referencedRelation: "purchase_plan_baskets"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_lines_requirement_fk"
            columns: ["workspace_id", "source_requirement_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_requirements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_lines_scenario_line_fk"
            columns: ["workspace_id", "source_scenario_line_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_scenario_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_lines_workspace_id_purchase_order_id_fkey"
            columns: ["workspace_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_lines_workspace_id_source_purchase_plan_lin_fkey"
            columns: ["workspace_id", "source_purchase_plan_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_plan_lines"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_order_receipt_discrepancies: {
        Row: {
          actor_id: string
          affected_quantity: number
          description: string
          discrepancy_type: string
          evidence: Json
          id: string
          idempotency_key: string
          occurred_at: string
          owner_disposition: string
          owner_id: string
          payload_fingerprint: string
          reason: string
          receipt_id: string
          receipt_line_id: string | null
          resolution_status: string
          severity: string
          supplier_claim_reference: string
          supplier_claim_required: boolean
          supplier_responsibility_state: string
          unit: string
          workspace_id: string
        }
        Insert: {
          actor_id: string
          affected_quantity: number
          description: string
          discrepancy_type: string
          evidence?: Json
          id?: string
          idempotency_key: string
          occurred_at?: string
          owner_disposition: string
          owner_id: string
          payload_fingerprint: string
          reason: string
          receipt_id: string
          receipt_line_id?: string | null
          resolution_status?: string
          severity: string
          supplier_claim_reference?: string
          supplier_claim_required?: boolean
          supplier_responsibility_state?: string
          unit: string
          workspace_id: string
        }
        Update: {
          actor_id?: string
          affected_quantity?: number
          description?: string
          discrepancy_type?: string
          evidence?: Json
          id?: string
          idempotency_key?: string
          occurred_at?: string
          owner_disposition?: string
          owner_id?: string
          payload_fingerprint?: string
          reason?: string
          receipt_id?: string
          receipt_line_id?: string | null
          resolution_status?: string
          severity?: string
          supplier_claim_reference?: string
          supplier_claim_required?: boolean
          supplier_responsibility_state?: string
          unit?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_receipt_discre_workspace_id_receipt_line_id_fkey"
            columns: ["workspace_id", "receipt_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_receipt_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_receipt_discrepanci_workspace_id_receipt_id_fkey"
            columns: ["workspace_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_receipts"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_order_receipt_inspections: {
        Row: {
          checklist_snapshot: Json
          created_at: string
          evidence: Json
          id: string
          idempotency_key: string
          inspected_at: string
          inspected_by: string
          inspection_type: string
          inspection_version: number
          measured_values: Json
          notes: string
          owner_id: string
          payload_fingerprint: string
          policy_version: string
          receipt_id: string
          receipt_line_id: string | null
          result: string
          supersedes_inspection_id: string | null
          workspace_id: string
        }
        Insert: {
          checklist_snapshot: Json
          created_at?: string
          evidence?: Json
          id?: string
          idempotency_key: string
          inspected_at?: string
          inspected_by: string
          inspection_type: string
          inspection_version: number
          measured_values?: Json
          notes?: string
          owner_id: string
          payload_fingerprint: string
          policy_version?: string
          receipt_id: string
          receipt_line_id?: string | null
          result: string
          supersedes_inspection_id?: string | null
          workspace_id: string
        }
        Update: {
          checklist_snapshot?: Json
          created_at?: string
          evidence?: Json
          id?: string
          idempotency_key?: string
          inspected_at?: string
          inspected_by?: string
          inspection_type?: string
          inspection_version?: number
          measured_values?: Json
          notes?: string
          owner_id?: string
          payload_fingerprint?: string
          policy_version?: string
          receipt_id?: string
          receipt_line_id?: string | null
          result?: string
          supersedes_inspection_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_receipt_inspec_workspace_id_receipt_line_id_fkey"
            columns: ["workspace_id", "receipt_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_receipt_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_receipt_inspection_supersedes_inspection_id_fkey"
            columns: ["supersedes_inspection_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_receipt_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_receipt_inspections_workspace_id_receipt_id_fkey"
            columns: ["workspace_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_receipts"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_order_receipt_lines: {
        Row: {
          best_before_date: string | null
          canonical_ingredient_id: string | null
          condition_checks: Json
          condition_status: string
          confirmation_line_id: string | null
          confirmed_package_count: number | null
          confirmed_quantity: number | null
          created_at: string
          damaged_quantity: number
          documentation_checks: Json
          documentation_references: Json
          expected_package_size: number
          expected_product: string
          expected_sku: string
          expected_unit: string
          expected_variant: string
          expiry_date: string | null
          held_quantity: number
          id: string
          idempotency_key: string
          identity_checks: Json
          identity_status: string
          line_status: string
          lot_evidence_reference: string
          lot_marking_location: string
          manufacturer_lot_number: string
          manufacturing_date: string | null
          material_profile: string
          opened_package_count: number
          ordered_package_count: number
          ordered_quantity: number
          owner_id: string
          packaging_component_id: string | null
          payload_fingerprint: string
          physical_line_note: string
          purchase_order_id: string
          purchase_order_line_id: string
          quarantine_candidate_quantity: number
          receipt_id: string
          received_package_count: number
          received_package_size: number
          received_package_unit: string
          received_product_name: string
          received_sku: string
          received_supplier_product_identity: string
          received_total_quantity: number
          received_variant: string
          recorded_at: string
          recorded_by: string
          rejected_quantity: number
          retest_date: string | null
          shipment_line_id: string | null
          shipped_package_count: number | null
          shipped_quantity: number | null
          source_order_snapshot: Json
          supplier_batch_number: string
          supplier_lot_number: string
          supplier_product_id: string | null
          unopened_package_count: number
          workspace_id: string
        }
        Insert: {
          best_before_date?: string | null
          canonical_ingredient_id?: string | null
          condition_checks?: Json
          condition_status: string
          confirmation_line_id?: string | null
          confirmed_package_count?: number | null
          confirmed_quantity?: number | null
          created_at?: string
          damaged_quantity?: number
          documentation_checks?: Json
          documentation_references?: Json
          expected_package_size: number
          expected_product: string
          expected_sku?: string
          expected_unit: string
          expected_variant?: string
          expiry_date?: string | null
          held_quantity?: number
          id?: string
          idempotency_key: string
          identity_checks?: Json
          identity_status: string
          line_status: string
          lot_evidence_reference?: string
          lot_marking_location?: string
          manufacturer_lot_number?: string
          manufacturing_date?: string | null
          material_profile?: string
          opened_package_count?: number
          ordered_package_count: number
          ordered_quantity: number
          owner_id: string
          packaging_component_id?: string | null
          payload_fingerprint: string
          physical_line_note?: string
          purchase_order_id: string
          purchase_order_line_id: string
          quarantine_candidate_quantity?: number
          receipt_id: string
          received_package_count: number
          received_package_size: number
          received_package_unit: string
          received_product_name: string
          received_sku?: string
          received_supplier_product_identity: string
          received_total_quantity: number
          received_variant?: string
          recorded_at?: string
          recorded_by: string
          rejected_quantity?: number
          retest_date?: string | null
          shipment_line_id?: string | null
          shipped_package_count?: number | null
          shipped_quantity?: number | null
          source_order_snapshot: Json
          supplier_batch_number?: string
          supplier_lot_number?: string
          supplier_product_id?: string | null
          unopened_package_count?: number
          workspace_id: string
        }
        Update: {
          best_before_date?: string | null
          canonical_ingredient_id?: string | null
          condition_checks?: Json
          condition_status?: string
          confirmation_line_id?: string | null
          confirmed_package_count?: number | null
          confirmed_quantity?: number | null
          created_at?: string
          damaged_quantity?: number
          documentation_checks?: Json
          documentation_references?: Json
          expected_package_size?: number
          expected_product?: string
          expected_sku?: string
          expected_unit?: string
          expected_variant?: string
          expiry_date?: string | null
          held_quantity?: number
          id?: string
          idempotency_key?: string
          identity_checks?: Json
          identity_status?: string
          line_status?: string
          lot_evidence_reference?: string
          lot_marking_location?: string
          manufacturer_lot_number?: string
          manufacturing_date?: string | null
          material_profile?: string
          opened_package_count?: number
          ordered_package_count?: number
          ordered_quantity?: number
          owner_id?: string
          packaging_component_id?: string | null
          payload_fingerprint?: string
          physical_line_note?: string
          purchase_order_id?: string
          purchase_order_line_id?: string
          quarantine_candidate_quantity?: number
          receipt_id?: string
          received_package_count?: number
          received_package_size?: number
          received_package_unit?: string
          received_product_name?: string
          received_sku?: string
          received_supplier_product_identity?: string
          received_total_quantity?: number
          received_variant?: string
          recorded_at?: string
          recorded_by?: string
          rejected_quantity?: number
          retest_date?: string | null
          shipment_line_id?: string | null
          shipped_package_count?: number | null
          shipped_quantity?: number | null
          source_order_snapshot?: Json
          supplier_batch_number?: string
          supplier_lot_number?: string
          supplier_product_id?: string | null
          unopened_package_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_receipt_lines_workspace_id_confirmation_lin_fkey"
            columns: ["workspace_id", "confirmation_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_confirmation_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_receipt_lines_workspace_id_purchase_order_i_fkey"
            columns: ["workspace_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_receipt_lines_workspace_id_purchase_order_l_fkey"
            columns: ["workspace_id", "purchase_order_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_receipt_lines_workspace_id_receipt_id_fkey"
            columns: ["workspace_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_receipts"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_receipt_lines_workspace_id_shipment_line_id_fkey"
            columns: ["workspace_id", "shipment_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_shipment_lines"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_order_receipt_shipments: {
        Row: {
          carrier_delivery_reported_at: string | null
          carrier_snapshot: string
          created_at: string
          id: string
          owner_id: string
          purchase_order_id: string
          receipt_id: string
          shipment_id: string
          shipment_reference_snapshot: string
          tracking_number_snapshot: string
          workspace_id: string
        }
        Insert: {
          carrier_delivery_reported_at?: string | null
          carrier_snapshot: string
          created_at?: string
          id?: string
          owner_id: string
          purchase_order_id: string
          receipt_id: string
          shipment_id: string
          shipment_reference_snapshot: string
          tracking_number_snapshot: string
          workspace_id: string
        }
        Update: {
          carrier_delivery_reported_at?: string | null
          carrier_snapshot?: string
          created_at?: string
          id?: string
          owner_id?: string
          purchase_order_id?: string
          receipt_id?: string
          shipment_id?: string
          shipment_reference_snapshot?: string
          tracking_number_snapshot?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_receipt_shipme_workspace_id_purchase_order__fkey"
            columns: ["workspace_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_receipt_shipments_workspace_id_receipt_id_fkey"
            columns: ["workspace_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_receipts"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_receipt_shipments_workspace_id_shipment_id_fkey"
            columns: ["workspace_id", "shipment_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_shipments"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_order_receipts: {
        Row: {
          created_at: string
          delivery_note_reference: string
          evidence_reference: string
          evidence_type: string
          id: string
          idempotency_key: string
          outer_packaging_condition: string
          owner_id: string
          package_count_expected: number | null
          package_count_received: number
          packing_slip_reference: string
          payload_fingerprint: string
          photograph_reference: string
          physical_receipt_date: string
          physically_received_by: string
          policy_version: string
          purchase_order_id: string
          receipt_number: string
          receipt_sequence: number
          receiving_location: string
          receiving_notes: string
          recorded_at: string
          recorded_by: string
          revision: number
          source_url: string | null
          status: string
          supplier_id: string
          tamper_state: string
          temperature_concern_state: string
          updated_at: string
          visible_contamination_state: string
          water_damage_state: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          delivery_note_reference?: string
          evidence_reference: string
          evidence_type: string
          id?: string
          idempotency_key: string
          outer_packaging_condition: string
          owner_id: string
          package_count_expected?: number | null
          package_count_received: number
          packing_slip_reference?: string
          payload_fingerprint: string
          photograph_reference?: string
          physical_receipt_date: string
          physically_received_by: string
          policy_version?: string
          purchase_order_id: string
          receipt_number: string
          receipt_sequence: number
          receiving_location: string
          receiving_notes?: string
          recorded_at?: string
          recorded_by: string
          revision?: number
          source_url?: string | null
          status?: string
          supplier_id: string
          tamper_state: string
          temperature_concern_state: string
          updated_at?: string
          visible_contamination_state: string
          water_damage_state: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          delivery_note_reference?: string
          evidence_reference?: string
          evidence_type?: string
          id?: string
          idempotency_key?: string
          outer_packaging_condition?: string
          owner_id?: string
          package_count_expected?: number | null
          package_count_received?: number
          packing_slip_reference?: string
          payload_fingerprint?: string
          photograph_reference?: string
          physical_receipt_date?: string
          physically_received_by?: string
          policy_version?: string
          purchase_order_id?: string
          receipt_number?: string
          receipt_sequence?: number
          receiving_location?: string
          receiving_notes?: string
          recorded_at?: string
          recorded_by?: string
          revision?: number
          source_url?: string | null
          status?: string
          supplier_id?: string
          tamper_state?: string
          temperature_concern_state?: string
          updated_at?: string
          visible_contamination_state?: string
          water_damage_state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_receipts_workspace_id_purchase_order_id_fkey"
            columns: ["workspace_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_receipts_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_order_shipment_events: {
        Row: {
          actor_id: string
          event_type: string
          evidence: Json
          id: string
          metadata: Json
          new_state: string
          occurred_at: string
          owner_id: string
          prior_state: string | null
          purchase_order_id: string
          shipment_id: string
          source_key: string
          workspace_id: string
        }
        Insert: {
          actor_id: string
          event_type: string
          evidence?: Json
          id?: string
          metadata?: Json
          new_state: string
          occurred_at?: string
          owner_id: string
          prior_state?: string | null
          purchase_order_id: string
          shipment_id: string
          source_key: string
          workspace_id: string
        }
        Update: {
          actor_id?: string
          event_type?: string
          evidence?: Json
          id?: string
          metadata?: Json
          new_state?: string
          occurred_at?: string
          owner_id?: string
          prior_state?: string | null
          purchase_order_id?: string
          shipment_id?: string
          source_key?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_shipment_event_workspace_id_purchase_order__fkey"
            columns: ["workspace_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_shipment_events_workspace_id_shipment_id_fkey"
            columns: ["workspace_id", "shipment_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_shipments"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_order_shipment_lines: {
        Row: {
          backordered_remainder: number
          confirmation_line_id: string
          created_at: string
          id: string
          note: string
          owner_id: string
          package_unit: string
          purchase_order_id: string
          purchase_order_line_id: string
          shipment_id: string
          shipped_package_count: number
          shipped_quantity: number
          supplier_line_reference: string
          workspace_id: string
        }
        Insert: {
          backordered_remainder?: number
          confirmation_line_id: string
          created_at?: string
          id?: string
          note?: string
          owner_id: string
          package_unit: string
          purchase_order_id: string
          purchase_order_line_id: string
          shipment_id: string
          shipped_package_count: number
          shipped_quantity: number
          supplier_line_reference?: string
          workspace_id: string
        }
        Update: {
          backordered_remainder?: number
          confirmation_line_id?: string
          created_at?: string
          id?: string
          note?: string
          owner_id?: string
          package_unit?: string
          purchase_order_id?: string
          purchase_order_line_id?: string
          shipment_id?: string
          shipped_package_count?: number
          shipped_quantity?: number
          supplier_line_reference?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_shipment_line_workspace_id_purchase_order__fkey1"
            columns: ["workspace_id", "purchase_order_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_shipment_lines_workspace_id_confirmation_li_fkey"
            columns: ["workspace_id", "confirmation_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_confirmation_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_shipment_lines_workspace_id_purchase_order__fkey"
            columns: ["workspace_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_shipment_lines_workspace_id_shipment_id_fkey"
            columns: ["workspace_id", "shipment_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_shipments"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_order_shipments: {
        Row: {
          carrier: string
          confirmation_id: string
          created_at: string
          customs_documentation_state: string
          customs_reference: string
          dangerous_goods_state: string
          delivery_reported_at: string | null
          destination_country: string | null
          dispatch_date: string | null
          estimated_delivery_date: string | null
          evidence_reference: string
          evidence_type: string
          gross_weight: number | null
          id: string
          idempotency_key: string
          import_tracking_state: string
          origin_country: string | null
          owner_id: string
          package_count: number | null
          payload_fingerprint: string
          purchase_order_id: string
          recorded_at: string
          recorded_by: string
          revision: number
          service_level: string
          shipment_cost: number | null
          shipment_currency: string | null
          shipment_sequence: number
          shipping_notes: string
          source_url: string | null
          status: string
          supplier_id: string
          supplier_shipment_reference: string
          tracking_number: string
          tracking_url: string | null
          updated_at: string
          weight_unit: string | null
          workspace_id: string
        }
        Insert: {
          carrier?: string
          confirmation_id: string
          created_at?: string
          customs_documentation_state?: string
          customs_reference?: string
          dangerous_goods_state?: string
          delivery_reported_at?: string | null
          destination_country?: string | null
          dispatch_date?: string | null
          estimated_delivery_date?: string | null
          evidence_reference: string
          evidence_type: string
          gross_weight?: number | null
          id?: string
          idempotency_key: string
          import_tracking_state?: string
          origin_country?: string | null
          owner_id: string
          package_count?: number | null
          payload_fingerprint: string
          purchase_order_id: string
          recorded_at?: string
          recorded_by: string
          revision?: number
          service_level?: string
          shipment_cost?: number | null
          shipment_currency?: string | null
          shipment_sequence: number
          shipping_notes?: string
          source_url?: string | null
          status?: string
          supplier_id: string
          supplier_shipment_reference: string
          tracking_number?: string
          tracking_url?: string | null
          updated_at?: string
          weight_unit?: string | null
          workspace_id: string
        }
        Update: {
          carrier?: string
          confirmation_id?: string
          created_at?: string
          customs_documentation_state?: string
          customs_reference?: string
          dangerous_goods_state?: string
          delivery_reported_at?: string | null
          destination_country?: string | null
          dispatch_date?: string | null
          estimated_delivery_date?: string | null
          evidence_reference?: string
          evidence_type?: string
          gross_weight?: number | null
          id?: string
          idempotency_key?: string
          import_tracking_state?: string
          origin_country?: string | null
          owner_id?: string
          package_count?: number | null
          payload_fingerprint?: string
          purchase_order_id?: string
          recorded_at?: string
          recorded_by?: string
          revision?: number
          service_level?: string
          shipment_cost?: number | null
          shipment_currency?: string | null
          shipment_sequence?: number
          shipping_notes?: string
          source_url?: string | null
          status?: string
          supplier_id?: string
          supplier_shipment_reference?: string
          tracking_number?: string
          tracking_url?: string | null
          updated_at?: string
          weight_unit?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_shipments_workspace_id_confirmation_id_fkey"
            columns: ["workspace_id", "confirmation_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_confirmations"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_shipments_workspace_id_purchase_order_id_fkey"
            columns: ["workspace_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_shipments_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          actual_base_currency_estimate: number | null
          actual_currency: string | null
          actual_customs: number | null
          actual_discount: number | null
          actual_duty: number | null
          actual_exchange_rate: number | null
          actual_grand_total: number | null
          actual_handling: number | null
          actual_import_vat: number | null
          actual_merchandise_subtotal: number | null
          actual_shipping: number | null
          actual_vat: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          checkout_tax_state: string | null
          commercial_snapshot: Json
          confirmation_state: string
          created_at: string
          created_by: string
          currency: string | null
          discount: number | null
          discount_code_used: string | null
          draft_created_at: string | null
          draft_version: number
          external_order_date: string | null
          first_order_discount_applied: boolean | null
          free_shipping_achieved: boolean | null
          handoff_key: string | null
          handoff_policy_version: string | null
          id: string
          import_cost_state: string | null
          legacy_migration: Json
          manual_checkout_checklist: Json
          merchandise_subtotal: number | null
          notes: string
          order_reference: string | null
          order_url: string | null
          owner_id: string
          payment_method_category: string | null
          payment_reference: string | null
          payment_state_recorded: string | null
          payment_status: string
          placed_at: string | null
          placed_by: string | null
          placement_classification: string | null
          placement_comparison: Json
          placement_evidence: Json
          placement_fingerprint: string | null
          placement_key: string | null
          placement_notes: string
          placement_policy_version: string | null
          placement_revision: number | null
          placement_warnings: string[]
          requires_receiving_review: boolean
          revision: number
          shipping: number | null
          source_purchase_plan_basket_id: string | null
          source_purchase_plan_id: string
          source_purchase_plan_revision: number
          source_purchase_plan_version: number | null
          source_round_id: string | null
          source_scenario_id: string | null
          status: string
          supplier_id: string
          supplier_order_number: string | null
          supplier_snapshot: Json
          supplier_url_snapshot: string | null
          tax: number | null
          total: number | null
          unresolved_post_checkout_costs: string[]
          updated_at: string
          verification_snapshot: Json
          workspace_id: string
        }
        Insert: {
          actual_base_currency_estimate?: number | null
          actual_currency?: string | null
          actual_customs?: number | null
          actual_discount?: number | null
          actual_duty?: number | null
          actual_exchange_rate?: number | null
          actual_grand_total?: number | null
          actual_handling?: number | null
          actual_import_vat?: number | null
          actual_merchandise_subtotal?: number | null
          actual_shipping?: number | null
          actual_vat?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checkout_tax_state?: string | null
          commercial_snapshot?: Json
          confirmation_state?: string
          created_at?: string
          created_by: string
          currency?: string | null
          discount?: number | null
          discount_code_used?: string | null
          draft_created_at?: string | null
          draft_version?: number
          external_order_date?: string | null
          first_order_discount_applied?: boolean | null
          free_shipping_achieved?: boolean | null
          handoff_key?: string | null
          handoff_policy_version?: string | null
          id?: string
          import_cost_state?: string | null
          legacy_migration?: Json
          manual_checkout_checklist?: Json
          merchandise_subtotal?: number | null
          notes?: string
          order_reference?: string | null
          order_url?: string | null
          owner_id: string
          payment_method_category?: string | null
          payment_reference?: string | null
          payment_state_recorded?: string | null
          payment_status?: string
          placed_at?: string | null
          placed_by?: string | null
          placement_classification?: string | null
          placement_comparison?: Json
          placement_evidence?: Json
          placement_fingerprint?: string | null
          placement_key?: string | null
          placement_notes?: string
          placement_policy_version?: string | null
          placement_revision?: number | null
          placement_warnings?: string[]
          requires_receiving_review?: boolean
          revision?: number
          shipping?: number | null
          source_purchase_plan_basket_id?: string | null
          source_purchase_plan_id: string
          source_purchase_plan_revision: number
          source_purchase_plan_version?: number | null
          source_round_id?: string | null
          source_scenario_id?: string | null
          status?: string
          supplier_id: string
          supplier_order_number?: string | null
          supplier_snapshot?: Json
          supplier_url_snapshot?: string | null
          tax?: number | null
          total?: number | null
          unresolved_post_checkout_costs?: string[]
          updated_at?: string
          verification_snapshot?: Json
          workspace_id: string
        }
        Update: {
          actual_base_currency_estimate?: number | null
          actual_currency?: string | null
          actual_customs?: number | null
          actual_discount?: number | null
          actual_duty?: number | null
          actual_exchange_rate?: number | null
          actual_grand_total?: number | null
          actual_handling?: number | null
          actual_import_vat?: number | null
          actual_merchandise_subtotal?: number | null
          actual_shipping?: number | null
          actual_vat?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checkout_tax_state?: string | null
          commercial_snapshot?: Json
          confirmation_state?: string
          created_at?: string
          created_by?: string
          currency?: string | null
          discount?: number | null
          discount_code_used?: string | null
          draft_created_at?: string | null
          draft_version?: number
          external_order_date?: string | null
          first_order_discount_applied?: boolean | null
          free_shipping_achieved?: boolean | null
          handoff_key?: string | null
          handoff_policy_version?: string | null
          id?: string
          import_cost_state?: string | null
          legacy_migration?: Json
          manual_checkout_checklist?: Json
          merchandise_subtotal?: number | null
          notes?: string
          order_reference?: string | null
          order_url?: string | null
          owner_id?: string
          payment_method_category?: string | null
          payment_reference?: string | null
          payment_state_recorded?: string | null
          payment_status?: string
          placed_at?: string | null
          placed_by?: string | null
          placement_classification?: string | null
          placement_comparison?: Json
          placement_evidence?: Json
          placement_fingerprint?: string | null
          placement_key?: string | null
          placement_notes?: string
          placement_policy_version?: string | null
          placement_revision?: number | null
          placement_warnings?: string[]
          requires_receiving_review?: boolean
          revision?: number
          shipping?: number | null
          source_purchase_plan_basket_id?: string | null
          source_purchase_plan_id?: string
          source_purchase_plan_revision?: number
          source_purchase_plan_version?: number | null
          source_round_id?: string | null
          source_scenario_id?: string | null
          status?: string
          supplier_id?: string
          supplier_order_number?: string | null
          supplier_snapshot?: Json
          supplier_url_snapshot?: string | null
          tax?: number | null
          total?: number | null
          unresolved_post_checkout_costs?: string[]
          updated_at?: string
          verification_snapshot?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_plan_basket_fk"
            columns: ["workspace_id", "source_purchase_plan_basket_id"]
            isOneToOne: false
            referencedRelation: "purchase_plan_baskets"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_orders_source_round_fk"
            columns: ["workspace_id", "source_round_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_rounds"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_orders_source_scenario_fk"
            columns: ["workspace_id", "source_scenario_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_scenarios"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_orders_workspace_id_source_purchase_plan_id_fkey"
            columns: ["workspace_id", "source_purchase_plan_id"]
            isOneToOne: false
            referencedRelation: "purchase_plans"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_orders_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_plan_audit_events: {
        Row: {
          actor_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
          new_state: string | null
          occurred_at: string
          owner_id: string
          plan_version: number
          prior_state: string | null
          purchase_plan_id: string
          reason: string
          source_scenario_id: string | null
          workspace_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          new_state?: string | null
          occurred_at?: string
          owner_id: string
          plan_version: number
          prior_state?: string | null
          purchase_plan_id: string
          reason?: string
          source_scenario_id?: string | null
          workspace_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          new_state?: string | null
          occurred_at?: string
          owner_id?: string
          plan_version?: number
          prior_state?: string | null
          purchase_plan_id?: string
          reason?: string
          source_scenario_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_plan_audit_events_workspace_id_purchase_plan_id_fkey"
            columns: ["workspace_id", "purchase_plan_id"]
            isOneToOne: false
            referencedRelation: "purchase_plans"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_plan_audit_events_workspace_id_source_scenario_id_fkey"
            columns: ["workspace_id", "source_scenario_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_scenarios"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_plan_baskets: {
        Row: {
          commercial_assumption_snapshot: Json
          commercial_warnings: string[]
          confirmed_discount: number
          confirmed_total: number | null
          created_at: string
          currency: string
          customs: number | null
          customs_state: string
          eligible_subtotal: number
          estimated_discount: number
          estimated_total: number | null
          first_order_discount_state: Json
          free_shipping_state: Json
          freshness_states: Json
          handling: number | null
          handling_state: string
          id: string
          import_vat: number | null
          import_vat_state: string
          known_minimum: number
          merchandise_subtotal: number
          owner_id: string
          post_discount_subtotal: number
          purchase_plan_id: string
          range_maximum: number | null
          range_minimum: number | null
          shipping: number | null
          shipping_state: string
          source_calculation_version: string
          source_scenario_basket_id: string | null
          supplier_id: string
          supplier_name_snapshot: string
          supplier_url_snapshot: string | null
          vat: number | null
          vat_state: string
          verification_completed_count: number
          verification_required_count: number
          workspace_id: string
        }
        Insert: {
          commercial_assumption_snapshot?: Json
          commercial_warnings?: string[]
          confirmed_discount: number
          confirmed_total?: number | null
          created_at?: string
          currency: string
          customs?: number | null
          customs_state: string
          eligible_subtotal: number
          estimated_discount: number
          estimated_total?: number | null
          first_order_discount_state?: Json
          free_shipping_state?: Json
          freshness_states?: Json
          handling?: number | null
          handling_state: string
          id?: string
          import_vat?: number | null
          import_vat_state: string
          known_minimum: number
          merchandise_subtotal: number
          owner_id: string
          post_discount_subtotal: number
          purchase_plan_id: string
          range_maximum?: number | null
          range_minimum?: number | null
          shipping?: number | null
          shipping_state: string
          source_calculation_version: string
          source_scenario_basket_id?: string | null
          supplier_id: string
          supplier_name_snapshot: string
          supplier_url_snapshot?: string | null
          vat?: number | null
          vat_state: string
          verification_completed_count?: number
          verification_required_count?: number
          workspace_id: string
        }
        Update: {
          commercial_assumption_snapshot?: Json
          commercial_warnings?: string[]
          confirmed_discount?: number
          confirmed_total?: number | null
          created_at?: string
          currency?: string
          customs?: number | null
          customs_state?: string
          eligible_subtotal?: number
          estimated_discount?: number
          estimated_total?: number | null
          first_order_discount_state?: Json
          free_shipping_state?: Json
          freshness_states?: Json
          handling?: number | null
          handling_state?: string
          id?: string
          import_vat?: number | null
          import_vat_state?: string
          known_minimum?: number
          merchandise_subtotal?: number
          owner_id?: string
          post_discount_subtotal?: number
          purchase_plan_id?: string
          range_maximum?: number | null
          range_minimum?: number | null
          shipping?: number | null
          shipping_state?: string
          source_calculation_version?: string
          source_scenario_basket_id?: string | null
          supplier_id?: string
          supplier_name_snapshot?: string
          supplier_url_snapshot?: string | null
          vat?: number | null
          vat_state?: string
          verification_completed_count?: number
          verification_required_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_plan_baskets_workspace_id_purchase_plan_id_fkey"
            columns: ["workspace_id", "purchase_plan_id"]
            isOneToOne: false
            referencedRelation: "purchase_plans"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_plan_baskets_workspace_id_source_scenario_basket__fkey"
            columns: ["workspace_id", "source_scenario_basket_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_scenario_baskets"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_plan_baskets_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_plan_lines: {
        Row: {
          allocated_discount: number | null
          allocated_shipping: number | null
          canonical_ingredient_id: string | null
          created_at: string
          currency: string | null
          description: string
          display_order: number
          documentation_state: Json
          effective_cost_per_unit: number | null
          estimated_line_total: number | null
          estimated_unit_price: number | null
          expected_landed_cost: number | null
          expected_surplus: number | null
          id: string
          inci_snapshot: string | null
          ingredient_name_snapshot: string | null
          inventory_domain: string
          moq_adjusted_pack_count: number | null
          owner_id: string
          pack_count: number | null
          pack_size: number | null
          planned_quantity: number
          price_freshness: string | null
          product_url_snapshot: string | null
          purchase_plan_basket_id: string | null
          purchase_plan_id: string
          purchased_quantity: number | null
          received_quantity: number
          required_quantity: number | null
          requirement_basis: Json
          requirement_reason: string | null
          snapshot_warnings: string[]
          source_quote_line_id: string | null
          source_requirement_id: string | null
          source_scenario_line_id: string | null
          source_selection_revision: number | null
          source_snapshot: Json
          stock_freshness: string | null
          supplier_product_id: string | null
          supplier_product_name_snapshot: string | null
          unit: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          allocated_discount?: number | null
          allocated_shipping?: number | null
          canonical_ingredient_id?: string | null
          created_at?: string
          currency?: string | null
          description: string
          display_order?: number
          documentation_state?: Json
          effective_cost_per_unit?: number | null
          estimated_line_total?: number | null
          estimated_unit_price?: number | null
          expected_landed_cost?: number | null
          expected_surplus?: number | null
          id?: string
          inci_snapshot?: string | null
          ingredient_name_snapshot?: string | null
          inventory_domain: string
          moq_adjusted_pack_count?: number | null
          owner_id: string
          pack_count?: number | null
          pack_size?: number | null
          planned_quantity: number
          price_freshness?: string | null
          product_url_snapshot?: string | null
          purchase_plan_basket_id?: string | null
          purchase_plan_id: string
          purchased_quantity?: number | null
          received_quantity?: number
          required_quantity?: number | null
          requirement_basis?: Json
          requirement_reason?: string | null
          snapshot_warnings?: string[]
          source_quote_line_id?: string | null
          source_requirement_id?: string | null
          source_scenario_line_id?: string | null
          source_selection_revision?: number | null
          source_snapshot?: Json
          stock_freshness?: string | null
          supplier_product_id?: string | null
          supplier_product_name_snapshot?: string | null
          unit: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          allocated_discount?: number | null
          allocated_shipping?: number | null
          canonical_ingredient_id?: string | null
          created_at?: string
          currency?: string | null
          description?: string
          display_order?: number
          documentation_state?: Json
          effective_cost_per_unit?: number | null
          estimated_line_total?: number | null
          estimated_unit_price?: number | null
          expected_landed_cost?: number | null
          expected_surplus?: number | null
          id?: string
          inci_snapshot?: string | null
          ingredient_name_snapshot?: string | null
          inventory_domain?: string
          moq_adjusted_pack_count?: number | null
          owner_id?: string
          pack_count?: number | null
          pack_size?: number | null
          planned_quantity?: number
          price_freshness?: string | null
          product_url_snapshot?: string | null
          purchase_plan_basket_id?: string | null
          purchase_plan_id?: string
          purchased_quantity?: number | null
          received_quantity?: number
          required_quantity?: number | null
          requirement_basis?: Json
          requirement_reason?: string | null
          snapshot_warnings?: string[]
          source_quote_line_id?: string | null
          source_requirement_id?: string | null
          source_scenario_line_id?: string | null
          source_selection_revision?: number | null
          source_snapshot?: Json
          stock_freshness?: string | null
          supplier_product_id?: string | null
          supplier_product_name_snapshot?: string | null
          unit?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_plan_lines_basket_fk"
            columns: ["workspace_id", "purchase_plan_basket_id"]
            isOneToOne: false
            referencedRelation: "purchase_plan_baskets"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_plan_lines_requirement_fk"
            columns: ["workspace_id", "source_requirement_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_requirements"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_plan_lines_scenario_line_fk"
            columns: ["workspace_id", "source_scenario_line_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_scenario_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_plan_lines_source_quote_line_id_fkey"
            columns: ["source_quote_line_id"]
            isOneToOne: false
            referencedRelation: "supplier_quote_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_plan_lines_workspace_id_purchase_plan_id_fkey"
            columns: ["workspace_id", "purchase_plan_id"]
            isOneToOne: false
            referencedRelation: "purchase_plans"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_plan_verifications: {
        Row: {
          category: string
          created_at: string
          evidence_reference: string | null
          expected_unit_or_currency: string | null
          expected_value: Json
          field: string
          id: string
          mismatch_classification: string
          note: string
          owner_id: string
          plan_version: number
          policy_version: string
          purchase_plan_basket_id: string | null
          purchase_plan_id: string
          purchase_plan_line_id: string | null
          requirement_reason: string
          resolution_state: string
          revision: number
          severity: string
          source_freshness: string | null
          supplier_id: string | null
          updated_at: string
          verification_method: string | null
          verification_state: string
          verified_at: string | null
          verified_by: string | null
          verified_unit_or_currency: string | null
          verified_value: Json | null
          workspace_id: string
        }
        Insert: {
          category: string
          created_at?: string
          evidence_reference?: string | null
          expected_unit_or_currency?: string | null
          expected_value?: Json
          field: string
          id?: string
          mismatch_classification?: string
          note?: string
          owner_id: string
          plan_version: number
          policy_version?: string
          purchase_plan_basket_id?: string | null
          purchase_plan_id: string
          purchase_plan_line_id?: string | null
          requirement_reason: string
          resolution_state?: string
          revision?: number
          severity: string
          source_freshness?: string | null
          supplier_id?: string | null
          updated_at?: string
          verification_method?: string | null
          verification_state?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_unit_or_currency?: string | null
          verified_value?: Json | null
          workspace_id: string
        }
        Update: {
          category?: string
          created_at?: string
          evidence_reference?: string | null
          expected_unit_or_currency?: string | null
          expected_value?: Json
          field?: string
          id?: string
          mismatch_classification?: string
          note?: string
          owner_id?: string
          plan_version?: number
          policy_version?: string
          purchase_plan_basket_id?: string | null
          purchase_plan_id?: string
          purchase_plan_line_id?: string | null
          requirement_reason?: string
          resolution_state?: string
          revision?: number
          severity?: string
          source_freshness?: string | null
          supplier_id?: string | null
          updated_at?: string
          verification_method?: string | null
          verification_state?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_unit_or_currency?: string | null
          verified_value?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_plan_verifications_workspace_id_purchase_plan_bas_fkey"
            columns: ["workspace_id", "purchase_plan_basket_id"]
            isOneToOne: false
            referencedRelation: "purchase_plan_baskets"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_plan_verifications_workspace_id_purchase_plan_id_fkey"
            columns: ["workspace_id", "purchase_plan_id"]
            isOneToOne: false
            referencedRelation: "purchase_plans"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_plan_verifications_workspace_id_purchase_plan_lin_fkey"
            columns: ["workspace_id", "purchase_plan_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_plan_lines"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_plan_verifications_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      purchase_plans: {
        Row: {
          approval_key: string | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          base_currency: string | null
          blocker_count: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_total: number | null
          created_at: string
          creation_key: string
          currency: string | null
          estimated_landed_total: number | null
          estimated_merchandise_total: number | null
          external_order_key: string | null
          id: string
          internal_notes: string
          known_minimum: number | null
          line_count: number | null
          mixed_currency: boolean
          ordered_at: string | null
          owner_id: string
          plan_version: number | null
          production_procurement_round_id: string | null
          purpose: string
          range_maximum: number | null
          range_minimum: number | null
          revision: number
          snapshot_version: string | null
          source_calculation_version: string | null
          source_id: string | null
          source_scenario_id: string | null
          source_scenario_revision: number | null
          source_snapshot: Json
          source_type: string | null
          status: string
          strategy: string | null
          strategy_explanation: string[]
          superseded_at: string | null
          superseded_by: string | null
          supplier_count: number | null
          supplier_id: string | null
          target_date: string | null
          title: string
          unknown_component_count: number | null
          updated_at: string
          verification_revision: number
          warning_count: number | null
          workspace_id: string
        }
        Insert: {
          approval_key?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          base_currency?: string | null
          blocker_count?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmed_total?: number | null
          created_at?: string
          creation_key?: string
          currency?: string | null
          estimated_landed_total?: number | null
          estimated_merchandise_total?: number | null
          external_order_key?: string | null
          id?: string
          internal_notes?: string
          known_minimum?: number | null
          line_count?: number | null
          mixed_currency?: boolean
          ordered_at?: string | null
          owner_id: string
          plan_version?: number | null
          production_procurement_round_id?: string | null
          purpose?: string
          range_maximum?: number | null
          range_minimum?: number | null
          revision?: number
          snapshot_version?: string | null
          source_calculation_version?: string | null
          source_id?: string | null
          source_scenario_id?: string | null
          source_scenario_revision?: number | null
          source_snapshot?: Json
          source_type?: string | null
          status?: string
          strategy?: string | null
          strategy_explanation?: string[]
          superseded_at?: string | null
          superseded_by?: string | null
          supplier_count?: number | null
          supplier_id?: string | null
          target_date?: string | null
          title: string
          unknown_component_count?: number | null
          updated_at?: string
          verification_revision?: number
          warning_count?: number | null
          workspace_id: string
        }
        Update: {
          approval_key?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          base_currency?: string | null
          blocker_count?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmed_total?: number | null
          created_at?: string
          creation_key?: string
          currency?: string | null
          estimated_landed_total?: number | null
          estimated_merchandise_total?: number | null
          external_order_key?: string | null
          id?: string
          internal_notes?: string
          known_minimum?: number | null
          line_count?: number | null
          mixed_currency?: boolean
          ordered_at?: string | null
          owner_id?: string
          plan_version?: number | null
          production_procurement_round_id?: string | null
          purpose?: string
          range_maximum?: number | null
          range_minimum?: number | null
          revision?: number
          snapshot_version?: string | null
          source_calculation_version?: string | null
          source_id?: string | null
          source_scenario_id?: string | null
          source_scenario_revision?: number | null
          source_snapshot?: Json
          source_type?: string | null
          status?: string
          strategy?: string | null
          strategy_explanation?: string[]
          superseded_at?: string | null
          superseded_by?: string | null
          supplier_count?: number | null
          supplier_id?: string | null
          target_date?: string | null
          title?: string
          unknown_component_count?: number | null
          updated_at?: string
          verification_revision?: number
          warning_count?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_plans_round_fk"
            columns: ["workspace_id", "production_procurement_round_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_rounds"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_plans_scenario_fk"
            columns: ["workspace_id", "source_scenario_id"]
            isOneToOne: false
            referencedRelation: "production_procurement_scenarios"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "purchase_plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_plans_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      readiness_issues: {
        Row: {
          category: string
          compliance_dossier_id: string
          description: string
          id: string
          notes: string
          owner_id: string
          resolved_at: string | null
          severity: string
          source_entity_id: string | null
          source_entity_type: string | null
          status: string
          title: string
          workspace_id: string
        }
        Insert: {
          category: string
          compliance_dossier_id: string
          description: string
          id: string
          notes: string
          owner_id: string
          resolved_at?: string | null
          severity: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          status: string
          title: string
          workspace_id: string
        }
        Update: {
          category?: string
          compliance_dossier_id?: string
          description?: string
          id?: string
          notes?: string
          owner_id?: string
          resolved_at?: string | null
          severity?: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          status?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "readiness_issues_workspace_id_compliance_dossier_id_fkey"
            columns: ["workspace_id", "compliance_dossier_id"]
            isOneToOne: false
            referencedRelation: "compliance_dossiers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "readiness_issues_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      regulatory_review_sources: {
        Row: {
          owner_id: string
          regulatory_review_id: string
          regulatory_source_id: string
          workspace_id: string
        }
        Insert: {
          owner_id: string
          regulatory_review_id: string
          regulatory_source_id: string
          workspace_id: string
        }
        Update: {
          owner_id?: string
          regulatory_review_id?: string
          regulatory_source_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_review_sources_workspace_id_regulatory_review_i_fkey"
            columns: ["workspace_id", "regulatory_review_id"]
            isOneToOne: false
            referencedRelation: "regulatory_reviews"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "regulatory_review_sources_workspace_id_regulatory_source_i_fkey"
            columns: ["workspace_id", "regulatory_source_id"]
            isOneToOne: false
            referencedRelation: "regulatory_sources"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      regulatory_reviews: {
        Row: {
          action_required: string
          compliance_dossier_id: string
          conclusion: string
          created_at: string
          id: string
          notes: string
          owner_id: string
          restriction_summary: string
          reviewed_at: string | null
          reviewed_by: string
          subject_id: string
          subject_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action_required: string
          compliance_dossier_id: string
          conclusion: string
          created_at: string
          id: string
          notes: string
          owner_id: string
          restriction_summary: string
          reviewed_at?: string | null
          reviewed_by: string
          subject_id: string
          subject_type: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          action_required?: string
          compliance_dossier_id?: string
          conclusion?: string
          created_at?: string
          id?: string
          notes?: string
          owner_id?: string
          restriction_summary?: string
          reviewed_at?: string | null
          reviewed_by?: string
          subject_id?: string
          subject_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_reviews_workspace_id_compliance_dossier_id_fkey"
            columns: ["workspace_id", "compliance_dossier_id"]
            isOneToOne: false
            referencedRelation: "compliance_dossiers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "regulatory_reviews_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      regulatory_sources: {
        Row: {
          authority: string
          effective_date: string | null
          external_url: string
          id: string
          jurisdiction: string
          last_reviewed_at: string | null
          notes: string
          owner_id: string
          publication_date: string | null
          source_type: string
          status: string
          title: string
          version_or_consolidation_date: string | null
          workspace_id: string
        }
        Insert: {
          authority: string
          effective_date?: string | null
          external_url: string
          id: string
          jurisdiction: string
          last_reviewed_at?: string | null
          notes: string
          owner_id: string
          publication_date?: string | null
          source_type: string
          status: string
          title: string
          version_or_consolidation_date?: string | null
          workspace_id: string
        }
        Update: {
          authority?: string
          effective_date?: string | null
          external_url?: string
          id?: string
          jurisdiction?: string
          last_reviewed_at?: string | null
          notes?: string
          owner_id?: string
          publication_date?: string | null
          source_type?: string
          status?: string
          title?: string
          version_or_consolidation_date?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      responsible_persons: {
        Row: {
          country: string
          created_at: string
          email: string
          id: string
          legal_name: string
          notes: string
          organisation_name: string
          owner_id: string
          phone: string
          physical_address: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          country: string
          created_at: string
          email: string
          id: string
          legal_name: string
          notes: string
          organisation_name: string
          owner_id: string
          phone: string
          physical_address: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          country?: string
          created_at?: string
          email?: string
          id?: string
          legal_name?: string
          notes?: string
          organisation_name?: string
          owner_id?: string
          phone?: string
          physical_address?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "responsible_persons_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scent_memory_checkpoints: {
        Row: {
          archived_at: string | null
          balance: number | null
          checkpoint_kind: string
          created_at: string
          custom_minutes: number | null
          darkness: number | null
          descriptors: string[]
          diffusion: number | null
          dryness: number | null
          freshness: number | null
          id: string
          intensity: number | null
          is_current: boolean
          logical_id: string
          notes: string | null
          observed_at: string
          overall_impression: string | null
          owner_user_id: string
          persistence: number | null
          revision: number
          session_id: string
          spice: number | null
          supersedes_id: string | null
          sweetness: number | null
          warmth: number | null
          woodiness: number | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          balance?: number | null
          checkpoint_kind: string
          created_at?: string
          custom_minutes?: number | null
          darkness?: number | null
          descriptors?: string[]
          diffusion?: number | null
          dryness?: number | null
          freshness?: number | null
          id?: string
          intensity?: number | null
          is_current?: boolean
          logical_id: string
          notes?: string | null
          observed_at: string
          overall_impression?: string | null
          owner_user_id: string
          persistence?: number | null
          revision: number
          session_id: string
          spice?: number | null
          supersedes_id?: string | null
          sweetness?: number | null
          warmth?: number | null
          woodiness?: number | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          balance?: number | null
          checkpoint_kind?: string
          created_at?: string
          custom_minutes?: number | null
          darkness?: number | null
          descriptors?: string[]
          diffusion?: number | null
          dryness?: number | null
          freshness?: number | null
          id?: string
          intensity?: number | null
          is_current?: boolean
          logical_id?: string
          notes?: string | null
          observed_at?: string
          overall_impression?: string | null
          owner_user_id?: string
          persistence?: number | null
          revision?: number
          session_id?: string
          spice?: number | null
          supersedes_id?: string | null
          sweetness?: number | null
          warmth?: number | null
          woodiness?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scent_memory_checkpoints_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "scent_memory_checkpoints_workspace_id_session_id_fkey"
            columns: ["workspace_id", "session_id"]
            isOneToOne: false
            referencedRelation: "scent_memory_sessions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "scent_memory_checkpoints_workspace_id_supersedes_id_fkey"
            columns: ["workspace_id", "supersedes_id"]
            isOneToOne: false
            referencedRelation: "scent_memory_checkpoints"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      scent_memory_sessions: {
        Row: {
          archived_at: string | null
          change_next: string | null
          created_at: string
          development_experiment_id: string | null
          development_experiment_variant_id: string | null
          final_conclusion: string | null
          formula_version_id: string | null
          id: string
          ingredient_id: string | null
          lab_batch_id: string | null
          overall_score: number | null
          owner_user_id: string
          product_id: string | null
          revision: number
          status: string
          test_session_id: string | null
          title: string
          updated_at: string
          what_disappeared: string | null
          what_felt_dominant: string | null
          what_surprised_me: string | null
          what_was_missing: string | null
          what_worked: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          change_next?: string | null
          created_at?: string
          development_experiment_id?: string | null
          development_experiment_variant_id?: string | null
          final_conclusion?: string | null
          formula_version_id?: string | null
          id?: string
          ingredient_id?: string | null
          lab_batch_id?: string | null
          overall_score?: number | null
          owner_user_id: string
          product_id?: string | null
          revision?: number
          status?: string
          test_session_id?: string | null
          title: string
          updated_at?: string
          what_disappeared?: string | null
          what_felt_dominant?: string | null
          what_surprised_me?: string | null
          what_was_missing?: string | null
          what_worked?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          change_next?: string | null
          created_at?: string
          development_experiment_id?: string | null
          development_experiment_variant_id?: string | null
          final_conclusion?: string | null
          formula_version_id?: string | null
          id?: string
          ingredient_id?: string | null
          lab_batch_id?: string | null
          overall_score?: number | null
          owner_user_id?: string
          product_id?: string | null
          revision?: number
          status?: string
          test_session_id?: string | null
          title?: string
          updated_at?: string
          what_disappeared?: string | null
          what_felt_dominant?: string | null
          what_surprised_me?: string | null
          what_was_missing?: string | null
          what_worked?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scent_memory_experiment_fk"
            columns: ["workspace_id", "development_experiment_id"]
            isOneToOne: false
            referencedRelation: "development_experiments"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "scent_memory_experiment_variant_fk"
            columns: ["workspace_id", "development_experiment_variant_id"]
            isOneToOne: false
            referencedRelation: "development_experiment_variants"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "scent_memory_sessions_workspace_id_formula_version_id_fkey"
            columns: ["workspace_id", "formula_version_id"]
            isOneToOne: false
            referencedRelation: "formula_versions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "scent_memory_sessions_workspace_id_ingredient_id_fkey"
            columns: ["workspace_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "scent_memory_sessions_workspace_id_lab_batch_id_fkey"
            columns: ["workspace_id", "lab_batch_id"]
            isOneToOne: false
            referencedRelation: "lab_batches"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "scent_memory_sessions_workspace_id_owner_user_id_fkey"
            columns: ["workspace_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "scent_memory_sessions_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "scent_memory_sessions_workspace_id_test_session_id_fkey"
            columns: ["workspace_id", "test_session_id"]
            isOneToOne: false
            referencedRelation: "test_sessions"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      stock_policies: {
        Row: {
          archived_at: string | null
          created_at: string
          expected_lead_time_days: number | null
          id: string
          ingredient_id: string | null
          inventory_domain: string
          is_basis_item: boolean
          minimum_on_hand: number
          owner_id: string
          packaging_component_id: string | null
          packaging_supplier_product_id: string | null
          policy_status: string
          preferred_order_quantity: number | null
          rationale: string
          reorder_point: number | null
          review_frequency: string | null
          revision: number
          safety_stock: number | null
          supplier_product_id: string | null
          target_on_hand: number
          unit: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          expected_lead_time_days?: number | null
          id?: string
          ingredient_id?: string | null
          inventory_domain: string
          is_basis_item?: boolean
          minimum_on_hand: number
          owner_id: string
          packaging_component_id?: string | null
          packaging_supplier_product_id?: string | null
          policy_status?: string
          preferred_order_quantity?: number | null
          rationale?: string
          reorder_point?: number | null
          review_frequency?: string | null
          revision?: number
          safety_stock?: number | null
          supplier_product_id?: string | null
          target_on_hand: number
          unit: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          expected_lead_time_days?: number | null
          id?: string
          ingredient_id?: string | null
          inventory_domain?: string
          is_basis_item?: boolean
          minimum_on_hand?: number
          owner_id?: string
          packaging_component_id?: string | null
          packaging_supplier_product_id?: string | null
          policy_status?: string
          preferred_order_quantity?: number | null
          rationale?: string
          reorder_point?: number | null
          review_frequency?: string | null
          revision?: number
          safety_stock?: number | null
          supplier_product_id?: string | null
          target_on_hand?: number
          unit?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contacts: {
        Row: {
          archived_at: string | null
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          notes: string
          owner_id: string
          phone: string | null
          preferred_contact_method: string | null
          role: string | null
          supplier_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          notes?: string
          owner_id: string
          phone?: string | null
          preferred_contact_method?: string | null
          role?: string | null
          supplier_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string
          owner_id?: string
          phone?: string | null
          preferred_contact_method?: string | null
          role?: string | null
          supplier_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contacts_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      supplier_document_records: {
        Row: {
          archived_at: string | null
          capability_state: string
          checked_date: string | null
          created_at: string
          document_subtype: string | null
          document_title: string | null
          document_type: string
          evidence_url: string | null
          expiry_date: string | null
          id: string
          issue_date: string | null
          issuer: string | null
          notes: string
          owner_id: string
          revision: number
          scope_type: string
          source_reference: string | null
          supplier_id: string
          updated_at: string
          verification_state: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          capability_state?: string
          checked_date?: string | null
          created_at?: string
          document_subtype?: string | null
          document_title?: string | null
          document_type: string
          evidence_url?: string | null
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          issuer?: string | null
          notes?: string
          owner_id: string
          revision?: number
          scope_type?: string
          source_reference?: string | null
          supplier_id: string
          updated_at?: string
          verification_state?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          capability_state?: string
          checked_date?: string | null
          created_at?: string
          document_subtype?: string | null
          document_title?: string | null
          document_type?: string
          evidence_url?: string | null
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          issuer?: string | null
          notes?: string
          owner_id?: string
          revision?: number
          scope_type?: string
          source_reference?: string | null
          supplier_id?: string
          updated_at?: string
          verification_state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_document_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_document_records_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      supplier_documents: {
        Row: {
          created_at: string
          document_type: string
          equipment_item_id: string | null
          id: string
          issue_date: string | null
          owner_id: string
          review_date: string | null
          source: string | null
          status: string
          storage_object_path: string | null
          supplier_id: string
          supplier_product_domain: string | null
          supplier_product_id: string | null
          title: string
          updated_at: string
          verification_status: string
          version: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          document_type: string
          equipment_item_id?: string | null
          id?: string
          issue_date?: string | null
          owner_id: string
          review_date?: string | null
          source?: string | null
          status?: string
          storage_object_path?: string | null
          supplier_id: string
          supplier_product_domain?: string | null
          supplier_product_id?: string | null
          title: string
          updated_at?: string
          verification_status?: string
          version?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          document_type?: string
          equipment_item_id?: string | null
          id?: string
          issue_date?: string | null
          owner_id?: string
          review_date?: string | null
          source?: string | null
          status?: string
          storage_object_path?: string | null
          supplier_id?: string
          supplier_product_domain?: string | null
          supplier_product_id?: string | null
          title?: string
          updated_at?: string
          verification_status?: string
          version?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_documents_equipment_fk"
            columns: ["workspace_id", "equipment_item_id"]
            isOneToOne: false
            referencedRelation: "equipment_items"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "supplier_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_documents_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      supplier_events: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string
          event_type: string
          expected_at: string | null
          id: string
          metadata: Json
          occurred_at: string
          owner_id: string
          procurement_request_id: string | null
          purchase_order_id: string | null
          purchase_plan_id: string | null
          revision: number
          source_key: string | null
          supplier_document_record_id: string | null
          supplier_id: string
          supplier_offer_id: string | null
          supplier_quote_id: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string
          event_type: string
          expected_at?: string | null
          id?: string
          metadata?: Json
          occurred_at: string
          owner_id: string
          procurement_request_id?: string | null
          purchase_order_id?: string | null
          purchase_plan_id?: string | null
          revision?: number
          source_key?: string | null
          supplier_document_record_id?: string | null
          supplier_id: string
          supplier_offer_id?: string | null
          supplier_quote_id?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string
          event_type?: string
          expected_at?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          owner_id?: string
          procurement_request_id?: string | null
          purchase_order_id?: string | null
          purchase_plan_id?: string | null
          revision?: number
          source_key?: string | null
          supplier_document_record_id?: string | null
          supplier_id?: string
          supplier_offer_id?: string | null
          supplier_quote_id?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_events_purchase_order_fk"
            columns: ["workspace_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "supplier_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_events_workspace_id_procurement_request_id_fkey"
            columns: ["workspace_id", "procurement_request_id"]
            isOneToOne: false
            referencedRelation: "procurement_requests"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "supplier_events_workspace_id_purchase_plan_id_fkey"
            columns: ["workspace_id", "purchase_plan_id"]
            isOneToOne: false
            referencedRelation: "purchase_plans"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "supplier_events_workspace_id_supplier_document_record_id_fkey"
            columns: ["workspace_id", "supplier_document_record_id"]
            isOneToOne: false
            referencedRelation: "supplier_document_records"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "supplier_events_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "supplier_events_workspace_id_supplier_offer_id_fkey"
            columns: ["workspace_id", "supplier_offer_id"]
            isOneToOne: false
            referencedRelation: "procurement_supplier_offers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "supplier_events_workspace_id_supplier_quote_id_fkey"
            columns: ["workspace_id", "supplier_quote_id"]
            isOneToOne: false
            referencedRelation: "supplier_quotes"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      supplier_product_ingredient_mappings: {
        Row: {
          acceptance_method: string | null
          accepted_at: string | null
          accepted_by: string | null
          compatibility_snapshot: Json
          created_at: string
          id: string
          ingredient_id: string
          notes: string
          owner_id: string
          provenance: Json
          retired_at: string | null
          status: string
          supplier_product_id: string
          workspace_id: string
        }
        Insert: {
          acceptance_method?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          compatibility_snapshot?: Json
          created_at?: string
          id?: string
          ingredient_id: string
          notes?: string
          owner_id: string
          provenance?: Json
          retired_at?: string | null
          status: string
          supplier_product_id: string
          workspace_id: string
        }
        Update: {
          acceptance_method?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          compatibility_snapshot?: Json
          created_at?: string
          id?: string
          ingredient_id?: string
          notes?: string
          owner_id?: string
          provenance?: Json
          retired_at?: string | null
          status?: string
          supplier_product_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_product_ingredient_m_workspace_id_supplier_produc_fkey"
            columns: ["workspace_id", "supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "supplier_product_ingredient_map_workspace_id_ingredient_id_fkey"
            columns: ["workspace_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          availability_status: string | null
          category_snapshot: string | null
          cosing_functions_snapshot: string[] | null
          country_code: string | null
          created_at: string
          currency: string
          declared_inci: string | null
          default_inventory_unit: string | null
          discontinued: boolean
          extraction_method: string | null
          grade: string | null
          id: string
          ingredient_id: string
          is_preferred: boolean
          last_verified_date: string | null
          lead_time_days: number | null
          moq: number | null
          notes: string
          operational_notes: string | null
          order_multiple: number | null
          origin: string | null
          owner_id: string
          package_quantity: number
          package_unit: string
          price: number
          processing_method: string | null
          product_name: string
          product_status: string | null
          product_url: string | null
          reference_entry_id: string | null
          research_profile_snapshot: string | null
          sample_available: boolean | null
          shelf_life_months: number | null
          storage_requirements: string | null
          supplier_grade: string | null
          supplier_id: string | null
          supplier_name: string
          supplier_sku: string | null
          updated_at: string
          verification: Json | null
          verification_notes: string | null
          workspace_id: string
        }
        Insert: {
          availability_status?: string | null
          category_snapshot?: string | null
          cosing_functions_snapshot?: string[] | null
          country_code?: string | null
          created_at: string
          currency: string
          declared_inci?: string | null
          default_inventory_unit?: string | null
          discontinued?: boolean
          extraction_method?: string | null
          grade?: string | null
          id: string
          ingredient_id: string
          is_preferred: boolean
          last_verified_date?: string | null
          lead_time_days?: number | null
          moq?: number | null
          notes: string
          operational_notes?: string | null
          order_multiple?: number | null
          origin?: string | null
          owner_id: string
          package_quantity: number
          package_unit: string
          price: number
          processing_method?: string | null
          product_name: string
          product_status?: string | null
          product_url?: string | null
          reference_entry_id?: string | null
          research_profile_snapshot?: string | null
          sample_available?: boolean | null
          shelf_life_months?: number | null
          storage_requirements?: string | null
          supplier_grade?: string | null
          supplier_id?: string | null
          supplier_name: string
          supplier_sku?: string | null
          updated_at: string
          verification?: Json | null
          verification_notes?: string | null
          workspace_id: string
        }
        Update: {
          availability_status?: string | null
          category_snapshot?: string | null
          cosing_functions_snapshot?: string[] | null
          country_code?: string | null
          created_at?: string
          currency?: string
          declared_inci?: string | null
          default_inventory_unit?: string | null
          discontinued?: boolean
          extraction_method?: string | null
          grade?: string | null
          id?: string
          ingredient_id?: string
          is_preferred?: boolean
          last_verified_date?: string | null
          lead_time_days?: number | null
          moq?: number | null
          notes?: string
          operational_notes?: string | null
          order_multiple?: number | null
          origin?: string | null
          owner_id?: string
          package_quantity?: number
          package_unit?: string
          price?: number
          processing_method?: string | null
          product_name?: string
          product_status?: string | null
          product_url?: string | null
          reference_entry_id?: string | null
          research_profile_snapshot?: string | null
          sample_available?: boolean | null
          shelf_life_months?: number | null
          storage_requirements?: string | null
          supplier_grade?: string | null
          supplier_id?: string | null
          supplier_name?: string
          supplier_sku?: string | null
          updated_at?: string
          verification?: Json | null
          verification_notes?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_supplier_fk"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "supplier_products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_workspace_id_ingredient_id_fkey"
            columns: ["workspace_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      supplier_quote_lines: {
        Row: {
          created_at: string
          description: string
          display_order: number
          equipment_item_id: string | null
          id: string
          lead_time_days: number | null
          line_discount: number
          line_total: number | null
          moq: number | null
          notes: string
          order_multiple: number | null
          owner_id: string
          quantity: number
          quote_id: string
          supplier_product_domain: string | null
          supplier_product_id: string | null
          unit: string
          unit_price: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description: string
          display_order?: number
          equipment_item_id?: string | null
          id?: string
          lead_time_days?: number | null
          line_discount?: number
          line_total?: number | null
          moq?: number | null
          notes?: string
          order_multiple?: number | null
          owner_id: string
          quantity: number
          quote_id: string
          supplier_product_domain?: string | null
          supplier_product_id?: string | null
          unit: string
          unit_price: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          display_order?: number
          equipment_item_id?: string | null
          id?: string
          lead_time_days?: number | null
          line_discount?: number
          line_total?: number | null
          moq?: number | null
          notes?: string
          order_multiple?: number | null
          owner_id?: string
          quantity?: number
          quote_id?: string
          supplier_product_domain?: string | null
          supplier_product_id?: string | null
          unit?: string
          unit_price?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_equipment_fk"
            columns: ["workspace_id", "equipment_item_id"]
            isOneToOne: false
            referencedRelation: "equipment_items"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "supplier_quote_lines_workspace_id_quote_id_fkey"
            columns: ["workspace_id", "quote_id"]
            isOneToOne: false
            referencedRelation: "supplier_quotes"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      supplier_quotes: {
        Row: {
          additional_cost: number | null
          archived_at: string | null
          created_at: string
          creation_key: string
          currency: string
          duties_estimate: number | null
          id: string
          incoterm: string | null
          internal_notes: string
          lead_time_days: number | null
          owner_id: string
          payment_fee: number | null
          payment_terms: string | null
          quote_date: string
          quote_reference: string | null
          revision: number
          shipping_cost: number | null
          source_document_id: string | null
          status: string
          supplier_id: string
          tax_estimate: number | null
          updated_at: string
          valid_until: string | null
          workspace_id: string
        }
        Insert: {
          additional_cost?: number | null
          archived_at?: string | null
          created_at?: string
          creation_key?: string
          currency: string
          duties_estimate?: number | null
          id?: string
          incoterm?: string | null
          internal_notes?: string
          lead_time_days?: number | null
          owner_id: string
          payment_fee?: number | null
          payment_terms?: string | null
          quote_date: string
          quote_reference?: string | null
          revision?: number
          shipping_cost?: number | null
          source_document_id?: string | null
          status?: string
          supplier_id: string
          tax_estimate?: number | null
          updated_at?: string
          valid_until?: string | null
          workspace_id: string
        }
        Update: {
          additional_cost?: number | null
          archived_at?: string | null
          created_at?: string
          creation_key?: string
          currency?: string
          duties_estimate?: number | null
          id?: string
          incoterm?: string | null
          internal_notes?: string
          lead_time_days?: number | null
          owner_id?: string
          payment_fee?: number | null
          payment_terms?: string | null
          quote_date?: string
          quote_reference?: string | null
          revision?: number
          shipping_cost?: number | null
          source_document_id?: string | null
          status?: string
          supplier_id?: string
          tax_estimate?: number | null
          updated_at?: string
          valid_until?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quotes_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "supplier_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotes_workspace_id_supplier_id_fkey"
            columns: ["workspace_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      supplier_research_candidates: {
        Row: {
          candidate_name: string
          candidate_summary: string | null
          candidate_type: string
          claimed_capabilities: string[]
          converted_supplier_id: string | null
          country_code: string | null
          created_at: string
          creation_key: string
          currency: string | null
          evidence_notes: string | null
          id: string
          owner_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          revision: number
          source_captured_at: string | null
          source_title: string | null
          source_url: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          candidate_name: string
          candidate_summary?: string | null
          candidate_type: string
          claimed_capabilities?: string[]
          converted_supplier_id?: string | null
          country_code?: string | null
          created_at?: string
          creation_key?: string
          currency?: string | null
          evidence_notes?: string | null
          id?: string
          owner_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          revision?: number
          source_captured_at?: string | null
          source_title?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          candidate_name?: string
          candidate_summary?: string | null
          candidate_type?: string
          claimed_capabilities?: string[]
          converted_supplier_id?: string | null
          country_code?: string | null
          created_at?: string
          creation_key?: string
          currency?: string | null
          evidence_notes?: string | null
          id?: string
          owner_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          revision?: number
          source_captured_at?: string | null
          source_title?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_research_candidates_workspace_id_converted_suppli_fkey"
            columns: ["workspace_id", "converted_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "supplier_research_candidates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          archived_at: string | null
          country_code: string | null
          created_at: string
          default_currency: string | null
          default_incoterm: string | null
          default_lead_time_days: number | null
          default_payment_terms: string | null
          id: string
          internal_notes: string
          internal_rating: number | null
          is_preferred: boolean
          legal_name: string
          minimum_order_value: number | null
          owner_id: string
          revision: number
          status: string
          supplier_type: string
          trading_name: string | null
          updated_at: string
          verification_state: string
          website_url: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          country_code?: string | null
          created_at?: string
          default_currency?: string | null
          default_incoterm?: string | null
          default_lead_time_days?: number | null
          default_payment_terms?: string | null
          id?: string
          internal_notes?: string
          internal_rating?: number | null
          is_preferred?: boolean
          legal_name: string
          minimum_order_value?: number | null
          owner_id: string
          revision?: number
          status?: string
          supplier_type: string
          trading_name?: string | null
          updated_at?: string
          verification_state?: string
          website_url?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          country_code?: string | null
          created_at?: string
          default_currency?: string | null
          default_incoterm?: string | null
          default_lead_time_days?: number | null
          default_payment_terms?: string | null
          id?: string
          internal_notes?: string
          internal_rating?: number | null
          is_preferred?: boolean
          legal_name?: string
          minimum_order_value?: number | null
          owner_id?: string
          revision?: number
          status?: string
          supplier_type?: string
          trading_name?: string | null
          updated_at?: string
          verification_state?: string
          website_url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      test_response_answers: {
        Row: {
          owner_id: string
          question_id: string
          test_response_id: string
          value: Json
          workspace_id: string
        }
        Insert: {
          owner_id: string
          question_id: string
          test_response_id: string
          value: Json
          workspace_id: string
        }
        Update: {
          owner_id?: string
          question_id?: string
          test_response_id?: string
          value?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_response_answers_workspace_id_question_id_fkey"
            columns: ["workspace_id", "question_id"]
            isOneToOne: false
            referencedRelation: "test_template_questions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "test_response_answers_workspace_id_test_response_id_fkey"
            columns: ["workspace_id", "test_response_id"]
            isOneToOne: false
            referencedRelation: "test_responses"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      test_responses: {
        Row: {
          id: string
          overall_notes: string
          owner_id: string
          submitted_at: string
          test_session_id: string
          tester_id: string
          workspace_id: string
        }
        Insert: {
          id: string
          overall_notes: string
          owner_id: string
          submitted_at: string
          test_session_id: string
          tester_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          overall_notes?: string
          owner_id?: string
          submitted_at?: string
          test_session_id?: string
          tester_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_responses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_responses_workspace_id_test_session_id_fkey"
            columns: ["workspace_id", "test_session_id"]
            isOneToOne: false
            referencedRelation: "test_sessions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "test_responses_workspace_id_tester_id_fkey"
            columns: ["workspace_id", "tester_id"]
            isOneToOne: false
            referencedRelation: "testers"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      test_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          lab_batch_id: string
          name: string
          notes: string
          owner_id: string
          status: string
          test_template_id: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at: string
          due_date?: string | null
          id: string
          lab_batch_id: string
          name: string
          notes: string
          owner_id: string
          status: string
          test_template_id: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          lab_batch_id?: string
          name?: string
          notes?: string
          owner_id?: string
          status?: string
          test_template_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_sessions_workspace_id_lab_batch_id_fkey"
            columns: ["workspace_id", "lab_batch_id"]
            isOneToOne: false
            referencedRelation: "lab_batches"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "test_sessions_workspace_id_test_template_id_fkey"
            columns: ["workspace_id", "test_template_id"]
            isOneToOne: false
            referencedRelation: "test_templates"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      test_template_questions: {
        Row: {
          choices: string[] | null
          id: string
          owner_id: string
          prompt: string
          sort_order: number
          test_template_id: string
          type: string
          workspace_id: string
        }
        Insert: {
          choices?: string[] | null
          id: string
          owner_id: string
          prompt: string
          sort_order: number
          test_template_id: string
          type: string
          workspace_id: string
        }
        Update: {
          choices?: string[] | null
          id?: string
          owner_id?: string
          prompt?: string
          sort_order?: number
          test_template_id?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_template_questions_workspace_id_test_template_id_fkey"
            columns: ["workspace_id", "test_template_id"]
            isOneToOne: false
            referencedRelation: "test_templates"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      test_templates: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      testers: {
        Row: {
          created_at: string
          display_name: string
          id: string
          notes: string
          owner_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at: string
          display_name: string
          id: string
          notes: string
          owner_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          notes?: string
          owner_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "testers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      trim_recipe_product_links: {
        Row: {
          display_order: number
          id: string
          owner_id: string
          product_category_snapshot: string
          product_id: string | null
          product_name_snapshot: string
          recipe_id: string
          usage_role: string
          workspace_id: string
        }
        Insert: {
          display_order: number
          id: string
          owner_id: string
          product_category_snapshot?: string
          product_id?: string | null
          product_name_snapshot: string
          recipe_id: string
          usage_role: string
          workspace_id: string
        }
        Update: {
          display_order?: number
          id?: string
          owner_id?: string
          product_category_snapshot?: string
          product_id?: string | null
          product_name_snapshot?: string
          recipe_id?: string
          usage_role?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trim_recipe_product_links_recipe_id_workspace_id_fkey"
            columns: ["recipe_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "trim_recipes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "trim_recipe_product_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trim_recipe_product_links_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      trim_recipe_steps: {
        Row: {
          attachment_id: string | null
          caution: string
          completion_required: boolean
          display_order: number
          id: string
          instruction: string
          recipe_id: string
          target_length_mm: number | null
          technique: string
          title: string
          tool_id: string | null
          trim_direction: string | null
          workspace_id: string
          zones: string[]
        }
        Insert: {
          attachment_id?: string | null
          caution?: string
          completion_required?: boolean
          display_order: number
          id: string
          instruction: string
          recipe_id: string
          target_length_mm?: number | null
          technique: string
          title: string
          tool_id?: string | null
          trim_direction?: string | null
          workspace_id: string
          zones?: string[]
        }
        Update: {
          attachment_id?: string | null
          caution?: string
          completion_required?: boolean
          display_order?: number
          id?: string
          instruction?: string
          recipe_id?: string
          target_length_mm?: number | null
          technique?: string
          title?: string
          tool_id?: string | null
          trim_direction?: string | null
          workspace_id?: string
          zones?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "trim_recipe_steps_attachment_workspace_fkey"
            columns: ["attachment_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "grooming_tool_attachments"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "trim_recipe_steps_recipe_id_workspace_id_fkey"
            columns: ["recipe_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "trim_recipes"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "trim_recipe_steps_tool_id_workspace_id_fkey"
            columns: ["tool_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "grooming_tools"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      trim_recipes: {
        Row: {
          created_at: string
          estimated_duration_minutes: number
          finishing_instructions: string
          id: string
          name: string
          notes: string
          owner_id: string
          preparation_instructions: string
          profile_id: string
          starting_condition: string
          status: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          estimated_duration_minutes: number
          finishing_instructions?: string
          id: string
          name: string
          notes?: string
          owner_id: string
          preparation_instructions?: string
          profile_id: string
          starting_condition?: string
          status: string
          updated_at?: string
          version: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          estimated_duration_minutes?: number
          finishing_instructions?: string
          id?: string
          name?: string
          notes?: string
          owner_id?: string
          preparation_instructions?: string
          profile_id?: string
          starting_condition?: string
          status?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trim_recipes_profile_id_workspace_id_fkey"
            columns: ["profile_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "beard_profiles"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "trim_recipes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      undesirable_effect_records: {
        Row: {
          corrective_action_notes: string
          created_at: string
          description: string
          external_notification_reference: string | null
          finished_goods_batch_id: string | null
          id: string
          internal_review_status: string
          owner_id: string
          product_id: string
          reported_at: string
          reporter_reference: string
          seriousness_status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          corrective_action_notes: string
          created_at: string
          description: string
          external_notification_reference?: string | null
          finished_goods_batch_id?: string | null
          id: string
          internal_review_status: string
          owner_id: string
          product_id: string
          reported_at: string
          reporter_reference: string
          seriousness_status: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          corrective_action_notes?: string
          created_at?: string
          description?: string
          external_notification_reference?: string | null
          finished_goods_batch_id?: string | null
          id?: string
          internal_review_status?: string
          owner_id?: string
          product_id?: string
          reported_at?: string
          reporter_reference?: string
          seriousness_status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "undesirable_effect_records_workspace_id_finished_goods_bat_fkey"
            columns: ["workspace_id", "finished_goods_batch_id"]
            isOneToOne: false
            referencedRelation: "finished_goods_batches"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "undesirable_effect_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "undesirable_effect_records_workspace_id_product_id_fkey"
            columns: ["workspace_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      workspace_records: {
        Row: {
          created_at: string
          data: Json
          entity_type: string
          id: string
          owner_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          entity_type: string
          id: string
          owner_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          entity_type?: string
          id?: string
          owner_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          lifecycle_state: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lifecycle_state?: string
          name?: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lifecycle_state?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_procurement_offer_candidate: {
        Args: {
          candidate_id: string
          candidate_workspace_id: string
          create_supplier?: boolean
          selected_supplier_id?: string
        }
        Returns: {
          offer_id: string
          supplier_id: string
        }[]
      }
      accept_supplier_product_ingredient_mapping: {
        Args: {
          acceptance_note?: string
          expected_round_revision: number
          target_requirement_id: string
          target_supplier_product_id: string
        }
        Returns: string
      }
      acknowledge_procurement_background_submission: {
        Args: { candidate_attempt_id: string }
        Returns: boolean
      }
      allocate_bulk_to_packaging_run_v1: {
        Args: {
          candidate_allocation_method: string
          candidate_idempotency_key: string
          candidate_quantity: number
          candidate_unit: string
          expected_run_revision: number
          target_packaging_run_id: string
        }
        Returns: Json
      }
      approve_production_procurement_scenario: {
        Args: {
          candidate_approval_key: string
          candidate_notes?: string
          candidate_title?: string
          expected_scenario_revision: number
          target_replaces_plan_id?: string
          target_scenario_id: string
        }
        Returns: string
      }
      attach_procurement_background_operation: {
        Args: {
          candidate_attempt_id: string
          candidate_owner_id: string
          candidate_provider_operation_id: string
          candidate_provider_status: string
        }
        Returns: string
      }
      begin_beard_provider_attempt: {
        Args: {
          candidate_analysis_id: string
          candidate_model: string
          candidate_prompt_version: string
          candidate_provider: string
          candidate_workspace_id: string
        }
        Returns: boolean
      }
      begin_beard_provider_attempt_v5: {
        Args: {
          candidate_analysis_id: string
          candidate_model: string
          candidate_prompt_version: string
          candidate_provider: string
          candidate_workspace_id: string
        }
        Returns: boolean
      }
      begin_procurement_background_submission: {
        Args: {
          candidate_job_id: string
          candidate_owner_id: string
          candidate_workspace_id: string
          maximum_daily_invocations: number
        }
        Returns: {
          attempt_id: string
          client_request_id: string
          submission_state: string
        }[]
      }
      begin_procurement_live_invocation: {
        Args: {
          candidate_job_id: string
          candidate_workspace_id: string
          maximum_daily_invocations: number
        }
        Returns: string
      }
      cancel_draft_purchase_order: {
        Args: {
          candidate_reason: string
          expected_revision: number
          target_order_id: string
        }
        Returns: number
      }
      cancel_internal_purchase_plan: {
        Args: {
          candidate_cancellation_reason: string
          expected_revision: number
          target_plan_id: string
        }
        Returns: number
      }
      cancel_production_procurement_round: {
        Args: { expected_revision: number; target_round_id: string }
        Returns: number
      }
      cancel_purchase_order_receipt: {
        Args: {
          candidate_reason: string
          expected_receipt_revision: number
          target_receipt_id: string
        }
        Returns: number
      }
      claim_procurement_background_operation: {
        Args: {
          candidate_attempt_id: string
          candidate_stage: string
          candidate_worker_id: string
          lease_seconds?: number
        }
        Returns: boolean
      }
      clear_production_requirement_match: {
        Args: {
          expected_match_revision: number
          expected_round_revision: number
          target_requirement_id: string
          unresolved_note?: string
        }
        Returns: number
      }
      commit_lab_consumption: {
        Args: { batch_id: string; commits: Json }
        Returns: Json
      }
      commit_packaging_consumption: {
        Args: {
          commits: Json
          receipt: Json
          target_finished_goods_batch_id: string
        }
        Returns: Json
      }
      commit_production_consumption: {
        Args: { commits: Json; run_id: string }
        Returns: Json
      }
      complete_packaging_run_v1: {
        Args: {
          candidate_completed_at: string
          candidate_idempotency_key: string
          expected_run_revision: number
          target_packaging_run_id: string
        }
        Returns: Json
      }
      complete_production_output_stage_v1: {
        Args: {
          candidate_completed_at: string
          candidate_idempotency_key: string
          expected_batch_revision: number
          target_production_run_id: string
        }
        Returns: Json
      }
      complete_purchase_order_receiving: {
        Args: {
          candidate_idempotency_key: string
          expected_receipt_revision: number
          target_receipt_id: string
        }
        Returns: string
      }
      complete_v9_reconciliation: {
        Args: { report: Json; run_id: string }
        Returns: undefined
      }
      consume_reserved_batch_material: {
        Args: {
          candidate_idempotency_key: string
          consumption_unit: string
          evidence_reference: string
          expected_reservation_revision: number
          productive_quantity: number
          reason: string
          target_reservation_id: string
          target_weighing_id: string
          waste_category: string
          waste_quantity: number
        }
        Returns: Json
      }
      convert_supplier_candidate: {
        Args: { candidate_id: string; idempotency: string }
        Returns: string
      }
      create_clean_workspace: { Args: never; Returns: string }
      create_development_experiment: { Args: { plan: Json }; Returns: string }
      create_draft_purchase_orders_from_plan: {
        Args: {
          candidate_handoff_key: string
          expected_plan_revision: number
          target_plan_id: string
        }
        Returns: Json
      }
      create_formula_branch_from_experiment: {
        Args: {
          idempotency: string
          target_experiment: string
          target_variant: string
        }
        Returns: string
      }
      create_lab_batch_from_experiment: {
        Args: {
          batch_size: number
          batch_unit: string
          formula_version: string
          idempotency: string
          target_experiment: string
          target_variant: string
        }
        Returns: string
      }
      create_packaging_run_v1: {
        Args: {
          candidate_idempotency_key: string
          candidate_location: string
          candidate_nominal_fill_quantity: number
          candidate_nominal_fill_unit: string
          candidate_packaging_specification_version_id: string
          candidate_planned_bulk_quantity: number
          candidate_planned_bulk_unit: string
          candidate_planned_unit_count: number
          candidate_run_label: string
          target_production_output_id: string
        }
        Returns: Json
      }
      create_product_studio_formula_handoff: {
        Args: {
          concept_id: string
          formula: Json
          formula_lines: Json
          formula_version: Json
          product: Json
        }
        Returns: Json
      }
      create_product_studio_purchase_plan: {
        Args: { concept_id: string; lines: Json }
        Returns: string
      }
      create_production_output_v1: {
        Args: {
          candidate_idempotency_key: string
          candidate_location: string
          candidate_measurement_basis: string
          candidate_output_label: string
          candidate_output_type: string
          candidate_override_evidence: string
          candidate_override_reason: string
          candidate_theoretical_basis: string
          candidate_theoretical_quantity: number
          candidate_theoretical_unit: string
          expected_batch_revision: number
          target_production_run_id: string
        }
        Returns: Json
      }
      create_production_procurement_round: {
        Args: {
          candidate_base_currency?: string
          candidate_notes?: string
          candidate_title: string
          candidate_workspace_id: string
          idempotency_key?: string
        }
        Returns: string
      }
      create_purchase_order_from_plan: {
        Args: { candidate_handoff_key: string; target_plan_id: string }
        Returns: string
      }
      create_purchase_order_receipt: {
        Args: {
          candidate_idempotency_key: string
          expected_order_revision: number
          receipt_payload: Json
          target_order_id: string
        }
        Returns: string
      }
      create_purchase_order_shipment: {
        Args: {
          candidate_idempotency_key: string
          expected_order_revision: number
          shipment_payload: Json
          target_confirmation_id: string
          target_order_id: string
        }
        Returns: string
      }
      decide_purchase_order_confirmation: {
        Args: {
          candidate_decision: string
          candidate_reason: string
          expected_revision: number
          line_decisions?: Json
          target_confirmation_id: string
        }
        Returns: number
      }
      delete_draft_production_procurement_scenario: {
        Args: {
          expected_round_revision: number
          expected_scenario_revision: number
          target_scenario_id: string
        }
        Returns: number
      }
      eligible_batch_material_lots: {
        Args: {
          target_batch_id: string
          target_batch_kind: string
          target_requirement_id: string
        }
        Returns: {
          available_balance: number
          cost_confidence: string
          cost_currency: string
          eligibility_policy_version: string
          expiry_or_retest_date: string
          fefo_rank: number
          internal_lot_number: string
          inventory_lot_id: string
          location: string
          movement_balance: number
          received_date: string
          released_at: string
          reserved_balance: number
          supplier_lot_number: string
          unit: string
          unit_cost: number
        }[]
      }
      expire_procurement_unmatched_webhooks: {
        Args: { maximum_rows?: number }
        Returns: number
      }
      finalize_procurement_background_operation: {
        Args: {
          candidate_attempt_id: string
          candidate_candidates?: Json
          candidate_error_code?: string
          candidate_error_details?: string
          candidate_event_id: string
          candidate_partial?: boolean
          candidate_provider_status: string
          candidate_terminal_source?: string
          candidate_worker_id: string
        }
        Returns: string
      }
      finish_beard_analysis_review: {
        Args: {
          candidate_analysis_id: string
          candidate_decisions: Json
          candidate_summary_snapshot: Json
          candidate_trim_plan_snapshot: Json
          candidate_workspace_id: string
        }
        Returns: Json
      }
      generate_production_procurement_scenarios: {
        Args: { expected_round_revision: number; target_round_id: string }
        Returns: number
      }
      generate_production_requirement_candidates: {
        Args: { expected_round_revision: number; target_requirement_id: string }
        Returns: number
      }
      get_batch_material_completion_readiness_v1: {
        Args: { target_batch_id: string; target_batch_kind: string }
        Returns: Json
      }
      get_batch_material_provenance_v1: {
        Args: {
          target_batch_id: string
          target_batch_kind: string
          target_requirement_id: string
        }
        Returns: Json
      }
      get_packaging_available_bulk_v1: {
        Args: { target_production_output_id: string }
        Returns: Json
      }
      get_packaging_eligible_lots_v1: {
        Args: { target_packaging_requirement_id: string }
        Returns: Json
      }
      get_packaging_run_completion_readiness_v1: {
        Args: { target_packaging_run_id: string }
        Returns: Json
      }
      get_packaging_run_genealogy_v1: {
        Args: { target_packaging_run_id: string }
        Returns: Json
      }
      get_production_output_completion_readiness_v1: {
        Args: { target_production_run_id: string }
        Returns: Json
      }
      get_production_output_genealogy_v1: {
        Args: { target_production_output_id: string }
        Returns: Json
      }
      import_procurement_purchasing_snapshot: {
        Args: { candidate_workspace_id: string; payload: Json }
        Returns: undefined
      }
      import_procurement_snapshot: {
        Args: { candidate_workspace_id: string; payload: Json }
        Returns: undefined
      }
      import_v9_relational: { Args: { payload: Json }; Returns: Json }
      import_v9_relational_pre_ingredient_knowledge: {
        Args: { payload: Json }
        Returns: Json
      }
      is_active_owned_workspace: {
        Args: { candidate_workspace_id: string }
        Returns: boolean
      }
      kf_active_reserved_balance: {
        Args: { target_lot_id: string; target_workspace_id: string }
        Returns: number
      }
      kf_batch_material_completion_readiness_v1: {
        Args: {
          target_batch_id: string
          target_batch_kind: string
          target_workspace_id: string
        }
        Returns: Json
      }
      kf_convert_quantity: {
        Args: { from_unit: string; q: number; to_unit: string }
        Returns: number
      }
      kf_inventory_available_balance: {
        Args: { target_lot_id: string; target_workspace_id: string }
        Returns: number
      }
      kf_inventory_balance: {
        Args: { lot_id: string; wid: string }
        Returns: number
      }
      kf_output_normalize: {
        Args: { q: number; u: string }
        Returns: {
          quantity: number
          unit: string
        }[]
      }
      kf_packaging_available_bulk_v1: {
        Args: { target_output_id: string; target_workspace_id: string }
        Returns: Json
      }
      kf_packaging_balance: {
        Args: { lot_id: string; wid: string }
        Returns: number
      }
      kf_packaging_run_completion_readiness_v1: {
        Args: { target_packaging_run_id: string; target_workspace_id: string }
        Returns: Json
      }
      kf_production_output_readiness_v1: {
        Args: { target_run_id: string; target_workspace_id: string }
        Returns: Json
      }
      list_beard_analysis_history: {
        Args: {
          candidate_before?: string
          candidate_before_id?: string
          candidate_limit?: number
          candidate_workspace_id: string
        }
        Returns: Json
      }
      lookup_beard_analysis_support_diagnostic: {
        Args: { candidate_support_id: string; candidate_workspace_id: string }
        Returns: Json
      }
      lookup_beard_analysis_support_diagnostic_v24: {
        Args: { candidate_support_id: string; candidate_workspace_id: string }
        Returns: Json
      }
      lookup_beard_analysis_support_diagnostic_v25: {
        Args: { candidate_support_id: string; candidate_workspace_id: string }
        Returns: Json
      }
      mark_packaging_supplier_product_preferred:
        | {
            Args: { p_expected_updated_at: string; p_product_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_expected_updated_at: string
              p_new_updated_at: string
              p_product_id: string
            }
            Returns: undefined
          }
      mark_procurement_background_submission_ambiguous: {
        Args: { candidate_attempt_id: string; safe_failure_code: string }
        Returns: boolean
      }
      mark_procurement_background_webhook_retry: {
        Args: {
          candidate_event_id: string
          delay_seconds: number
          safe_failure_code: string
        }
        Returns: boolean
      }
      mark_purchase_plan_checkout_ready: {
        Args: { expected_verification_revision: number; target_plan_id: string }
        Returns: number
      }
      mark_supplier_product_preferred:
        | {
            Args: { p_expected_updated_at: string; p_product_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_expected_updated_at: string
              p_new_updated_at: string
              p_product_id: string
            }
            Returns: undefined
          }
      persist_beard_analysis_result: {
        Args: {
          candidate_analysis_id: string
          candidate_correlation_id: string
          candidate_observations: Json
          candidate_provider_usage?: Json
          candidate_recommendations: Json
          candidate_result: Json
          candidate_workspace_id: string
        }
        Returns: Json
      }
      persist_beard_analysis_result_v5: {
        Args: {
          candidate_analysis_id: string
          candidate_correlation_id: string
          candidate_observations: Json
          candidate_provider_usage?: Json
          candidate_recommendations: Json
          candidate_result: Json
          candidate_workspace_id: string
        }
        Returns: Json
      }
      persist_procurement_provider_diagnostic: {
        Args: {
          candidate_job_id: string
          candidate_owner_id: string
          candidate_workspace_id: string
          diagnostic_abort_source: string
          diagnostic_body_elapsed_ms: number
          diagnostic_candidate_count: number
          diagnostic_function_elapsed_ms: number
          diagnostic_headers_elapsed_ms: number
          diagnostic_parse_elapsed_ms: number
          diagnostic_provider_called: boolean
          diagnostic_provider_elapsed_ms: number
          diagnostic_provider_http_status: number
          diagnostic_provider_stage: string
          diagnostic_terminal_error_code: string
          diagnostic_timeout_limit_ms: number
          diagnostic_timeout_stage: string
          diagnostic_usage_present: boolean
          diagnostic_validation_elapsed_ms: number
        }
        Returns: boolean
      }
      place_purchase_order_receipt_into_quarantine: {
        Args: {
          candidate_idempotency_key: string
          expected_receipt_revision: number
          quarantine_payload: Json
          target_receipt_id: string
        }
        Returns: string[]
      }
      production_unit_factor: {
        Args: { candidate_unit: string }
        Returns: number
      }
      production_unit_family: {
        Args: { candidate_unit: string }
        Returns: string
      }
      publish_procurement_research_results: {
        Args: {
          candidate_job_id: string
          candidate_workspace_id: string
          candidates: Json
          provider_request_id?: string
          terminal_status: string
        }
        Returns: number
      }
      publish_production_procurement_scenario: {
        Args: {
          expected_round_revision: number
          expected_scenario_revision: number
          target_scenario_id: string
        }
        Returns: number
      }
      reconcile_batch_material_requirement: {
        Args: {
          candidate_idempotency_key: string
          target_batch_id: string
          target_batch_kind: string
          target_requirement_id: string
          variance_approval_state: string
          variance_evidence: string
          variance_reason: string
        }
        Returns: Json
      }
      reconcile_packaging_run_v1: {
        Args: {
          candidate_approve_variance: boolean
          candidate_bulk_waste_quantity: number
          candidate_evidence_reference: string
          candidate_idempotency_key: string
          candidate_pending_finished_goods_quantity: number
          candidate_reason: string
          candidate_reconciled_at: string
          candidate_retained_bulk_quantity: number
          candidate_unexplained_bulk_variance: number
          candidate_unexplained_packaging_variance: number
          expected_run_revision: number
          target_packaging_run_id: string
        }
        Returns: Json
      }
      reconcile_production_output_v1: {
        Args: {
          candidate_approve_variance: boolean
          candidate_evidence_reference: string
          candidate_idempotency_key: string
          candidate_reason: string
          candidate_reconciled_at: string
          candidate_tolerance_quantity: number
          expected_output_revision: number
          target_production_output_id: string
        }
        Returns: Json
      }
      record_batch_material_return: {
        Args: {
          candidate_idempotency_key: string
          condition_assessment: string
          evidence_reference: string
          expected_reservation_revision: number
          original_consumption_id: string
          reason: string
          return_kind: string
          return_quantity: number
          return_unit: string
          target_reservation_id: string
          target_weighing_id: string
        }
        Returns: Json
      }
      record_batch_material_weighing: {
        Args: {
          candidate_idempotency_key: string
          equipment_reference: string
          evidence_reference: string
          expected_reservation_revision: number
          operator_note: string
          record_type: string
          target_reservation_id: string
          weighing_quantity: number
          weighing_unit: string
        }
        Returns: Json
      }
      record_batch_material_weighing_v2: {
        Args: {
          candidate_idempotency_key: string
          equipment_reference: string
          evidence_reference: string
          expected_reservation_revision: number
          operator_note: string
          planned_container: string
          planned_sequence: number
          record_type: string
          target_reservation_id: string
          weighing_quantity: number
          weighing_unit: string
        }
        Returns: Json
      }
      record_packaging_bulk_transfer_v1: {
        Args: {
          candidate_destination_vessel: string
          candidate_equipment_reference: string
          candidate_evidence_reference: string
          candidate_idempotency_key: string
          candidate_measurement_method: string
          candidate_note: string
          candidate_quantity: number
          candidate_source_vessel: string
          candidate_transferred_at: string
          candidate_unit: string
          expected_run_revision: number
          target_bulk_allocation_id: string
        }
        Returns: Json
      }
      record_packaging_inventory_use_v1: {
        Args: {
          candidate_category: string
          candidate_evidence_reference: string
          candidate_idempotency_key: string
          candidate_occurred_at: string
          candidate_quantity: number
          candidate_reason: string
          candidate_unit: string
          candidate_use_type: string
          expected_run_revision: number
          target_packaging_reservation_id: string
        }
        Returns: Json
      }
      record_production_output_component_v1: {
        Args: {
          candidate_approval_state: string
          candidate_component_type: string
          candidate_evidence_reference: string
          candidate_idempotency_key: string
          candidate_quantity: number
          candidate_reason: string
          candidate_recorded_at: string
          candidate_unit: string
          expected_output_revision: number
          target_production_output_id: string
        }
        Returns: Json
      }
      record_production_output_measurement_v1: {
        Args: {
          candidate_equipment_reference: string
          candidate_evidence_reference: string
          candidate_gross_quantity: number
          candidate_idempotency_key: string
          candidate_measured_at: string
          candidate_method: string
          candidate_note: string
          candidate_quantity: number
          candidate_tare_quantity: number
          candidate_unit: string
          candidate_vessel_reference: string
          expected_output_revision: number
          target_production_output_id: string
        }
        Returns: Json
      }
      record_purchase_order_placement: {
        Args: {
          expected_revision: number
          external_reference: string
          placed_at?: string
          target_order_id: string
        }
        Returns: number
      }
      record_purchase_order_receipt_discrepancy: {
        Args: {
          candidate_idempotency_key: string
          discrepancy_payload: Json
          expected_receipt_revision: number
          target_receipt_id: string
        }
        Returns: string
      }
      record_purchase_order_receipt_inspection: {
        Args: {
          candidate_idempotency_key: string
          expected_receipt_revision: number
          inspection_payload: Json
          target_receipt_id: string
        }
        Returns: string
      }
      record_purchase_order_receipt_line: {
        Args: {
          candidate_idempotency_key: string
          expected_receipt_revision: number
          line_payload: Json
          target_receipt_id: string
        }
        Returns: string
      }
      record_purchase_order_shipment_status: {
        Args: {
          candidate_idempotency_key: string
          candidate_status: string
          expected_revision: number
          status_payload: Json
          target_shipment_id: string
        }
        Returns: number
      }
      record_purchase_order_supplier_confirmation: {
        Args: {
          candidate_idempotency_key: string
          confirmation_payload: Json
          expected_order_revision: number
          target_order_id: string
        }
        Returns: string
      }
      record_purchase_plan_verification: {
        Args: {
          candidate_evidence: string
          candidate_method: string
          candidate_note: string
          candidate_state: string
          candidate_unit_or_currency: string
          candidate_verified_value: Json
          expected_revision: number
          target_verification_id: string
        }
        Returns: number
      }
      record_scent_memory_checkpoint: {
        Args: {
          checkpoint: Json
          correction_of?: string
          target_session_id: string
        }
        Returns: string
      }
      record_v9_migration_failure: {
        Args: { error_message: string }
        Returns: string
      }
      record_verified_purchase_order_placement: {
        Args: {
          candidate_placement_key: string
          expected_revision: number
          placement_payload: Json
          target_order_id: string
        }
        Returns: number
      }
      regenerate_production_procurement_requirements: {
        Args: { expected_revision: number; target_round_id: string }
        Returns: number
      }
      register_document_object: {
        Args: {
          byte_size: number
          content_checksum?: string
          content_type: string
          document_id: string
          dossier_id: string
          file_name: string
          object_bucket: string
          path: string
        }
        Returns: {
          bucket: string
          checksum: string | null
          compliance_dossier_id: string | null
          document_record_id: string
          file_version: number
          id: string
          mime_type: string
          object_path: string
          original_file_name: string
          owner_id: string
          removed_at: string | null
          replaced_by: string | null
          size: number
          state: string
          uploaded_at: string
          uploader_id: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "document_objects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_finished_goods_output: {
        Args: { batch: Json; receipt?: Json }
        Returns: Json
      }
      reject_production_requirement_candidate: {
        Args: {
          expected_round_revision: number
          rejection_note: string
          target_candidate_id: string
        }
        Returns: number
      }
      release_batch_material_reservation: {
        Args: {
          candidate_idempotency_key: string
          expected_reservation_revision: number
          release_quantity: number
          release_reason: string
          target_reservation_id: string
        }
        Returns: Json
      }
      release_packaging_reservation_v1: {
        Args: {
          candidate_condition_acceptable: boolean
          candidate_evidence_reference: string
          candidate_idempotency_key: string
          candidate_reason: string
          candidate_staged_return: boolean
          expected_run_revision: number
          target_packaging_reservation_id: string
        }
        Returns: Json
      }
      release_packaging_run_bulk_allocation_v1: {
        Args: {
          candidate_idempotency_key: string
          candidate_reason: string
          expected_run_revision: number
          target_bulk_allocation_id: string
        }
        Returns: Json
      }
      remove_current_document_object: {
        Args: { document_id: string }
        Returns: {
          bucket: string
          checksum: string | null
          compliance_dossier_id: string | null
          document_record_id: string
          file_version: number
          id: string
          mime_type: string
          object_path: string
          original_file_name: string
          owner_id: string
          removed_at: string | null
          replaced_by: string | null
          size: number
          state: string
          uploaded_at: string
          uploader_id: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "document_objects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reopen_beard_analysis: {
        Args: { candidate_analysis_id: string; candidate_workspace_id: string }
        Returns: Json
      }
      reschedule_procurement_background_operation: {
        Args: {
          candidate_attempt_id: string
          candidate_worker_id: string
          delay_seconds: number
          increment_failure?: boolean
          safe_failure_code: string
        }
        Returns: boolean
      }
      reserve_batch_material_inventory: {
        Args: {
          allocation_method: string
          candidate_idempotency_key: string
          expected_batch_revision: number
          reservation_quantity: number
          reservation_unit: string
          target_batch_id: string
          target_batch_kind: string
          target_inventory_lot_id: string
          target_requirement_id: string
        }
        Returns: Json
      }
      reserve_packaging_run_requirement_v1: {
        Args: {
          candidate_idempotency_key: string
          candidate_quantity: number
          candidate_unit: string
          expected_run_revision: number
          target_packaging_inventory_lot_id: string
          target_packaging_requirement_id: string
        }
        Returns: Json
      }
      reserve_packaging_run_requirements_v1: {
        Args: {
          candidate_idempotency_key: string
          candidates: Json
          expected_run_revision: number
          target_packaging_run_id: string
        }
        Returns: Json
      }
      review_quarantined_inventory: {
        Args: {
          candidate_idempotency_key: string
          expected_intake_revision: number
          review_payload: Json
          target_quarantine_intake_id: string
        }
        Returns: Json
      }
      save_beard_studio_workspace: { Args: { payload: Json }; Returns: Json }
      save_ingredient_knowledge_aggregate: {
        Args: { aggregate: Json; expected_updated_at?: string }
        Returns: Json
      }
      select_production_requirement_supplier_product: {
        Args: {
          expected_match_revision: number
          expected_round_revision: number
          target_candidate_id: string
          target_requirement_id: string
        }
        Returns: number
      }
      start_procurement_background_submission: {
        Args: { candidate_attempt_id: string }
        Returns: boolean
      }
      store_procurement_background_webhook: {
        Args: {
          candidate_event_id: string
          candidate_event_type: string
          candidate_provider_operation_id: string
        }
        Returns: string
      }
      transition_development_experiment: {
        Args: {
          expected_revision: number
          note?: string
          target_id: string
          target_status: string
        }
        Returns: number
      }
      update_production_procurement_round_products: {
        Args: {
          expected_revision: number
          product_selections: Json
          round_notes: string
          round_title: string
          target_round_id: string
        }
        Returns: number
      }
      waive_purchase_plan_verification: {
        Args: {
          expected_revision: number
          target_verification_id: string
          waiver_reason: string
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

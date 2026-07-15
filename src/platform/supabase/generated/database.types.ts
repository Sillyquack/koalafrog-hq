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
          development_notes: string | null
          formula_id: string
          id: string
          owner_id: string
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
          development_notes?: string | null
          formula_id: string
          id: string
          owner_id: string
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
          development_notes?: string | null
          formula_id?: string
          id?: string
          owner_id?: string
          process_instructions?: string | null
          status?: string
          target_characteristics?: string
          updated_at?: string
          version?: string
          workspace_id?: string
        }
        Relationships: [
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
      ingredients: {
        Row: {
          category: string
          common_name: string
          created_at: string
          default_unit: string
          description: string
          functions: string[]
          id: string
          inci_name: string
          notes: string
          owner_id: string
          reorder_threshold: number | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category: string
          common_name: string
          created_at: string
          default_unit: string
          description: string
          functions: string[]
          id: string
          inci_name: string
          notes: string
          owner_id: string
          reorder_threshold?: number | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Update: {
          category?: string
          common_name?: string
          created_at?: string
          default_unit?: string
          description?: string
          functions?: string[]
          id?: string
          inci_name?: string
          notes?: string
          owner_id?: string
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
      inventory_lots: {
        Row: {
          acquisition_cost_currency: string | null
          best_before_date: string | null
          cost_notes: string | null
          created_at: string
          expiry_date: string | null
          id: string
          ingredient_id: string
          internal_lot_number: string
          location: string
          notes: string
          opening_quantity: number
          owner_id: string
          received_date: string
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
          cost_notes?: string | null
          created_at: string
          expiry_date?: string | null
          id: string
          ingredient_id: string
          internal_lot_number: string
          location: string
          notes: string
          opening_quantity: number
          owner_id: string
          received_date: string
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
          cost_notes?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          ingredient_id?: string
          internal_lot_number?: string
          location?: string
          notes?: string
          opening_quantity?: number
          owner_id?: string
          received_date?: string
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
      lab_batch_lines: {
        Row: {
          actual_quantity: number | null
          formula_line_id: string
          id: string
          ingredient_id: string
          ingredient_name_snapshot: string
          lab_batch_id: string
          notes: string
          owner_id: string
          phase: string
          planned_percentage: number
          planned_quantity: number
          status: string
          unit: string
          variance: number | null
          workspace_id: string
        }
        Insert: {
          actual_quantity?: number | null
          formula_line_id: string
          id: string
          ingredient_id: string
          ingredient_name_snapshot: string
          lab_batch_id: string
          notes: string
          owner_id: string
          phase: string
          planned_percentage: number
          planned_quantity: number
          status: string
          unit: string
          variance?: number | null
          workspace_id: string
        }
        Update: {
          actual_quantity?: number | null
          formula_line_id?: string
          id?: string
          ingredient_id?: string
          ingredient_name_snapshot?: string
          lab_batch_id?: string
          notes?: string
          owner_id?: string
          phase?: string
          planned_percentage?: number
          planned_quantity?: number
          status?: string
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
          formula_id: string
          formula_version_id: string
          id: string
          notes: string
          owner_id: string
          planned_batch_size: number
          planned_batch_unit: string
          product_id: string
          purpose: string
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
          formula_id: string
          formula_version_id: string
          id: string
          notes: string
          owner_id: string
          planned_batch_size: number
          planned_batch_unit: string
          product_id: string
          purpose: string
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
          formula_id?: string
          formula_version_id?: string
          id?: string
          notes?: string
          owner_id?: string
          planned_batch_size?: number
          planned_batch_unit?: string
          product_id?: string
          purpose?: string
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
          completed_at: string | null
          id: string
          instruction: string
          lab_batch_id: string
          notes: string
          owner_id: string
          status: string
          step_number: number
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          id: string
          instruction: string
          lab_batch_id: string
          notes: string
          owner_id: string
          status: string
          step_number: number
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          instruction?: string
          lab_batch_id?: string
          notes?: string
          owner_id?: string
          status?: string
          step_number?: number
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
          created_at: string
          currency: string
          id: string
          is_preferred: boolean
          notes: string
          owner_id: string
          package_quantity: number
          package_unit: string
          packaging_component_id: string
          price: number
          product_name: string
          product_url: string | null
          supplier_name: string
          supplier_sku: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at: string
          currency: string
          id: string
          is_preferred: boolean
          notes: string
          owner_id: string
          package_quantity: number
          package_unit: string
          packaging_component_id: string
          price: number
          product_name: string
          product_url?: string | null
          supplier_name: string
          supplier_sku?: string | null
          updated_at: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_preferred?: boolean
          notes?: string
          owner_id?: string
          package_quantity?: number
          package_unit?: string
          packaging_component_id?: string
          price?: number
          product_name?: string
          product_url?: string | null
          supplier_name?: string
          supplier_sku?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
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
      production_run_lines: {
        Row: {
          actual_quantity: number | null
          formula_line_id: string
          id: string
          ingredient_id: string
          ingredient_name_snapshot: string
          notes: string
          owner_id: string
          phase: string
          planned_percentage: number
          planned_quantity: number
          production_run_id: string
          status: string
          unit: string
          variance: number | null
          workspace_id: string
        }
        Insert: {
          actual_quantity?: number | null
          formula_line_id: string
          id: string
          ingredient_id: string
          ingredient_name_snapshot: string
          notes: string
          owner_id: string
          phase: string
          planned_percentage: number
          planned_quantity: number
          production_run_id: string
          status: string
          unit: string
          variance?: number | null
          workspace_id: string
        }
        Update: {
          actual_quantity?: number | null
          formula_line_id?: string
          id?: string
          ingredient_id?: string
          ingredient_name_snapshot?: string
          notes?: string
          owner_id?: string
          phase?: string
          planned_percentage?: number
          planned_quantity?: number
          production_run_id?: string
          status?: string
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
          notes: string
          owner_id: string
          planned_batch_size: number
          planned_batch_unit: string
          planned_units: number | null
          product_id: string
          production_run_number: string
          purpose: string
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
          notes: string
          owner_id: string
          planned_batch_size: number
          planned_batch_unit: string
          planned_units?: number | null
          product_id: string
          production_run_number: string
          purpose: string
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
          notes?: string
          owner_id?: string
          planned_batch_size?: number
          planned_batch_unit?: string
          planned_units?: number | null
          product_id?: string
          production_run_number?: string
          purpose?: string
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
      supplier_products: {
        Row: {
          created_at: string
          currency: string
          id: string
          ingredient_id: string
          is_preferred: boolean
          notes: string
          owner_id: string
          package_quantity: number
          package_unit: string
          price: number
          product_name: string
          product_url: string | null
          supplier_name: string
          supplier_sku: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at: string
          currency: string
          id: string
          ingredient_id: string
          is_preferred: boolean
          notes: string
          owner_id: string
          package_quantity: number
          package_unit: string
          price: number
          product_name: string
          product_url?: string | null
          supplier_name: string
          supplier_sku?: string | null
          updated_at: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          ingredient_id?: string
          is_preferred?: boolean
          notes?: string
          owner_id?: string
          package_quantity?: number
          package_unit?: string
          price?: number
          product_name?: string
          product_url?: string | null
          supplier_name?: string
          supplier_sku?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
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
      complete_v9_reconciliation: {
        Args: { report: Json; run_id: string }
        Returns: undefined
      }
      create_clean_workspace: { Args: never; Returns: string }
      import_v9_relational: { Args: { payload: Json }; Returns: Json }
      kf_convert_quantity: {
        Args: { from_unit: string; q: number; to_unit: string }
        Returns: number
      }
      kf_inventory_balance: {
        Args: { lot_id: string; wid: string }
        Returns: number
      }
      kf_packaging_balance: {
        Args: { lot_id: string; wid: string }
        Returns: number
      }
      record_v9_migration_failure: {
        Args: { error_message: string }
        Returns: string
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

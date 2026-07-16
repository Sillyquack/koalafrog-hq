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
          development_experiment_id?: string | null
          development_experiment_variant_id?: string | null
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
          development_experiment_id?: string | null
          development_experiment_variant_id?: string | null
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
          reorder_threshold: number | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
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
          reorder_threshold?: number | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Update: {
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
          development_experiment_id: string | null
          development_experiment_variant_id: string | null
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
          development_experiment_id?: string | null
          development_experiment_variant_id?: string | null
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
          development_experiment_id?: string | null
          development_experiment_variant_id?: string | null
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
      purchase_plan_lines: {
        Row: {
          created_at: string
          currency: string | null
          description: string
          display_order: number
          estimated_line_total: number | null
          estimated_unit_price: number | null
          id: string
          inventory_domain: string
          owner_id: string
          pack_count: number | null
          pack_size: number | null
          planned_quantity: number
          purchase_plan_id: string
          received_quantity: number
          requirement_basis: Json
          requirement_reason: string | null
          source_quote_line_id: string | null
          supplier_product_id: string | null
          unit: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          description: string
          display_order?: number
          estimated_line_total?: number | null
          estimated_unit_price?: number | null
          id?: string
          inventory_domain: string
          owner_id: string
          pack_count?: number | null
          pack_size?: number | null
          planned_quantity: number
          purchase_plan_id: string
          received_quantity?: number
          requirement_basis?: Json
          requirement_reason?: string | null
          source_quote_line_id?: string | null
          supplier_product_id?: string | null
          unit: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          description?: string
          display_order?: number
          estimated_line_total?: number | null
          estimated_unit_price?: number | null
          id?: string
          inventory_domain?: string
          owner_id?: string
          pack_count?: number | null
          pack_size?: number | null
          planned_quantity?: number
          purchase_plan_id?: string
          received_quantity?: number
          requirement_basis?: Json
          requirement_reason?: string | null
          source_quote_line_id?: string | null
          supplier_product_id?: string | null
          unit?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
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
      purchase_plans: {
        Row: {
          approved_at: string | null
          archived_at: string | null
          cancelled_at: string | null
          created_at: string
          creation_key: string
          currency: string | null
          estimated_landed_total: number | null
          estimated_merchandise_total: number | null
          external_order_key: string | null
          id: string
          internal_notes: string
          ordered_at: string | null
          owner_id: string
          purpose: string
          revision: number
          source_id: string | null
          source_type: string | null
          status: string
          supplier_id: string | null
          target_date: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approved_at?: string | null
          archived_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          creation_key?: string
          currency?: string | null
          estimated_landed_total?: number | null
          estimated_merchandise_total?: number | null
          external_order_key?: string | null
          id?: string
          internal_notes?: string
          ordered_at?: string | null
          owner_id: string
          purpose?: string
          revision?: number
          source_id?: string | null
          source_type?: string | null
          status?: string
          supplier_id?: string | null
          target_date?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approved_at?: string | null
          archived_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          creation_key?: string
          currency?: string | null
          estimated_landed_total?: number | null
          estimated_merchandise_total?: number | null
          external_order_key?: string | null
          id?: string
          internal_notes?: string
          ordered_at?: string | null
          owner_id?: string
          purpose?: string
          revision?: number
          source_id?: string | null
          source_type?: string | null
          status?: string
          supplier_id?: string | null
          target_date?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
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
      supplier_products: {
        Row: {
          availability_status: string | null
          created_at: string
          currency: string
          discontinued: boolean
          id: string
          ingredient_id: string
          is_preferred: boolean
          last_verified_date: string | null
          lead_time_days: number | null
          moq: number | null
          notes: string
          order_multiple: number | null
          owner_id: string
          package_quantity: number
          package_unit: string
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
          ingredient_id: string
          is_preferred: boolean
          last_verified_date?: string | null
          lead_time_days?: number | null
          moq?: number | null
          notes: string
          order_multiple?: number | null
          owner_id: string
          package_quantity: number
          package_unit: string
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
          ingredient_id?: string
          is_preferred?: boolean
          last_verified_date?: string | null
          lead_time_days?: number | null
          moq?: number | null
          notes?: string
          order_multiple?: number | null
          owner_id?: string
          package_quantity?: number
          package_unit?: string
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
      convert_supplier_candidate: {
        Args: { candidate_id: string; idempotency: string }
        Returns: string
      }
      create_clean_workspace: { Args: never; Returns: string }
      create_development_experiment: { Args: { plan: Json }; Returns: string }
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
      mark_packaging_supplier_product_preferred: {
        Args: { p_expected_updated_at: string; p_product_id: string }
        Returns: undefined
      }
      mark_purchase_plan_external_order: {
        Args: { idempotency: string; plan_id: string }
        Returns: string
      }
      mark_supplier_product_preferred: {
        Args: { p_expected_updated_at: string; p_product_id: string }
        Returns: undefined
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
      transition_development_experiment: {
        Args: {
          expected_revision: number
          note?: string
          target_id: string
          target_status: string
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

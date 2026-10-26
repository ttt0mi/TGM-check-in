export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      departments: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      host_decision_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          outcome: string | null
          token_hash: string
          visit_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          outcome?: string | null
          token_hash: string
          visit_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          outcome?: string | null
          token_hash?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_decision_tokens_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      host_notification_attempts: {
        Row: {
          attempted_at: string
          error_code: string | null
          id: string
          idempotency_key: string
          provider_message_id: string | null
          recipient_email: string
          sent_at: string | null
          status: Database["public"]["Enums"]["tgm_notification_status"]
          updated_at: string
          visit_id: string
        }
        Insert: {
          attempted_at?: string
          error_code?: string | null
          id?: string
          idempotency_key: string
          provider_message_id?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["tgm_notification_status"]
          updated_at?: string
          visit_id: string
        }
        Update: {
          attempted_at?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string
          provider_message_id?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["tgm_notification_status"]
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_notification_attempts_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string
          admission_overdue_minutes: number
          auto_close_enabled: boolean
          auto_close_local_time: string | null
          created_at: string
          host_overdue_minutes: number
          id: string
          is_active: boolean
          name: string
          organization_id: string
          public_slug: string
          reception_overdue_minutes: number
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string
          admission_overdue_minutes?: number
          auto_close_enabled?: boolean
          auto_close_local_time?: string | null
          created_at?: string
          host_overdue_minutes?: number
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          public_slug?: string
          reception_overdue_minutes?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string
          admission_overdue_minutes?: number
          auto_close_enabled?: boolean
          auto_close_local_time?: string | null
          created_at?: string
          host_overdue_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          public_slug?: string
          reception_overdue_minutes?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_profiles: {
        Row: {
          created_at: string
          is_active: boolean
          organization_id: string | null
          role: Database["public"]["Enums"]["tgm_operator_role"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          organization_id?: string | null
          role?: Database["public"]["Enums"]["tgm_operator_role"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          organization_id?: string | null
          role?: Database["public"]["Enums"]["tgm_operator_role"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_privacy_notices: {
        Row: {
          approved_at: string
          approved_by: string
          notice_copy: string
          organization_id: string
          policy_url: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          notice_copy: string
          organization_id: string
          policy_url: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          notice_copy?: string
          organization_id?: string
          policy_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_privacy_notices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      public_rate_limit_windows: {
        Row: {
          request_count: number
          request_key_hash: string
          window_start: string
        }
        Insert: {
          request_count?: number
          request_key_hash: string
          window_start: string
        }
        Update: {
          request_count?: number
          request_key_hash?: string
          window_start?: string
        }
        Relationships: []
      }
      receptionist_location_assignments: {
        Row: {
          created_at: string
          location_id: string
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          location_id: string
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          location_id?: string
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_location_organization_fk"
            columns: ["location_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "assignment_operator_organization_fk"
            columns: ["user_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "operator_profiles"
            referencedColumns: ["user_id", "organization_id"]
          },
          {
            foreignKeyName: "receptionist_location_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receptionist_location_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "operator_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          department_id: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          location_id: string
          organization_id: string
          person_id: string
          preferred_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          location_id: string
          organization_id: string
          person_id?: string
          preferred_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          location_id?: string
          organization_id?: string
          person_id?: string
          preferred_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_department_organization_fk"
            columns: ["department_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "staff_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_location_organization_fk"
            columns: ["location_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      visit_events: {
        Row: {
          actor_role: Database["public"]["Enums"]["tgm_operator_role"] | null
          actor_user_id: string | null
          event_source: string
          event_type: string
          id: number
          location_id: string
          metadata: Json
          occurred_at: string
          organization_id: string
          visit_id: string
        }
        Insert: {
          actor_role?: Database["public"]["Enums"]["tgm_operator_role"] | null
          actor_user_id?: string | null
          event_source: string
          event_type: string
          id?: never
          location_id: string
          metadata?: Json
          occurred_at?: string
          organization_id: string
          visit_id: string
        }
        Update: {
          actor_role?: Database["public"]["Enums"]["tgm_operator_role"] | null
          actor_user_id?: string | null
          event_source?: string
          event_type?: string
          id?: never
          location_id?: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_events_actor_organization_fk"
            columns: ["actor_user_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "operator_profiles"
            referencedColumns: ["user_id", "organization_id"]
          },
          {
            foreignKeyName: "visit_events_location_organization_fk"
            columns: ["location_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "visit_events_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_events_visit_organization_fk"
            columns: ["visit_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      visits: {
        Row: {
          admitted_at: string | null
          arrived_at: string
          check_in_method: Database["public"]["Enums"]["tgm_check_in_method"]
          checkout_actor_id: string | null
          checkout_corrected_at: string | null
          checkout_corrected_by: string | null
          checkout_correction_reason: string | null
          checkout_location_id: string | null
          checkout_method:
            | Database["public"]["Enums"]["tgm_checkout_method"]
            | null
          created_at: string
          department_id: string | null
          host_approved_at: string | null
          host_display_name_at_assignment: string | null
          id: string
          location_id: string
          organization: string | null
          organization_id: string
          phone_number: string
          purpose: string
          reception_reviewed_at: string | null
          staff_id: string | null
          status: Database["public"]["Enums"]["tgm_visit_status"]
          submission_idempotency_key: string | null
          time_out: string | null
          updated_at: string
          visit_type: Database["public"]["Enums"]["tgm_visit_type"]
          visitor_email: string | null
          visitor_full_name: string
          visitor_preferred_name: string | null
        }
        Insert: {
          admitted_at?: string | null
          arrived_at?: string
          check_in_method: Database["public"]["Enums"]["tgm_check_in_method"]
          checkout_actor_id?: string | null
          checkout_corrected_at?: string | null
          checkout_corrected_by?: string | null
          checkout_correction_reason?: string | null
          checkout_location_id?: string | null
          checkout_method?:
            | Database["public"]["Enums"]["tgm_checkout_method"]
            | null
          created_at?: string
          department_id?: string | null
          host_approved_at?: string | null
          host_display_name_at_assignment?: string | null
          id?: string
          location_id: string
          organization?: string | null
          organization_id: string
          phone_number: string
          purpose: string
          reception_reviewed_at?: string | null
          staff_id?: string | null
          status?: Database["public"]["Enums"]["tgm_visit_status"]
          submission_idempotency_key?: string | null
          time_out?: string | null
          updated_at?: string
          visit_type: Database["public"]["Enums"]["tgm_visit_type"]
          visitor_email?: string | null
          visitor_full_name: string
          visitor_preferred_name?: string | null
        }
        Update: {
          admitted_at?: string | null
          arrived_at?: string
          check_in_method?: Database["public"]["Enums"]["tgm_check_in_method"]
          checkout_actor_id?: string | null
          checkout_corrected_at?: string | null
          checkout_corrected_by?: string | null
          checkout_correction_reason?: string | null
          checkout_location_id?: string | null
          checkout_method?:
            | Database["public"]["Enums"]["tgm_checkout_method"]
            | null
          created_at?: string
          department_id?: string | null
          host_approved_at?: string | null
          host_display_name_at_assignment?: string | null
          id?: string
          location_id?: string
          organization?: string | null
          organization_id?: string
          phone_number?: string
          purpose?: string
          reception_reviewed_at?: string | null
          staff_id?: string | null
          status?: Database["public"]["Enums"]["tgm_visit_status"]
          submission_idempotency_key?: string | null
          time_out?: string | null
          updated_at?: string
          visit_type?: Database["public"]["Enums"]["tgm_visit_type"]
          visitor_email?: string | null
          visitor_full_name?: string
          visitor_preferred_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_checkout_actor_organization_fk"
            columns: ["checkout_actor_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "operator_profiles"
            referencedColumns: ["user_id", "organization_id"]
          },
          {
            foreignKeyName: "visits_checkout_corrector_organization_fk"
            columns: ["checkout_corrected_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "operator_profiles"
            referencedColumns: ["user_id", "organization_id"]
          },
          {
            foreignKeyName: "visits_checkout_location_organization_fk"
            columns: ["checkout_location_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "visits_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_department_organization_fk"
            columns: ["department_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "visits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_location_organization_fk"
            columns: ["location_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "visits_staff_id_location_id_department_id_fkey"
            columns: ["staff_id", "location_id", "department_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "location_id", "department_id"]
          },
          {
            foreignKeyName: "visits_staff_tenant_location_department_fk"
            columns: [
              "staff_id",
              "organization_id",
              "location_id",
              "department_id",
            ]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: [
              "id",
              "organization_id",
              "location_id",
              "department_id",
            ]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      tgm_accept_operator_invitation: {
        Args: { p_actor_id: string; p_token_hash: string }
        Returns: string
      }
      tgm_apply_auto_close: { Args: { p_limit?: number }; Returns: number }
      tgm_approve_privacy_notice: {
        Args: {
          p_notice_copy: string
          p_organization_id: string
          p_policy_url: string
        }
        Returns: undefined
      }
      tgm_consume_public_rate_limit: {
        Args: {
          p_limit: number
          p_request_key_hash: string
          p_window_start: string
        }
        Returns: boolean
      }
      tgm_create_assisted_visit: {
        Args: {
          p_actor_id: string
          p_department_id: string
          p_idempotency_key: string
          p_location_id: string
          p_organization: string
          p_phone_number: string
          p_purpose: string
          p_staff_id: string
          p_visit_type: Database["public"]["Enums"]["tgm_visit_type"]
          p_visitor_email: string
          p_visitor_full_name: string
          p_visitor_preferred_name: string
        }
        Returns: string
      }
      tgm_create_branch: {
        Args: {
          p_actor_id: string
          p_address: string
          p_name: string
          p_timezone: string
        }
        Returns: string
      }
      tgm_create_operator_invitation: {
        Args: {
          p_actor_id: string
          p_email: string
          p_location_id: string
          p_role: Database["public"]["Enums"]["tgm_operator_role"]
          p_token_hash: string
        }
        Returns: string
      }
      tgm_create_public_visit:
        | {
            Args: {
              p_department_id: string
              p_organization: string
              p_phone_number: string
              p_public_slug: string
              p_purpose: string
              p_staff_id: string
              p_submission_idempotency_key: string
              p_visit_type: Database["public"]["Enums"]["tgm_visit_type"]
              p_visitor_email: string
              p_visitor_full_name: string
              p_visitor_preferred_name: string
            }
            Returns: string
          }
        | {
            Args: {
              p_department_id: string
              p_organization: string
              p_phone_number: string
              p_public_slug: string
              p_purpose: string
              p_staff_id: string
              p_submission_idempotency_key: string
              p_visit_type: Database["public"]["Enums"]["tgm_visit_type"]
              p_visitor_email: string
              p_visitor_full_name: string
              p_visitor_preferred_name: string
              p_visitor_session_token_hash: string
            }
            Returns: string
          }
      tgm_finish_host_email: {
        Args: {
          p_attempt_id: string
          p_error_code?: string
          p_provider_message_id?: string
          p_status: Database["public"]["Enums"]["tgm_notification_status"]
        }
        Returns: boolean
      }
      tgm_finish_visit_export: {
        Args: { p_actor_id: string; p_export_id: string; p_row_count: number }
        Returns: undefined
      }
      tgm_get_visitor_visit: {
        Args: { p_token_hash: string }
        Returns: {
          admitted_at: string
          branch_name: string
          host_name: string
          organization_name: string
          self_checkout_available: boolean
          status: Database["public"]["Enums"]["tgm_visit_status"]
          time_out: string
          visitor_display_name: string
        }[]
      }
      tgm_list_organization_invitations: {
        Args: { p_actor_id: string }
        Returns: {
          accepted_at: string
          created_at: string
          delivery_status: string
          email: string
          expires_at: string
          id: string
          location_id: string
          resend_count: number
          revoked_at: string
          role: Database["public"]["Enums"]["tgm_operator_role"]
        }[]
      }
      tgm_list_organization_invitations_page: {
        Args: {
          p_actor_id: string
          p_after_created_at?: string
          p_after_id?: string
          p_limit?: number
          p_search?: string
        }
        Returns: {
          accepted_at: string
          created_at: string
          delivery_status: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          inviter_email: string
          last_attempt_at: string
          location_id: string
          resend_count: number
          revoked_at: string
          role: Database["public"]["Enums"]["tgm_operator_role"]
        }[]
      }
      tgm_list_organization_operators: {
        Args: { p_actor_id: string }
        Returns: {
          email: string
          is_active: boolean
          location_id: string
          role: Database["public"]["Enums"]["tgm_operator_role"]
          user_id: string
        }[]
      }
      tgm_list_organization_operators_page: {
        Args: {
          p_actor_id: string
          p_after_email?: string
          p_after_id?: string
          p_limit?: number
          p_search?: string
        }
        Returns: {
          email: string
          is_active: boolean
          location_id: string
          role: Database["public"]["Enums"]["tgm_operator_role"]
          user_id: string
        }[]
      }
      tgm_list_visit_queue: {
        Args: {
          p_after_arrived_at?: string
          p_after_id?: string
          p_location_id: string
          p_page_size?: number
          p_search?: string
          p_status?: Database["public"]["Enums"]["tgm_visit_status"]
        }
        Returns: {
          admitted_at: string | null
          arrived_at: string
          check_in_method: Database["public"]["Enums"]["tgm_check_in_method"]
          checkout_actor_id: string | null
          checkout_corrected_at: string | null
          checkout_corrected_by: string | null
          checkout_correction_reason: string | null
          checkout_location_id: string | null
          checkout_method:
            | Database["public"]["Enums"]["tgm_checkout_method"]
            | null
          created_at: string
          department_id: string | null
          host_approved_at: string | null
          host_display_name_at_assignment: string | null
          id: string
          location_id: string
          organization: string | null
          organization_id: string
          phone_number: string
          purpose: string
          reception_reviewed_at: string | null
          staff_id: string | null
          status: Database["public"]["Enums"]["tgm_visit_status"]
          submission_idempotency_key: string | null
          time_out: string | null
          updated_at: string
          visit_type: Database["public"]["Enums"]["tgm_visit_type"]
          visitor_email: string | null
          visitor_full_name: string
          visitor_preferred_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      tgm_manage_operator: {
        Args: {
          p_action: string
          p_actor_id: string
          p_location_id?: string
          p_role?: Database["public"]["Enums"]["tgm_operator_role"]
          p_target_id: string
        }
        Returns: {
          created_at: string
          is_active: boolean
          organization_id: string | null
          role: Database["public"]["Enums"]["tgm_operator_role"] | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "operator_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tgm_mark_operator_invitation_delivery: {
        Args: {
          p_error?: string
          p_invitation_id: string
          p_provider_id?: string
          p_status: string
        }
        Returns: undefined
      }
      tgm_mark_stale_host_email: {
        Args: { p_actor_id: string; p_visit_id: string }
        Returns: number
      }
      tgm_move_staff_assignment: {
        Args: {
          p_actor_id: string
          p_department_id: string
          p_location_id: string
          p_staff_id: string
        }
        Returns: {
          created_at: string
          department_id: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          location_id: string
          organization_id: string
          person_id: string
          preferred_name: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "staff"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tgm_operator_visit_action: {
        Args: {
          p_action: string
          p_actor_id: string
          p_patch?: Json
          p_visit_id: string
        }
        Returns: {
          admitted_at: string | null
          arrived_at: string
          check_in_method: Database["public"]["Enums"]["tgm_check_in_method"]
          checkout_actor_id: string | null
          checkout_corrected_at: string | null
          checkout_corrected_by: string | null
          checkout_correction_reason: string | null
          checkout_location_id: string | null
          checkout_method:
            | Database["public"]["Enums"]["tgm_checkout_method"]
            | null
          created_at: string
          department_id: string | null
          host_approved_at: string | null
          host_display_name_at_assignment: string | null
          id: string
          location_id: string
          organization: string | null
          organization_id: string
          phone_number: string
          purpose: string
          reception_reviewed_at: string | null
          staff_id: string | null
          status: Database["public"]["Enums"]["tgm_visit_status"]
          submission_idempotency_key: string | null
          time_out: string | null
          updated_at: string
          visit_type: Database["public"]["Enums"]["tgm_visit_type"]
          visitor_email: string | null
          visitor_full_name: string
          visitor_preferred_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tgm_operator_visit_action_core: {
        Args: {
          p_action: string
          p_actor_id: string
          p_patch?: Json
          p_visit_id: string
        }
        Returns: {
          admitted_at: string | null
          arrived_at: string
          check_in_method: Database["public"]["Enums"]["tgm_check_in_method"]
          checkout_actor_id: string | null
          checkout_corrected_at: string | null
          checkout_corrected_by: string | null
          checkout_correction_reason: string | null
          checkout_location_id: string | null
          checkout_method:
            | Database["public"]["Enums"]["tgm_checkout_method"]
            | null
          created_at: string
          department_id: string | null
          host_approved_at: string | null
          host_display_name_at_assignment: string | null
          id: string
          location_id: string
          organization: string | null
          organization_id: string
          phone_number: string
          purpose: string
          reception_reviewed_at: string | null
          staff_id: string | null
          status: Database["public"]["Enums"]["tgm_visit_status"]
          submission_idempotency_key: string | null
          time_out: string | null
          updated_at: string
          visit_type: Database["public"]["Enums"]["tgm_visit_type"]
          visitor_email: string | null
          visitor_full_name: string
          visitor_preferred_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tgm_prepare_host_email: {
        Args: {
          p_actor_id: string
          p_idempotency_key: string
          p_token_hash: string
          p_visit_id: string
        }
        Returns: string
      }
      tgm_preview_host_decision: {
        Args: { p_token_hash: string }
        Returns: Json
      }
      tgm_preview_operator_invitation: {
        Args: { p_actor_id: string; p_token_hash: string }
        Returns: {
          branch_name: string
          expires_at: string
          invited_email: string
          invited_role: Database["public"]["Enums"]["tgm_operator_role"]
          organization_name: string
          state: string
        }[]
      }
      tgm_public_visit_retry_matches:
        | {
            Args: {
              p_department_id: string
              p_organization: string
              p_phone_number: string
              p_public_slug: string
              p_purpose: string
              p_staff_id: string
              p_submission_idempotency_key: string
              p_visit_type: Database["public"]["Enums"]["tgm_visit_type"]
              p_visitor_email: string
              p_visitor_full_name: string
              p_visitor_preferred_name: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_department_id: string
              p_organization: string
              p_phone_number: string
              p_public_slug: string
              p_purpose: string
              p_staff_id: string
              p_submission_idempotency_key: string
              p_visit_type: Database["public"]["Enums"]["tgm_visit_type"]
              p_visitor_email: string
              p_visitor_full_name: string
              p_visitor_preferred_name: string
              p_visitor_session_token_hash: string
            }
            Returns: boolean
          }
      tgm_register_organization: {
        Args: { p_actor_id: string; p_name: string }
        Returns: string
      }
      tgm_respond_to_host: {
        Args: { p_outcome: string; p_token_hash: string }
        Returns: string
      }
      tgm_revoke_operator_invitation: {
        Args: { p_actor_id: string; p_invitation_id: string }
        Returns: undefined
      }
      tgm_rotate_operator_invitation: {
        Args: {
          p_actor_id: string
          p_invitation_id: string
          p_token_hash: string
        }
        Returns: string
      }
      tgm_start_visit_export: {
        Args: {
          p_actor_id: string
          p_end_date: string
          p_location_id: string
          p_preset: string
          p_redacted: boolean
          p_start_date: string
        }
        Returns: string
      }
      tgm_visit_queue_counts: {
        Args: { p_location_id: string; p_search?: string }
        Returns: Json
      }
      tgm_visit_report_aggregate: {
        Args: {
          p_actor_id: string
          p_end_date?: string
          p_location_id?: string
          p_preset?: string
          p_start_date?: string
        }
        Returns: Json
      }
      tgm_visit_report_page: {
        Args: {
          p_actor_id: string
          p_after_arrived_at?: string
          p_after_id?: string
          p_end_date?: string
          p_limit?: number
          p_location_id?: string
          p_preset?: string
          p_start_date?: string
        }
        Returns: {
          admitted_at: string
          arrived_at: string
          branch_id: string
          branch_name: string
          branch_timezone: string
          check_in_method: string
          host_name: string
          id: string
          phone_number: string
          purpose: string
          status: string
          time_out: string
          visit_type: string
          visitor_email: string
          visitor_full_name: string
          visitor_organization: string
          visitor_preferred_name: string
        }[]
      }
    }
    Enums: {
      tgm_check_in_method: "qr" | "assisted"
      tgm_checkout_method:
        | "self"
        | "receptionist_assisted"
        | "system_auto_close"
        | "admin_correction"
      tgm_notification_status: "sending" | "sent" | "failed" | "unknown"
      tgm_operator_role: "admin" | "receptionist"
      tgm_visit_status:
        | "pending_reception_review"
        | "pending_host_acknowledgement"
        | "host_approved_awaiting_reception"
        | "approved_on_site"
        | "checked_out"
        | "declined"
        | "cancelled"
        | "auto_closed"
      tgm_visit_type:
        | "school"
        | "business"
        | "counselling"
        | "travels"
        | "vendors"
        | "other"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      tgm_check_in_method: ["qr", "assisted"],
      tgm_checkout_method: [
        "self",
        "receptionist_assisted",
        "system_auto_close",
        "admin_correction",
      ],
      tgm_notification_status: ["sending", "sent", "failed", "unknown"],
      tgm_operator_role: ["admin", "receptionist"],
      tgm_visit_status: [
        "pending_reception_review",
        "pending_host_acknowledgement",
        "host_approved_awaiting_reception",
        "approved_on_site",
        "checked_out",
        "declined",
        "cancelled",
        "auto_closed",
      ],
      tgm_visit_type: [
        "school",
        "business",
        "counselling",
        "travels",
        "vendors",
        "other",
      ],
    },
  },
} as const

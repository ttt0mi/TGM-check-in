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
        Relationships: []
      }
      employee_hosts: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id?: string
          name: string
          owner_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      guests: {
        Row: {
          checked_in_at: string | null
          checked_out_at: string | null
          company: string
          created_at: string
          email: string
          host_id: string | null
          host_name: string
          host_notified_at: string | null
          id: string
          name: string
          owner_id: string
          purpose: string
          status: string
        }
        Insert: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          company?: string
          created_at?: string
          email: string
          host_id?: string | null
          host_name: string
          host_notified_at?: string | null
          id?: string
          name: string
          owner_id?: string
          purpose: string
          status?: string
        }
        Update: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          company?: string
          created_at?: string
          email?: string
          host_id?: string | null
          host_name?: string
          host_notified_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          purpose?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "guests_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "employee_hosts"
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
          auto_close_enabled: boolean
          auto_close_local_time: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          public_slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string
          auto_close_enabled?: boolean
          auto_close_local_time?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          public_slug?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string
          auto_close_enabled?: boolean
          auto_close_local_time?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          public_slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
      self_checkout_challenges: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          guest_id: string
          id: string
          owner_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          guest_id: string
          id: string
          owner_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          guest_id?: string
          id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "self_checkout_challenges_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_checkout_challenges_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["owner_id"]
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
            foreignKeyName: "staff_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_events: {
        Row: {
          event_source: string
          event_type: string
          id: number
          metadata: Json
          occurred_at: string
          visit_id: string
        }
        Insert: {
          event_source: string
          event_type: string
          id?: never
          metadata?: Json
          occurred_at?: string
          visit_id: string
        }
        Update: {
          event_source?: string
          event_type?: string
          id?: never
          metadata?: Json
          occurred_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_events_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          admitted_at: string | null
          arrived_at: string
          check_in_method: Database["public"]["Enums"]["tgm_check_in_method"]
          created_at: string
          department_id: string | null
          host_approved_at: string | null
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
          created_at?: string
          department_id?: string | null
          host_approved_at?: string | null
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
          created_at?: string
          department_id?: string | null
          host_approved_at?: string | null
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
            foreignKeyName: "visits_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_staff_id_location_id_department_id_fkey"
            columns: ["staff_id", "location_id", "department_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "location_id", "department_id"]
          },
        ]
      }
      workspace_reception_members: {
        Row: {
          created_at: string
          owner_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          owner_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_reception_members_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      workspaces: {
        Row: {
          company_name: string
          created_at: string
          id: string
          owner_id: string
          reception_token: string
        }
        Insert: {
          company_name?: string
          created_at?: string
          id?: string
          owner_id: string
          reception_token?: string
        }
        Update: {
          company_name?: string
          created_at?: string
          id?: string
          owner_id?: string
          reception_token?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_self_checkout_challenge: {
        Args: {
          challenge_id: string
          reception_token: string
          verification_hash: string
          visitor_email: string
        }
        Returns: {
          created_challenge_id: string
          send_code: boolean
          visitor_name: string
        }[]
      }
      get_my_reception_access: {
        Args: never
        Returns: {
          company_name: string
          owner_id: string
          reception_token: string
          role: string
        }[]
      }
      get_or_create_reception_workspace: {
        Args: never
        Returns: {
          company_name: string
          reception_token: string
        }[]
      }
      get_reception_company_by_qr: {
        Args: { reception_token: string }
        Returns: {
          company_name: string
        }[]
      }
      get_reception_hosts_by_qr: {
        Args: { reception_token: string }
        Returns: {
          host_name: string
        }[]
      }
      is_reception_member: {
        Args: { workspace_owner_id: string }
        Returns: boolean
      }
      list_reception_team: {
        Args: never
        Returns: {
          created_at: string
          email: string
          user_id: string
        }[]
      }
      register_visitor_by_qr: {
        Args: {
          reception_token: string
          visit_purpose: string
          visitor_company: string
          visitor_email: string
          visitor_host: string
          visitor_name: string
        }
        Returns: {
          checked_in_at: string
          company: string
          host_name: string
          name: string
          status: string
        }[]
      }
      tgm_apply_auto_close: { Args: { p_limit?: number }; Returns: number }
      tgm_register_organization: {
        Args: { p_actor_id: string; p_name: string }
        Returns: string
      }
      tgm_create_branch: {
        Args: { p_actor_id: string; p_name: string; p_address: string; p_timezone: string }
        Returns: string
      }
      tgm_create_operator_invitation: {
        Args: {
          p_actor_id: string
          p_email: string
          p_role: Database["public"]["Enums"]["tgm_operator_role"]
          p_location_id: string | null
          p_token_hash: string
        }
        Returns: string
      }
      tgm_accept_operator_invitation: {
        Args: { p_actor_id: string; p_token_hash: string }
        Returns: string
      }
      tgm_consume_public_rate_limit: {
        Args: {
          p_limit: number
          p_request_key_hash: string
          p_window_start: string
        }
        Returns: boolean
      }
      tgm_mark_stale_host_email: {
        Args: { p_actor_id: string; p_visit_id: string }
        Returns: number
      }
      tgm_create_assisted_visit: {
        Args: {
          p_actor_id: string
          p_idempotency_key: string
          p_department_id: string
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
      tgm_create_public_visit: {
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
      tgm_finish_host_email: {
        Args: {
          p_attempt_id: string
          p_error_code?: string
          p_provider_message_id?: string
          p_status: Database["public"]["Enums"]["tgm_notification_status"]
        }
        Returns: boolean
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
          created_at: string
          department_id: string | null
          host_approved_at: string | null
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
      tgm_respond_to_host: {
        Args: { p_outcome: string; p_token_hash: string }
        Returns: string
      }
      verify_self_checkout_code: {
        Args: { challenge_id: string; verification_hash: string }
        Returns: boolean
      }
    }
    Enums: {
      tgm_check_in_method: "qr" | "assisted"
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

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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          branch_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          status: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          branch_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          status?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          branch_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          status?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          code: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      catalog_items: {
        Row: {
          base_price: number
          branch_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_global: boolean
          name: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          base_price: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_global?: boolean
          name: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_global?: boolean
          name?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          branch_id: string
          contact_number: string | null
          created_at: string
          created_by: string | null
          customer_type: Database["public"]["Enums"]["customer_type"]
          email: string | null
          full_name: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["customer_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_id: string
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          customer_type?: Database["public"]["Enums"]["customer_type"]
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_id?: string
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          customer_type?: Database["public"]["Enums"]["customer_type"]
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_order_items: {
        Row: {
          base_price: number
          catalog_item_id: string
          catalog_item_name: string
          catalog_item_type: string
          created_at: string
          id: string
          job_order_id: string
          labor_price: number | null
          line_total: number
          packaging_price: number | null
          quantity: number
        }
        Insert: {
          base_price: number
          catalog_item_id: string
          catalog_item_name: string
          catalog_item_type: string
          created_at?: string
          id?: string
          job_order_id: string
          labor_price?: number | null
          line_total: number
          packaging_price?: number | null
          quantity?: number
        }
        Update: {
          base_price?: number
          catalog_item_id?: string
          catalog_item_name?: string
          catalog_item_type?: string
          created_at?: string
          id?: string
          job_order_id?: string
          labor_price?: number | null
          line_total?: number
          packaging_price?: number | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_order_items_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_order_items_job_order_id_fkey"
            columns: ["job_order_id"]
            isOneToOne: false
            referencedRelation: "job_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      job_orders: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          notes: string | null
          order_number: string
          status: Database["public"]["Enums"]["job_order_status"]
          total_amount: number
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          notes?: string | null
          order_number: string
          status?: Database["public"]["Enums"]["job_order_status"]
          total_amount?: number
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          notes?: string | null
          order_number?: string
          status?: Database["public"]["Enums"]["job_order_status"]
          total_amount?: number
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_matrices: {
        Row: {
          branch_id: string
          catalog_item_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          price: number
          pricing_type: Database["public"]["Enums"]["pricing_type"]
          status: Database["public"]["Enums"]["pricing_matrix_status"]
          updated_at: string
        }
        Insert: {
          branch_id: string
          catalog_item_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          price: number
          pricing_type: Database["public"]["Enums"]["pricing_type"]
          status?: Database["public"]["Enums"]["pricing_matrix_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string
          catalog_item_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          price?: number
          pricing_type?: Database["public"]["Enums"]["pricing_type"]
          status?: Database["public"]["Enums"]["pricing_matrix_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_matrices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_matrices_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_matrices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          dark_mode: boolean
          font_size: string
          id: string
          primary_color: string
          sidebar_collapsed: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          dark_mode?: boolean
          font_size?: string
          id?: string
          primary_color?: string
          sidebar_collapsed?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          dark_mode?: boolean
          font_size?: string
          id?: string
          primary_color?: string
          sidebar_collapsed?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      third_party_repairs: {
        Row: {
          cost: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          job_order_id: string
          notes: string | null
          provider_name: string
          repair_date: string
          updated_at: string
        }
        Insert: {
          cost?: number
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          job_order_id: string
          notes?: string | null
          provider_name: string
          repair_date?: string
          updated_at?: string
        }
        Update: {
          cost?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          job_order_id?: string
          notes?: string | null
          provider_name?: string
          repair_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "third_party_repairs_job_order_id_fkey"
            columns: ["job_order_id"]
            isOneToOne: false
            referencedRelation: "job_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_branch_assignments: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_primary: boolean
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_branch_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_branch_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          email: string
          failed_login_attempts: number
          full_name: string
          id: string
          is_active: boolean
          locked_until: string | null
          must_change_password: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          failed_login_attempts?: number
          full_name: string
          id: string
          is_active?: boolean
          locked_until?: string | null
          must_change_password?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          failed_login_attempts?: number
          full_name?: string
          id?: string
          is_active?: boolean
          locked_until?: string | null
          must_change_password?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          branch_id: string
          chassis_number: string | null
          color: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          engine_number: string | null
          id: string
          model: string
          notes: string | null
          orcr: string
          plate_number: string
          status: Database["public"]["Enums"]["vehicle_status"]
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          year: number | null
        }
        Insert: {
          branch_id: string
          chassis_number?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          engine_number?: string | null
          id?: string
          model: string
          notes?: string | null
          orcr: string
          plate_number: string
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          year?: number | null
        }
        Update: {
          branch_id?: string
          chassis_number?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          engine_number?: string | null
          id?: string
          model?: string
          notes?: string | null
          orcr?: string
          plate_number?: string
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_audit_log: {
        Args: {
          p_action: string
          p_branch_id?: string
          p_entity_id: string
          p_entity_type: string
          p_new_values?: Json
          p_old_values?: Json
        }
        Returns: string
      }
      current_user_has_role: {
        Args: { check_role: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      get_current_user_id: { Args: never; Returns: string }
      get_role_level: {
        Args: { role: Database["public"]["Enums"]["user_role"] }
        Returns: number
      }
      get_user_branch_ids: {
        Args: { check_user_id: string }
        Returns: string[]
      }
      get_user_full_data: { Args: { p_user_id: string }; Returns: Json }
      get_user_max_role_level: { Args: { p_user_id: string }; Returns: number }
      get_user_roles: { Args: { user_uuid: string }; Returns: string[] }
      is_admin_or_hm: { Args: { check_user_id: string }; Returns: boolean }
      is_audit_viewer: { Args: { user_id: string }; Returns: boolean }
      is_branch_manager: { Args: { user_id: string }; Returns: boolean }
      is_user_manager: { Args: { user_id: string }; Returns: boolean }
      is_vehicle_manager: { Args: { user_id: string }; Returns: boolean }
      log_admin_action: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_new_values?: Json
          p_old_values?: Json
          p_performed_by_branch_id: string | null
          p_performed_by_user_id: string
        }
        Returns: string
      }
      log_auth_event: {
        Args: { p_user_id: string; p_event_type: string; p_branch_id?: string | null; p_status?: string }
        Returns: string
      }
      update_user_branches: {
        Args: {
          p_branch_ids: string[]
          p_calling_user_id?: string
          p_primary_branch_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      update_user_roles: {
        Args: {
          p_calling_user_id?: string
          p_roles: Database["public"]["Enums"]["user_role"][]
          p_user_id: string
        }
        Returns: Json
      }
      user_has_branch_access: {
        Args: { check_branch_id: string; check_user_id: string }
        Returns: boolean
      }
      user_has_role: {
        Args: {
          check_role: Database["public"]["Enums"]["user_role"]
          check_user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      customer_status: "active" | "inactive"
      customer_type: "individual" | "company"
      job_order_status: "created"
      pricing_matrix_status: "active" | "inactive"
      pricing_type: "labor" | "packaging"
      user_role: "HM" | "POC" | "JS" | "R" | "T" | "ADMIN"
      vehicle_status: "active" | "inactive"
      vehicle_type:
        | "sedan"
        | "suv"
        | "truck"
        | "van"
        | "motorcycle"
        | "hatchback"
        | "coupe"
        | "wagon"
        | "bus"
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
  public: {
    Enums: {
      customer_status: ["active", "inactive"],
      customer_type: ["individual", "company"],
      job_order_status: ["created"],
      pricing_matrix_status: ["active", "inactive"],
      pricing_type: ["labor", "packaging"],
      user_role: ["HM", "POC", "JS", "R", "T", "ADMIN"],
      vehicle_status: ["active", "inactive"],
      vehicle_type: [
        "sedan",
        "suv",
        "truck",
        "van",
        "motorcycle",
        "hatchback",
        "coupe",
        "wagon",
        "bus",
        "other",
      ],
    },
  },
} as const

// Custom types used across the application
export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type UserRole = "HM" | "POC" | "JS" | "R" | "T" | "ADMIN";

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
      inventory_items: {
        Row: {
          approval_requested_at: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          category: string
          cost_price: number
          created_at: string
          created_by: string | null
          id: string
          initial_stock_pending: number
          item_name: string
          reorder_threshold: number
          sku_code: string
          status: Database["public"]["Enums"]["inventory_item_status"]
          unit_of_measure: string
          updated_at: string
        }
        Insert: {
          approval_requested_at?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          category: string
          cost_price: number
          created_at?: string
          created_by?: string | null
          id?: string
          initial_stock_pending?: number
          item_name: string
          reorder_threshold?: number
          sku_code: string
          status?: Database["public"]["Enums"]["inventory_item_status"]
          unit_of_measure: string
          updated_at?: string
        }
        Update: {
          approval_requested_at?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          category?: string
          cost_price?: number
          created_at?: string
          created_by?: string | null
          id?: string
          initial_stock_pending?: number
          item_name?: string
          reorder_threshold?: number
          sku_code?: string
          status?: Database["public"]["Enums"]["inventory_item_status"]
          unit_of_measure?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_order_item_inventories: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          inventory_item_name: string
          job_order_item_id: string
          line_total: number
          quantity: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          inventory_item_name: string
          job_order_item_id: string
          line_total: number
          quantity: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          inventory_item_name?: string
          job_order_item_id?: string
          line_total?: number
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_order_item_inventories_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_order_item_inventories_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_on_hand"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "job_order_item_inventories_job_order_item_id_fkey"
            columns: ["job_order_item_id"]
            isOneToOne: false
            referencedRelation: "job_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      job_order_lines: {
        Row: {
          created_at: string
          id: string
          job_order_id: string
          line_type: string
          metadata: Json
          name: string
          quantity: number
          reference_id: string | null
          total: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_order_id: string
          line_type: string
          metadata?: Json
          name: string
          quantity?: number
          reference_id?: string | null
          total?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_order_id?: string
          line_type?: string
          metadata?: Json
          name?: string
          quantity?: number
          reference_id?: string | null
          total?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_order_lines_job_order_id_fkey"
            columns: ["job_order_id"]
            isOneToOne: false
            referencedRelation: "job_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      job_order_items: {
        Row: {
          created_at: string
          id: string
          inventory_cost: number | null
          job_order_id: string
          labor_item_id: string | null
          labor_price: number | null
          line_total: number
          package_item_id: string
          package_item_name: string
          package_item_type: string
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_cost?: number | null
          job_order_id: string
          labor_item_id?: string | null
          labor_price?: number | null
          line_total: number
          package_item_id: string
          package_item_name: string
          package_item_type: string
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          inventory_cost?: number | null
          job_order_id?: string
          labor_item_id?: string | null
          labor_price?: number | null
          line_total?: number
          package_item_id?: string
          package_item_name?: string
          package_item_type?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_order_items_job_order_id_fkey"
            columns: ["job_order_id"]
            isOneToOne: false
            referencedRelation: "job_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_order_items_labor_item_id_fkey"
            columns: ["labor_item_id"]
            isOneToOne: false
            referencedRelation: "labor_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_order_items_package_item_id_fkey"
            columns: ["package_item_id"]
            isOneToOne: false
            referencedRelation: "package_items"
            referencedColumns: ["id"]
          },
        ]
      }
      job_orders: {
        Row: {
          approval_method: string | null
          approval_notes: string | null
          approval_requested_at: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          assigned_technician_id: string | null
          branch_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completion_time: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          delivered_by: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean
          is_free_rework: boolean
          job_type: "normal" | "backorder"
          notes: string | null
          odometer_reading: number | null
          order_number: string
          payment_recorded_at: string | null
          payment_recorded_by: string | null
          picked_up_by: string | null
          reference_job_order_id: string | null
          rejection_reason: string | null
          rework_reason: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["job_order_status"]
          total_amount: number
          updated_at: string
          vehicle_bay: string | null
          vehicle_class: string
          vehicle_id: string
        }
        Insert: {
          approval_method?: string | null
          approval_notes?: string | null
          approval_requested_at?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_technician_id?: string | null
          branch_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completion_time?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          delivered_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          is_free_rework?: boolean
          job_type?: "normal" | "backorder"
          notes?: string | null
          odometer_reading?: number | null
          order_number: string
          payment_recorded_at?: string | null
          payment_recorded_by?: string | null
          picked_up_by?: string | null
          reference_job_order_id?: string | null
          rejection_reason?: string | null
          rework_reason?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["job_order_status"]
          total_amount?: number
          updated_at?: string
          vehicle_bay?: string | null
          vehicle_class?: string
          vehicle_id: string
        }
        Update: {
          approval_method?: string | null
          approval_notes?: string | null
          approval_requested_at?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_technician_id?: string | null
          branch_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completion_time?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          delivered_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          is_free_rework?: boolean
          job_type?: "normal" | "backorder"
          notes?: string | null
          odometer_reading?: number | null
          order_number?: string
          payment_recorded_at?: string | null
          payment_recorded_by?: string | null
          picked_up_by?: string | null
          reference_job_order_id?: string | null
          rejection_reason?: string | null
          rework_reason?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["job_order_status"]
          total_amount?: number
          updated_at?: string
          vehicle_bay?: string | null
          vehicle_class?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_orders_assigned_technician_id_fkey"
            columns: ["assigned_technician_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
            foreignKeyName: "job_orders_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_orders_reference_job_order_id_fkey"
            columns: ["reference_job_order_id"]
            isOneToOne: false
            referencedRelation: "job_orders"
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
      labor_items: {
        Row: {
          created_at: string
          extra_heavy_price: number
          heavy_price: number
          id: string
          light_price: number
          name: string
          status: Database["public"]["Enums"]["pricing_matrix_status"]
        }
        Insert: {
          created_at?: string
          extra_heavy_price?: number
          heavy_price?: number
          id?: string
          light_price?: number
          name: string
          status?: Database["public"]["Enums"]["pricing_matrix_status"]
        }
        Update: {
          created_at?: string
          extra_heavy_price?: number
          heavy_price?: number
          id?: string
          light_price?: number
          name?: string
          status?: Database["public"]["Enums"]["pricing_matrix_status"]
        }
        Relationships: []
      }
      notification_receipts: {
        Row: {
          delivered_at: string
          id: string
          is_read: boolean
          notification_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          delivered_at?: string
          id?: string
          is_read?: boolean
          notification_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          delivered_at?: string
          id?: string
          is_read?: boolean
          notification_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_receipts_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string
          id: string
          message: string
          notification_type: string
          reference_id: string | null
          reference_type: string | null
          scheduled_at: string | null
          status: string
          target_type: string
          target_value: string
          title: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by: string
          id?: string
          message: string
          notification_type?: string
          reference_id?: string | null
          reference_type?: string | null
          scheduled_at?: string | null
          status?: string
          target_type: string
          target_value: string
          title: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string
          id?: string
          message?: string
          notification_type?: string
          reference_id?: string | null
          reference_type?: string | null
          scheduled_at?: string | null
          status?: string
          target_type?: string
          target_value?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      package_inventory_links: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          package_item_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          package_item_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          package_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_inventory_links_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_inventory_links_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_on_hand"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "package_inventory_links_package_item_id_fkey"
            columns: ["package_item_id"]
            isOneToOne: false
            referencedRelation: "package_items"
            referencedColumns: ["id"]
          },
        ]
      }
      package_inventory_items: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          package_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          package_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          package_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "package_inventory_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_inventory_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_on_hand"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "package_inventory_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_items"
            referencedColumns: ["id"]
          },
        ]
      }
      package_labor_items: {
        Row: {
          created_at: string
          id: string
          labor_id: string
          package_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          labor_id: string
          package_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          labor_id?: string
          package_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "package_labor_items_labor_id_fkey"
            columns: ["labor_id"]
            isOneToOne: false
            referencedRelation: "labor_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_labor_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_items"
            referencedColumns: ["id"]
          },
        ]
      }
      package_items: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          inventory_types: string[] | null
          name: string
          price: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          inventory_types?: string[] | null
          name: string
          price: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          inventory_types?: string[] | null
          name?: string
          price?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received?: number
          unit_cost: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_on_hand"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          expected_delivery_date: string | null
          id: string
          is_deleted: boolean
          notes: string | null
          order_date: string
          po_number: string
          receipt_attachment: string | null
          receipt_uploaded_at: string | null
          receipt_uploaded_by: string | null
          received_at: string | null
          received_by: string | null
          status: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id: string | null
          supplier_name: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          is_deleted?: boolean
          notes?: string | null
          order_date?: string
          po_number: string
          receipt_attachment?: string | null
          receipt_uploaded_at?: string | null
          receipt_uploaded_by?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          is_deleted?: boolean
          notes?: string | null
          order_date?: string
          po_number?: string
          receipt_attachment?: string | null
          receipt_uploaded_at?: string | null
          receipt_uploaded_by?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_receipt_uploaded_by_fkey"
            columns: ["receipt_uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          branch_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          filters: Json | null
          generated_at: string
          generated_by: string
          id: string
          is_deleted: boolean | null
          is_template: boolean | null
          report_name: string
          report_type: Database["public"]["Enums"]["report_type"]
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          filters?: Json | null
          generated_at?: string
          generated_by: string
          id?: string
          is_deleted?: boolean | null
          is_template?: boolean | null
          report_name: string
          report_type: Database["public"]["Enums"]["report_type"]
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          filters?: Json | null
          generated_at?: string
          generated_by?: string
          id?: string
          is_deleted?: boolean | null
          is_template?: boolean | null
          report_name?: string
          report_type?: Database["public"]["Enums"]["report_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_reminders: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string
          customer_id: string
          delivery_method: string
          failure_reason: string | null
          id: string
          message_template: string
          scheduled_at: string
          sent_at: string | null
          service_type: string
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by: string
          customer_id: string
          delivery_method?: string
          failure_reason?: string | null
          id?: string
          message_template: string
          scheduled_at: string
          sent_at?: string | null
          service_type: string
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string
          customer_id?: string
          delivery_method?: string
          failure_reason?: string | null
          id?: string
          message_template?: string
          scheduled_at?: string
          sent_at?: string | null
          service_type?: string
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_reminders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reminders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reminders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reminders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_performance: {
        Row: {
          branch_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean
          metric_type: Database["public"]["Enums"]["staff_metric_type"]
          metric_value: number
          period_end: string
          period_start: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          metric_type: Database["public"]["Enums"]["staff_metric_type"]
          metric_value?: number
          period_end: string
          period_start: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          metric_type?: Database["public"]["Enums"]["staff_metric_type"]
          metric_value?: number
          period_end?: string
          period_start?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_performance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_performance_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_performance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          inventory_item_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: Database["public"]["Enums"]["stock_reference_type"]
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type: Database["public"]["Enums"]["stock_reference_type"]
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: Database["public"]["Enums"]["stock_reference_type"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_on_hand"
            referencedColumns: ["inventory_item_id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          inventory_item_id: string | null
          lead_time_days: number | null
          product_name: string
          status: Database["public"]["Enums"]["supplier_product_status"]
          supplier_id: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id?: string | null
          lead_time_days?: number | null
          product_name: string
          status?: Database["public"]["Enums"]["supplier_product_status"]
          supplier_id: string
          unit_cost: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id?: string | null
          lead_time_days?: number | null
          product_name?: string
          status?: Database["public"]["Enums"]["supplier_product_status"]
          supplier_id?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_on_hand"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string
          branch_id: string
          contact_person: string
          created_at: string
          created_by: string | null
          email: string
          id: string
          notes: string | null
          phone: string
          status: Database["public"]["Enums"]["supplier_status"]
          supplier_name: string
          updated_at: string
        }
        Insert: {
          address: string
          branch_id: string
          contact_person: string
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          notes?: string | null
          phone: string
          status?: Database["public"]["Enums"]["supplier_status"]
          supplier_name: string
          updated_at?: string
        }
        Update: {
          address?: string
          branch_id?: string
          contact_person?: string
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          notes?: string | null
          phone?: string
          status?: Database["public"]["Enums"]["supplier_status"]
          supplier_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_created_by_fkey"
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
          login_lockout_enabled: boolean
          primary_color: string
          sidebar_collapsed: boolean
          table_density: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          dark_mode?: boolean
          font_size?: string
          id?: string
          login_lockout_enabled?: boolean
          primary_color?: string
          sidebar_collapsed?: boolean
          table_density?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          dark_mode?: boolean
          font_size?: string
          id?: string
          login_lockout_enabled?: boolean
          primary_color?: string
          sidebar_collapsed?: boolean
          table_density?: string
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
          is_deleted: boolean
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
          is_deleted?: boolean
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
          is_deleted?: boolean
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
          failed_login_attempts: number | null
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
          failed_login_attempts?: number | null
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
          failed_login_attempts?: number | null
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
          conduction_sticker: string | null
          color: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          make: string
          model: string
          notes: string | null
          orcr: string
          plate_number: string
          status: Database["public"]["Enums"]["vehicle_status"]
          updated_at: string
          vehicle_class: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          year: number | null
        }
        Insert: {
          branch_id: string
          chassis_number?: string | null
          conduction_sticker?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          make?: string
          model: string
          notes?: string | null
          orcr: string
          plate_number: string
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
          vehicle_class?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          year?: number | null
        }
        Update: {
          branch_id?: string
          chassis_number?: string | null
          conduction_sticker?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          make?: string
          model?: string
          notes?: string | null
          orcr?: string
          plate_number?: string
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
          vehicle_class?: string
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
      inventory_on_hand: {
        Row: {
          branch_id: string | null
          category: string | null
          cost_price: number | null
          created_at: string | null
          created_by: string | null
          current_quantity: number | null
          inventory_item_id: string | null
          item_name: string | null
          reorder_threshold: number | null
          sku_code: string | null
          status: Database["public"]["Enums"]["inventory_item_status"] | null
          unit_of_measure: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_audit_log: {
        Args: {
          p_action: string
          p_branch_id?: string | null
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
        Args: {
          p_branch_id?: string | null
          p_event_type: string
          p_status?: string
          p_user_id: string
        }
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
      inventory_item_status: "draft" | "active" | "inactive"
      job_order_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "in_progress"
        | "ready_for_release"
        | "pending_payment"
        | "completed"
        | "rejected"
        | "cancelled"
        | "deactivated"
      labor_vehicle_type: "light" | "heavy" | "extra_heavy"
      pricing_matrix_status: "active" | "inactive"
      pricing_type: "labor" | "packaging"
      purchase_order_status:
        | "draft"
        | "submitted"
        | "approved"
        | "received"
        | "cancelled"
        | "deactivated"
      report_type: "sales" | "inventory" | "job_order" | "staff_performance"
      staff_metric_type:
        | "jobs_completed"
        | "avg_completion_time"
        | "revenue_generated"
        | "on_time_completion_rate"
      stock_movement_type: "stock_in" | "stock_out" | "adjustment"
      stock_reference_type: "purchase_order" | "job_order" | "adjustment"
      supplier_product_status: "active" | "inactive"
      supplier_status: "active" | "inactive"
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
      inventory_item_status: ["draft", "active", "inactive"],
      job_order_status: [
        "draft",
        "pending_approval",
        "approved",
        "in_progress",
        "ready_for_release",
        "pending_payment",
        "completed",
        "rejected",
        "cancelled",
        "deactivated",
      ],
      labor_vehicle_type: ["light", "heavy", "extra_heavy"],
      pricing_matrix_status: ["active", "inactive"],
      pricing_type: ["labor", "packaging"],
      purchase_order_status: [
        "draft",
        "submitted",
        "approved",
        "received",
        "cancelled",
        "deactivated",
      ],
      report_type: ["sales", "inventory", "job_order", "staff_performance"],
      staff_metric_type: [
        "jobs_completed",
        "avg_completion_time",
        "revenue_generated",
        "on_time_completion_rate",
      ],
      stock_movement_type: ["stock_in", "stock_out", "adjustment"],
      stock_reference_type: ["purchase_order", "job_order", "adjustment"],
      supplier_product_status: ["active", "inactive"],
      supplier_status: ["active", "inactive"],
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

// Backward-compatible aliases used across route files.
export type UserRole = Enums<"user_role">;
export type UserProfile = Tables<"user_profiles">;
export type BranchInsert = TablesInsert<"branches">;
export type BranchUpdate = TablesUpdate<"branches">;
export type SupplierInsert = TablesInsert<"suppliers">;
export type SupplierUpdate = TablesUpdate<"suppliers">;
export type SupplierProductInsert = TablesInsert<"supplier_products">;
export type SupplierProductUpdate = TablesUpdate<"supplier_products">;


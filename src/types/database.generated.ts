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
      adjustment_requests: {
        Row: {
          box_difference: number
          count_inventory_version: number | null
          count_lifecycle_status:
            | Database["public"]["Enums"]["pallet_lifecycle_status"]
            | null
          count_lifecycle_status_before_hold:
            | Database["public"]["Enums"]["pallet_lifecycle_status"]
            | null
          count_location_id: string | null
          counted_boxes: number
          counted_pieces: number
          created_at: string
          id: string
          pallet_id: string
          piece_difference: number
          reason_code: string
          reason_notes: string | null
          requested_by_user_id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          status: Database["public"]["Enums"]["adjustment_status"]
          system_boxes: number
          system_pieces: number
          updated_at: string
        }
        Insert: {
          box_difference: number
          count_inventory_version?: number | null
          count_lifecycle_status?:
            | Database["public"]["Enums"]["pallet_lifecycle_status"]
            | null
          count_lifecycle_status_before_hold?:
            | Database["public"]["Enums"]["pallet_lifecycle_status"]
            | null
          count_location_id?: string | null
          counted_boxes: number
          counted_pieces: number
          created_at?: string
          id?: string
          pallet_id: string
          piece_difference: number
          reason_code: string
          reason_notes?: string | null
          requested_by_user_id: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: Database["public"]["Enums"]["adjustment_status"]
          system_boxes: number
          system_pieces: number
          updated_at?: string
        }
        Update: {
          box_difference?: number
          count_inventory_version?: number | null
          count_lifecycle_status?:
            | Database["public"]["Enums"]["pallet_lifecycle_status"]
            | null
          count_lifecycle_status_before_hold?:
            | Database["public"]["Enums"]["pallet_lifecycle_status"]
            | null
          count_location_id?: string | null
          counted_boxes?: number
          counted_pieces?: number
          created_at?: string
          id?: string
          pallet_id?: string
          piece_difference?: number
          reason_code?: string
          reason_notes?: string | null
          requested_by_user_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: Database["public"]["Enums"]["adjustment_status"]
          system_boxes?: number
          system_pieces?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "adjustment_requests_count_location_id_fkey"
            columns: ["count_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjustment_requests_pallet_id_fkey"
            columns: ["pallet_id"]
            isOneToOne: false
            referencedRelation: "pallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjustment_requests_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjustment_requests_reviewed_by_user_id_fkey"
            columns: ["reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          actor_user_id: string
          adjustment_request_id: string | null
          bol_reference: string | null
          box_change: number | null
          created_at: string
          id: string
          idempotency_key: string | null
          metadata: Json | null
          new_boxes: number | null
          new_location_id: string | null
          new_pieces: number | null
          occurred_at: string
          pallet_id: string
          piece_change: number | null
          po_reference: string | null
          previous_boxes: number | null
          previous_location_id: string | null
          previous_pieces: number | null
          reason_code: string | null
          reason_notes: string | null
          transaction_type: Database["public"]["Enums"]["inventory_transaction_type"]
        }
        Insert: {
          actor_user_id: string
          adjustment_request_id?: string | null
          bol_reference?: string | null
          box_change?: number | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          new_boxes?: number | null
          new_location_id?: string | null
          new_pieces?: number | null
          occurred_at?: string
          pallet_id: string
          piece_change?: number | null
          po_reference?: string | null
          previous_boxes?: number | null
          previous_location_id?: string | null
          previous_pieces?: number | null
          reason_code?: string | null
          reason_notes?: string | null
          transaction_type: Database["public"]["Enums"]["inventory_transaction_type"]
        }
        Update: {
          actor_user_id?: string
          adjustment_request_id?: string | null
          bol_reference?: string | null
          box_change?: number | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          new_boxes?: number | null
          new_location_id?: string | null
          new_pieces?: number | null
          occurred_at?: string
          pallet_id?: string
          piece_change?: number | null
          po_reference?: string | null
          previous_boxes?: number | null
          previous_location_id?: string | null
          previous_pieces?: number | null
          reason_code?: string | null
          reason_notes?: string | null
          transaction_type?: Database["public"]["Enums"]["inventory_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_adjustment_request_id_fkey"
            columns: ["adjustment_request_id"]
            isOneToOne: false
            referencedRelation: "adjustment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_new_location_id_fkey"
            columns: ["new_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_pallet_id_fkey"
            columns: ["pallet_id"]
            isOneToOne: false
            referencedRelation: "pallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_previous_location_id_fkey"
            columns: ["previous_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          location_code: string
          location_type: Database["public"]["Enums"]["location_type"]
          position: string | null
          preferred_product_family: string | null
          rack: string | null
          updated_at: string
          zone: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          location_code: string
          location_type: Database["public"]["Enums"]["location_type"]
          position?: string | null
          preferred_product_family?: string | null
          rack?: string | null
          updated_at?: string
          zone?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          location_code?: string
          location_type?: Database["public"]["Enums"]["location_type"]
          position?: string | null
          preferred_product_family?: string | null
          rack?: string | null
          updated_at?: string
          zone?: string | null
        }
        Relationships: []
      }
      packing_specs: {
        Row: {
          boxes_per_full_pallet: number
          created_at: string
          estimated_box_weight_lb: number | null
          estimated_full_pallet_weight_lb: number | null
          id: string
          part_id: string
          pieces_per_box: number
          pieces_per_full_pallet: number | null
          updated_at: string
        }
        Insert: {
          boxes_per_full_pallet: number
          created_at?: string
          estimated_box_weight_lb?: number | null
          estimated_full_pallet_weight_lb?: number | null
          id?: string
          part_id: string
          pieces_per_box: number
          pieces_per_full_pallet?: number | null
          updated_at?: string
        }
        Update: {
          boxes_per_full_pallet?: number
          created_at?: string
          estimated_box_weight_lb?: number | null
          estimated_full_pallet_weight_lb?: number | null
          id?: string
          part_id?: string
          pieces_per_box?: number
          pieces_per_full_pallet?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_specs_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: true
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      pallets: {
        Row: {
          boxes_per_full_pallet_snapshot: number
          created_at: string
          current_boxes: number
          current_location_id: string | null
          current_pieces: number
          estimated_box_weight_lb_snapshot: number | null
          heat_number: string
          hold_reason: string | null
          id: string
          inventory_version: number
          lifecycle_status: Database["public"]["Enums"]["pallet_lifecycle_status"]
          lifecycle_status_before_hold:
            | Database["public"]["Enums"]["pallet_lifecycle_status"]
            | null
          lot_number: string
          machine_code: string | null
          original_boxes: number
          original_pieces: number
          packed_at: string
          packed_by_user_id: string
          pallet_code: string
          part_id: string
          pieces_per_box_snapshot: number
          updated_at: string
        }
        Insert: {
          boxes_per_full_pallet_snapshot: number
          created_at?: string
          current_boxes: number
          current_location_id?: string | null
          current_pieces: number
          estimated_box_weight_lb_snapshot?: number | null
          heat_number: string
          hold_reason?: string | null
          id?: string
          inventory_version?: number
          lifecycle_status?: Database["public"]["Enums"]["pallet_lifecycle_status"]
          lifecycle_status_before_hold?:
            | Database["public"]["Enums"]["pallet_lifecycle_status"]
            | null
          lot_number: string
          machine_code?: string | null
          original_boxes: number
          original_pieces: number
          packed_at?: string
          packed_by_user_id: string
          pallet_code: string
          part_id: string
          pieces_per_box_snapshot: number
          updated_at?: string
        }
        Update: {
          boxes_per_full_pallet_snapshot?: number
          created_at?: string
          current_boxes?: number
          current_location_id?: string | null
          current_pieces?: number
          estimated_box_weight_lb_snapshot?: number | null
          heat_number?: string
          hold_reason?: string | null
          id?: string
          inventory_version?: number
          lifecycle_status?: Database["public"]["Enums"]["pallet_lifecycle_status"]
          lifecycle_status_before_hold?:
            | Database["public"]["Enums"]["pallet_lifecycle_status"]
            | null
          lot_number?: string
          machine_code?: string | null
          original_boxes?: number
          original_pieces?: number
          packed_at?: string
          packed_by_user_id?: string
          pallet_code?: string
          part_id?: string
          pieces_per_box_snapshot?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pallets_current_location_id_fkey"
            columns: ["current_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pallets_packed_by_user_id_fkey"
            columns: ["packed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pallets_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          part_number: string
          product_family: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description: string
          id?: string
          part_number: string
          product_family: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          part_number?: string
          product_family?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          employee_code: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          employee_code?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          employee_code?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_adjustment_request: {
        Args: {
          p_idempotency_key: string
          p_request_id: string
          p_review_notes: string
        }
        Returns: {
          after_boxes: number
          after_pieces: number
          before_boxes: number
          before_pieces: number
          box_change: number
          decision_status: Database["public"]["Enums"]["adjustment_status"]
          lifecycle_status: Database["public"]["Enums"]["pallet_lifecycle_status"]
          location_code: string
          location_id: string
          pallet_code: string
          pallet_id: string
          part_number: string
          piece_change: number
          request_id: string
          review_notes: string
          reviewed_at: string
          reviewed_by_user_id: string
          reviewer_name: string
          transaction_id: string
        }[]
      }
      count_pallet: {
        Args: {
          p_counted_boxes: number
          p_expected_current_boxes: number
          p_expected_current_location_id: string
          p_expected_current_pieces: number
          p_idempotency_key: string
          p_pallet_code: string
          p_reason_code: string
          p_reason_notes: string
        }
        Returns: {
          adjustment_request_id: string
          box_difference: number
          counted_boxes: number
          counted_pieces: number
          description: string
          lifecycle_status: Database["public"]["Enums"]["pallet_lifecycle_status"]
          location_code: string
          location_id: string
          outcome: string
          pallet_code: string
          pallet_id: string
          part_number: string
          piece_difference: number
          recorded_at: string
          system_boxes: number
          system_pieces: number
          transaction_id: string
        }[]
      }
      create_pallet: {
        Args: {
          p_boxes: number
          p_heat_number: string
          p_idempotency_key: string
          p_lot_number: string
          p_machine_code?: string
          p_part_id: string
        }
        Returns: {
          boxes_per_full_pallet_snapshot: number
          current_boxes: number
          current_pieces: number
          description: string
          estimated_box_weight_lb_snapshot: number
          heat_number: string
          id: string
          lifecycle_status: Database["public"]["Enums"]["pallet_lifecycle_status"]
          lot_number: string
          machine_code: string
          original_boxes: number
          original_pieces: number
          packed_at: string
          packed_by_user_id: string
          pallet_code: string
          part_id: string
          part_number: string
          pieces_per_box_snapshot: number
          product_family: string
        }[]
      }
      move_pallet: {
        Args: {
          p_destination_location_id: string
          p_expected_current_location_id: string
          p_idempotency_key: string
          p_pallet_code: string
        }
        Returns: {
          boxes_per_full_pallet_snapshot: number
          current_boxes: number
          current_pieces: number
          description: string
          destination_location_code: string
          destination_location_id: string
          lifecycle_status: Database["public"]["Enums"]["pallet_lifecycle_status"]
          moved_at: string
          pallet_code: string
          pallet_id: string
          part_number: string
          previous_location_code: string
          previous_location_id: string
          transaction_id: string
        }[]
      }
      pull_boxes: {
        Args: {
          p_bol_reference?: string
          p_boxes_to_pull: number
          p_expected_current_boxes: number
          p_expected_current_pieces: number
          p_idempotency_key: string
          p_pallet_code: string
          p_po_reference?: string
        }
        Returns: {
          boxes_removed: number
          current_boxes: number
          current_pieces: number
          description: string
          location_code: string
          pallet_code: string
          pallet_id: string
          part_number: string
          pieces_removed: number
          previous_boxes: number
          previous_pieces: number
          pulled_at: string
          transaction_id: string
        }[]
      }
      reject_adjustment_request: {
        Args: {
          p_idempotency_key: string
          p_request_id: string
          p_review_notes: string
        }
        Returns: {
          after_boxes: number
          after_pieces: number
          before_boxes: number
          before_pieces: number
          box_change: number
          decision_status: Database["public"]["Enums"]["adjustment_status"]
          lifecycle_status: Database["public"]["Enums"]["pallet_lifecycle_status"]
          location_code: string
          location_id: string
          pallet_code: string
          pallet_id: string
          part_number: string
          piece_change: number
          request_id: string
          review_notes: string
          reviewed_at: string
          reviewed_by_user_id: string
          reviewer_name: string
          transaction_id: string
        }[]
      }
      ship_pallet: {
        Args: {
          p_bol_reference: string
          p_expected_current_boxes: number
          p_expected_current_location_id: string
          p_expected_current_pieces: number
          p_expected_inventory_version: number
          p_expected_lifecycle_status: Database["public"]["Enums"]["pallet_lifecycle_status"]
          p_idempotency_key: string
          p_pallet_code: string
          p_po_reference: string
          p_reason_notes: string
        }
        Returns: {
          actor_name: string
          actor_user_id: string
          bol_reference: string
          current_boxes: number
          current_pieces: number
          description: string
          lifecycle_status: Database["public"]["Enums"]["pallet_lifecycle_status"]
          pallet_code: string
          pallet_id: string
          part_number: string
          po_reference: string
          reason_notes: string
          shipped_at: string
          shipped_boxes: number
          shipped_pieces: number
          source_location_code: string
          source_location_id: string
          transaction_id: string
        }[]
      }
      stage_pallet_for_shipping: {
        Args: {
          p_destination_location_id: string
          p_expected_current_boxes: number
          p_expected_current_location_id: string
          p_expected_current_pieces: number
          p_expected_inventory_version: number
          p_expected_lifecycle_status: Database["public"]["Enums"]["pallet_lifecycle_status"]
          p_idempotency_key: string
          p_pallet_code: string
        }
        Returns: {
          actor_name: string
          actor_user_id: string
          current_boxes: number
          current_pieces: number
          description: string
          lifecycle_status: Database["public"]["Enums"]["pallet_lifecycle_status"]
          pallet_code: string
          pallet_id: string
          part_number: string
          previous_location_code: string
          previous_location_id: string
          staged_at: string
          staging_location_code: string
          staging_location_id: string
          transaction_id: string
        }[]
      }
      store_pallet: {
        Args: {
          p_destination_location_id: string
          p_idempotency_key: string
          p_pallet_code: string
        }
        Returns: {
          boxes_per_full_pallet_snapshot: number
          current_boxes: number
          current_pieces: number
          description: string
          destination_location_code: string
          destination_location_id: string
          lifecycle_status: Database["public"]["Enums"]["pallet_lifecycle_status"]
          pallet_code: string
          pallet_id: string
          part_number: string
          position: string
          rack: string
          stored_at: string
          zone: string
        }[]
      }
    }
    Enums: {
      adjustment_status: "pending" | "approved" | "rejected"
      inventory_transaction_type:
        | "pallet_created"
        | "label_printed"
        | "stored"
        | "box_pull"
        | "moved"
        | "count_matched"
        | "adjustment_requested"
        | "adjustment_approved"
        | "adjustment_rejected"
        | "hold_placed"
        | "hold_released"
        | "shipping_staging"
        | "shipped"
      location_type: "rack" | "shipping_staging" | "packing"
      pallet_lifecycle_status:
        | "created"
        | "stored"
        | "shipping_staging"
        | "on_hold"
        | "shipped"
      user_role: "worker" | "supervisor"
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
      adjustment_status: ["pending", "approved", "rejected"],
      inventory_transaction_type: [
        "pallet_created",
        "label_printed",
        "stored",
        "box_pull",
        "moved",
        "count_matched",
        "adjustment_requested",
        "adjustment_approved",
        "adjustment_rejected",
        "hold_placed",
        "hold_released",
        "shipping_staging",
        "shipped",
      ],
      location_type: ["rack", "shipping_staging", "packing"],
      pallet_lifecycle_status: [
        "created",
        "stored",
        "shipping_staging",
        "on_hold",
        "shipped",
      ],
      user_role: ["worker", "supervisor"],
    },
  },
} as const

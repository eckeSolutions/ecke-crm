export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          birthday: string | null
          city: string | null
          client_number: string
          created_at: string | null
          email_1: string | null
          email_2: string | null
          hourly_rate: number | null
          id: string
          last_contact_sync_at: string | null
          last_sync_error: string | null
          mobile_1: string | null
          mobile_2: string | null
          name: string
          phone: string | null
          stalwart_contact_id: string | null
          status: string | null
          street: string | null
          sync_status: string | null
          updated_at: string | null
          website: string | null
          zip_code: string | null
        }
        Insert: {
          birthday?: string | null
          city?: string | null
          client_number: string
          created_at?: string | null
          email_1?: string | null
          email_2?: string | null
          hourly_rate?: number | null
          id?: string
          last_contact_sync_at?: string | null
          last_sync_error?: string | null
          mobile_1?: string | null
          mobile_2?: string | null
          name: string
          phone?: string | null
          stalwart_contact_id?: string | null
          status?: string | null
          street?: string | null
          sync_status?: string | null
          updated_at?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          birthday?: string | null
          city?: string | null
          client_number?: string
          created_at?: string | null
          email_1?: string | null
          email_2?: string | null
          hourly_rate?: number | null
          id?: string
          last_contact_sync_at?: string | null
          last_sync_error?: string | null
          mobile_1?: string | null
          mobile_2?: string | null
          name?: string
          phone?: string | null
          stalwart_contact_id?: string | null
          status?: string | null
          street?: string | null
          sync_status?: string | null
          updated_at?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          city: string | null
          company_name: string | null
          default_hourly_rate: number | null
          iban: string | null
          id: boolean
          jmap_endpoint: string | null
          jmap_secret_id: string | null
          jmap_username: string | null
          slogan: string | null
          street: string | null
          tax_number: string | null
          updated_at: string | null
          vat_id: string | null
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          company_name?: string | null
          default_hourly_rate?: number | null
          iban?: string | null
          id?: boolean
          jmap_endpoint?: string | null
          jmap_secret_id?: string | null
          jmap_username?: string | null
          slogan?: string | null
          street?: string | null
          tax_number?: string | null
          updated_at?: string | null
          vat_id?: string | null
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          company_name?: string | null
          default_hourly_rate?: number | null
          iban?: string | null
          id?: boolean
          jmap_endpoint?: string | null
          jmap_secret_id?: string | null
          jmap_username?: string | null
          slogan?: string | null
          street?: string | null
          tax_number?: string | null
          updated_at?: string | null
          vat_id?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          client_id: string
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          phone: string | null
          position: string | null
          stalwart_contact_id: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          phone?: string | null
          position?: string | null
          stalwart_contact_id?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          phone?: string | null
          position?: string | null
          stalwart_contact_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          description: string
          id: string
          invoice_id: string
          line_total: number
          linked_time_entry_id: string | null
          quantity: number
          sort_order: number | null
          template_id: string | null
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          line_total: number
          linked_time_entry_id?: string | null
          quantity: number
          sort_order?: number | null
          template_id?: string | null
          unit_price: number
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number
          linked_time_entry_id?: string | null
          quantity?: number
          sort_order?: number | null
          template_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_linked_time_entry_id_fkey"
            columns: ["linked_time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "service_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          created_at: string | null
          date_due: string | null
          date_issued: string | null
          id: string
          invoice_number: number
          notes: string | null
          paid_at: string | null
          pdf_storage_path: string | null
          profile_id: string
          status: string | null
          total_amount: number | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          date_due?: string | null
          date_issued?: string | null
          id?: string
          invoice_number?: number
          notes?: string | null
          paid_at?: string | null
          pdf_storage_path?: string | null
          profile_id: string
          status?: string | null
          total_amount?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          date_due?: string | null
          date_issued?: string | null
          id?: string
          invoice_number?: number
          notes?: string | null
          paid_at?: string | null
          pdf_storage_path?: string | null
          profile_id?: string
          status?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount: number
          category: string | null
          created_at: string | null
          description: string
          entry_date: string
          entry_type: string
          id: string
          profile_id: string
          receipt_storage_path: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string | null
          description: string
          entry_date?: string
          entry_type?: string
          id?: string
          profile_id: string
          receipt_storage_path?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string | null
          description?: string
          entry_date?: string
          entry_type?: string
          id?: string
          profile_id?: string
          receipt_storage_path?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          default_hourly_rate: number | null
          email: string
          full_name: string | null
          id: string
          role: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_hourly_rate?: number | null
          email: string
          full_name?: string | null
          id: string
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_hourly_rate?: number | null
          email?: string
          full_name?: string | null
          id?: string
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      service_templates: {
        Row: {
          created_at: string | null
          default_price: number | null
          id: string
          is_time_based: boolean | null
          title: string
        }
        Insert: {
          created_at?: string | null
          default_price?: number | null
          id?: string
          is_time_based?: boolean | null
          title: string
        }
        Update: {
          created_at?: string | null
          default_price?: number | null
          id?: string
          is_time_based?: boolean | null
          title?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          calendar_event_id: string | null
          client_id: string
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          end_time: string | null
          hourly_rate_snapshot: number
          id: string
          invoice_id: string | null
          is_invoiced: boolean | null
          profile_id: string
          start_time: string
          template_id: string | null
        }
        Insert: {
          calendar_event_id?: string | null
          client_id: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          hourly_rate_snapshot: number
          id?: string
          invoice_id?: string | null
          is_invoiced?: boolean | null
          profile_id: string
          start_time: string
          template_id?: string | null
        }
        Update: {
          calendar_event_id?: string | null
          client_id?: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          hourly_rate_snapshot?: number
          id?: string
          invoice_id?: string | null
          is_invoiced?: boolean | null
          profile_id?: string
          start_time?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_time_entries_invoice"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "service_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_next_invoice_number: { Args: never; Returns: number }
      get_company_letterhead: {
        Args: never
        Returns: {
          city: string
          company_name: string
          iban: string
          slogan: string
          street: string
          tax_number: string
          vat_id: string
          zip_code: string
        }[]
      }
      get_default_hourly_rate: { Args: never; Returns: number }
      get_uninvoiced_time_entries: {
        Args: { client_uuid: string }
        Returns: {
          calendar_event_id: string | null
          client_id: string
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          end_time: string | null
          hourly_rate_snapshot: number
          id: string
          invoice_id: string | null
          is_invoiced: boolean | null
          profile_id: string
          start_time: string
          template_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_admin: { Args: never; Returns: boolean }
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
  public: {
    Enums: {},
  },
} as const


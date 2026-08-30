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
      admin_notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          background_color: string | null
          created_at: string | null
          id: string
          icon_url: string | null
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          layout_variant: string
          name: string
          parent_id: string | null
          slug: string
          text_color: string | null
          sort_order: number | null
        }
        Insert: {
          background_color?: string | null
          created_at?: string | null
          id?: string
          icon_url?: string | null
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          layout_variant?: string
          name: string
          parent_id?: string | null
          slug: string
          text_color?: string | null
          sort_order?: number | null
        }
        Update: {
          background_color?: string | null
          created_at?: string | null
          id?: string
          icon_url?: string | null
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          layout_variant?: string
          name?: string
          parent_id?: string | null
          slug?: string
          text_color?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string | null
          discount_type: string
          discount_value: number
          value: number
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          merchant_id: string | null
          min_order_amount: number | null
          used_count: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          discount_type: string
          discount_value: number
          value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          merchant_id?: string | null
          min_order_amount?: number | null
          used_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          discount_type?: string
          discount_value?: number
          value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          merchant_id?: string | null
          min_order_amount?: number | null
          used_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_companies: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          phone: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          phone?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      delivery_prices: {
        Row: {
          company_id: string | null
          created_at: string | null
          governorate_id: string | null
          id: string
          price: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          governorate_id?: string | null
          id?: string
          price?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          governorate_id?: string | null
          id?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_prices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "delivery_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_prices_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
        ]
      }
      desktop_quick_links: {
        Row: {
          created_at: string
          href: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          href: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          href?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      governorates: {
        Row: {
          delivery_price: number
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          delivery_price?: number
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          delivery_price?: number
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      merchants: {
        Row: {
          banner_url: string | null
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_featured: boolean
          logo_url: string | null
          name_ar: string
          name_en: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_featured?: boolean
          logo_url?: string | null
          name_ar: string
          name_en: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_featured?: boolean
          logo_url?: string | null
          name_ar?: string
          name_en?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      merchant_settings: {
        Row: {
          address: string | null
          city: string | null
          contact_phone: string | null
          created_at: string
          delivery_notes: string | null
          merchant_id: string
          order_auto_accept: boolean
          support_email: string | null
          updated_at: string
          whatsapp_phone: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_notes?: string | null
          merchant_id: string
          order_auto_accept?: boolean
          support_email?: string | null
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_notes?: string | null
          merchant_id?: string
          order_auto_accept?: boolean
          support_email?: string | null
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_settings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_users: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_users_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          merchant_id: string | null
          order_id: string
          price: number
          product_id: string
          product_name: string
          quantity: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          merchant_id?: string | null
          order_id: string
          price: number
          product_id: string
          product_name: string
          quantity?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          merchant_id?: string | null
          order_id?: string
          price?: number
          product_id?: string
          product_name?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_notes: string | null
          area: string
          coupon_id: string | null
          created_at: string | null
          customer_name: string
          customer_phone: string
          delivery_company_id: string | null
          delivery_cost: number
          discount: number | null
          governorate_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          map_url: string | null
          merchant_id: string | null
          nearest_landmark: string | null
          notes: string | null
          order_number: string
          status: string | null
          subtotal: number
          total: number
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          area: string
          coupon_id?: string | null
          created_at?: string | null
          customer_name: string
          customer_phone: string
          delivery_company_id?: string | null
          delivery_cost: number
          discount?: number | null
          governorate_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          map_url?: string | null
          merchant_id?: string | null
          nearest_landmark?: string | null
          notes?: string | null
          order_number: string
          status?: string | null
          subtotal: number
          total: number
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          area?: string
          coupon_id?: string | null
          created_at?: string | null
          customer_name?: string
          customer_phone?: string
          delivery_company_id?: string | null
          delivery_cost?: number
          discount?: number | null
          governorate_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          map_url?: string | null
          merchant_id?: string | null
          nearest_landmark?: string | null
          notes?: string | null
          order_number?: string
          status?: string | null
          subtotal?: number
          total?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_company_id_fkey"
            columns: ["delivery_company_id"]
            isOneToOne: false
            referencedRelation: "delivery_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string | null
          description: string | null
          short_description: string | null
          discount_price: number | null
          dimensions: string | null
          id: string
          images: string[] | null
          is_active: boolean | null
          is_best_seller: boolean | null
          is_featured: boolean | null
          is_new: boolean | null
          low_stock_threshold: number | null
          merchant_id: string
          mobile_promo_image_url: string | null
          merchant_sku: string | null
          brand: string | null
          name: string
          offer_ends_at: string | null
          price: number
          purchase_price: number | null
          slug: string
          sold_count: number | null
          sort_order: number | null
          stock: number | null
          colors: string[] | null
          sizes: string[] | null
          weight_grams: number | null
          is_mobile_promo: boolean
          is_published: boolean
          visibility_status: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          short_description?: string | null
          discount_price?: number | null
          dimensions?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean | null
          is_best_seller?: boolean | null
          is_featured?: boolean | null
          is_new?: boolean | null
          low_stock_threshold?: number | null
          merchant_id: string
          mobile_promo_image_url?: string | null
          merchant_sku?: string | null
          brand?: string | null
          name: string
          offer_ends_at?: string | null
          price: number
          purchase_price?: number | null
          slug: string
          sold_count?: number | null
          sort_order?: number | null
          stock?: number | null
          colors?: string[] | null
          sizes?: string[] | null
          weight_grams?: number | null
          is_mobile_promo?: boolean
          is_published?: boolean
          visibility_status?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          short_description?: string | null
          discount_price?: number | null
          dimensions?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean | null
          is_best_seller?: boolean | null
          is_featured?: boolean | null
          is_new?: boolean | null
          low_stock_threshold?: number | null
          merchant_id?: string
          mobile_promo_image_url?: string | null
          merchant_sku?: string | null
          brand?: string | null
          name?: string
          offer_ends_at?: string | null
          price?: number
          purchase_price?: number | null
          slug?: string
          sold_count?: number | null
          sort_order?: number | null
          stock?: number | null
          colors?: string[] | null
          sizes?: string[] | null
          weight_grams?: number | null
          is_mobile_promo?: boolean
          is_published?: boolean
          visibility_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          latitude: number | null
          longitude: number | null
          map_url: string | null
          phone: string | null
          points: number | null
          role: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          latitude?: number | null
          longitude?: number | null
          map_url?: string | null
          phone?: string | null
          points?: number | null
          role?: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          map_url?: string | null
          phone?: string | null
          points?: number | null
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      regions: {
        Row: {
          created_at: string | null
          governorate_id: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          governorate_id?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          governorate_id?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "regions_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          change_amount: number
          created_at: string | null
          id: string
          product_id: string | null
          reason: string | null
          type: string
        }
        Insert: {
          change_amount: number
          created_at?: string | null
          id?: string
          product_id?: string | null
          reason?: string | null
          type: string
        }
        Update: {
          change_amount?: number
          created_at?: string | null
          id?: string
          product_id?: string | null
          reason?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_order_status: {
        Args: { p_order_number: string; p_phone: string }
        Returns: Json
      }
      increment_coupon_usage: {
        Args: { p_coupon_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      place_order:
        | {
            Args: {
              p_area: string
              p_coupon_id: string
              p_customer_name: string
              p_customer_phone: string
              p_delivery_cost: number
              p_discount: number
              p_governorate_id: string
              p_items: Json
              p_nearest_landmark: string
              p_notes: string
              p_subtotal: number
              p_total: number
            }
            Returns: string
          }
        | {
            Args: {
              p_area: string
              p_coupon_id: string
              p_customer_name: string
              p_customer_phone: string
              p_delivery_cost: number
              p_discount: number
              p_governorate_id: string
              p_items: Json
              p_nearest_landmark: string
              p_notes: string
              p_subtotal: number
              p_total: number
              p_user_id?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_area: string
              p_coupon_id: string
              p_customer_name: string
              p_customer_phone: string
              p_delivery_cost: number
              p_discount: number
              p_governorate_id: string
              p_items: Json
              p_latitude?: number
              p_longitude?: number
              p_map_url?: string
              p_nearest_landmark: string
              p_notes: string
              p_subtotal: number
              p_total: number
              p_user_id?: string
            }
            Returns: string
          }
      validate_coupon: {
        Args: { p_code: string; p_total: number }
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

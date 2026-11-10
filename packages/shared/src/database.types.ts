export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      document_access_log: {
        Row: {
          document_id: string;
          id: number;
          viewed_at: string;
          viewer_id: string;
        };
        ComputedFields: never;
        Insert: {
          document_id: string;
          id?: never;
          viewed_at?: string;
          viewer_id: string;
        };
        Update: {
          document_id?: string;
          id?: never;
          viewed_at?: string;
          viewer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_access_log_document_id_fkey';
            columns: ['document_id'];
            isOneToOne: false;
            referencedRelation: 'verification_documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_access_log_viewer_id_fkey';
            columns: ['viewer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      job_tracks: {
        Row: {
          id: number;
          job_id: string;
          point: unknown;
          recorded_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: never;
          job_id: string;
          point: unknown;
          recorded_at?: string;
        };
        Update: {
          id?: never;
          job_id?: string;
          point?: unknown;
          recorded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'job_tracks_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      jobs: {
        Row: {
          accepted_offer_id: string | null;
          approx_point: unknown;
          client_id: string;
          commission_rate_bps: number | null;
          created_at: string;
          description: string;
          exact_address: string;
          final_price_cents: number | null;
          id: string;
          offered_price_cents: number;
          photos: string[];
          status: Database['public']['Enums']['job_status'];
          trade_id: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_offer_id?: string | null;
          approx_point: unknown;
          client_id?: string;
          commission_rate_bps?: number | null;
          created_at?: string;
          description: string;
          exact_address: string;
          final_price_cents?: number | null;
          id?: string;
          offered_price_cents: number;
          photos?: string[];
          status?: Database['public']['Enums']['job_status'];
          trade_id: number;
          updated_at?: string;
        };
        Update: {
          accepted_offer_id?: string | null;
          approx_point?: unknown;
          client_id?: string;
          commission_rate_bps?: number | null;
          created_at?: string;
          description?: string;
          exact_address?: string;
          final_price_cents?: number | null;
          id?: string;
          offered_price_cents?: number;
          photos?: string[];
          status?: Database['public']['Enums']['job_status'];
          trade_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'jobs_accepted_offer_fk';
            columns: ['accepted_offer_id'];
            isOneToOne: false;
            referencedRelation: 'offers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'jobs_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'jobs_trade_id_fkey';
            columns: ['trade_id'];
            isOneToOne: false;
            referencedRelation: 'trades';
            referencedColumns: ['id'];
          },
        ];
      };
      offers: {
        Row: {
          created_at: string;
          id: string;
          job_id: string;
          message: string | null;
          price_cents: number;
          pro_id: string;
          status: Database['public']['Enums']['offer_status'];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          job_id: string;
          message?: string | null;
          price_cents: number;
          pro_id?: string;
          status?: Database['public']['Enums']['offer_status'];
        };
        Update: {
          created_at?: string;
          id?: string;
          job_id?: string;
          message?: string | null;
          price_cents?: number;
          pro_id?: string;
          status?: Database['public']['Enums']['offer_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'offers_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'offers_pro_id_fkey';
            columns: ['pro_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_proofs: {
        Row: {
          amount_cents: number;
          created_at: string;
          id: string;
          image_path: string;
          method: Database['public']['Enums']['payment_method'];
          operation_code: string;
          professional_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database['public']['Enums']['payment_proof_status'];
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          created_at?: string;
          id?: string;
          image_path: string;
          method: Database['public']['Enums']['payment_method'];
          operation_code: string;
          professional_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database['public']['Enums']['payment_proof_status'];
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          id?: string;
          image_path?: string;
          method?: Database['public']['Enums']['payment_method'];
          operation_code?: string;
          professional_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database['public']['Enums']['payment_proof_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'payment_proofs_professional_id_fkey';
            columns: ['professional_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payment_proofs_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      pro_presence: {
        Row: {
          last_point: unknown;
          online: boolean;
          pro_id: string;
          radius_m: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          last_point?: unknown;
          online?: boolean;
          pro_id: string;
          radius_m?: number;
          updated_at?: string;
        };
        Update: {
          last_point?: unknown;
          online?: boolean;
          pro_id?: string;
          radius_m?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pro_presence_pro_id_fkey';
            columns: ['pro_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      pro_trades: {
        Row: {
          created_at: string;
          good_ratings_count: number;
          id: string;
          pro_id: string;
          reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database['public']['Enums']['pro_trade_status'];
          trade_id: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          good_ratings_count?: number;
          id?: string;
          pro_id: string;
          reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database['public']['Enums']['pro_trade_status'];
          trade_id: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          good_ratings_count?: number;
          id?: string;
          pro_id?: string;
          reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database['public']['Enums']['pro_trade_status'];
          trade_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pro_trades_pro_id_fkey';
            columns: ['pro_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_trades_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pro_trades_trade_id_fkey';
            columns: ['trade_id'];
            isOneToOne: false;
            referencedRelation: 'trades';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          active_role: Database['public']['Enums']['user_role'];
          avatar_url: string | null;
          created_at: string;
          deleted_at: string | null;
          full_name: string | null;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active_role?: Database['public']['Enums']['user_role'];
          avatar_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          active_role?: Database['public']['Enums']['user_role'];
          avatar_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      ratings: {
        Row: {
          comment: string | null;
          created_at: string;
          from_id: string;
          id: string;
          job_id: string;
          stars: number;
          tags: string[];
          to_id: string;
        };
        ComputedFields: never;
        Insert: {
          comment?: string | null;
          created_at?: string;
          from_id: string;
          id?: string;
          job_id: string;
          stars: number;
          tags?: string[];
          to_id: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          from_id?: string;
          id?: string;
          job_id?: string;
          stars?: number;
          tags?: string[];
          to_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ratings_from_id_fkey';
            columns: ['from_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ratings_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ratings_to_id_fkey';
            columns: ['to_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      settings: {
        Row: {
          key: string;
          scope: string;
          updated_at: string;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          scope?: string;
          updated_at?: string;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          scope?: string;
          updated_at?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      sos_alerts: {
        Row: {
          closed_at: string | null;
          closed_by: string | null;
          id: string;
          job_id: string | null;
          note: string | null;
          opened_at: string;
          status: Database['public']['Enums']['sos_status'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          closed_at?: string | null;
          closed_by?: string | null;
          id?: string;
          job_id?: string | null;
          note?: string | null;
          opened_at?: string;
          status?: Database['public']['Enums']['sos_status'];
          user_id?: string;
        };
        Update: {
          closed_at?: string | null;
          closed_by?: string | null;
          id?: string;
          job_id?: string | null;
          note?: string | null;
          opened_at?: string;
          status?: Database['public']['Enums']['sos_status'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sos_alerts_closed_by_fkey';
            columns: ['closed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sos_alerts_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sos_alerts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      trades: {
        Row: {
          active: boolean;
          id: number;
          name: string;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          id?: never;
          name: string;
          slug: string;
        };
        Update: {
          active?: boolean;
          id?: never;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      trusted_contacts: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          phone: string;
          relation: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          phone: string;
          relation?: string | null;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          phone?: string;
          relation?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'trusted_contacts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      verification_documents: {
        Row: {
          created_at: string;
          id: string;
          kind: Database['public']['Enums']['verification_document_kind'];
          pro_id: string;
          pro_trade_id: string | null;
          storage_path: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          kind: Database['public']['Enums']['verification_document_kind'];
          pro_id: string;
          pro_trade_id?: string | null;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: Database['public']['Enums']['verification_document_kind'];
          pro_id?: string;
          pro_trade_id?: string | null;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'verification_documents_pro_id_fkey';
            columns: ['pro_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'verification_documents_pro_trade_id_fkey';
            columns: ['pro_trade_id'];
            isOneToOne: false;
            referencedRelation: 'pro_trades';
            referencedColumns: ['id'];
          },
        ];
      };
      wallet_entries: {
        Row: {
          amount_cents: number;
          balance_after_cents: number;
          created_at: string;
          created_by: string | null;
          external_ref: string | null;
          id: string;
          idempotency_key: string;
          job_id: string | null;
          professional_id: string;
          type: Database['public']['Enums']['wallet_entry_type'];
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          balance_after_cents?: number;
          created_at?: string;
          created_by?: string | null;
          external_ref?: string | null;
          id?: string;
          idempotency_key: string;
          job_id?: string | null;
          professional_id: string;
          type: Database['public']['Enums']['wallet_entry_type'];
        };
        Update: {
          amount_cents?: number;
          balance_after_cents?: number;
          created_at?: string;
          created_by?: string | null;
          external_ref?: string | null;
          id?: string;
          idempotency_key?: string;
          job_id?: string | null;
          professional_id?: string;
          type?: Database['public']['Enums']['wallet_entry_type'];
        };
        Relationships: [
          {
            foreignKeyName: 'wallet_entries_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_entries_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_entries_professional_id_fkey';
            columns: ['professional_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      job_counterpart_phone: { Args: { p_job: string }; Returns: string };
      job_exact_address: { Args: { p_job: string }; Returns: string };
      log_document_access: { Args: { p_document: string }; Returns: string };
      my_account: {
        Args: Record<PropertyKey, never>;
        Returns: {
          active_role: Database['public']['Enums']['user_role'];
          avatar_url: string;
          full_name: string;
          has_pro_trades: boolean;
          id: string;
          phone: string;
          staff_role: string;
        }[];
      };
      public_profiles: {
        Args: { p_ids: string[] };
        Returns: {
          avatar_url: string;
          full_name: string;
          id: string;
        }[];
      };
      set_staff_role: { Args: { p_role: string; p_user: string }; Returns: undefined };
      wallet_post_entry: {
        Args: {
          p_amount_cents: number;
          p_created_by?: string;
          p_external_ref?: string;
          p_idempotency_key: string;
          p_job?: string;
          p_professional: string;
          p_type: Database['public']['Enums']['wallet_entry_type'];
        };
        Returns: {
          amount_cents: number;
          balance_after_cents: number;
          created_at: string;
          created_by: string | null;
          external_ref: string | null;
          id: string;
          idempotency_key: string;
          job_id: string | null;
          professional_id: string;
          type: Database['public']['Enums']['wallet_entry_type'];
        };
        SetofOptions: {
          from: '*';
          to: 'wallet_entries';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      job_status:
        | 'published'
        | 'with_offers'
        | 'accepted'
        | 'on_the_way'
        | 'at_home'
        | 'finished'
        | 'confirmed'
        | 'rated'
        | 'cancelled';
      offer_status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
      payment_method: 'yape' | 'plin' | 'transfer';
      payment_proof_status: 'pending' | 'approved' | 'rejected';
      pro_trade_status:
        | 'draft'
        | 'submitted'
        | 'in_review'
        | 'needs_info'
        | 'approved_observation'
        | 'approved_full'
        | 'rejected'
        | 'suspended';
      sos_status: 'countdown' | 'open' | 'closed' | 'cancelled';
      user_role: 'client' | 'pro';
      verification_document_kind:
        | 'dni_front'
        | 'dni_back'
        | 'selfie'
        | 'background'
        | 'work_photo'
        | 'certificate'
        | 'reference'
        | 'quiz';
      wallet_entry_type:
        'commission_debit' | 'payment_credit' | 'promo_credit' | 'adjustment' | 'reversal';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      job_status: [
        'published',
        'with_offers',
        'accepted',
        'on_the_way',
        'at_home',
        'finished',
        'confirmed',
        'rated',
        'cancelled',
      ],
      offer_status: ['pending', 'accepted', 'rejected', 'withdrawn', 'expired'],
      payment_method: ['yape', 'plin', 'transfer'],
      payment_proof_status: ['pending', 'approved', 'rejected'],
      pro_trade_status: [
        'draft',
        'submitted',
        'in_review',
        'needs_info',
        'approved_observation',
        'approved_full',
        'rejected',
        'suspended',
      ],
      sos_status: ['countdown', 'open', 'closed', 'cancelled'],
      user_role: ['client', 'pro'],
      verification_document_kind: [
        'dni_front',
        'dni_back',
        'selfie',
        'background',
        'work_photo',
        'certificate',
        'reference',
        'quiz',
      ],
      wallet_entry_type: [
        'commission_debit',
        'payment_credit',
        'promo_credit',
        'adjustment',
        'reversal',
      ],
    },
  },
} as const;

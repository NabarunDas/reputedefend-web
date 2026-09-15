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
      customers: {
        Row: {
          id: string
          full_name: string
          email: string
          phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          full_name: string
          email: string
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          email?: string
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          id: string
          display_name: string
          website_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          display_name: string
          website_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string
          website_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          id: string
          business_id: string
          location_name: string | null
          country: string
          business_profile_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          location_name?: string | null
          country: string
          business_profile_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          location_name?: string | null
          country?: string
          business_profile_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      cases: {
        Row: {
          id: string
          public_ref: string
          case_type: string
          issue_subtype: string | null
          status: string
          customer_id: string
          business_id: string
          location_id: string
          source: string
          issue_description: string
          review_url: string | null
          intake_snapshot: Json
          information_accurate_at: string | null
          privacy_accepted_at: string | null
          submitted_at: string
          closed_at: string | null
          created_at: string
          updated_at: string
          submission_key: string | null
        }
        Insert: {
          id?: string
          public_ref?: string
          case_type: string
          issue_subtype?: string | null
          status?: string
          customer_id: string
          business_id: string
          location_id: string
          source?: string
          issue_description: string
          review_url?: string | null
          intake_snapshot?: Json
          information_accurate_at?: string | null
          privacy_accepted_at?: string | null
          submitted_at?: string
          closed_at?: string | null
          created_at?: string
          updated_at?: string
          submission_key?: string | null
        }
        Update: {
          id?: string
          public_ref?: string
          case_type?: string
          issue_subtype?: string | null
          status?: string
          customer_id?: string
          business_id?: string
          location_id?: string
          source?: string
          issue_description?: string
          review_url?: string | null
          intake_snapshot?: Json
          information_accurate_at?: string | null
          privacy_accepted_at?: string | null
          submitted_at?: string
          closed_at?: string | null
          created_at?: string
          updated_at?: string
          submission_key?: string | null
        }
        Relationships: []
      }
      case_events: {
        Row: {
          id: string
          case_id: string
          event_type: string
          actor_type: string
          event_data: Json
          created_at: string
        }
        Insert: {
          id?: string
          case_id: string
          event_type: string
          actor_type?: string
          event_data?: Json
          created_at?: string
        }
        Update: {
          id?: string
          case_id?: string
          event_type?: string
          actor_type?: string
          event_data?: Json
          created_at?: string
        }
        Relationships: []
      }
      communications: {
        Row: {
          id: string
          case_id: string
          channel: string
          communication_type: string
          direction: string
          recipient: string
          subject: string | null
          provider: string | null
          provider_message_id: string | null
          status: string
          error_message: string | null
          metadata: Json
          sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          case_id: string
          channel?: string
          communication_type: string
          direction?: string
          recipient: string
          subject?: string | null
          provider?: string | null
          provider_message_id?: string | null
          status?: string
          error_message?: string | null
          metadata?: Json
          sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          case_id?: string
          channel?: string
          communication_type?: string
          direction?: string
          recipient?: string
          subject?: string | null
          provider?: string | null
          provider_message_id?: string | null
          status?: string
          error_message?: string | null
          metadata?: Json
          sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_case_public_ref: {
        Args: { p_case_type: string }
        Returns: string
      }
      create_case_intake_v1: {
        Args: {
          p_submission_key: string
          p_case_type: string
          p_issue_subtype: string | null
          p_full_name: string
          p_email: string
          p_phone: string | null
          p_business_name: string
          p_country: string
          p_website_url: string | null
          p_business_profile_url: string | null
          p_review_url: string | null
          p_issue_description: string
          p_information_accurate: boolean
          p_privacy_accepted: boolean
          p_intake_snapshot: Json
          p_internal_recipient: string
        }
        Returns: {
          case_id: string
          public_ref: string
          case_type: string
          customer_id: string
          business_id: string
          location_id: string
          customer_communication_id: string
          internal_communication_id: string
          was_existing: boolean
          customer_communication_status: string
          internal_communication_status: string
          intake_snapshot: Json
          customer_communication_recipient: string
          internal_communication_recipient: string
        }[]
      }
    }
  }
}

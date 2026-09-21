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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      application_status_updates: {
        Row: {
          deadline_date: string | null
          documents_required: string[] | null
          id: string
          is_visible_to_student: boolean | null
          next_action_required: string | null
          notes: string | null
          shortlist_id: string
          status: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          deadline_date?: string | null
          documents_required?: string[] | null
          id?: string
          is_visible_to_student?: boolean | null
          next_action_required?: string | null
          notes?: string | null
          shortlist_id: string
          status: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          deadline_date?: string | null
          documents_required?: string[] | null
          id?: string
          is_visible_to_student?: boolean | null
          next_action_required?: string | null
          notes?: string | null
          shortlist_id?: string
          status?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_status_updates_shortlist_id_fkey"
            columns: ["shortlist_id"]
            isOneToOne: false
            referencedRelation: "university_shortlists"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          application_deadline: string | null
          application_fee: number | null
          application_id: string | null
          course_id: string | null
          created_at: string
          decision_date: string | null
          documents_submitted: Json | null
          essay_topics: string[] | null
          id: string
          intake_term: string
          interview_scheduled_at: string | null
          lor_requests: Json | null
          milestones: Json | null
          notes: string | null
          priority_level: string | null
          scholarship_offered: number | null
          status: string
          test_scores: Json | null
          tuition_fee_offered: number | null
          university_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_deadline?: string | null
          application_fee?: number | null
          application_id?: string | null
          course_id?: string | null
          created_at?: string
          decision_date?: string | null
          documents_submitted?: Json | null
          essay_topics?: string[] | null
          id?: string
          intake_term: string
          interview_scheduled_at?: string | null
          lor_requests?: Json | null
          milestones?: Json | null
          notes?: string | null
          priority_level?: string | null
          scholarship_offered?: number | null
          status?: string
          test_scores?: Json | null
          tuition_fee_offered?: number | null
          university_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_deadline?: string | null
          application_fee?: number | null
          application_id?: string | null
          course_id?: string | null
          created_at?: string
          decision_date?: string | null
          documents_submitted?: Json | null
          essay_topics?: string[] | null
          id?: string
          intake_term?: string
          interview_scheduled_at?: string | null
          lor_requests?: Json | null
          milestones?: Json | null
          notes?: string | null
          priority_level?: string | null
          scholarship_offered?: number | null
          status?: string
          test_scores?: Json | null
          tuition_fee_offered?: number | null
          university_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_analytics: {
        Row: {
          campaign_id: string
          channel: string
          conversions: number | null
          created_at: string
          date: string
          id: string
          leads_count: number | null
          messages_clicked: number | null
          messages_delivered: number | null
          messages_replied: number | null
          messages_seen: number | null
          messages_sent: number | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          channel: string
          conversions?: number | null
          created_at?: string
          date: string
          id?: string
          leads_count?: number | null
          messages_clicked?: number | null
          messages_delivered?: number | null
          messages_replied?: number | null
          messages_seen?: number | null
          messages_sent?: number | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          channel?: string
          conversions?: number | null
          created_at?: string
          date?: string
          id?: string
          leads_count?: number | null
          messages_clicked?: number | null
          messages_delivered?: number | null
          messages_replied?: number | null
          messages_seen?: number | null
          messages_sent?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_campaign_analytics_campaign"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_messages: {
        Row: {
          campaign_id: string
          channel: string
          created_at: string
          error_message: string | null
          external_message_id: string | null
          id: string
          lead_id: string
          message_content: string
          retry_count: number | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          channel: string
          created_at?: string
          error_message?: string | null
          external_message_id?: string | null
          id?: string
          lead_id: string
          message_content: string
          retry_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          channel?: string
          created_at?: string
          error_message?: string | null
          external_message_id?: string | null
          id?: string
          lead_id?: string
          message_content?: string
          retry_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_campaign_messages_campaign"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_campaign_messages_lead"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "marketing_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_campaign_messages_template"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_prospects: {
        Row: {
          campaign_id: string
          first_reply_at: string | null
          id: string
          prospect_id: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id: string
          first_reply_at?: string | null
          id?: string
          prospect_id: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string
          first_reply_at?: string | null
          id?: string
          prospect_id?: string
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_prospects_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_prospects_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "university_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_agents: {
        Row: {
          counselor_id: string
          created_at: string | null
          current_active_chats: number | null
          id: string
          is_available: boolean | null
          is_online: boolean | null
          last_seen_at: string | null
          max_concurrent_chats: number | null
          updated_at: string | null
        }
        Insert: {
          counselor_id: string
          created_at?: string | null
          current_active_chats?: number | null
          id?: string
          is_available?: boolean | null
          is_online?: boolean | null
          last_seen_at?: string | null
          max_concurrent_chats?: number | null
          updated_at?: string | null
        }
        Update: {
          counselor_id?: string
          created_at?: string | null
          current_active_chats?: number | null
          id?: string
          is_available?: boolean | null
          is_online?: boolean | null
          last_seen_at?: string | null
          max_concurrent_chats?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          assigned_agent_id: string | null
          chat_type: string
          created_at: string | null
          ended_at: string | null
          id: string
          is_active: boolean | null
          lead_id: string | null
          session_id: string | null
          started_at: string | null
          student_email: string | null
          student_name: string | null
          student_phone: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_agent_id?: string | null
          chat_type?: string
          created_at?: string | null
          ended_at?: string | null
          id?: string
          is_active?: boolean | null
          lead_id?: string | null
          session_id?: string | null
          started_at?: string | null
          student_email?: string | null
          student_name?: string | null
          student_phone?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_agent_id?: string | null
          chat_type?: string
          created_at?: string | null
          ended_at?: string | null
          id?: string
          is_active?: boolean | null
          lead_id?: string | null
          session_id?: string | null
          started_at?: string | null
          student_email?: string | null
          student_name?: string | null
          student_phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "chat_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "student_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          message_type: string
          metadata: Json | null
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          message_type: string
          metadata?: Json | null
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message_type?: string
          metadata?: Json | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_questions: {
        Row: {
          created_at: string | null
          created_by: string | null
          display_order: number
          id: string
          is_active: boolean | null
          is_required: boolean | null
          question_text: string
          question_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          question_text: string
          question_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          question_text?: string
          question_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      chat_sessions: {
        Row: {
          conversation_data: Json
          created_at: string
          current_stage: number
          id: string
          is_completed: boolean
          session_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          conversation_data?: Json
          created_at?: string
          current_stage?: number
          id?: string
          is_completed?: boolean
          session_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          conversation_data?: Json
          created_at?: string
          current_stage?: number
          id?: string
          is_completed?: boolean
          session_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      counselor_attendance: {
        Row: {
          clock_in: string | null
          clock_out: string | null
          counselor_id: string
          created_at: string
          date: string
          id: string
          notes: string | null
          status: string
          total_hours: number | null
          updated_at: string
        }
        Insert: {
          clock_in?: string | null
          clock_out?: string | null
          counselor_id: string
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          status?: string
          total_hours?: number | null
          updated_at?: string
        }
        Update: {
          clock_in?: string | null
          clock_out?: string | null
          counselor_id?: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          status?: string
          total_hours?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      counselor_leave_requests: {
        Row: {
          admin_comments: string | null
          applied_on: string
          approved_by: string | null
          approved_on: string | null
          counselor_id: string
          created_at: string
          end_date: string
          id: string
          leave_type: string
          reason: string
          rejected_by: string | null
          rejected_on: string | null
          start_date: string
          status: string
          total_days: number
          updated_at: string
        }
        Insert: {
          admin_comments?: string | null
          applied_on?: string
          approved_by?: string | null
          approved_on?: string | null
          counselor_id: string
          created_at?: string
          end_date: string
          id?: string
          leave_type: string
          reason: string
          rejected_by?: string | null
          rejected_on?: string | null
          start_date: string
          status?: string
          total_days: number
          updated_at?: string
        }
        Update: {
          admin_comments?: string | null
          applied_on?: string
          approved_by?: string | null
          approved_on?: string | null
          counselor_id?: string
          created_at?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string
          rejected_by?: string | null
          rejected_on?: string | null
          start_date?: string
          status?: string
          total_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      counselor_profiles: {
        Row: {
          contact_number: string | null
          counselor_id: string | null
          created_at: string | null
          hourly_rate: number | null
          id: string
          position: string | null
          shift_end: string | null
          shift_start: string | null
          total_hours_this_month: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          contact_number?: string | null
          counselor_id?: string | null
          created_at?: string | null
          hourly_rate?: number | null
          id?: string
          position?: string | null
          shift_end?: string | null
          shift_start?: string | null
          total_hours_this_month?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          contact_number?: string | null
          counselor_id?: string | null
          created_at?: string | null
          hourly_rate?: number | null
          id?: string
          position?: string | null
          shift_end?: string | null
          shift_start?: string | null
          total_hours_this_month?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counselor_profiles_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: true
            referencedRelation: "counselors"
            referencedColumns: ["id"]
          },
        ]
      }
      counselor_salary_records: {
        Row: {
          allowances: number | null
          basic_salary: number
          counselor_id: string
          created_at: string
          deductions: number | null
          generated_by: string | null
          id: string
          month: string
          net_salary: number
          notes: string | null
          payment_date: string | null
          status: string
          updated_at: string
          year: number
        }
        Insert: {
          allowances?: number | null
          basic_salary: number
          counselor_id: string
          created_at?: string
          deductions?: number | null
          generated_by?: string | null
          id?: string
          month: string
          net_salary: number
          notes?: string | null
          payment_date?: string | null
          status?: string
          updated_at?: string
          year: number
        }
        Update: {
          allowances?: number | null
          basic_salary?: number
          counselor_id?: string
          created_at?: string
          deductions?: number | null
          generated_by?: string | null
          id?: string
          month?: string
          net_salary?: number
          notes?: string | null
          payment_date?: string | null
          status?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      counselor_sessions: {
        Row: {
          amount_paid: number | null
          counselor_id: string
          counselor_notes: string | null
          created_at: string
          duration_minutes: number
          id: string
          meeting_link: string | null
          scheduled_at: string
          session_notes: string | null
          session_type: string
          status: string
          student_feedback: string | null
          student_id: string
          student_rating: number | null
          updated_at: string
        }
        Insert: {
          amount_paid?: number | null
          counselor_id: string
          counselor_notes?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          meeting_link?: string | null
          scheduled_at: string
          session_notes?: string | null
          session_type?: string
          status?: string
          student_feedback?: string | null
          student_id: string
          student_rating?: number | null
          updated_at?: string
        }
        Update: {
          amount_paid?: number | null
          counselor_id?: string
          counselor_notes?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          meeting_link?: string | null
          scheduled_at?: string
          session_notes?: string | null
          session_type?: string
          status?: string
          student_feedback?: string | null
          student_id?: string
          student_rating?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "counselor_sessions_counselor_id_fkey"
            columns: ["counselor_id"]
            isOneToOne: false
            referencedRelation: "counselors"
            referencedColumns: ["id"]
          },
        ]
      }
      counselors: {
        Row: {
          aadhar_number: string | null
          achievement_highlights: string[] | null
          availability_schedule: Json | null
          bank_account_number: string | null
          bank_ifsc_code: string | null
          bank_name: string | null
          bio: string | null
          certifications: string[] | null
          company_email: string | null
          company_phone: string | null
          contact_number: string | null
          correspondence_address: string | null
          created_at: string
          date_of_birth: string | null
          education_background: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          escalation_contact: string | null
          escalation_phone: string | null
          experience_years: number
          hourly_rate: number | null
          id: string
          is_active: boolean | null
          is_premium: boolean | null
          is_verified: boolean | null
          joining_date: string | null
          languages: string[] | null
          pan_number: string | null
          permanent_address: string | null
          position: string | null
          rating: number | null
          reviews_count: number | null
          shift_end: string | null
          shift_start: string | null
          specializations: string[]
          students_helped: number | null
          success_rate: number | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aadhar_number?: string | null
          achievement_highlights?: string[] | null
          availability_schedule?: Json | null
          bank_account_number?: string | null
          bank_ifsc_code?: string | null
          bank_name?: string | null
          bio?: string | null
          certifications?: string[] | null
          company_email?: string | null
          company_phone?: string | null
          contact_number?: string | null
          correspondence_address?: string | null
          created_at?: string
          date_of_birth?: string | null
          education_background?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          escalation_contact?: string | null
          escalation_phone?: string | null
          experience_years?: number
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          is_verified?: boolean | null
          joining_date?: string | null
          languages?: string[] | null
          pan_number?: string | null
          permanent_address?: string | null
          position?: string | null
          rating?: number | null
          reviews_count?: number | null
          shift_end?: string | null
          shift_start?: string | null
          specializations?: string[]
          students_helped?: number | null
          success_rate?: number | null
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aadhar_number?: string | null
          achievement_highlights?: string[] | null
          availability_schedule?: Json | null
          bank_account_number?: string | null
          bank_ifsc_code?: string | null
          bank_name?: string | null
          bio?: string | null
          certifications?: string[] | null
          company_email?: string | null
          company_phone?: string | null
          contact_number?: string | null
          correspondence_address?: string | null
          created_at?: string
          date_of_birth?: string | null
          education_background?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          escalation_contact?: string | null
          escalation_phone?: string | null
          experience_years?: number
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          is_verified?: boolean | null
          joining_date?: string | null
          languages?: string[] | null
          pan_number?: string | null
          permanent_address?: string | null
          position?: string | null
          rating?: number | null
          reviews_count?: number | null
          shift_end?: string | null
          shift_start?: string | null
          specializations?: string[]
          students_helped?: number | null
          success_rate?: number | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      countries: {
        Row: {
          created_at: string
          display_order: number | null
          flag_emoji: string
          id: string
          is_active: boolean | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          flag_emoji: string
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          flag_emoji?: string
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      country_content: {
        Row: {
          area: string | null
          average_fees: string | null
          capital: string | null
          country_id: string
          created_at: string
          description: string | null
          english_speaking_percentage: string | null
          famous_places: string[] | null
          hero_image_url: string | null
          id: string
          indian_student_population: string | null
          interesting_facts: string[] | null
          languages: string[] | null
          native_languages: string[] | null
          part_time_work_allowed: boolean | null
          part_time_work_hours: string | null
          processing_highlights: string[] | null
          psw_period: string | null
          study_duration: string | null
          total_universities: string | null
          updated_at: string
          video_url: string | null
          why_study_here: string | null
          work_permit_duration: string | null
        }
        Insert: {
          area?: string | null
          average_fees?: string | null
          capital?: string | null
          country_id: string
          created_at?: string
          description?: string | null
          english_speaking_percentage?: string | null
          famous_places?: string[] | null
          hero_image_url?: string | null
          id?: string
          indian_student_population?: string | null
          interesting_facts?: string[] | null
          languages?: string[] | null
          native_languages?: string[] | null
          part_time_work_allowed?: boolean | null
          part_time_work_hours?: string | null
          processing_highlights?: string[] | null
          psw_period?: string | null
          study_duration?: string | null
          total_universities?: string | null
          updated_at?: string
          video_url?: string | null
          why_study_here?: string | null
          work_permit_duration?: string | null
        }
        Update: {
          area?: string | null
          average_fees?: string | null
          capital?: string | null
          country_id?: string
          created_at?: string
          description?: string | null
          english_speaking_percentage?: string | null
          famous_places?: string[] | null
          hero_image_url?: string | null
          id?: string
          indian_student_population?: string | null
          interesting_facts?: string[] | null
          languages?: string[] | null
          native_languages?: string[] | null
          part_time_work_allowed?: boolean | null
          part_time_work_hours?: string | null
          processing_highlights?: string[] | null
          psw_period?: string | null
          study_duration?: string | null
          total_universities?: string | null
          updated_at?: string
          video_url?: string | null
          why_study_here?: string | null
          work_permit_duration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "country_content_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: true
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      country_courses: {
        Row: {
          country_id: string
          course_name: string
          created_at: string
          display_order: number | null
          id: string
          is_popular: boolean | null
        }
        Insert: {
          country_id: string
          course_name: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_popular?: boolean | null
        }
        Update: {
          country_id?: string
          course_name?: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_popular?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "country_courses_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      country_highlights: {
        Row: {
          country_id: string
          created_at: string
          display_order: number | null
          highlight_text: string
          icon_name: string | null
          id: string
        }
        Insert: {
          country_id: string
          created_at?: string
          display_order?: number | null
          highlight_text: string
          icon_name?: string | null
          id?: string
        }
        Update: {
          country_id?: string
          created_at?: string
          display_order?: number | null
          highlight_text?: string
          icon_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "country_highlights_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      country_industries: {
        Row: {
          country_id: string
          created_at: string
          display_order: number | null
          id: string
          industry_name: string
        }
        Insert: {
          country_id: string
          created_at?: string
          display_order?: number | null
          id?: string
          industry_name: string
        }
        Update: {
          country_id?: string
          created_at?: string
          display_order?: number | null
          id?: string
          industry_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "country_industries_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      country_testimonials: {
        Row: {
          country_id: string
          course: string | null
          created_at: string
          display_order: number | null
          id: string
          is_featured: boolean | null
          student_image_url: string | null
          student_name: string
          testimonial_text: string
          university: string | null
          video_url: string | null
        }
        Insert: {
          country_id: string
          course?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_featured?: boolean | null
          student_image_url?: string | null
          student_name: string
          testimonial_text: string
          university?: string | null
          video_url?: string | null
        }
        Update: {
          country_id?: string
          course?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_featured?: boolean | null
          student_image_url?: string | null
          student_name?: string
          testimonial_text?: string
          university?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "country_testimonials_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          application_deadline: string | null
          created_at: string
          currency: string | null
          degree_type: string
          duration_months: number | null
          field_of_study: string | null
          gmat_requirement: boolean | null
          gre_requirement: boolean | null
          id: string
          ielts_requirement: number | null
          intake_months: number[] | null
          is_active: boolean
          name: string
          requirements: string | null
          scholarship_available: boolean | null
          toefl_requirement: number | null
          tuition_fee_usd: number | null
          university_id: string
          updated_at: string
          visa_sponsorship: boolean | null
          work_experience_required: number | null
        }
        Insert: {
          application_deadline?: string | null
          created_at?: string
          currency?: string | null
          degree_type: string
          duration_months?: number | null
          field_of_study?: string | null
          gmat_requirement?: boolean | null
          gre_requirement?: boolean | null
          id?: string
          ielts_requirement?: number | null
          intake_months?: number[] | null
          is_active?: boolean
          name: string
          requirements?: string | null
          scholarship_available?: boolean | null
          toefl_requirement?: number | null
          tuition_fee_usd?: number | null
          university_id: string
          updated_at?: string
          visa_sponsorship?: boolean | null
          work_experience_required?: number | null
        }
        Update: {
          application_deadline?: string | null
          created_at?: string
          currency?: string | null
          degree_type?: string
          duration_months?: number | null
          field_of_study?: string | null
          gmat_requirement?: boolean | null
          gre_requirement?: boolean | null
          id?: string
          ielts_requirement?: number | null
          intake_months?: number[] | null
          is_active?: boolean
          name?: string
          requirements?: string | null
          scholarship_available?: boolean | null
          toefl_requirement?: number | null
          tuition_fee_usd?: number | null
          university_id?: string
          updated_at?: string
          visa_sponsorship?: boolean | null
          work_experience_required?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      document_audit_logs: {
        Row: {
          action_type: string
          additional_data: Json | null
          created_at: string
          document_id: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          performed_by: string | null
          user_agent: string | null
        }
        Insert: {
          action_type: string
          additional_data?: Json | null
          created_at?: string
          document_id: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string | null
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          additional_data?: Json | null
          created_at?: string
          document_id?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_audit_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_checklists: {
        Row: {
          activation_notes: string | null
          allowed_file_types: string[]
          category: string | null
          conditional_logic: Json | null
          countries: string[] | null
          country: string
          course_id: string | null
          created_at: string
          created_by: string | null
          degree_type: string
          degree_types: string[] | null
          description: string | null
          display_order: number | null
          document_type: string
          id: string
          is_active: boolean
          is_required: boolean
          last_modified_by: string | null
          max_file_size_mb: number
          university_id: string | null
          updated_at: string
        }
        Insert: {
          activation_notes?: string | null
          allowed_file_types?: string[]
          category?: string | null
          conditional_logic?: Json | null
          countries?: string[] | null
          country: string
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          degree_type: string
          degree_types?: string[] | null
          description?: string | null
          display_order?: number | null
          document_type: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          last_modified_by?: string | null
          max_file_size_mb?: number
          university_id?: string | null
          updated_at?: string
        }
        Update: {
          activation_notes?: string | null
          allowed_file_types?: string[]
          category?: string | null
          conditional_logic?: Json | null
          countries?: string[] | null
          country?: string
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          degree_type?: string
          degree_types?: string[] | null
          description?: string | null
          display_order?: number | null
          document_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          last_modified_by?: string | null
          max_file_size_mb?: number
          university_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      document_countries: {
        Row: {
          code: string
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_degree_types: {
        Row: {
          code: string
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_notifications: {
        Row: {
          additional_data: Json | null
          created_at: string
          document_id: string | null
          id: string
          is_read: boolean | null
          message: string
          notification_type: string
          read_at: string | null
          sent_via: string[] | null
          title: string
          user_id: string
        }
        Insert: {
          additional_data?: Json | null
          created_at?: string
          document_id?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          notification_type: string
          read_at?: string | null
          sent_via?: string[] | null
          title: string
          user_id: string
        }
        Update: {
          additional_data?: Json | null
          created_at?: string
          document_id?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          notification_type?: string
          read_at?: string | null
          sent_via?: string[] | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_notifications_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requests: {
        Row: {
          allowed_file_types: string[] | null
          created_at: string | null
          description: string | null
          document_type: string
          id: string
          is_mandatory: boolean | null
          max_file_size_mb: number | null
          requested_by: string
          status: string | null
          student_id: string
          updated_at: string | null
        }
        Insert: {
          allowed_file_types?: string[] | null
          created_at?: string | null
          description?: string | null
          document_type: string
          id?: string
          is_mandatory?: boolean | null
          max_file_size_mb?: number | null
          requested_by: string
          status?: string | null
          student_id: string
          updated_at?: string | null
        }
        Update: {
          allowed_file_types?: string[] | null
          created_at?: string | null
          description?: string | null
          document_type?: string
          id?: string
          is_mandatory?: boolean | null
          max_file_size_mb?: number | null
          requested_by?: string
          status?: string | null
          student_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      document_versions: {
        Row: {
          change_reason: string | null
          created_at: string
          document_id: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          is_current: boolean | null
          mime_type: string | null
          uploaded_by: string | null
          version_number: number
        }
        Insert: {
          change_reason?: string | null
          created_at?: string
          document_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          is_current?: boolean | null
          mime_type?: string | null
          uploaded_by?: string | null
          version_number: number
        }
        Update: {
          change_reason?: string | null
          created_at?: string
          document_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          is_current?: boolean | null
          mime_type?: string | null
          uploaded_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          admin_comments: string | null
          archived: boolean
          archived_at: string | null
          archived_by: string | null
          created_at: string
          document_type: string
          expiry_date: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          is_current_version: boolean | null
          mime_type: string | null
          parent_document_id: string | null
          priority_level: string | null
          request_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tags: string[] | null
          updated_at: string
          user_id: string
          version_number: number | null
        }
        Insert: {
          admin_comments?: string | null
          archived?: boolean
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          document_type: string
          expiry_date?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          is_current_version?: boolean | null
          mime_type?: string | null
          parent_document_id?: string | null
          priority_level?: string | null
          request_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
          version_number?: number | null
        }
        Update: {
          admin_comments?: string | null
          archived?: boolean
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          document_type?: string
          expiry_date?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          is_current_version?: boolean | null
          mime_type?: string | null
          parent_document_id?: string | null
          priority_level?: string | null
          request_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
          version_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      email_conversations: {
        Row: {
          ai_generated_count: number | null
          assigned_to: string | null
          conversation_stage: string | null
          created_at: string
          human_edited_count: number | null
          id: string
          last_activity_at: string
          priority_flags: string[] | null
          sentiment_score: number | null
          subject: string
          thread_id: string | null
          total_emails: number | null
          university_prospect_id: string
          updated_at: string
        }
        Insert: {
          ai_generated_count?: number | null
          assigned_to?: string | null
          conversation_stage?: string | null
          created_at?: string
          human_edited_count?: number | null
          id?: string
          last_activity_at?: string
          priority_flags?: string[] | null
          sentiment_score?: number | null
          subject: string
          thread_id?: string | null
          total_emails?: number | null
          university_prospect_id: string
          updated_at?: string
        }
        Update: {
          ai_generated_count?: number | null
          assigned_to?: string | null
          conversation_stage?: string | null
          created_at?: string
          human_edited_count?: number | null
          id?: string
          last_activity_at?: string
          priority_flags?: string[] | null
          sentiment_score?: number | null
          subject?: string
          thread_id?: string | null
          total_emails?: number | null
          university_prospect_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_conversations_university_prospect_id_fkey"
            columns: ["university_prospect_id"]
            isOneToOne: false
            referencedRelation: "university_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          ai_confidence_score: number | null
          approved_at: string | null
          approved_by: string | null
          bcc_emails: string[] | null
          body_html: string | null
          body_text: string | null
          cc_emails: string[] | null
          clicked_at: string | null
          conversation_id: string
          created_at: string
          delivery_status: string | null
          direction: string
          id: string
          is_ai_generated: boolean | null
          is_approved: boolean | null
          message_id: string | null
          opened_at: string | null
          recipient_emails: string[]
          requires_human_review: boolean | null
          response_classification: string | null
          sender_email: string
          sent_at: string
          sentiment: string | null
          subject: string
          template_used: string | null
        }
        Insert: {
          ai_confidence_score?: number | null
          approved_at?: string | null
          approved_by?: string | null
          bcc_emails?: string[] | null
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[] | null
          clicked_at?: string | null
          conversation_id: string
          created_at?: string
          delivery_status?: string | null
          direction: string
          id?: string
          is_ai_generated?: boolean | null
          is_approved?: boolean | null
          message_id?: string | null
          opened_at?: string | null
          recipient_emails: string[]
          requires_human_review?: boolean | null
          response_classification?: string | null
          sender_email: string
          sent_at?: string
          sentiment?: string | null
          subject: string
          template_used?: string | null
        }
        Update: {
          ai_confidence_score?: number | null
          approved_at?: string | null
          approved_by?: string | null
          bcc_emails?: string[] | null
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[] | null
          clicked_at?: string | null
          conversation_id?: string
          created_at?: string
          delivery_status?: string | null
          direction?: string
          id?: string
          is_ai_generated?: boolean | null
          is_approved?: boolean | null
          message_id?: string | null
          opened_at?: string | null
          recipient_emails?: string[]
          requires_human_review?: boolean | null
          response_classification?: string | null
          sender_email?: string
          sent_at?: string
          sentiment?: string | null
          subject?: string
          template_used?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "email_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_template_used_fkey"
            columns: ["template_used"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_service_config: {
        Row: {
          bounce_rate: number | null
          config_name: string
          created_at: string
          created_by: string
          current_daily_sent: number | null
          daily_send_limit: number | null
          email_address: string
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          last_reset_date: string | null
          oauth_token_encrypted: string | null
          service_type: string
          smtp_settings: Json | null
          spam_complaints: number | null
          updated_at: string
        }
        Insert: {
          bounce_rate?: number | null
          config_name: string
          created_at?: string
          created_by: string
          current_daily_sent?: number | null
          daily_send_limit?: number | null
          email_address: string
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          last_reset_date?: string | null
          oauth_token_encrypted?: string | null
          service_type: string
          smtp_settings?: Json | null
          spam_complaints?: number | null
          updated_at?: string
        }
        Update: {
          bounce_rate?: number | null
          config_name?: string
          created_at?: string
          created_by?: string
          current_daily_sent?: number | null
          daily_send_limit?: number | null
          email_address?: string
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          last_reset_date?: string | null
          oauth_token_encrypted?: string | null
          service_type?: string
          smtp_settings?: Json | null
          spam_complaints?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_template: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          region: string | null
          subject_template: string
          template_type: string | null
          tone: string | null
          updated_at: string
          variables_used: string[] | null
        }
        Insert: {
          body_template: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          region?: string | null
          subject_template: string
          template_type?: string | null
          tone?: string | null
          updated_at?: string
          variables_used?: string[] | null
        }
        Update: {
          body_template?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          region?: string | null
          subject_template?: string
          template_type?: string | null
          tone?: string | null
          updated_at?: string
          variables_used?: string[] | null
        }
        Relationships: []
      }
      event_registrations: {
        Row: {
          attendance_status: string | null
          event_id: string
          feedback_comments: string | null
          feedback_rating: number | null
          id: string
          registered_at: string
          user_id: string
        }
        Insert: {
          attendance_status?: string | null
          event_id: string
          feedback_comments?: string | null
          feedback_rating?: number | null
          id?: string
          registered_at?: string
          user_id: string
        }
        Update: {
          attendance_status?: string | null
          event_id?: string
          feedback_comments?: string | null
          feedback_rating?: number | null
          id?: string
          registered_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          agenda: Json | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          event_type: string
          host_name: string
          host_organization: string | null
          id: string
          is_free: boolean | null
          is_premium_only: boolean | null
          max_attendees: number | null
          meeting_link: string | null
          recording_available: boolean | null
          recording_url: string | null
          registration_deadline: string | null
          registration_fee: number | null
          scheduled_at: string
          status: string | null
          target_audience: string[] | null
          timezone: string | null
          title: string
          topics_covered: string[] | null
          updated_at: string
        }
        Insert: {
          agenda?: Json | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          event_type?: string
          host_name: string
          host_organization?: string | null
          id?: string
          is_free?: boolean | null
          is_premium_only?: boolean | null
          max_attendees?: number | null
          meeting_link?: string | null
          recording_available?: boolean | null
          recording_url?: string | null
          registration_deadline?: string | null
          registration_fee?: number | null
          scheduled_at: string
          status?: string | null
          target_audience?: string[] | null
          timezone?: string | null
          title: string
          topics_covered?: string[] | null
          updated_at?: string
        }
        Update: {
          agenda?: Json | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          event_type?: string
          host_name?: string
          host_organization?: string | null
          id?: string
          is_free?: boolean | null
          is_premium_only?: boolean | null
          max_attendees?: number | null
          meeting_link?: string | null
          recording_available?: boolean | null
          recording_url?: string | null
          registration_deadline?: string | null
          registration_fee?: number | null
          scheduled_at?: string
          status?: string | null
          target_audience?: string[] | null
          timezone?: string | null
          title?: string
          topics_covered?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      financial_plans: {
        Row: {
          country: string
          created_at: string
          currency: string | null
          duration_years: number
          family_contribution: number | null
          funding_gap: number | null
          id: string
          insurance_cost: number | null
          living_cost: number | null
          loan_amount: number | null
          miscellaneous_cost: number | null
          monthly_budget: Json | null
          scholarship_amount: number | null
          self_funding: number | null
          total_budget: number
          travel_cost: number | null
          tuition_cost: number | null
          updated_at: string
          user_id: string
          work_earnings_estimate: number | null
        }
        Insert: {
          country: string
          created_at?: string
          currency?: string | null
          duration_years?: number
          family_contribution?: number | null
          funding_gap?: number | null
          id?: string
          insurance_cost?: number | null
          living_cost?: number | null
          loan_amount?: number | null
          miscellaneous_cost?: number | null
          monthly_budget?: Json | null
          scholarship_amount?: number | null
          self_funding?: number | null
          total_budget: number
          travel_cost?: number | null
          tuition_cost?: number | null
          updated_at?: string
          user_id: string
          work_earnings_estimate?: number | null
        }
        Update: {
          country?: string
          created_at?: string
          currency?: string | null
          duration_years?: number
          family_contribution?: number | null
          funding_gap?: number | null
          id?: string
          insurance_cost?: number | null
          living_cost?: number | null
          loan_amount?: number | null
          miscellaneous_cost?: number | null
          monthly_budget?: Json | null
          scholarship_amount?: number | null
          self_funding?: number | null
          total_budget?: number
          travel_cost?: number | null
          tuition_cost?: number | null
          updated_at?: string
          user_id?: string
          work_earnings_estimate?: number | null
        }
        Relationships: []
      }
      founders: {
        Row: {
          bio: string
          countries_worked: string[] | null
          created_at: string | null
          display_order: number | null
          experience_years: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          linkedin_url: string | null
          name: string
          specializations: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          bio: string
          countries_worked?: string[] | null
          created_at?: string | null
          display_order?: number | null
          experience_years?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          linkedin_url?: string | null
          name: string
          specializations?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          bio?: string
          countries_worked?: string[] | null
          created_at?: string | null
          display_order?: number | null
          experience_years?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          linkedin_url?: string | null
          name?: string
          specializations?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      lead_activity_logs: {
        Row: {
          activity_type: string
          created_at: string
          description: string
          id: string
          lead_id: string
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          performed_by: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          description: string
          id?: string
          lead_id: string
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "student_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string
          counselor_id: string
          ended_at: string | null
          id: string
          is_active: boolean | null
          lead_id: string
          reassignment_reason: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          counselor_id: string
          ended_at?: string | null
          id?: string
          is_active?: boolean | null
          lead_id: string
          reassignment_reason?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          counselor_id?: string
          ended_at?: string | null
          id?: string
          is_active?: boolean | null
          lead_id?: string
          reassignment_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_assignments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "student_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_important: boolean | null
          lead_id: string
          note: string
          note_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_important?: boolean | null
          lead_id: string
          note: string
          note_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_important?: boolean | null
          lead_id?: string
          note?: string
          note_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "student_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          campaign_settings: Json | null
          campaign_type: string
          channels: string[]
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          id: string
          name: string
          scheduled_at: string | null
          start_date: string | null
          status: string
          target_audience: Json
          updated_at: string
          utm_parameters: Json | null
        }
        Insert: {
          campaign_settings?: Json | null
          campaign_type?: string
          channels?: string[]
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          scheduled_at?: string | null
          start_date?: string | null
          status?: string
          target_audience?: Json
          updated_at?: string
          utm_parameters?: Json | null
        }
        Update: {
          campaign_settings?: Json | null
          campaign_type?: string
          channels?: string[]
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          scheduled_at?: string | null
          start_date?: string | null
          status?: string
          target_audience?: Json
          updated_at?: string
          utm_parameters?: Json | null
        }
        Relationships: []
      }
      marketing_leads: {
        Row: {
          campaign_id: string
          consent_given: boolean | null
          country: string | null
          created_at: string
          custom_fields: Json | null
          destination_country: string | null
          email: string | null
          field_of_interest: string | null
          first_name: string | null
          id: string
          last_name: string | null
          lead_source: string | null
          opt_out_email: boolean | null
          opt_out_sms: boolean | null
          opt_out_whatsapp: boolean | null
          phone: string | null
          qualification_level: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          consent_given?: boolean | null
          country?: string | null
          created_at?: string
          custom_fields?: Json | null
          destination_country?: string | null
          email?: string | null
          field_of_interest?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lead_source?: string | null
          opt_out_email?: boolean | null
          opt_out_sms?: boolean | null
          opt_out_whatsapp?: boolean | null
          phone?: string | null
          qualification_level?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          consent_given?: boolean | null
          country?: string | null
          created_at?: string
          custom_fields?: Json | null
          destination_country?: string | null
          email?: string | null
          field_of_interest?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lead_source?: string | null
          opt_out_email?: boolean | null
          opt_out_sms?: boolean | null
          opt_out_whatsapp?: boolean | null
          phone?: string | null
          qualification_level?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_marketing_leads_campaign"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      message_engagement: {
        Row: {
          engagement_data: Json | null
          engagement_type: string
          id: string
          message_id: string
          tracked_at: string
          webhook_data: Json | null
        }
        Insert: {
          engagement_data?: Json | null
          engagement_type: string
          id?: string
          message_id: string
          tracked_at?: string
          webhook_data?: Json | null
        }
        Update: {
          engagement_data?: Json | null
          engagement_type?: string
          id?: string
          message_id?: string
          tracked_at?: string
          webhook_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_message_engagement_message"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "campaign_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean | null
          is_ai_generated: boolean | null
          name: string
          subject: string | null
          template_type: string
          tone: string | null
          updated_at: string
          variables_used: string[] | null
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean | null
          is_ai_generated?: boolean | null
          name: string
          subject?: string | null
          template_type: string
          tone?: string | null
          updated_at?: string
          variables_used?: string[] | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean | null
          is_ai_generated?: boolean | null
          name?: string
          subject?: string | null
          template_type?: string
          tone?: string | null
          updated_at?: string
          variables_used?: string[] | null
        }
        Relationships: []
      }
      newsletter_subscriptions: {
        Row: {
          email: string
          id: string
          is_active: boolean | null
          name: string | null
          preferences: Json | null
          subscribed_at: string | null
          unsubscribed_at: string | null
        }
        Insert: {
          email: string
          id?: string
          is_active?: boolean | null
          name?: string | null
          preferences?: Json | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
        }
        Update: {
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string | null
          preferences?: Json | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      otp_verifications: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          is_verified: boolean
          otp_code: string
          phone_number: string
          session_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          is_verified?: boolean
          otp_code: string
          phone_number: string
          session_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          is_verified?: boolean
          otp_code?: string
          phone_number?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "otp_verifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          assigned_staff_id: string | null
          contact_name: string | null
          created_at: string
          id: string
          last_message_at: string | null
          lead_id: string | null
          phone_number: string
          staff_role: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_staff_id?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          phone_number: string
          staff_role?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_staff_id?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          phone_number?: string
          staff_role?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          direction: string
          id: string
          is_read: boolean | null
          staff_id: string | null
          updated_at: string | null
          wa_message_id: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          direction?: string
          id?: string
          is_read?: boolean | null
          staff_id?: string | null
          updated_at?: string | null
          wa_message_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          is_read?: boolean | null
          staff_id?: string | null
          updated_at?: string | null
          wa_message_id?: string | null
        }
        Relationships: []
      }
      whatsapp_verifications: {
        Row: {
          attempts: number | null
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          phone_number: string
          updated_at: string | null
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          attempts?: number | null
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          phone_number: string
          updated_at?: string | null
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          attempts?: number | null
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone_number?: string
          updated_at?: string | null
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      outreach_activity_logs: {
        Row: {
          activity_type: string
          automated: boolean | null
          created_at: string
          description: string
          entity_id: string
          entity_type: string
          id: string
          new_values: Json | null
          old_values: Json | null
          performed_by: string | null
        }
        Insert: {
          activity_type: string
          automated?: boolean | null
          created_at?: string
          description: string
          entity_id: string
          entity_type: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string | null
        }
        Update: {
          activity_type?: string
          automated?: boolean | null
          created_at?: string
          description?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string | null
        }
        Relationships: []
      }
      outreach_campaigns: {
        Row: {
          auto_follow_up: boolean | null
          conversions: number | null
          created_at: string
          created_by: string
          daily_send_limit: number | null
          description: string | null
          emails_opened: number | null
          emails_sent: number | null
          end_date: string | null
          follow_up_days: number | null
          id: string
          name: string
          replies_received: number | null
          start_date: string | null
          status: string | null
          target_countries: string[]
          target_course_types: string[] | null
          template_id: string | null
          total_prospects: number | null
          updated_at: string
        }
        Insert: {
          auto_follow_up?: boolean | null
          conversions?: number | null
          created_at?: string
          created_by: string
          daily_send_limit?: number | null
          description?: string | null
          emails_opened?: number | null
          emails_sent?: number | null
          end_date?: string | null
          follow_up_days?: number | null
          id?: string
          name: string
          replies_received?: number | null
          start_date?: string | null
          status?: string | null
          target_countries: string[]
          target_course_types?: string[] | null
          template_id?: string | null
          total_prospects?: number | null
          updated_at?: string
        }
        Update: {
          auto_follow_up?: boolean | null
          conversions?: number | null
          created_at?: string
          created_by?: string
          daily_send_limit?: number | null
          description?: string | null
          emails_opened?: number | null
          emails_sent?: number | null
          end_date?: string | null
          follow_up_days?: number | null
          id?: string
          name?: string
          replies_received?: number | null
          start_date?: string | null
          status?: string | null
          target_countries?: string[]
          target_course_types?: string[] | null
          template_id?: string | null
          total_prospects?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      package_availability: {
        Row: {
          available_slots: number
          booked_slots: number | null
          created_at: string | null
          departure_date: string
          id: string
          is_available: boolean | null
          notes: string | null
          package_id: string
          price_override: number | null
          updated_at: string | null
        }
        Insert: {
          available_slots: number
          booked_slots?: number | null
          created_at?: string | null
          departure_date: string
          id?: string
          is_available?: boolean | null
          notes?: string | null
          package_id: string
          price_override?: number | null
          updated_at?: string | null
        }
        Update: {
          available_slots?: number
          booked_slots?: number | null
          created_at?: string | null
          departure_date?: string
          id?: string
          is_available?: boolean | null
          notes?: string | null
          package_id?: string
          price_override?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_availability_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "travel_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_bookings: {
        Row: {
          accessibility_needs: string | null
          booking_reference: string
          booking_status: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmation_sent_at: string | null
          created_at: string | null
          currency: string | null
          departure_date: string
          dietary_preferences: string | null
          discount_amount: number | null
          final_amount: number
          id: string
          inquiry_id: string | null
          number_of_travelers: number
          package_id: string
          payment_method: string | null
          payment_status: string | null
          price_per_person: number
          return_date: string
          special_requirements: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          total_amount: number
          traveler_details: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accessibility_needs?: string | null
          booking_reference: string
          booking_status?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmation_sent_at?: string | null
          created_at?: string | null
          currency?: string | null
          departure_date: string
          dietary_preferences?: string | null
          discount_amount?: number | null
          final_amount: number
          id?: string
          inquiry_id?: string | null
          number_of_travelers: number
          package_id: string
          payment_method?: string | null
          payment_status?: string | null
          price_per_person: number
          return_date: string
          special_requirements?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount: number
          traveler_details?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accessibility_needs?: string | null
          booking_reference?: string
          booking_status?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmation_sent_at?: string | null
          created_at?: string | null
          currency?: string | null
          departure_date?: string
          dietary_preferences?: string | null
          discount_amount?: number | null
          final_amount?: number
          id?: string
          inquiry_id?: string | null
          number_of_travelers?: number
          package_id?: string
          payment_method?: string | null
          payment_status?: string | null
          price_per_person?: number
          return_date?: string
          special_requirements?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount?: number
          traveler_details?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_bookings_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "travel_inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "travel_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_faqs: {
        Row: {
          answer: string
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_global: boolean | null
          package_id: string | null
          question: string
          updated_at: string | null
        }
        Insert: {
          answer: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_global?: boolean | null
          package_id?: string | null
          question: string
          updated_at?: string | null
        }
        Update: {
          answer?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_global?: boolean | null
          package_id?: string | null
          question?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_faqs_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "travel_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_inventory: {
        Row: {
          available_slots: number | null
          blackout_reason: string | null
          blocked_slots: number | null
          booked_slots: number | null
          created_at: string | null
          date: string
          flight_inventory_status: string | null
          hotel_inventory_status: string | null
          id: string
          is_blackout_date: boolean | null
          notes: string | null
          package_id: string | null
          total_slots: number
          updated_at: string | null
        }
        Insert: {
          available_slots?: number | null
          blackout_reason?: string | null
          blocked_slots?: number | null
          booked_slots?: number | null
          created_at?: string | null
          date: string
          flight_inventory_status?: string | null
          hotel_inventory_status?: string | null
          id?: string
          is_blackout_date?: boolean | null
          notes?: string | null
          package_id?: string | null
          total_slots?: number
          updated_at?: string | null
        }
        Update: {
          available_slots?: number | null
          blackout_reason?: string | null
          blocked_slots?: number | null
          booked_slots?: number | null
          created_at?: string | null
          date?: string
          flight_inventory_status?: string | null
          hotel_inventory_status?: string | null
          id?: string
          is_blackout_date?: boolean | null
          notes?: string | null
          package_id?: string | null
          total_slots?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_inventory_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "travel_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_reviews: {
        Row: {
          created_at: string | null
          helpful_count: number | null
          id: string
          images: string[] | null
          is_approved: boolean | null
          is_featured: boolean | null
          package_id: string
          rating: number
          review_text: string
          title: string
          updated_at: string | null
          user_id: string
          verified_booking: boolean | null
        }
        Insert: {
          created_at?: string | null
          helpful_count?: number | null
          id?: string
          images?: string[] | null
          is_approved?: boolean | null
          is_featured?: boolean | null
          package_id: string
          rating: number
          review_text: string
          title: string
          updated_at?: string | null
          user_id: string
          verified_booking?: boolean | null
        }
        Update: {
          created_at?: string | null
          helpful_count?: number | null
          id?: string
          images?: string[] | null
          is_approved?: boolean | null
          is_featured?: boolean | null
          package_id?: string
          rating?: number
          review_text?: string
          title?: string
          updated_at?: string | null
          user_id?: string
          verified_booking?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "package_reviews_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "travel_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_wishlists: {
        Row: {
          created_at: string | null
          id: string
          package_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          package_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          package_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_wishlists_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "travel_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          likes_count: number | null
          parent_comment_id: string | null
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          likes_count?: number | null
          parent_comment_id?: string | null
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          likes_count?: number | null
          parent_comment_id?: string | null
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          category: string
          comments_count: number | null
          content: string
          created_at: string
          id: string
          is_featured: boolean | null
          is_pinned: boolean | null
          likes_count: number | null
          media_urls: string[] | null
          poll_expires_at: string | null
          poll_options: Json | null
          poll_votes: Json | null
          post_type: string
          tags: string[] | null
          title: string
          updated_at: string
          user_id: string
          views_count: number | null
        }
        Insert: {
          category?: string
          comments_count?: number | null
          content: string
          created_at?: string
          id?: string
          is_featured?: boolean | null
          is_pinned?: boolean | null
          likes_count?: number | null
          media_urls?: string[] | null
          poll_expires_at?: string | null
          poll_options?: Json | null
          poll_votes?: Json | null
          post_type?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          user_id: string
          views_count?: number | null
        }
        Update: {
          category?: string
          comments_count?: number | null
          content?: string
          created_at?: string
          id?: string
          is_featured?: boolean | null
          is_pinned?: boolean | null
          likes_count?: number | null
          media_urls?: string[] | null
          poll_expires_at?: string | null
          poll_options?: Json | null
          poll_votes?: Json | null
          post_type?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
          views_count?: number | null
        }
        Relationships: []
      }
      private_conversations: {
        Row: {
          counselor_id: string
          created_at: string
          id: string
          last_message_at: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          counselor_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          counselor_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      private_messages: {
        Row: {
          attachments: Json | null
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          receiver_id: string
          sender_id: string
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          receiver_id: string
          sender_id: string
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          receiver_id?: string
          sender_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          backlogs_history: string | null
          bachelors_degree: string | null
          bachelors_institution: string | null
          bachelors_score: string | null
          country: string | null
          course_preferences: string | null
          created_at: string
          date_of_birth: string | null
          degree_level: string | null
          first_name: string | null
          full_name: string | null
          id: string
          interested_countries: string[] | null
          last_name: string | null
          masters_degree: string | null
          masters_institution: string | null
          masters_score: string | null
          passport_number: string | null
          phone: string | null
          student_notes: string | null
          tenth_grade_score: string | null
          test_scores: Json | null
          twelfth_grade_score: string | null
          updated_at: string
          user_id: string
          whatsapp_number: string | null
          whatsapp_verified: boolean | null
          whatsapp_verified_at: string | null
        }
        Insert: {
          backlogs_history?: string | null
          bachelors_degree?: string | null
          bachelors_institution?: string | null
          bachelors_score?: string | null
          country?: string | null
          course_preferences?: string | null
          created_at?: string
          date_of_birth?: string | null
          degree_level?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          interested_countries?: string[] | null
          last_name?: string | null
          masters_degree?: string | null
          masters_institution?: string | null
          masters_score?: string | null
          passport_number?: string | null
          phone?: string | null
          student_notes?: string | null
          tenth_grade_score?: string | null
          test_scores?: Json | null
          twelfth_grade_score?: string | null
          updated_at?: string
          user_id: string
          whatsapp_number?: string | null
          whatsapp_verified?: boolean | null
          whatsapp_verified_at?: string | null
        }
        Update: {
          backlogs_history?: string | null
          bachelors_degree?: string | null
          bachelors_institution?: string | null
          bachelors_score?: string | null
          country?: string | null
          course_preferences?: string | null
          created_at?: string
          date_of_birth?: string | null
          degree_level?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          interested_countries?: string[] | null
          last_name?: string | null
          masters_degree?: string | null
          masters_institution?: string | null
          masters_score?: string | null
          passport_number?: string | null
          phone?: string | null
          student_notes?: string | null
          tenth_grade_score?: string | null
          test_scores?: Json | null
          twelfth_grade_score?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_number?: string | null
          whatsapp_verified?: boolean | null
          whatsapp_verified_at?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          created_at: string
          id: string
          key: string
          last_reset: string
          updated_at: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          key: string
          last_reset?: string
          updated_at?: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          key?: string
          last_reset?: string
          updated_at?: string
        }
        Relationships: []
      }
      reengagement_flows: {
        Row: {
          action_config: Json
          action_type: string
          campaign_id: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean | null
          trigger_condition: string
          trigger_value: number | null
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          campaign_id: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean | null
          trigger_condition: string
          trigger_value?: number | null
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          campaign_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean | null
          trigger_condition?: string
          trigger_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_reengagement_flows_campaign"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      scholarship_applications: {
        Row: {
          amount_awarded: number | null
          applied_at: string | null
          created_at: string
          decision_date: string | null
          id: string
          notes: string | null
          scholarship_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_awarded?: number | null
          applied_at?: string | null
          created_at?: string
          decision_date?: string | null
          id?: string
          notes?: string | null
          scholarship_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_awarded?: number | null
          applied_at?: string | null
          created_at?: string
          decision_date?: string | null
          id?: string
          notes?: string | null
          scholarship_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scholarship_applications_scholarship_id_fkey"
            columns: ["scholarship_id"]
            isOneToOne: false
            referencedRelation: "scholarships"
            referencedColumns: ["id"]
          },
        ]
      }
      scholarships: {
        Row: {
          amount: number | null
          application_deadline: string | null
          countries: string[] | null
          created_at: string
          currency: string | null
          degree_levels: string[] | null
          description: string | null
          eligibility_criteria: Json
          fields_of_study: string[] | null
          id: string
          is_merit_based: boolean | null
          is_need_based: boolean | null
          name: string
          provider: string
          renewal_criteria: string | null
          requirements: string[] | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          amount?: number | null
          application_deadline?: string | null
          countries?: string[] | null
          created_at?: string
          currency?: string | null
          degree_levels?: string[] | null
          description?: string | null
          eligibility_criteria?: Json
          fields_of_study?: string[] | null
          id?: string
          is_merit_based?: boolean | null
          is_need_based?: boolean | null
          name: string
          provider: string
          renewal_criteria?: string | null
          requirements?: string[] | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          amount?: number | null
          application_deadline?: string | null
          countries?: string[] | null
          created_at?: string
          currency?: string | null
          degree_levels?: string[] | null
          description?: string | null
          eligibility_criteria?: Json
          fields_of_study?: string[] | null
          id?: string
          is_merit_based?: boolean | null
          is_need_based?: boolean | null
          name?: string
          provider?: string
          renewal_criteria?: string | null
          requirements?: string[] | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      service_offerings: {
        Row: {
          created_at: string
          description: string
          display_order: number | null
          features: string[] | null
          icon_name: string | null
          id: string
          is_active: boolean | null
          is_popular: boolean | null
          service_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          display_order?: number | null
          features?: string[] | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          service_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          display_order?: number | null
          features?: string[] | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          service_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      shortlist_notes: {
        Row: {
          author_id: string
          author_type: string
          created_at: string
          id: string
          is_private: boolean | null
          note_text: string
          shortlist_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          author_type: string
          created_at?: string
          id?: string
          is_private?: boolean | null
          note_text: string
          shortlist_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          author_type?: string
          created_at?: string
          id?: string
          is_private?: boolean | null
          note_text?: string
          shortlist_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shortlist_notes_shortlist_id_fkey"
            columns: ["shortlist_id"]
            isOneToOne: false
            referencedRelation: "university_shortlists"
            referencedColumns: ["id"]
          },
        ]
      }
      student_checklists: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          checklist_type: string
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          items: Json
          shortlist_id: string | null
          student_id: string
          title: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          checklist_type?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          items?: Json
          shortlist_id?: string | null
          student_id: string
          title: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          checklist_type?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          items?: Json
          shortlist_id?: string | null
          student_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_checklists_shortlist_id_fkey"
            columns: ["shortlist_id"]
            isOneToOne: false
            referencedRelation: "university_shortlists"
            referencedColumns: ["id"]
          },
        ]
      }
      student_document_progress: {
        Row: {
          approved_documents: number | null
          completion_percentage: number | null
          country: string
          course_id: string | null
          created_at: string
          degree_type: string
          id: string
          last_activity_at: string | null
          rejected_documents: number | null
          total_required_documents: number | null
          university_id: string | null
          updated_at: string
          uploaded_documents: number | null
          user_id: string
        }
        Insert: {
          approved_documents?: number | null
          completion_percentage?: number | null
          country: string
          course_id?: string | null
          created_at?: string
          degree_type: string
          id?: string
          last_activity_at?: string | null
          rejected_documents?: number | null
          total_required_documents?: number | null
          university_id?: string | null
          updated_at?: string
          uploaded_documents?: number | null
          user_id: string
        }
        Update: {
          approved_documents?: number | null
          completion_percentage?: number | null
          country?: string
          course_id?: string | null
          created_at?: string
          degree_type?: string
          id?: string
          last_activity_at?: string | null
          rejected_documents?: number | null
          total_required_documents?: number | null
          university_id?: string | null
          updated_at?: string
          uploaded_documents?: number | null
          user_id?: string
        }
        Relationships: []
      }
      student_gallery: {
        Row: {
          country: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          image_url: string
          is_active: boolean | null
          student_name: string
          updated_at: string | null
          visa_type: string | null
          year: number | null
        }
        Insert: {
          country?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          image_url: string
          is_active?: boolean | null
          student_name: string
          updated_at?: string | null
          visa_type?: string | null
          year?: number | null
        }
        Update: {
          country?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          student_name?: string
          updated_at?: string | null
          visa_type?: string | null
          year?: number | null
        }
        Relationships: []
      }
      student_leads: {
        Row: {
          academic_score: string | null
          address: string | null
          assigned_counselor_id: string | null
          assigned_telecaller_id: string | null
          budget_max_usd: number | null
          budget_min_usd: number | null
          chat_session_id: string | null
          conversion_date: string | null
          converted_at: string | null
          created_at: string
          current_qualification: string | null
          email: string
          entity_type: string | null
          field_of_interest: string | null
          first_name: string | null
          gmat_score: number | null
          gre_score: number | null
          id: string
          ielts_score: number | null
          interested_programs: string[] | null
          is_from_website: boolean | null
          is_otp_verified: boolean | null
          last_activity_at: string | null
          last_contact_date: string | null
          last_name: string | null
          lead_source: string | null
          lead_stage: string | null
          lead_status: string | null
          next_follow_up_date: string | null
          notes: string | null
          phone: string | null
          preferences: Json | null
          preferred_countries: string[] | null
          priority: string | null
          priority_level: string | null
          qualification_level: string | null
          status: string
          stream_or_program: string | null
          test_scores: Json | null
          toefl_score: number | null
          updated_at: string
          user_id: string
          whatsapp_number: string | null
          whatsapp_verified: boolean | null
          whatsapp_verified_at: string | null
        }
        Insert: {
          academic_score?: string | null
          address?: string | null
          assigned_counselor_id?: string | null
          assigned_telecaller_id?: string | null
          budget_max_usd?: number | null
          budget_min_usd?: number | null
          chat_session_id?: string | null
          conversion_date?: string | null
          converted_at?: string | null
          created_at?: string
          current_qualification?: string | null
          email: string
          entity_type?: string | null
          field_of_interest?: string | null
          first_name?: string | null
          gmat_score?: number | null
          gre_score?: number | null
          id?: string
          ielts_score?: number | null
          interested_programs?: string[] | null
          is_from_website?: boolean | null
          is_otp_verified?: boolean | null
          last_activity_at?: string | null
          last_contact_date?: string | null
          last_name?: string | null
          lead_source?: string | null
          lead_stage?: string | null
          lead_status?: string | null
          next_follow_up_date?: string | null
          notes?: string | null
          phone?: string | null
          preferences?: Json | null
          preferred_countries?: string[] | null
          priority?: string | null
          priority_level?: string | null
          qualification_level?: string | null
          status?: string
          stream_or_program?: string | null
          test_scores?: Json | null
          toefl_score?: number | null
          updated_at?: string
          user_id: string
          whatsapp_number?: string | null
          whatsapp_verified?: boolean | null
          whatsapp_verified_at?: string | null
        }
        Update: {
          academic_score?: string | null
          address?: string | null
          assigned_counselor_id?: string | null
          assigned_telecaller_id?: string | null
          budget_max_usd?: number | null
          budget_min_usd?: number | null
          chat_session_id?: string | null
          conversion_date?: string | null
          converted_at?: string | null
          created_at?: string
          current_qualification?: string | null
          email?: string
          entity_type?: string | null
          field_of_interest?: string | null
          first_name?: string | null
          gmat_score?: number | null
          gre_score?: number | null
          id?: string
          ielts_score?: number | null
          interested_programs?: string[] | null
          is_from_website?: boolean | null
          is_otp_verified?: boolean | null
          last_activity_at?: string | null
          last_contact_date?: string | null
          last_name?: string | null
          lead_source?: string | null
          lead_stage?: string | null
          lead_status?: string | null
          next_follow_up_date?: string | null
          notes?: string | null
          phone?: string | null
          preferences?: Json | null
          preferred_countries?: string[] | null
          priority?: string | null
          priority_level?: string | null
          qualification_level?: string | null
          status?: string
          stream_or_program?: string | null
          test_scores?: Json | null
          toefl_score?: number | null
          updated_at?: string
          user_id?: string
          whatsapp_number?: string | null
          whatsapp_verified?: boolean | null
          whatsapp_verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_leads_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      success_stories: {
        Row: {
          academic_background: string | null
          achievements: string[] | null
          advice_for_students: string | null
          country: string
          course_name: string
          created_at: string
          id: string
          intake_year: number
          is_featured: boolean | null
          is_verified: boolean | null
          likes_count: number | null
          profile_image_url: string | null
          scholarship_amount: number | null
          story_content: string
          student_name: string
          test_scores: Json | null
          university_logo_url: string | null
          university_name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          academic_background?: string | null
          achievements?: string[] | null
          advice_for_students?: string | null
          country: string
          course_name: string
          created_at?: string
          id?: string
          intake_year: number
          is_featured?: boolean | null
          is_verified?: boolean | null
          likes_count?: number | null
          profile_image_url?: string | null
          scholarship_amount?: number | null
          story_content: string
          student_name: string
          test_scores?: Json | null
          university_logo_url?: string | null
          university_name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          academic_background?: string | null
          achievements?: string[] | null
          advice_for_students?: string | null
          country?: string
          course_name?: string
          created_at?: string
          id?: string
          intake_year?: number
          is_featured?: boolean | null
          is_verified?: boolean | null
          likes_count?: number | null
          profile_image_url?: string | null
          scholarship_amount?: number | null
          story_content?: string
          student_name?: string
          test_scores?: Json | null
          university_logo_url?: string | null
          university_name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      test_prep_modules: {
        Row: {
          content_url: string | null
          created_at: string
          description: string | null
          difficulty_level: string | null
          estimated_duration_hours: number | null
          id: string
          is_premium: boolean | null
          module_name: string
          order_sequence: number | null
          practice_questions: Json | null
          test_type: string
          video_url: string | null
        }
        Insert: {
          content_url?: string | null
          created_at?: string
          description?: string | null
          difficulty_level?: string | null
          estimated_duration_hours?: number | null
          id?: string
          is_premium?: boolean | null
          module_name: string
          order_sequence?: number | null
          practice_questions?: Json | null
          test_type: string
          video_url?: string | null
        }
        Update: {
          content_url?: string | null
          created_at?: string
          description?: string | null
          difficulty_level?: string | null
          estimated_duration_hours?: number | null
          id?: string
          is_premium?: boolean | null
          module_name?: string
          order_sequence?: number | null
          practice_questions?: Json | null
          test_type?: string
          video_url?: string | null
        }
        Relationships: []
      }
      test_prep_schedules: {
        Row: {
          batch_timings: string | null
          created_at: string
          created_by: string | null
          description: string | null
          discount_percentage: number | null
          discounted_price: number | null
          display_order: number | null
          end_date: string | null
          features: Json | null
          id: string
          is_active: boolean
          original_price: number | null
          schedule_image_url: string | null
          schedule_pdf_url: string | null
          start_date: string | null
          test_type: string
          title: string
          updated_at: string
        }
        Insert: {
          batch_timings?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_percentage?: number | null
          discounted_price?: number | null
          display_order?: number | null
          end_date?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          original_price?: number | null
          schedule_image_url?: string | null
          schedule_pdf_url?: string | null
          start_date?: string | null
          test_type: string
          title: string
          updated_at?: string
        }
        Update: {
          batch_timings?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_percentage?: number | null
          discounted_price?: number | null
          display_order?: number | null
          end_date?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          original_price?: number | null
          schedule_image_url?: string | null
          schedule_pdf_url?: string | null
          start_date?: string | null
          test_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          country: string
          course: string | null
          created_at: string
          display_order: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_featured: boolean | null
          rating: number | null
          student_name: string
          testimonial: string
          university: string
          updated_at: string
        }
        Insert: {
          country: string
          course?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          rating?: number | null
          student_name: string
          testimonial: string
          university: string
          updated_at?: string
        }
        Update: {
          country?: string
          course?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          rating?: number | null
          student_name?: string
          testimonial?: string
          university?: string
          updated_at?: string
        }
        Relationships: []
      }
      travel_blogs: {
        Row: {
          author_id: string | null
          category: string | null
          content: string
          created_at: string | null
          excerpt: string | null
          featured_image: string | null
          id: string
          is_published: boolean | null
          published_at: string | null
          slug: string
          tags: string[] | null
          title: string
          updated_at: string | null
          views_count: number | null
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          content: string
          created_at?: string | null
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          is_published?: boolean | null
          published_at?: string | null
          slug: string
          tags?: string[] | null
          title: string
          updated_at?: string | null
          views_count?: number | null
        }
        Update: {
          author_id?: string | null
          category?: string | null
          content?: string
          created_at?: string | null
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          is_published?: boolean | null
          published_at?: string | null
          slug?: string
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          views_count?: number | null
        }
        Relationships: []
      }
      travel_booking_analytics: {
        Row: {
          booking_date: string
          booking_id: string | null
          booking_source: string | null
          conversion_time_hours: number | null
          created_at: string | null
          customer_age_group: string | null
          customer_country: string | null
          id: string
          package_id: string | null
          total_revenue: number | null
        }
        Insert: {
          booking_date: string
          booking_id?: string | null
          booking_source?: string | null
          conversion_time_hours?: number | null
          created_at?: string | null
          customer_age_group?: string | null
          customer_country?: string | null
          id?: string
          package_id?: string | null
          total_revenue?: number | null
        }
        Update: {
          booking_date?: string
          booking_id?: string | null
          booking_source?: string | null
          conversion_time_hours?: number | null
          created_at?: string | null
          customer_age_group?: string | null
          customer_country?: string | null
          id?: string
          package_id?: string | null
          total_revenue?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_booking_analytics_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "package_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_booking_analytics_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "travel_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_document_requirements: {
        Row: {
          allowed_formats: string[] | null
          booking_id: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          document_name: string
          document_type: string
          id: string
          is_required: boolean | null
          max_size_mb: number | null
        }
        Insert: {
          allowed_formats?: string[] | null
          booking_id?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          document_name: string
          document_type: string
          id?: string
          is_required?: boolean | null
          max_size_mb?: number | null
        }
        Update: {
          allowed_formats?: string[] | null
          booking_id?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          document_name?: string
          document_type?: string
          id?: string
          is_required?: boolean | null
          max_size_mb?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_document_requirements_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "package_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_document_uploads: {
        Row: {
          booking_id: string | null
          created_at: string | null
          document_name: string
          document_type: string
          expiry_date: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          rejection_reason: string | null
          requirement_id: string | null
          updated_at: string | null
          uploaded_by: string | null
          verification_status: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          document_name: string
          document_type: string
          expiry_date?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          rejection_reason?: string | null
          requirement_id?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          document_name?: string
          document_type?: string
          expiry_date?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          rejection_reason?: string | null
          requirement_id?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_document_uploads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "package_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_document_uploads_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "travel_document_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_email_campaigns: {
        Row: {
          campaign_name: string
          campaign_type: string
          click_count: number | null
          conversion_count: number | null
          created_at: string | null
          created_by: string | null
          delay_hours: number | null
          id: string
          is_active: boolean | null
          open_count: number | null
          send_count: number | null
          target_audience: Json | null
          template_id: string | null
          trigger_event: string
          updated_at: string | null
        }
        Insert: {
          campaign_name: string
          campaign_type: string
          click_count?: number | null
          conversion_count?: number | null
          created_at?: string | null
          created_by?: string | null
          delay_hours?: number | null
          id?: string
          is_active?: boolean | null
          open_count?: number | null
          send_count?: number | null
          target_audience?: Json | null
          template_id?: string | null
          trigger_event: string
          updated_at?: string | null
        }
        Update: {
          campaign_name?: string
          campaign_type?: string
          click_count?: number | null
          conversion_count?: number | null
          created_at?: string | null
          created_by?: string | null
          delay_hours?: number | null
          id?: string
          is_active?: boolean | null
          open_count?: number | null
          send_count?: number | null
          target_audience?: Json | null
          template_id?: string | null
          trigger_event?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "travel_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_email_logs: {
        Row: {
          booking_id: string | null
          campaign_id: string | null
          clicked_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          opened_at: string | null
          recipient_email: string
          sent_at: string | null
          status: string | null
          subject: string
        }
        Insert: {
          booking_id?: string | null
          campaign_id?: string | null
          clicked_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          opened_at?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: string | null
          subject: string
        }
        Update: {
          booking_id?: string | null
          campaign_id?: string | null
          clicked_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          opened_at?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_email_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "package_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_email_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "travel_email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_email_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "travel_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_email_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          email_body: string
          id: string
          is_active: boolean | null
          subject_line: string
          template_name: string
          template_type: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email_body: string
          id?: string
          is_active?: boolean | null
          subject_line: string
          template_name: string
          template_type: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email_body?: string
          id?: string
          is_active?: boolean | null
          subject_line?: string
          template_name?: string
          template_type?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      travel_inquiries: {
        Row: {
          admin_notes: string | null
          assigned_to: string | null
          budget_range: string
          created_at: string
          destination: string
          email: string
          follow_up_date: string | null
          full_name: string
          id: string
          number_of_travelers: number
          package_id: string | null
          phone: string
          source: string | null
          special_requirements: string | null
          status: string
          travel_end_date: string
          travel_start_date: string
          trip_type: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          assigned_to?: string | null
          budget_range: string
          created_at?: string
          destination: string
          email: string
          follow_up_date?: string | null
          full_name: string
          id?: string
          number_of_travelers: number
          package_id?: string | null
          phone: string
          source?: string | null
          special_requirements?: string | null
          status?: string
          travel_end_date: string
          travel_start_date: string
          trip_type?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          assigned_to?: string | null
          budget_range?: string
          created_at?: string
          destination?: string
          email?: string
          follow_up_date?: string | null
          full_name?: string
          id?: string
          number_of_travelers?: number
          package_id?: string | null
          phone?: string
          source?: string | null
          special_requirements?: string | null
          status?: string
          travel_end_date?: string
          travel_start_date?: string
          trip_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_inquiries_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "travel_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_lead_activities: {
        Row: {
          activity_description: string | null
          activity_type: string
          created_at: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          performed_by: string | null
        }
        Insert: {
          activity_description?: string | null
          activity_type: string
          created_at?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          performed_by?: string | null
        }
        Update: {
          activity_description?: string | null
          activity_type?: string
          created_at?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "travel_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_leads: {
        Row: {
          assigned_to: string | null
          budget_range: string | null
          country: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          interested_destination: string | null
          last_contacted_at: string | null
          lead_score: number | null
          lead_source: string | null
          lead_status: string | null
          metadata: Json | null
          next_follow_up_date: string | null
          notes: string | null
          phone: string
          travel_date_preference: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          budget_range?: string | null
          country?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          interested_destination?: string | null
          last_contacted_at?: string | null
          lead_score?: number | null
          lead_source?: string | null
          lead_status?: string | null
          metadata?: Json | null
          next_follow_up_date?: string | null
          notes?: string | null
          phone: string
          travel_date_preference?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          budget_range?: string | null
          country?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          interested_destination?: string | null
          last_contacted_at?: string | null
          lead_score?: number | null
          lead_source?: string | null
          lead_status?: string | null
          metadata?: Json | null
          next_follow_up_date?: string | null
          notes?: string | null
          phone?: string
          travel_date_preference?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      travel_news: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          news_type: string | null
          publish_date: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          news_type?: string | null
          publish_date?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          news_type?: string | null
          publish_date?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      travel_offers: {
        Row: {
          created_at: string | null
          description: string | null
          discount_text: string | null
          display_order: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          offer_type: string
          price_text: string | null
          title: string
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          discount_text?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          offer_type: string
          price_text?: string | null
          title: string
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          discount_text?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          offer_type?: string
          price_text?: string | null
          title?: string
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      travel_packages: {
        Row: {
          best_season: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          destination: string
          difficulty_level: string | null
          duration_days: number
          duration_nights: number
          exclusions: string[] | null
          id: string
          images: string[] | null
          inclusions: string[] | null
          is_active: boolean | null
          is_featured: boolean | null
          itinerary: Json | null
          max_travelers: number | null
          package_name: string
          price_per_person: number
          updated_at: string | null
        }
        Insert: {
          best_season?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          destination: string
          difficulty_level?: string | null
          duration_days: number
          duration_nights: number
          exclusions?: string[] | null
          id?: string
          images?: string[] | null
          inclusions?: string[] | null
          is_active?: boolean | null
          is_featured?: boolean | null
          itinerary?: Json | null
          max_travelers?: number | null
          package_name: string
          price_per_person: number
          updated_at?: string | null
        }
        Update: {
          best_season?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          destination?: string
          difficulty_level?: string | null
          duration_days?: number
          duration_nights?: number
          exclusions?: string[] | null
          id?: string
          images?: string[] | null
          inclusions?: string[] | null
          is_active?: boolean | null
          is_featured?: boolean | null
          itinerary?: Json | null
          max_travelers?: number | null
          package_name?: string
          price_per_person?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      travel_services: {
        Row: {
          created_at: string | null
          display_order: number | null
          icon_name: string | null
          id: string
          is_active: boolean | null
          subtitle: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          subtitle?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          subtitle?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      universities: {
        Row: {
          city: string | null
          country: string
          created_at: string
          description: string | null
          established_year: number | null
          id: string
          is_active: boolean
          is_tie_up: boolean | null
          logo_url: string | null
          name: string
          ranking: number | null
          state_province: string | null
          university_type: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          city?: string | null
          country: string
          created_at?: string
          description?: string | null
          established_year?: number | null
          id?: string
          is_active?: boolean
          is_tie_up?: boolean | null
          logo_url?: string | null
          name: string
          ranking?: number | null
          state_province?: string | null
          university_type?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          city?: string | null
          country?: string
          created_at?: string
          description?: string | null
          established_year?: number | null
          id?: string
          is_active?: boolean
          is_tie_up?: boolean | null
          logo_url?: string | null
          name?: string
          ranking?: number | null
          state_province?: string | null
          university_type?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      university_prospects: {
        Row: {
          accreditation: string[] | null
          city: string | null
          contact_email: string | null
          contact_person: string | null
          country: string
          course_types: string[] | null
          created_by: string | null
          discovered_at: string
          discovery_source: string | null
          id: string
          is_verified: boolean | null
          last_updated: string
          name: string
          notes: string | null
          phone: string | null
          priority_level: string | null
          ranking: number | null
          state_province: string | null
          status: string | null
          tags: string[] | null
          updated_by: string | null
          website_url: string | null
        }
        Insert: {
          accreditation?: string[] | null
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          country: string
          course_types?: string[] | null
          created_by?: string | null
          discovered_at?: string
          discovery_source?: string | null
          id?: string
          is_verified?: boolean | null
          last_updated?: string
          name: string
          notes?: string | null
          phone?: string | null
          priority_level?: string | null
          ranking?: number | null
          state_province?: string | null
          status?: string | null
          tags?: string[] | null
          updated_by?: string | null
          website_url?: string | null
        }
        Update: {
          accreditation?: string[] | null
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          country?: string
          course_types?: string[] | null
          created_by?: string | null
          discovered_at?: string
          discovery_source?: string | null
          id?: string
          is_verified?: boolean | null
          last_updated?: string
          name?: string
          notes?: string | null
          phone?: string | null
          priority_level?: string | null
          ranking?: number | null
          state_province?: string | null
          status?: string | null
          tags?: string[] | null
          updated_by?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      university_shortlists: {
        Row: {
          application_deadline: string | null
          application_fees: number | null
          change_request_note: string | null
          counselor_id: string
          counselor_notes: string | null
          course_duration: string | null
          course_id: string | null
          course_link: string | null
          course_name: string | null
          created_at: string
          entry_requirements: string | null
          estimated_fees: number | null
          id: string
          location: string | null
          priority_level: string | null
          shortlisted_at: string
          status: string
          student_consent: boolean | null
          student_consent_date: string | null
          student_id: string
          student_notes: string | null
          student_response: string | null
          student_response_date: string | null
          tuition_fees: number | null
          university_id: string
          university_name: string | null
          updated_at: string
        }
        Insert: {
          application_deadline?: string | null
          application_fees?: number | null
          change_request_note?: string | null
          counselor_id: string
          counselor_notes?: string | null
          course_duration?: string | null
          course_id?: string | null
          course_link?: string | null
          course_name?: string | null
          created_at?: string
          entry_requirements?: string | null
          estimated_fees?: number | null
          id?: string
          location?: string | null
          priority_level?: string | null
          shortlisted_at?: string
          status?: string
          student_consent?: boolean | null
          student_consent_date?: string | null
          student_id: string
          student_notes?: string | null
          student_response?: string | null
          student_response_date?: string | null
          tuition_fees?: number | null
          university_id: string
          university_name?: string | null
          updated_at?: string
        }
        Update: {
          application_deadline?: string | null
          application_fees?: number | null
          change_request_note?: string | null
          counselor_id?: string
          counselor_notes?: string | null
          course_duration?: string | null
          course_id?: string | null
          course_link?: string | null
          course_name?: string | null
          created_at?: string
          entry_requirements?: string | null
          estimated_fees?: number | null
          id?: string
          location?: string | null
          priority_level?: string | null
          shortlisted_at?: string
          status?: string
          student_consent?: boolean | null
          student_consent_date?: string | null
          student_id?: string
          student_notes?: string | null
          student_response?: string | null
          student_response_date?: string | null
          tuition_fees?: number | null
          university_id?: string
          university_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_favorites: {
        Row: {
          created_at: string
          id: string
          university_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          university_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          university_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_favorites_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_test_progress: {
        Row: {
          attempts_count: number | null
          best_score: number | null
          completed_at: string | null
          created_at: string
          id: string
          last_accessed_at: string | null
          module_id: string
          progress_percentage: number | null
          time_spent_minutes: number | null
          user_id: string
        }
        Insert: {
          attempts_count?: number | null
          best_score?: number | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_accessed_at?: string | null
          module_id: string
          progress_percentage?: number | null
          time_spent_minutes?: number | null
          user_id: string
        }
        Update: {
          attempts_count?: number | null
          best_score?: number | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_accessed_at?: string | null
          module_id?: string
          progress_percentage?: number | null
          time_spent_minutes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_test_progress_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "test_prep_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      video_testimonials: {
        Row: {
          country: string
          course: string | null
          created_at: string
          display_order: number | null
          duration_seconds: number | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          rating: number | null
          student_name: string
          thumbnail_url: string | null
          university: string
          updated_at: string
          video_url: string
        }
        Insert: {
          country: string
          course?: string | null
          created_at?: string
          display_order?: number | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          rating?: number | null
          student_name: string
          thumbnail_url?: string | null
          university: string
          updated_at?: string
          video_url: string
        }
        Update: {
          country?: string
          course?: string | null
          created_at?: string
          display_order?: number | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          rating?: number | null
          student_name?: string
          thumbnail_url?: string | null
          university?: string
          updated_at?: string
          video_url?: string
        }
        Relationships: []
      }
      website_content: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          cta_link: string | null
          cta_text: string | null
          display_order: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          metadata: Json | null
          section_key: string
          subtitle: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          section_key: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          section_key?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      youtube_videos: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          video_id: string
          video_type: string
          video_url: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          video_id: string
          video_type?: string
          video_url: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          video_id?: string
          video_type?: string
          video_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_booking_reference: { Args: never; Returns: string }
      get_current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_lead_stats: {
        Args: never
        Returns: {
          total_counselors: number
          total_leads: number
          total_profiles: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "student" | "admin" | "counselor" | "telecaller" | "super_admin"
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
      app_role: ["student", "admin", "counselor", "telecaller", "super_admin"],
    },
  },
} as const

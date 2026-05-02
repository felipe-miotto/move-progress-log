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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      adaptation_rules: {
        Row: {
          action_type: string
          condition: string
          created_at: string | null
          description: string | null
          id: string
          metric_name: string
          severity: string
          threshold_value: number
        }
        Insert: {
          action_type: string
          condition: string
          created_at?: string | null
          description?: string | null
          id?: string
          metric_name: string
          severity: string
          threshold_value: number
        }
        Update: {
          action_type?: string
          condition?: string
          created_at?: string | null
          description?: string | null
          id?: string
          metric_name?: string
          severity?: string
          threshold_value?: number
        }
        Relationships: []
      }
      ai_builder_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_builder_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          issue_url: string | null
          message_type: string | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          issue_url?: string | null
          message_type?: string | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          issue_url?: string | null
          message_type?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_builder_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_builder_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_project_memory: {
        Row: {
          content: string
          key: string
          updated_at: string | null
        }
        Insert: {
          content: string
          key: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      anamnesis_responses: {
        Row: {
          activity_duration_minutes: number | null
          activity_frequency: number | null
          activity_types: Json | null
          assessment_id: string
          birth_date: string | null
          created_at: string
          has_red_flags: boolean | null
          height_cm: number | null
          id: string
          laterality: Database["public"]["Enums"]["laterality_type"] | null
          lgpd_consent: boolean | null
          lgpd_consent_date: string | null
          objectives: string | null
          occupation: string | null
          pain_history: Json | null
          red_flags: Json | null
          sedentary_hours_per_day: number | null
          sleep_hours: number | null
          sleep_quality: number | null
          sports: Json | null
          surgeries: Json | null
          time_horizon: string | null
          updated_at: string
          weight_kg: number | null
          work_type: string | null
        }
        Insert: {
          activity_duration_minutes?: number | null
          activity_frequency?: number | null
          activity_types?: Json | null
          assessment_id: string
          birth_date?: string | null
          created_at?: string
          has_red_flags?: boolean | null
          height_cm?: number | null
          id?: string
          laterality?: Database["public"]["Enums"]["laterality_type"] | null
          lgpd_consent?: boolean | null
          lgpd_consent_date?: string | null
          objectives?: string | null
          occupation?: string | null
          pain_history?: Json | null
          red_flags?: Json | null
          sedentary_hours_per_day?: number | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          sports?: Json | null
          surgeries?: Json | null
          time_horizon?: string | null
          updated_at?: string
          weight_kg?: number | null
          work_type?: string | null
        }
        Update: {
          activity_duration_minutes?: number | null
          activity_frequency?: number | null
          activity_types?: Json | null
          assessment_id?: string
          birth_date?: string | null
          created_at?: string
          has_red_flags?: boolean | null
          height_cm?: number | null
          id?: string
          laterality?: Database["public"]["Enums"]["laterality_type"] | null
          lgpd_consent?: boolean | null
          lgpd_consent_date?: string | null
          objectives?: string | null
          occupation?: string | null
          pain_history?: Json | null
          red_flags?: Json | null
          sedentary_hours_per_day?: number | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          sports?: Json | null
          surgeries?: Json | null
          time_horizon?: string | null
          updated_at?: string
          weight_kg?: number | null
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_responses_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_exercises: {
        Row: {
          body_region: string
          created_at: string
          created_by: string | null
          description: string | null
          fabrik_phase: Database["public"]["Enums"]["fabrik_phase"]
          id: string
          is_active: boolean | null
          name: string
          progression_criteria: string | null
          target_classifications: Json | null
          target_muscles: Json | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          body_region: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          fabrik_phase: Database["public"]["Enums"]["fabrik_phase"]
          id?: string
          is_active?: boolean | null
          name: string
          progression_criteria?: string | null
          target_classifications?: Json | null
          target_muscles?: Json | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          body_region?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          fabrik_phase?: Database["public"]["Enums"]["fabrik_phase"]
          id?: string
          is_active?: boolean | null
          name?: string
          progression_criteria?: string | null
          target_classifications?: Json | null
          target_muscles?: Json | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      assessment_progress_logs: {
        Row: {
          completed_at: string
          difficulty_rating: number | null
          exercise_id: string
          id: string
          notes: string | null
          protocol_id: string
          student_id: string
        }
        Insert: {
          completed_at?: string
          difficulty_rating?: number | null
          exercise_id: string
          id?: string
          notes?: string | null
          protocol_id: string
          student_id: string
        }
        Update: {
          completed_at?: string
          difficulty_rating?: number | null
          exercise_id?: string
          id?: string
          notes?: string | null
          protocol_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_progress_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "assessment_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_progress_logs_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "assessment_protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_protocols: {
        Row: {
          assessment_id: string
          completion_percentage: number | null
          created_at: string
          duration_weeks: number | null
          exercises: Json
          frequency_per_week: number | null
          id: string
          name: string | null
          next_review_date: string | null
          phase: number | null
          priority_level: Database["public"]["Enums"]["priority_level"]
          updated_at: string
        }
        Insert: {
          assessment_id: string
          completion_percentage?: number | null
          created_at?: string
          duration_weeks?: number | null
          exercises?: Json
          frequency_per_week?: number | null
          id?: string
          name?: string | null
          next_review_date?: string | null
          phase?: number | null
          priority_level?: Database["public"]["Enums"]["priority_level"]
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          completion_percentage?: number | null
          created_at?: string
          duration_weeks?: number | null
          exercises?: Json
          frequency_per_week?: number | null
          id?: string
          name?: string | null
          next_review_date?: string | null
          phase?: number | null
          priority_level?: Database["public"]["Enums"]["priority_level"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_protocols_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          professional_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["assessment_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          professional_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["assessment_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          professional_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["assessment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      breathing_protocols: {
        Row: {
          audio_cues: string[] | null
          benefits: Json | null
          category: string
          created_at: string | null
          duration_seconds: number
          id: string
          instructions: string
          is_active: boolean | null
          name: string
          rhythm: string | null
          technique: string
          updated_at: string | null
          when_to_use: string[] | null
        }
        Insert: {
          audio_cues?: string[] | null
          benefits?: Json | null
          category: string
          created_at?: string | null
          duration_seconds: number
          id?: string
          instructions: string
          is_active?: boolean | null
          name: string
          rhythm?: string | null
          technique: string
          updated_at?: string | null
          when_to_use?: string[] | null
        }
        Update: {
          audio_cues?: string[] | null
          benefits?: Json | null
          category?: string
          created_at?: string | null
          duration_seconds?: number
          id?: string
          instructions?: string
          is_active?: boolean | null
          name?: string
          rhythm?: string | null
          technique?: string
          updated_at?: string | null
          when_to_use?: string[] | null
        }
        Relationships: []
      }
      equipment_inventory: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_available: boolean | null
          location: string | null
          name: string
          notes: string | null
          quantity: number
          updated_at: string | null
          weight_kg: number | null
          weight_range: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          is_available?: boolean | null
          location?: string | null
          name: string
          notes?: string | null
          quantity?: number
          updated_at?: string | null
          weight_kg?: number | null
          weight_range?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_available?: boolean | null
          location?: string | null
          name?: string
          notes?: string | null
          quantity?: number
          updated_at?: string | null
          weight_kg?: number | null
          weight_range?: string | null
        }
        Relationships: []
      }
      exercise_adaptations: {
        Row: {
          adaptation_type: string
          created_at: string
          exercise_library_id: string
          id: string
          interval_seconds: number | null
          observations: string | null
          prescription_exercise_id: string
          pse: string | null
          reps: string | null
          sets: string | null
        }
        Insert: {
          adaptation_type: string
          created_at?: string
          exercise_library_id: string
          id?: string
          interval_seconds?: number | null
          observations?: string | null
          prescription_exercise_id: string
          pse?: string | null
          reps?: string | null
          sets?: string | null
        }
        Update: {
          adaptation_type?: string
          created_at?: string
          exercise_library_id?: string
          id?: string
          interval_seconds?: number | null
          observations?: string | null
          prescription_exercise_id?: string
          pse?: string | null
          reps?: string | null
          sets?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_adaptations_exercise_library_id_fkey"
            columns: ["exercise_library_id"]
            isOneToOne: false
            referencedRelation: "exercises_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_adaptations_prescription_exercise_id_fkey"
            columns: ["prescription_exercise_id"]
            isOneToOne: false
            referencedRelation: "prescription_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          created_at: string
          exercise_name: string
          id: string
          is_best_set: boolean | null
          load_breakdown: string | null
          load_description: string | null
          load_kg: number | null
          observations: string | null
          reps: number | null
          session_id: string
          sets: number | null
        }
        Insert: {
          created_at?: string
          exercise_name: string
          id?: string
          is_best_set?: boolean | null
          load_breakdown?: string | null
          load_description?: string | null
          load_kg?: number | null
          observations?: string | null
          reps?: number | null
          session_id: string
          sets?: number | null
        }
        Update: {
          created_at?: string
          exercise_name?: string
          id?: string
          is_best_set?: boolean | null
          load_breakdown?: string | null
          load_description?: string | null
          load_kg?: number | null
          observations?: string | null
          reps?: number | null
          session_id?: string
          sets?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises_library: {
        Row: {
          axial_load: number | null
          boyle_score: number | null
          category: string | null
          contraction_type: string | null
          created_at: string
          default_reps: string | null
          default_sets: string | null
          description: string | null
          emphasis: string | null
          equipment_required: string[] | null
          functional_group: string | null
          hip_dominance: number | null
          id: string
          knee_dominance: number | null
          laterality: string | null
          level: string | null
          lumbar_demand: number | null
          metabolic_potential: number | null
          movement_pattern: string | null
          movement_plane: string | null
          name: string
          numeric_level: number | null
          plyometric_phase: number | null
          prerequisites: Json | null
          primary_muscles: string[] | null
          risk_level: string | null
          stability_position: string | null
          subcategory: string | null
          surface_modifier: string | null
          tags: string[] | null
          technical_complexity: number | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          axial_load?: number | null
          boyle_score?: number | null
          category?: string | null
          contraction_type?: string | null
          created_at?: string
          default_reps?: string | null
          default_sets?: string | null
          description?: string | null
          emphasis?: string | null
          equipment_required?: string[] | null
          functional_group?: string | null
          hip_dominance?: number | null
          id?: string
          knee_dominance?: number | null
          laterality?: string | null
          level?: string | null
          lumbar_demand?: number | null
          metabolic_potential?: number | null
          movement_pattern?: string | null
          movement_plane?: string | null
          name: string
          numeric_level?: number | null
          plyometric_phase?: number | null
          prerequisites?: Json | null
          primary_muscles?: string[] | null
          risk_level?: string | null
          stability_position?: string | null
          subcategory?: string | null
          surface_modifier?: string | null
          tags?: string[] | null
          technical_complexity?: number | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          axial_load?: number | null
          boyle_score?: number | null
          category?: string | null
          contraction_type?: string | null
          created_at?: string
          default_reps?: string | null
          default_sets?: string | null
          description?: string | null
          emphasis?: string | null
          equipment_required?: string[] | null
          functional_group?: string | null
          hip_dominance?: number | null
          id?: string
          knee_dominance?: number | null
          laterality?: string | null
          level?: string | null
          lumbar_demand?: number | null
          metabolic_potential?: number | null
          movement_pattern?: string | null
          movement_plane?: string | null
          name?: string
          numeric_level?: number | null
          plyometric_phase?: number | null
          prerequisites?: Json | null
          primary_muscles?: string[] | null
          risk_level?: string | null
          stability_position?: string | null
          subcategory?: string | null
          surface_modifier?: string | null
          tags?: string[] | null
          technical_complexity?: number | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      functional_findings: {
        Row: {
          assessment_id: string
          associated_injuries: Json | null
          biomechanical_importance: number | null
          body_region: string
          classification_tag: string
          context_weight: number | null
          created_at: string
          hyperactive_muscles: Json | null
          hypoactive_muscles: Json | null
          id: string
          priority_score: number | null
          severity: Database["public"]["Enums"]["severity_level"]
        }
        Insert: {
          assessment_id: string
          associated_injuries?: Json | null
          biomechanical_importance?: number | null
          body_region: string
          classification_tag: string
          context_weight?: number | null
          created_at?: string
          hyperactive_muscles?: Json | null
          hypoactive_muscles?: Json | null
          id?: string
          priority_score?: number | null
          severity?: Database["public"]["Enums"]["severity_level"]
        }
        Update: {
          assessment_id?: string
          associated_injuries?: Json | null
          biomechanical_importance?: number | null
          body_region?: string
          classification_tag?: string
          context_weight?: number | null
          created_at?: string
          hyperactive_muscles?: Json | null
          hypoactive_muscles?: Json | null
          id?: string
          priority_score?: number | null
          severity?: Database["public"]["Enums"]["severity_level"]
        }
        Relationships: [
          {
            foreignKeyName: "functional_findings_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      global_test_results: {
        Row: {
          anterior_view: Json | null
          assessment_id: string
          created_at: string
          id: string
          lateral_view: Json | null
          left_side: Json | null
          media_urls: Json | null
          notes: string | null
          posterior_view: Json | null
          right_side: Json | null
          test_name: string
          updated_at: string
        }
        Insert: {
          anterior_view?: Json | null
          assessment_id: string
          created_at?: string
          id?: string
          lateral_view?: Json | null
          left_side?: Json | null
          media_urls?: Json | null
          notes?: string | null
          posterior_view?: Json | null
          right_side?: Json | null
          test_name: string
          updated_at?: string
        }
        Update: {
          anterior_view?: Json | null
          assessment_id?: string
          created_at?: string
          id?: string
          lateral_view?: Json | null
          left_side?: Json | null
          media_urls?: Json | null
          notes?: string | null
          posterior_view?: Json | null
          right_side?: Json | null
          test_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_test_results_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      oura_acute_metrics: {
        Row: {
          created_at: string
          date: string
          day_hr_series: Json | null
          hr_day_avg: number | null
          hr_day_max: number | null
          hr_day_min: number | null
          hr_night_last: number | null
          hr_night_max: number | null
          hr_night_min: number | null
          hrv_night_last: number | null
          hrv_night_max: number | null
          hrv_night_min: number | null
          hrv_night_stddev: number | null
          id: string
          movement_30_sec: string | null
          samples_count_hr_day: number
          samples_count_hrv: number
          sleep_hr_series: Json | null
          sleep_hrv_series: Json | null
          sleep_phase_5min: string | null
          stress_samples: Json | null
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          day_hr_series?: Json | null
          hr_day_avg?: number | null
          hr_day_max?: number | null
          hr_day_min?: number | null
          hr_night_last?: number | null
          hr_night_max?: number | null
          hr_night_min?: number | null
          hrv_night_last?: number | null
          hrv_night_max?: number | null
          hrv_night_min?: number | null
          hrv_night_stddev?: number | null
          id?: string
          movement_30_sec?: string | null
          samples_count_hr_day?: number
          samples_count_hrv?: number
          sleep_hr_series?: Json | null
          sleep_hrv_series?: Json | null
          sleep_phase_5min?: string | null
          stress_samples?: Json | null
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          day_hr_series?: Json | null
          hr_day_avg?: number | null
          hr_day_max?: number | null
          hr_day_min?: number | null
          hr_night_last?: number | null
          hr_night_max?: number | null
          hr_night_min?: number | null
          hrv_night_last?: number | null
          hrv_night_max?: number | null
          hrv_night_min?: number | null
          hrv_night_stddev?: number | null
          id?: string
          movement_30_sec?: string | null
          samples_count_hr_day?: number
          samples_count_hrv?: number
          sleep_hr_series?: Json | null
          sleep_hrv_series?: Json | null
          sleep_phase_5min?: string | null
          stress_samples?: Json | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oura_acute_metrics_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      oura_connections: {
        Row: {
          access_token: string
          connected_at: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          refresh_token: string
          student_id: string
          token_expires_at: string
        }
        Insert: {
          access_token: string
          connected_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          refresh_token: string
          student_id: string
          token_expires_at: string
        }
        Update: {
          access_token?: string
          connected_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          refresh_token?: string
          student_id?: string
          token_expires_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oura_connections_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      oura_metrics: {
        Row: {
          active_calories: number | null
          activity_balance: number | null
          activity_score: number | null
          average_breath: number | null
          average_sleep_hrv: number | null
          awake_time: number | null
          breathing_disturbance_index: number | null
          created_at: string | null
          date: string
          day_summary: string | null
          deep_sleep_duration: number | null
          high_activity_time: number | null
          hrv_balance: number | null
          id: string
          light_sleep_duration: number | null
          low_activity_time: number | null
          lowest_heart_rate: number | null
          medium_activity_time: number | null
          met_minutes: number | null
          readiness_score: number | null
          recovery_high_time: number | null
          rem_sleep_duration: number | null
          resilience_level: string | null
          resting_heart_rate: number | null
          sedentary_time: number | null
          sleep_efficiency: number | null
          sleep_latency: number | null
          sleep_score: number | null
          spo2_average: number | null
          steps: number | null
          stress_high_time: number | null
          student_id: string
          temperature_deviation: number | null
          total_calories: number | null
          total_sleep_duration: number | null
          training_frequency: number | null
          training_volume: number | null
          vo2_max: number | null
        }
        Insert: {
          active_calories?: number | null
          activity_balance?: number | null
          activity_score?: number | null
          average_breath?: number | null
          average_sleep_hrv?: number | null
          awake_time?: number | null
          breathing_disturbance_index?: number | null
          created_at?: string | null
          date: string
          day_summary?: string | null
          deep_sleep_duration?: number | null
          high_activity_time?: number | null
          hrv_balance?: number | null
          id?: string
          light_sleep_duration?: number | null
          low_activity_time?: number | null
          lowest_heart_rate?: number | null
          medium_activity_time?: number | null
          met_minutes?: number | null
          readiness_score?: number | null
          recovery_high_time?: number | null
          rem_sleep_duration?: number | null
          resilience_level?: string | null
          resting_heart_rate?: number | null
          sedentary_time?: number | null
          sleep_efficiency?: number | null
          sleep_latency?: number | null
          sleep_score?: number | null
          spo2_average?: number | null
          steps?: number | null
          stress_high_time?: number | null
          student_id: string
          temperature_deviation?: number | null
          total_calories?: number | null
          total_sleep_duration?: number | null
          training_frequency?: number | null
          training_volume?: number | null
          vo2_max?: number | null
        }
        Update: {
          active_calories?: number | null
          activity_balance?: number | null
          activity_score?: number | null
          average_breath?: number | null
          average_sleep_hrv?: number | null
          awake_time?: number | null
          breathing_disturbance_index?: number | null
          created_at?: string | null
          date?: string
          day_summary?: string | null
          deep_sleep_duration?: number | null
          high_activity_time?: number | null
          hrv_balance?: number | null
          id?: string
          light_sleep_duration?: number | null
          low_activity_time?: number | null
          lowest_heart_rate?: number | null
          medium_activity_time?: number | null
          met_minutes?: number | null
          readiness_score?: number | null
          recovery_high_time?: number | null
          rem_sleep_duration?: number | null
          resilience_level?: string | null
          resting_heart_rate?: number | null
          sedentary_time?: number | null
          sleep_efficiency?: number | null
          sleep_latency?: number | null
          sleep_score?: number | null
          spo2_average?: number | null
          steps?: number | null
          stress_high_time?: number | null
          student_id?: string
          temperature_deviation?: number | null
          total_calories?: number | null
          total_sleep_duration?: number | null
          training_frequency?: number | null
          training_volume?: number | null
          vo2_max?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oura_metrics_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      oura_sync_logs: {
        Row: {
          attempt_number: number
          created_at: string
          error_message: string | null
          id: string
          metrics_synced: Json | null
          status: string
          student_id: string
          sync_date: string
          sync_time: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          error_message?: string | null
          id?: string
          metrics_synced?: Json | null
          status: string
          student_id: string
          sync_date: string
          sync_time?: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          error_message?: string | null
          id?: string
          metrics_synced?: Json | null
          status?: string
          student_id?: string
          sync_date?: string
          sync_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "oura_sync_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      oura_workouts: {
        Row: {
          activity: string
          average_heart_rate: number | null
          calories: number | null
          created_at: string | null
          distance: number | null
          end_datetime: string
          id: string
          intensity: string | null
          max_heart_rate: number | null
          oura_workout_id: string
          source: string | null
          start_datetime: string
          student_id: string
        }
        Insert: {
          activity: string
          average_heart_rate?: number | null
          calories?: number | null
          created_at?: string | null
          distance?: number | null
          end_datetime: string
          id?: string
          intensity?: string | null
          max_heart_rate?: number | null
          oura_workout_id: string
          source?: string | null
          start_datetime: string
          student_id: string
        }
        Update: {
          activity?: string
          average_heart_rate?: number | null
          calories?: number | null
          created_at?: string | null
          distance?: number | null
          end_datetime?: string
          id?: string
          intensity?: string | null
          max_heart_rate?: number | null
          oura_workout_id?: string
          source?: string | null
          start_datetime?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oura_workouts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_assignments: {
        Row: {
          created_at: string
          custom_adaptations: Json | null
          end_date: string | null
          id: string
          prescription_id: string
          start_date: string
          student_id: string
        }
        Insert: {
          created_at?: string
          custom_adaptations?: Json | null
          end_date?: string | null
          id?: string
          prescription_id: string
          start_date: string
          student_id: string
        }
        Update: {
          created_at?: string
          custom_adaptations?: Json | null
          end_date?: string | null
          id?: string
          prescription_id?: string
          start_date?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_assignments_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "workout_prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_exercises: {
        Row: {
          created_at: string
          exercise_library_id: string
          group_with_previous: boolean
          id: string
          interval_seconds: number | null
          load: string | null
          observations: string | null
          order_index: number
          prescription_id: string
          pse: string | null
          reps: string
          rir: string | null
          sets: string
          should_track: boolean
          training_method: string | null
        }
        Insert: {
          created_at?: string
          exercise_library_id: string
          group_with_previous?: boolean
          id?: string
          interval_seconds?: number | null
          load?: string | null
          observations?: string | null
          order_index: number
          prescription_id: string
          pse?: string | null
          reps: string
          rir?: string | null
          sets: string
          should_track?: boolean
          training_method?: string | null
        }
        Update: {
          created_at?: string
          exercise_library_id?: string
          group_with_previous?: boolean
          id?: string
          interval_seconds?: number | null
          load?: string | null
          observations?: string | null
          order_index?: number
          prescription_id?: string
          pse?: string | null
          reps?: string
          rir?: string | null
          sets?: string
          should_track?: boolean
          training_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_exercises_exercise_library_id_fkey"
            columns: ["exercise_library_id"]
            isOneToOne: false
            referencedRelation: "exercises_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_exercises_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "workout_prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_folders: {
        Row: {
          created_at: string
          depth_level: number
          full_path: string | null
          id: string
          name: string
          order_index: number
          parent_id: string | null
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          depth_level?: number
          full_path?: string | null
          id?: string
          name: string
          order_index?: number
          parent_id?: string | null
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          depth_level?: number
          full_path?: string | null
          id?: string
          name?: string
          order_index?: number
          parent_id?: string | null
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "prescription_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_students: {
        Row: {
          created_at: string
          id: string
          professional_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          professional_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          professional_id?: string
          student_id?: string
        }
        Relationships: []
      }
      protocol_adherence: {
        Row: {
          created_at: string
          followed: boolean
          followed_at: string | null
          hrv_after: number | null
          hrv_before: number | null
          hrv_delta: number | null
          id: string
          notes: string | null
          protocol_id: string
          readiness_after: number | null
          readiness_before: number | null
          readiness_delta: number | null
          recommendation_id: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          followed?: boolean
          followed_at?: string | null
          hrv_after?: number | null
          hrv_before?: number | null
          hrv_delta?: number | null
          id?: string
          notes?: string | null
          protocol_id: string
          readiness_after?: number | null
          readiness_before?: number | null
          readiness_delta?: number | null
          recommendation_id?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          followed?: boolean
          followed_at?: string | null
          hrv_after?: number | null
          hrv_before?: number | null
          hrv_delta?: number | null
          id?: string
          notes?: string | null
          protocol_id?: string
          readiness_after?: number | null
          readiness_before?: number | null
          readiness_delta?: number | null
          recommendation_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocol_adherence_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "recovery_protocols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_adherence_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "protocol_recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_adherence_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_recommendations: {
        Row: {
          applied: boolean | null
          created_at: string | null
          id: string
          priority: string
          protocol_id: string
          reason: string
          recommended_date: string
          student_id: string
          trainer_notes: string | null
        }
        Insert: {
          applied?: boolean | null
          created_at?: string | null
          id?: string
          priority: string
          protocol_id: string
          reason: string
          recommended_date?: string
          student_id: string
          trainer_notes?: string | null
        }
        Update: {
          applied?: boolean | null
          created_at?: string | null
          id?: string
          priority?: string
          protocol_id?: string
          reason?: string
          recommended_date?: string
          student_id?: string
          trainer_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "protocol_recommendations_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "recovery_protocols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_recommendations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_attempts: {
        Row: {
          action: string
          attempt_count: number
          blocked_until: string | null
          created_at: string
          first_attempt_at: string
          id: string
          ip_address: string
          last_attempt_at: string
        }
        Insert: {
          action: string
          attempt_count?: number
          blocked_until?: string | null
          created_at?: string
          first_attempt_at?: string
          id?: string
          ip_address: string
          last_attempt_at?: string
        }
        Update: {
          action?: string
          attempt_count?: number
          blocked_until?: string | null
          created_at?: string
          first_attempt_at?: string
          id?: string
          ip_address?: string
          last_attempt_at?: string
        }
        Relationships: []
      }
      recovery_protocols: {
        Row: {
          benefits: Json | null
          category: string
          contraindications: string | null
          created_at: string | null
          duration_minutes: number
          id: string
          instructions: string
          name: string
          scientific_references: string | null
          subcategory: string | null
          updated_at: string | null
        }
        Insert: {
          benefits?: Json | null
          category: string
          contraindications?: string | null
          created_at?: string | null
          duration_minutes: number
          id?: string
          instructions: string
          name: string
          scientific_references?: string | null
          subcategory?: string | null
          updated_at?: string | null
        }
        Update: {
          benefits?: Json | null
          category?: string
          contraindications?: string | null
          created_at?: string | null
          duration_minutes?: number
          id?: string
          instructions?: string
          name?: string
          scientific_references?: string | null
          subcategory?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      report_tracked_exercises: {
        Row: {
          created_at: string
          exercise_library_id: string | null
          exercise_name: string
          final_load: number | null
          final_total_work: number | null
          id: string
          initial_load: number | null
          initial_total_work: number | null
          load_variation_percentage: number | null
          report_id: string
          weekly_progression: Json | null
          work_variation_percentage: number | null
        }
        Insert: {
          created_at?: string
          exercise_library_id?: string | null
          exercise_name: string
          final_load?: number | null
          final_total_work?: number | null
          id?: string
          initial_load?: number | null
          initial_total_work?: number | null
          load_variation_percentage?: number | null
          report_id: string
          weekly_progression?: Json | null
          work_variation_percentage?: number | null
        }
        Update: {
          created_at?: string
          exercise_library_id?: string | null
          exercise_name?: string
          final_load?: number | null
          final_total_work?: number | null
          id?: string
          initial_load?: number | null
          initial_total_work?: number | null
          load_variation_percentage?: number | null
          report_id?: string
          weekly_progression?: Json | null
          work_variation_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_tracked_exercises_exercise_library_id_fkey"
            columns: ["exercise_library_id"]
            isOneToOne: false
            referencedRelation: "exercises_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_tracked_exercises_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "student_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      segmental_test_results: {
        Row: {
          assessment_id: string
          body_region: string
          created_at: string
          cutoff_value: number | null
          id: string
          left_value: number | null
          media_urls: Json | null
          notes: string | null
          pass_fail_left: boolean | null
          pass_fail_right: boolean | null
          right_value: number | null
          test_name: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          assessment_id: string
          body_region: string
          created_at?: string
          cutoff_value?: number | null
          id?: string
          left_value?: number | null
          media_urls?: Json | null
          notes?: string | null
          pass_fail_left?: boolean | null
          pass_fail_right?: boolean | null
          right_value?: number | null
          test_name: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          body_region?: string
          created_at?: string
          cutoff_value?: number | null
          id?: string
          left_value?: number | null
          media_urls?: Json | null
          notes?: string | null
          pass_fail_left?: boolean | null
          pass_fail_right?: boolean | null
          right_value?: number | null
          test_name?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "segmental_test_results_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      session_audio_segments: {
        Row: {
          audio_duration_seconds: number | null
          created_at: string | null
          edited_transcription: string | null
          id: string
          raw_transcription: string
          segment_order: number
          session_id: string
          updated_at: string | null
        }
        Insert: {
          audio_duration_seconds?: number | null
          created_at?: string | null
          edited_transcription?: string | null
          id?: string
          raw_transcription: string
          segment_order: number
          session_id: string
          updated_at?: string | null
        }
        Update: {
          audio_duration_seconds?: number | null
          created_at?: string | null
          edited_transcription?: string | null
          id?: string
          raw_transcription?: string
          segment_order?: number
          session_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_session"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_templates: {
        Row: {
          core_triplanar_check: Json | null
          created_at: string | null
          cycle: string
          duration_minutes: number
          equipment_used: string[] | null
          focus: string | null
          format: string
          id: string
          is_favorite: boolean | null
          name: string
          phases: Json
          trainer_id: string
          updated_at: string | null
          use_count: number | null
          valences: string[]
        }
        Insert: {
          core_triplanar_check?: Json | null
          created_at?: string | null
          cycle: string
          duration_minutes: number
          equipment_used?: string[] | null
          focus?: string | null
          format: string
          id?: string
          is_favorite?: boolean | null
          name: string
          phases?: Json
          trainer_id: string
          updated_at?: string | null
          use_count?: number | null
          valences: string[]
        }
        Update: {
          core_triplanar_check?: Json | null
          created_at?: string | null
          cycle?: string
          duration_minutes?: number
          equipment_used?: string[] | null
          focus?: string | null
          format?: string
          id?: string
          is_favorite?: boolean | null
          name?: string
          phases?: Json
          trainer_id?: string
          updated_at?: string | null
          use_count?: number | null
          valences?: string[]
        }
        Relationships: []
      }
      student_invites: {
        Row: {
          created_at: string | null
          created_student_id: string | null
          email: string | null
          expires_at: string
          id: string
          invite_token: string
          is_used: boolean | null
          trainer_id: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_student_id?: string | null
          email?: string | null
          expires_at: string
          id?: string
          invite_token: string
          is_used?: boolean | null
          trainer_id: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_student_id?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          invite_token?: string
          is_used?: boolean | null
          trainer_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_invites_created_student_id_fkey"
            columns: ["created_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_invites_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_observations: {
        Row: {
          categories: string[] | null
          created_at: string | null
          created_by: string | null
          exercise_id: string | null
          id: string
          is_resolved: boolean | null
          observation_text: string
          resolved_at: string | null
          session_id: string | null
          severity: string | null
          student_id: string
        }
        Insert: {
          categories?: string[] | null
          created_at?: string | null
          created_by?: string | null
          exercise_id?: string | null
          id?: string
          is_resolved?: boolean | null
          observation_text: string
          resolved_at?: string | null
          session_id?: string | null
          severity?: string | null
          student_id: string
        }
        Update: {
          categories?: string[] | null
          created_at?: string | null
          created_by?: string | null
          exercise_id?: string | null
          id?: string
          is_resolved?: boolean | null
          observation_text?: string
          resolved_at?: string | null
          session_id?: string | null
          severity?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_observations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "trainer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observations_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_reports: {
        Row: {
          adherence_percentage: number | null
          attention_points: string | null
          consistency_analysis: string | null
          created_at: string
          generated_at: string | null
          id: string
          next_cycle_plan: string | null
          oura_data: Json | null
          period_end: string
          period_start: string
          report_type: string
          sessions_proposed: number | null
          status: string
          strength_analysis: string | null
          student_id: string
          total_sessions: number
          trainer_highlights: string | null
          trainer_id: string
          updated_at: string
          weekly_average: number | null
        }
        Insert: {
          adherence_percentage?: number | null
          attention_points?: string | null
          consistency_analysis?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          next_cycle_plan?: string | null
          oura_data?: Json | null
          period_end: string
          period_start: string
          report_type: string
          sessions_proposed?: number | null
          status?: string
          strength_analysis?: string | null
          student_id: string
          total_sessions?: number
          trainer_highlights?: string | null
          trainer_id: string
          updated_at?: string
          weekly_average?: number | null
        }
        Update: {
          adherence_percentage?: number | null
          attention_points?: string | null
          consistency_analysis?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          next_cycle_plan?: string | null
          oura_data?: Json | null
          period_end?: string
          period_start?: string
          report_type?: string
          sessions_proposed?: number | null
          status?: string
          strength_analysis?: string | null
          student_id?: string
          total_sessions?: number
          trainer_highlights?: string | null
          trainer_id?: string
          updated_at?: string
          weekly_average?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "student_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          fitness_level: string | null
          height_cm: number | null
          id: string
          injury_history: string | null
          limitations: string | null
          max_heart_rate: number | null
          name: string
          objectives: string[] | null
          preferences: string | null
          trainer_id: string
          updated_at: string
          weekly_sessions_proposed: number | null
          weight_kg: number | null
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          fitness_level?: string | null
          height_cm?: number | null
          id?: string
          injury_history?: string | null
          limitations?: string | null
          max_heart_rate?: number | null
          name: string
          objectives?: string[] | null
          preferences?: string | null
          trainer_id: string
          updated_at?: string
          weekly_sessions_proposed?: number | null
          weight_kg?: number | null
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          fitness_level?: string | null
          height_cm?: number | null
          id?: string
          injury_history?: string | null
          limitations?: string | null
          max_heart_rate?: number | null
          name?: string
          objectives?: string[] | null
          preferences?: string | null
          trainer_id?: string
          updated_at?: string
          weekly_sessions_proposed?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      trainer_access_permissions: {
        Row: {
          admin_id: string
          can_edit_prescriptions: boolean | null
          can_view_prescriptions: boolean | null
          granted_at: string | null
          id: string
          trainer_id: string
        }
        Insert: {
          admin_id: string
          can_edit_prescriptions?: boolean | null
          can_view_prescriptions?: boolean | null
          granted_at?: string | null
          id?: string
          trainer_id: string
        }
        Update: {
          admin_id?: string
          can_edit_prescriptions?: boolean | null
          can_view_prescriptions?: boolean | null
          granted_at?: string | null
          id?: string
          trainer_id?: string
        }
        Relationships: []
      }
      trainer_profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workout_prescriptions: {
        Row: {
          created_at: string
          folder_id: string | null
          id: string
          name: string
          objective: string | null
          order_index: number
          prescription_type: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          folder_id?: string | null
          id?: string
          name: string
          objective?: string | null
          order_index?: number
          prescription_type?: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          folder_id?: string | null
          id?: string
          name?: string
          objective?: string | null
          order_index?: number
          prescription_type?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_prescriptions_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "prescription_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          can_reopen: boolean | null
          created_at: string
          date: string
          id: string
          is_finalized: boolean | null
          prescription_id: string | null
          room_name: string | null
          session_type: string
          student_id: string
          time: string
          trainer_name: string | null
          updated_at: string
          workout_name: string | null
        }
        Insert: {
          can_reopen?: boolean | null
          created_at?: string
          date: string
          id?: string
          is_finalized?: boolean | null
          prescription_id?: string | null
          room_name?: string | null
          session_type: string
          student_id: string
          time: string
          trainer_name?: string | null
          updated_at?: string
          workout_name?: string | null
        }
        Update: {
          can_reopen?: boolean | null
          created_at?: string
          date?: string
          id?: string
          is_finalized?: boolean | null
          prescription_id?: string | null
          room_name?: string | null
          session_type?: string
          student_id?: string
          time?: string
          trainer_name?: string | null
          updated_at?: string
          workout_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "workout_prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions_time_fix_audit: {
        Row: {
          created_at: string | null
          date: string
          new_time: string
          old_time: string
          run_at: string
          session_id: string
          student_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          new_time: string
          old_time: string
          run_at?: string
          session_id: string
          student_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          new_time?: string
          old_time?: string
          run_at?: string
          session_id?: string
          student_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calc_oura_baseline: {
        Args: { p_days?: number; p_student_id: string }
        Returns: {
          avg_hrv: number
          avg_rhr: number
          avg_sleep_score: number
          data_points: number
        }[]
      }
      can_access_trainer: {
        Args: { _trainer_id: string; _viewer_id: string }
        Returns: boolean
      }
      cleanup_rate_limit_attempts: { Args: never; Returns: undefined }
      count_active_students: { Args: { p_since: string }; Returns: number }
      delete_prescription_cascade: {
        Args: { p_prescription_id: string }
        Returns: undefined
      }
      get_oura_access_token: { Args: { p_student_id: string }; Returns: string }
      get_oura_refresh_token: {
        Args: { p_student_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      migrate_oura_tokens_to_vault: { Args: never; Returns: undefined }
      normalize_objective: { Args: { obj: string }; Returns: string }
      search_exercises_by_name: {
        Args: { p_limit?: number; p_movement_pattern?: string; p_query: string }
        Returns: {
          id: string
          name: string
          similarity: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      store_oura_tokens: {
        Args: {
          p_access_token: string
          p_refresh_token: string
          p_student_id: string
          p_token_expires_at: string
        }
        Returns: undefined
      }
      update_prescription_with_exercises: {
        Args: {
          p_exercises: Json
          p_name: string
          p_objective: string
          p_prescription_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "trainer" | "moderator"
      assessment_status: "draft" | "in_progress" | "completed" | "archived"
      fabrik_phase:
        | "mobility"
        | "inhibition"
        | "activation"
        | "stability"
        | "strength"
        | "integration"
      laterality_type: "right" | "left" | "ambidextrous"
      priority_level: "critical" | "high" | "medium" | "low" | "maintenance"
      severity_level: "none" | "mild" | "moderate" | "severe"
      test_type: "global" | "segmental"
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
      app_role: ["admin", "trainer", "moderator"],
      assessment_status: ["draft", "in_progress", "completed", "archived"],
      fabrik_phase: [
        "mobility",
        "inhibition",
        "activation",
        "stability",
        "strength",
        "integration",
      ],
      laterality_type: ["right", "left", "ambidextrous"],
      priority_level: ["critical", "high", "medium", "low", "maintenance"],
      severity_level: ["none", "mild", "moderate", "severe"],
      test_type: ["global", "segmental"],
    },
  },
} as const

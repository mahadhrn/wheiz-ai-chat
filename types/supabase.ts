export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          username: string
          created_at: string
          avatar_url: string | null
          expo_push_token: string | null
        }
        Insert: {
          id?: string
          email: string
          username: string
          created_at?: string
          avatar_url?: string | null
          expo_push_token?: string | null
        }
        Update: {
          id?: string
          email?: string
          username?: string
          created_at?: string
          avatar_url?: string | null
          expo_push_token?: string | null
        }
      }
      chats: {
        Row: {
          id: string
          created_at: string
          user1_id: string
          user2_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          user1_id: string
          user2_id: string
        }
        Update: {
          id?: string
          created_at?: string
          user1_id?: string
          user2_id?: string
        }
      }
      messages: {
        Row: {
          id: string
          chat_id: string
          sender_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          chat_id: string
          sender_id: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          chat_id?: string
          sender_id?: string
          content?: string
          created_at?: string
        }
      }
      users_read: {
        Row: {
          user_id: string
          chat_id: string
          last_read_at: string
        }
        Insert: {
          user_id: string
          chat_id: string
          last_read_at?: string
        }
        Update: {
          user_id?: string
          chat_id?: string
          last_read_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
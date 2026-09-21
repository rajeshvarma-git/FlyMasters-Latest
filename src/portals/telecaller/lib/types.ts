export type Role = "student" | "telecaller" | "counselor" | "admin" | "super_admin";

export interface AppUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
}

/** Only the lead fields a telecaller is allowed to see or set. */
export interface Lead {
  id: string;
  user_id?: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  whatsapp_number?: string;
  field_of_interest: string;
  academic_score: string;
  preferred_countries: string[];
  assigned_telecaller_id: string | null;
  entity_type: string;
  lead_status: string;
  lead_stage: string;
  lead_source: string;
  priority: string;
  notes: string;
  next_follow_up_date: string | null;
  last_contact_date: string | null;
  conversion_date: string | null;
  created_at: string | null;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string;
  is_read?: boolean;
  action_url?: string;
  type?: string;
  created_at: string;
}

export interface CounselorSummary {
  id: string;
  first_name?: string;
  last_name?: string;
  specializations?: string[];
}

export interface Conversation {
  id: string;
  telecaller_id: string;
  student_id: string;
  last_message_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface WhatsAppConversation {
  id: string;
  lead_id: string;
  user_id?: string;
  phone_number: string;
  assigned_staff_id?: string;
  staff_role?: "counselor" | "telecaller" | "admin" | "";
  last_message_at?: string | null;
  created_at?: string | null;
}

export interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  kind?: "system" | "";
  body: string;
  wa_message_id?: string;
  staff_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface TelecallerState {
  leads: Lead[];
  notifications: NotificationRow[];
  counselors: CounselorSummary[];
  conversations: Conversation[];
  messages: Message[];
  whatsappConversations: WhatsAppConversation[];
  whatsappMessages: WhatsAppMessage[];
}

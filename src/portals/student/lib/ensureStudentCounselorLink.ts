import type { User } from "@student/integrations/supabase/client";
import { supabase } from "@student/integrations/supabase/client";

// Creates the lead row if one is missing. It never assigns a counselor and never
// marks anyone as a student - only a telecaller converts.
export async function ensureStudentCounselorLink(user: User) {
  if (!user.email) return;

  const { data: existingRows } = await supabase
    .from("student_leads")
    .select("id")
    .eq("user_id", user.id);

  if ((existingRows || []).length > 0) return;

  await supabase.from("student_leads").insert({
    user_id: user.id,
    email: user.email,
    first_name: (user.user_metadata?.first_name as string) || null,
    last_name: (user.user_metadata?.last_name as string) || null,
    assigned_counselor_id: null,
    assigned_telecaller_id: null,
    lead_source: "student_site",
    entity_type: "lead",
    lead_status: "hot",
    lead_stage: "hot",
    status: "new",
  });
}

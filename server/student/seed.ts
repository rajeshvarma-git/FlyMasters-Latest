export const COUNSELOR_ID = "local-counselor-1";
export const ADMIN_ID = "local-admin-1";

export function seedAppState() {
  return {
    authUsers: [
      {
        id: COUNSELOR_ID,
        email: "counselor@local.test",
        password: "counselor123",
        user_metadata: { first_name: "Priya", last_name: "Counselor" },
      },
      {
        id: ADMIN_ID,
        email: "admin@local.test",
        password: "admin123",
        user_metadata: { first_name: "Fly", last_name: "Admin" },
      },
    ],
    session: null,
    tables: {
      user_roles: [
        { id: "role-c1", user_id: COUNSELOR_ID, role: "counselor" },
        { id: "role-a1", user_id: ADMIN_ID, role: "admin" },
      ],
      profiles: [
        {
          id: "profile-c1",
          user_id: COUNSELOR_ID,
          first_name: "Priya",
          last_name: "Counselor",
          phone: "",
          country: "India",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "profile-a1",
          user_id: ADMIN_ID,
          first_name: "Fly",
          last_name: "Admin",
          phone: "",
          country: "India",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      counselors: [
        {
          id: "counselor-row-1",
          user_id: COUNSELOR_ID,
          is_active: true,
          specializations: ["Study Abroad"],
          experience_years: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      document_checklists: [
        { id: "dc-resume", document_type: "Resume", description: "Must have details of all Education & Job experience.", is_required: true, is_active: true, max_file_size_mb: 20, allowed_file_types: ["pdf", "doc", "docx"], country: "All", countries: ["All"], degree_type: "All", degree_types: ["All"], display_order: 1 },
        { id: "dc-sop", document_type: "Statement of purpose(SOP)", description: "University and course based content without plagiarism.", is_required: true, is_active: true, max_file_size_mb: 20, allowed_file_types: ["pdf", "doc", "docx"], country: "All", countries: ["All"], degree_type: "All", degree_types: ["All"], display_order: 2 },
        { id: "dc-lor1", document_type: "Letter of recommendation(LOR)-1", description: "Letter of recommendation.", is_required: true, is_active: true, max_file_size_mb: 20, allowed_file_types: ["pdf"], country: "All", countries: ["All"], degree_type: "All", degree_types: ["All"], display_order: 3 },
        { id: "dc-lor2", document_type: "Letter of recommendation(LOR)-2", description: "Letter of recommendation.", is_required: true, is_active: true, max_file_size_mb: 20, allowed_file_types: ["pdf"], country: "All", countries: ["All"], degree_type: "All", degree_types: ["All"], display_order: 4 },
        { id: "dc-lor3", document_type: "Letter of recommendation(LOR)-3", description: "Letter of recommendation.", is_required: true, is_active: true, max_file_size_mb: 20, allowed_file_types: ["pdf"], country: "All", countries: ["All"], degree_type: "All", degree_types: ["All"], display_order: 5 },
        { id: "dc-od", document_type: "Original Degree(OD)", description: "Original degree certificate.", is_required: true, is_active: true, max_file_size_mb: 20, allowed_file_types: ["pdf", "jpg", "jpeg", "png"], country: "All", countries: ["All"], degree_type: "All", degree_types: ["All"], display_order: 6 },
        { id: "dc-pc", document_type: "Provisional Certificate(PC)", description: "Provisional certificate.", is_required: true, is_active: true, max_file_size_mb: 20, allowed_file_types: ["pdf"], country: "All", countries: ["All"], degree_type: "All", degree_types: ["All"], display_order: 7 },
        { id: "dc-sem", document_type: "Semwise Marks Memo's", description: "Semester-wise marks memos.", is_required: true, is_active: true, max_file_size_mb: 20, allowed_file_types: ["pdf"], country: "All", countries: ["All"], degree_type: "All", degree_types: ["All"], display_order: 8 },
        { id: "dc-cmm", document_type: "Consolidated Marks Memo(CMM)", description: "Consolidated marks memo.", is_required: true, is_active: true, max_file_size_mb: 20, allowed_file_types: ["pdf"], country: "All", countries: ["All"], degree_type: "All", degree_types: ["All"], display_order: 9 },
        { id: "dc-photo", document_type: "Photo(Passport size)", description: "Recent passport-size photograph.", is_required: true, is_active: true, max_file_size_mb: 20, allowed_file_types: ["jpg", "jpeg", "png"], country: "All", countries: ["All"], degree_type: "All", degree_types: ["All"], display_order: 10 },
        { id: "dc-passport-proof", document_type: "Passport proof", description: "Clear color scan of your passport bio page. This is not a passport-size photo.", is_required: true, is_active: true, max_file_size_mb: 20, allowed_file_types: ["pdf", "jpg", "jpeg", "png"], country: "All", countries: ["All"], degree_type: "All", degree_types: ["All"], display_order: 11 },
        { id: "dc-aadhaar-proof", document_type: "Aadhaar card proof", description: "Clear scan or photo of your Aadhaar / Adhar card (front and back).", is_required: true, is_active: true, max_file_size_mb: 20, allowed_file_types: ["pdf", "jpg", "jpeg", "png"], country: "All", countries: ["All"], degree_type: "All", degree_types: ["All"], display_order: 12 },
      ],
      document_countries: [
        { id: "doc-country-all", name: "All", code: "ALL", is_active: true, display_order: 0 },
        { id: "doc-country-usa", name: "USA", code: "USA", is_active: true, display_order: 1 },
        { id: "doc-country-uk", name: "UK", code: "UK", is_active: true, display_order: 2 },
        { id: "doc-country-canada", name: "Canada", code: "CA", is_active: true, display_order: 3 },
        { id: "doc-country-australia", name: "Australia", code: "AU", is_active: true, display_order: 4 },
        { id: "doc-country-germany", name: "Germany", code: "DE", is_active: true, display_order: 5 },
        { id: "doc-country-nepal", name: "Nepal", code: "NP", is_active: true, display_order: 6 },
        { id: "doc-country-india", name: "India", code: "IN", is_active: true, display_order: 7 },
      ],
      document_degree_types: [
        { id: "doc-degree-all", name: "All", code: "ALL", is_active: true, display_order: 0 },
        { id: "doc-degree-bachelors", name: "Bachelors", code: "UG", is_active: true, display_order: 1 },
        { id: "doc-degree-masters", name: "Masters", code: "PG", is_active: true, display_order: 2 },
        { id: "doc-degree-phd", name: "PhD", code: "PHD", is_active: true, display_order: 3 },
        { id: "doc-degree-diploma", name: "Diploma", code: "DIP", is_active: true, display_order: 4 },
        { id: "doc-degree-certificate", name: "Certificate", code: "CERT", is_active: true, display_order: 5 },
        { id: "doc-degree-other", name: "Other", code: "OTHER", is_active: true, display_order: 6 },
      ],
      universities: [
        { id: "uni-ku", name: "Kathmandu University", country: "Nepal", city: "Dhulikhel", ranking: 1, is_active: true, website_url: "https://ku.edu.np" },
        { id: "uni-tu", name: "Tribhuvan University IOE Pulchowk", country: "Nepal", city: "Lalitpur", ranking: 2, is_active: true, website_url: "https://ioe.edu.np" },
      ],
      student_leads: [],
      documents: [],
      document_requests: [],
      document_notifications: [],
      notifications: [],
      applications: [],
      user_favorites: [],
      chat_sessions: [],
    } as Record<string, any[]>,
    storage: {} as Record<string, string>,
  };
}

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import { api } from "@counselor/lib/api";
import StudentChecklistPanel from "@shared/components/StudentChecklistPanel";

/**
 * CRM 2.6.2, counsellor side.
 *
 * The counsellor picks one of their own students and works the checklist:
 * activate the country checklist, move each document through the Super
 * Admin's statuses, and leave the next-step note the student sees.
 */

type Student = { id: string; first_name?: string; last_name?: string; full_name?: string; email?: string };

export default function StudentChecklist() {
  const [params, setParams] = useSearchParams();
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState("");
  const selected = params.get("student") || "";

  useEffect(() => {
    api<{ students?: Student[]; leads?: Student[] }>("/counselor/students")
      .then((data) => setStudents(data.students || data.leads || []))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your students"));
  }, []);

  const nameOf = (student: Student) =>
    student.full_name || [student.first_name, student.last_name].filter(Boolean).join(" ") || student.email || student.id;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-sky-600" />
        <h1 className="text-xl font-semibold text-navy-900">Checklists &amp; status</h1>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <select
        value={selected}
        onChange={(e) => setParams(e.target.value ? { student: e.target.value } : {})}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500"
      >
        <option value="">Choose a student…</option>
        {students.map((student) => (
          <option key={student.id} value={student.id}>{nameOf(student)}</option>
        ))}
      </select>

      {selected
        ? <StudentChecklistPanel studentId={selected} fetchJson={api} />
        : <p className="text-sm text-slate-500">Pick a student to see and update their checklist.</p>}
    </div>
  );
}

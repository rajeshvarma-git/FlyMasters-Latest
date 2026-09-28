import { FormEvent, useEffect, useState } from "react";
import { BookOpen, Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { api } from "@admin/lib/api";
import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";
import { Input, Label, Select, Textarea } from "@admin/components/ui/Field";

/**
 * FAQs and policies the student chat AI may answer from — and nothing else.
 * A question these don't cover goes to the student's telecaller/counselor,
 * who also check (approve or fix) every AI answer in their Student Chat.
 * Server: server/routes/knowledge.mjs, used by server/routes/cases.mjs.
 */

type Article = {
  id: string;
  title: string;
  category: "faq" | "policy";
  content: string;
  is_active: boolean;
  updated_at: string | null;
  updated_by_name: string | null;
};

type Suggestion = { title: string; category: "faq" | "policy"; content: string };

const EMPTY = { title: "", category: "faq" as "faq" | "policy", content: "", is_active: true };

export default function KnowledgeBase() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const data = await api<{ articles: Article[]; suggestions: Suggestion[]; ai_enabled: boolean; ai_model: string | null }>("/knowledge");
    setArticles(data.articles);
    setSuggestions(data.suggestions);
    setAiEnabled(data.ai_enabled);
    setAiModel(data.ai_model);
  };

  useEffect(() => {
    load()
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"))
      .finally(() => setLoading(false));
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editingId) {
        await api(`/knowledge/${editingId}`, { method: "PUT", body: form });
      } else {
        await api("/knowledge", { method: "POST", body: form });
      }
      setForm(EMPTY);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const addSuggestion = async (s: Suggestion) => {
    setBusy(true);
    try {
      await api("/knowledge", { method: "POST", body: { ...s, is_active: true } });
      setSuggestions((list) => list.filter((x) => x.title !== s.title));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (a: Article) => {
    await api(`/knowledge/${a.id}`, { method: "PUT", body: { is_active: !a.is_active } }).catch((e) => setError(e.message));
    await load();
  };

  const remove = async (a: Article) => {
    if (!window.confirm(`Delete "${a.title}"? The AI will stop using it.`)) return;
    await api(`/knowledge/${a.id}`, { method: "DELETE" }).catch((e) => setError(e.message));
    await load();
  };

  const edit = (a: Article) => {
    setEditingId(a.id);
    setForm({ title: a.title, category: a.category, content: a.content, is_active: a.is_active });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <BookOpen className="mt-1 h-6 w-6 text-sky-600" />
        <div>
          <h1 className="text-2xl font-semibold text-navy-900">AI FAQs &amp; policies</h1>
          <p className="max-w-3xl text-sm text-slate-500">
            When a student asks something in chat, the AI answers only from the active entries below. If nothing here covers
            it, the question goes to the student's telecaller or counselor. Staff check every AI answer in Student Chat and
            can fix it.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {aiEnabled ? `AI is on (${aiModel}).` : "AI is off — set GEMINI_API_KEY in Railway. Until then all questions go to staff."}
          </p>
        </div>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <Card className="p-5">
        <form onSubmit={save} className="space-y-3">
          <h2 className="font-semibold text-navy-900">{editingId ? "Edit entry" : "Add an FAQ or policy"}</h2>
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <div>
              <Label>Question or title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. What is your refund policy?"
                required
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as "faq" | "policy" })}>
                <option value="faq">FAQ</option>
                <option value="policy">Policy</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Answer / policy text</Label>
            <Textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Write the exact answer. The AI will not add anything that isn't written here."
              className="min-h-[140px]"
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Active (the AI can use it)
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              <Plus className="h-4 w-4" /> {editingId ? "Save changes" : "Add"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={() => { setEditingId(null); setForm(EMPTY); }}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      {suggestions.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-navy-900">
            <Sparkles className="h-4 w-4 text-gold-500" /> Suggested from your website
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Taken from what the public site already says. Check each one before adding — the site currently shows two
            different office timings, so keep the correct one.
          </p>
          <div className="space-y-3">
            {suggestions.map((s) => (
              <div key={s.title} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="mt-1 text-sm text-slate-600">{s.content}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => addSuggestion(s)}>Add as is</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setForm({ ...s, is_active: true }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                    Edit first
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-navy-900">Entries ({articles.length})</h2>
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {!loading && articles.length === 0 && <p className="text-sm text-slate-500">Nothing yet — the AI will pass every question to staff.</p>}
        <div className="divide-y">
          {articles.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] uppercase ${a.category === "policy" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}>
                    {a.category}
                  </span>
                  {a.title}
                  {!a.is_active && <span className="ml-2 text-xs text-slate-400">(off)</span>}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.content}</p>
                {a.updated_at && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Updated {new Date(a.updated_at).toLocaleString()} {a.updated_by_name ? `by ${a.updated_by_name}` : ""}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => toggle(a)}>{a.is_active ? "Turn off" : "Turn on"}</Button>
                <Button size="sm" variant="ghost" onClick={() => edit(a)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => remove(a)} aria-label="Delete"><Trash2 className="h-4 w-4 text-rose-600" /></Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

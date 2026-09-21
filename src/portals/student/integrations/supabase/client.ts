import { apiUrl } from '@student/lib/apiBase';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type User = {
  id: string;
  email?: string;
  user_metadata: Record<string, any>;
};

export type Session = {
  user: User;
  access_token?: string;
  expires_at?: string;
};

const SESSION_KEY = "flymasters.student.session.v2";

type Filter = (row: any) => boolean;

type FilterSpec = {
  op: "eq" | "neq" | "in" | "is" | "contains" | "not" | "or";
  column?: string;
  value?: any;
  operator?: string;
  expression?: string;
};

type QueryState = {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  filters: Filter[];
  filterSpecs: FilterSpec[];
  payload: any;
  orderBy?: { column: string; ascending: boolean };
  limitCount?: number;
  countOnly?: boolean;
  singleRow?: "maybe" | "one";
  upsertConflict?: string;
};

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      console.error(error);
    }
  });
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 15000) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        cache: "no-store",
        ...init,
        signal: ctrl.signal,
        headers: { ...(init?.headers || {}), "Cache-Control": "no-store" },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(payload.error || `Request failed (${res.status})`) as Error & {
          status?: number;
          details?: Record<string, any>;
        };
        err.status = res.status;
        err.details = payload;
        throw err;
      }
      return payload;
    } catch (error: any) {
      if (error?.status && error.status < 500) throw error;
      if (error?.name === "AbortError") {
        lastError = new Error("PostgreSQL request timed out");
      } else if (String(error?.message || "").toLowerCase().includes("failed to fetch")) {
        lastError = new Error("Could not reach the local database. Refresh the page and try again.");
      } else {
        lastError = error instanceof Error ? error : new Error(String(error?.message || "Request failed"));
      }
      if (attempt < 2) {
        await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
        continue;
      }
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw lastError || new Error("Request failed");
}

async function loadAuth() {
  const local = readBrowserSession();
  if (!local?.access_token) return { session: null };
  try {
    const payload = await fetchJson(`${apiUrl('/__auth')}?token=${encodeURIComponent(local.access_token)}`);
    if (payload.session?.user) {
      writeBrowserSession(payload.session);
      return { session: payload.session as Session };
    }
    writeBrowserSession(null);
    return { session: null };
  } catch {
    return { session: local };
  }
}

function readBrowserSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.user?.id) return null;
    if (parsed.expires_at && Date.parse(parsed.expires_at) <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeBrowserSession(session: Session | null) {
  try {
    if (!session?.user) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private browsing can block storage; keep the in-memory listener update anyway.
  }
}

async function loadTable(table: string) {
  const payload = await fetchJson(`${apiUrl('/__local_db')}?table=${encodeURIComponent(table)}`);
  return Array.isArray(payload.rows) ? payload.rows : [];
}

async function saveSession(session: Session | null) {
  writeBrowserSession(session);
  notifyListeners();
}

async function loadDb() {
  return fetchJson(apiUrl("/__local_db"));
}

async function saveDb(db: any) {
  const res = await fetch(apiUrl("/__local_db"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(db),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: "Failed to save to PostgreSQL" }));
    throw new Error(payload.error || "Failed to save to PostgreSQL");
  }
  notifyListeners();
}

async function mutateDb(body: Record<string, any>) {
  const payload = await fetchJson(
    apiUrl("/__local_db"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    20000
  );
  notifyListeners();
  return payload;
}

function uid() {
  return crypto.randomUUID();
}

function applyFilters(rows: any[], filters: Filter[]) {
  return rows.filter((row) => filters.every((fn) => fn(row)));
}

function valuesEqual(actual: any, expected: any) {
  if (expected === false) return actual !== true && actual !== "true";
  if (expected === true) return actual === true || actual === "true";
  return actual === expected || (actual == null && expected == null) || String(actual) === String(expected);
}

class QueryBuilder {
  private state: QueryState;

  constructor(table: string) {
    this.state = { table, action: "select", filters: [], filterSpecs: [], payload: null };
  }

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    this.state.action = this.state.action === "insert" || this.state.action === "update" || this.state.action === "upsert"
      ? this.state.action
      : "select";
    if (options?.head && options?.count === "exact") this.state.countOnly = true;
    return this;
  }

  insert(payload: any) {
    this.state.action = "insert";
    this.state.payload = payload;
    return this;
  }

  update(payload: any) {
    this.state.action = "update";
    this.state.payload = payload;
    return this;
  }

  upsert(payload: any, options?: { onConflict?: string }) {
    this.state.action = "upsert";
    this.state.payload = payload;
    this.state.upsertConflict = options?.onConflict || "id";
    return this;
  }

  delete() {
    this.state.action = "delete";
    return this;
  }

  eq(column: string, value: any) {
    this.state.filterSpecs.push({ op: "eq", column, value });
    this.state.filters.push((row) => valuesEqual(row?.[column], value));
    return this;
  }

  neq(column: string, value: any) {
    this.state.filterSpecs.push({ op: "neq", column, value });
    this.state.filters.push((row) => row?.[column] !== value);
    return this;
  }

  in(column: string, values: any[]) {
    this.state.filterSpecs.push({ op: "in", column, value: values });
    this.state.filters.push((row) => values.includes(row?.[column]));
    return this;
  }

  is(column: string, value: any) {
    this.state.filterSpecs.push({ op: "is", column, value });
    this.state.filters.push((row) => row?.[column] === value);
    return this;
  }

  contains(column: string, value: any) {
    this.state.filterSpecs.push({ op: "contains", column, value });
    this.state.filters.push((row) => {
      const current = row?.[column];
      if (Array.isArray(current) && Array.isArray(value)) {
        return value.every((item) => current.includes(item));
      }
      return false;
    });
    return this;
  }

  not(column: string, operator: string, value: any) {
    this.state.filterSpecs.push({ op: "not", column, operator, value });
    this.state.filters.push((row) => {
      if (operator === "is" && value === null) return row?.[column] != null;
      return row?.[column] !== value;
    });
    return this;
  }

  or(expression: string) {
    this.state.filterSpecs.push({ op: "or", expression });
    const clauses = expression.split(",").map((part) => part.trim());
    this.state.filters.push((row) =>
      clauses.some((clause) => {
        const ilike = clause.match(/^(.+)\.ilike\.%(.+)%$/);
        if (ilike) {
          return String(row?.[ilike[1]] || "").toLowerCase().includes(ilike[2].toLowerCase());
        }
        return false;
      })
    );
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.state.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number) {
    this.state.limitCount = count;
    return this;
  }

  maybeSingle() {
    this.state.singleRow = "maybe";
    return this;
  }

  single() {
    this.state.singleRow = "one";
    return this;
  }

  then<T>(resolve: (value: any) => T, reject?: (reason: any) => T) {
    return this.execute().then(resolve, reject);
  }

  private async execute() {
    try {
      const now = new Date().toISOString();

      if (this.state.action === "insert") {
        const items = (Array.isArray(this.state.payload) ? this.state.payload : [this.state.payload]).map((item) => ({
          ...item,
          id: item.id || uid(),
          created_at: item.created_at || now,
          updated_at: now,
        }));
        const result = await mutateDb({ action: "insert", table: this.state.table, rows: items });
        return { data: result.data, error: null, count: result.count ?? items.length };
      }

      if (this.state.action === "update") {
        const result = await mutateDb({
          action: "update",
          table: this.state.table,
          payload: this.state.payload,
          filters: this.state.filterSpecs,
        });
        return { data: result.data, error: null, count: result.count ?? 0 };
      }

      if (this.state.action === "upsert") {
        const items = Array.isArray(this.state.payload) ? this.state.payload : [this.state.payload];
        const result = await mutateDb({
          action: "upsert",
          table: this.state.table,
          rows: items,
          upsertConflict: this.state.upsertConflict || "id",
        });
        return { data: result.data, error: null, count: result.count ?? items.length };
      }

      if (this.state.action === "delete") {
        const result = await mutateDb({
          action: "delete",
          table: this.state.table,
          filters: this.state.filterSpecs,
        });
        return { data: result.data, error: null, count: result.count ?? 0 };
      }

      const db = await loadTable(this.state.table);
      if (!Array.isArray(db)) {
        return { data: [], error: null, count: 0 };
      }
      let rows: any[] = [...db];
      let result = applyFilters(rows, this.state.filters);
      if (this.state.orderBy) {
        const { column, ascending } = this.state.orderBy;
        result = result.sort((a, b) => {
          if (a?.[column] === b?.[column]) return 0;
          if (a?.[column] == null) return 1;
          if (b?.[column] == null) return -1;
          return ascending ? (a[column] > b[column] ? 1 : -1) : (a[column] < b[column] ? 1 : -1);
        });
      } else if (this.state.singleRow) {
        result = result.sort((a, b) => String(b?.updated_at || "").localeCompare(String(a?.updated_at || "")));
      }
      if (this.state.limitCount != null) result = result.slice(0, this.state.limitCount);
      if (this.state.countOnly) return { data: null, error: null, count: result.length };
      if (this.state.singleRow === "maybe") return { data: result[0] || null, error: null };
      if (this.state.singleRow === "one") {
        if (!result[0]) return { data: null, error: { message: "No rows found" } };
        return { data: result[0], error: null };
      }
      return { data: result, error: null, count: result.length };
    } catch (error: any) {
      return { data: null, error: { message: error.message || "Local database error" }, count: 0 };
    }
  }
}

function dataUrlToBlob(dataUrl: string) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);/)?.[1] || "application/octet-stream";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const authListeners = new Set<(event: string, session: Session | null) => void>();

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== SESSION_KEY) return;
    const session = readBrowserSession();
    authListeners.forEach((fn) => fn(session ? "SIGNED_IN" : "SIGNED_OUT", session));
    notifyListeners();
  });
}

export const supabase = {
  from(table: string) {
    return new QueryBuilder(table) as any;
  },
  auth: {
    async getSession() {
      try {
        const local = readBrowserSession();
        if (!local) return { data: { session: null }, error: null };
        const db = await loadAuth();
        return { data: { session: db.session || local }, error: null };
      } catch (error: any) {
        return { data: { session: readBrowserSession() }, error: { message: error.message } };
      }
    },
    async getUser() {
      const { data } = await supabase.auth.getSession();
      return { data: { user: data.session?.user || null }, error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const payload = await fetchJson(apiUrl("/__auth"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "signin", email: String(email || "").trim(), password }),
        });
        const session = payload.session as Session | undefined;
        if (!session?.user) {
          throw new Error(payload.error || "Sign-in failed. The server did not return a session.");
        }
        await saveSession(session);
        authListeners.forEach((fn) => fn("SIGNED_IN", session));
        return { data: { user: session.user, session }, error: null };
      } catch (error: any) {
        return { data: { user: null, session: null }, error: { message: error.message || "Invalid email or password" } };
      }
    },
    async signUp({
      email,
      password,
      options,
    }: {
      email: string;
      password: string;
      options?: { data?: Record<string, any>; emailRedirectTo?: string };
    }) {
      try {
        const payload = await fetchJson(apiUrl("/__auth"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "signup",
            email: String(email || "").trim(),
            password,
            user_metadata: options?.data || {},
          }),
        });
        const session = payload.session as Session | undefined;
        if (!session?.user) {
          throw new Error(payload.error || "Sign-up failed. Make sure the server API is running and DATABASE_URL is configured.");
        }
        await saveSession(session);
        authListeners.forEach((fn) => fn("SIGNED_IN", session));
        return { data: { user: session.user, session }, error: null };
      } catch (error: any) {
        return { data: { user: null, session: null }, error: { message: error.message || "Could not create account" } };
      }
    },
    async signOut(_options?: { scope?: string }) {
      const local = readBrowserSession();
      try {
        await fetchJson(apiUrl("/__auth"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "signout", token: local?.access_token }),
        });
      } catch {
        // Local sign-out still proceeds if the server is unreachable.
      }
      await saveSession(null);
      authListeners.forEach((fn) => fn("SIGNED_OUT", null));
      return { error: null };
    },
    async resetPasswordForEmail() {
      return { data: {}, error: null };
    },
    async updateUser({ password }: { password?: string }) {
      const local = readBrowserSession();
      if (local?.access_token && password) {
        await fetchJson(apiUrl("/__auth"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "password", token: local.access_token, password }),
        });
      }
      return { data: { user: local?.user || null }, error: null };
    },
    onAuthStateChange(callback: (event: string, session: Session | null) => void) {
      authListeners.add(callback);
      const local = readBrowserSession();
      callback(local ? "INITIAL_SESSION" : "SIGNED_OUT", local);
      if (local?.access_token) {
        loadAuth()
          .then((db) => callback(db.session ? "INITIAL_SESSION" : "SIGNED_OUT", db.session || null))
          .catch(() => callback("INITIAL_SESSION", local));
      }
      return {
        data: {
          subscription: {
            unsubscribe: () => authListeners.delete(callback),
          },
        },
      };
    },
  },
  storage: {
    from(_bucket: string) {
      return {
        async upload(filePath: string, file: File | Blob) {
          const mime = file.type || "application/octet-stream";
          const uploadUrl = `${apiUrl("/__storage")}?path=${encodeURIComponent(filePath)}`;
          await fetchJson(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": mime },
            body: file,
          }, 120000);
          return { data: { path: filePath }, error: null };
        },
        async download(filePath: string) {
          try {
            const payload = await fetchJson(`${apiUrl('/__storage')}?path=${encodeURIComponent(filePath)}`, undefined, 30000);
            if (!payload.dataUrl) return { data: null, error: { message: "File not found" } };
            return { data: dataUrlToBlob(payload.dataUrl), error: null };
          } catch (error: any) {
            return { data: null, error: { message: error.message || "File not found" } };
          }
        },
        async remove(paths: string[]) {
          await fetchJson(apiUrl("/__storage"), {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths }),
          });
          return { data: paths, error: null };
        },
        getPublicUrl(filePath: string) {
          return { data: { publicUrl: filePath } };
        },
      };
    },
  },
  channel(_name: string) {
    return {
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
      unsubscribe() {},
    };
  },
  removeChannel(channel: { unsubscribe?: () => void }) {
    channel?.unsubscribe?.();
  },
  functions: {
    async invoke(_name: string, _args?: { body?: any }) {
      return { data: { ok: true }, error: null };
    },
  },
};

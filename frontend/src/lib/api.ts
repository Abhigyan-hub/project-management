type ApiError = { message: string } | null;
type ApiResult<T> = { data: T; error: ApiError };

export async function apiRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path.startsWith("/api") ? path : `/api${path}`, { ...init, headers, credentials: "include" });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
  return body as T;
}

class DataQuery implements PromiseLike<ApiResult<any>> {
  private action: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any;
  private selected = "*";
  private filters: Array<[string, unknown]> = [];
  private sort?: string;
  private maxRows?: number;
  private singleMode?: "single" | "maybeSingle";
  constructor(private readonly resource: string) {}
  select(fields = "*") { this.selected = fields; return this; }
  insert(value: any) { this.action = "insert"; this.payload = value; return this; }
  update(value: any) { this.action = "update"; this.payload = value; return this; }
  delete() { this.action = "delete"; return this; }
  upsert(value: any) { this.action = "upsert"; this.payload = value; return this; }
  eq(field: string, value: unknown) { this.filters.push([field, value]); return this; }
  order(field: string, options?: { ascending?: boolean }) { this.sort = `${field}.${options?.ascending === false ? "desc" : "asc"}`; return this; }
  limit(value: number) { this.maxRows = value; return this; }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybeSingle"; return this; }
  private async run(): Promise<ApiResult<any>> {
    try {
      const params = new URLSearchParams();
      if (this.action === "select" || this.selected !== "*") params.set("select", this.selected);
      if (this.sort) params.set("order", this.sort);
      if (this.maxRows) params.set("limit", String(this.maxRows));
      for (const [field, value] of this.filters) params.set(field, value == null ? "null" : String(value));
      const method = this.action === "select" ? "GET" : this.action === "insert" ? "POST" : this.action === "update" ? "PATCH" : this.action === "delete" ? "DELETE" : "PUT";
      const body = this.action === "insert" || this.action === "update" || this.action === "upsert" ? JSON.stringify(this.payload) : undefined;
      const result = await apiRequest<{ data: any }>(`/api/data/${this.resource}${params.size ? `?${params}` : ""}`, { method, body });
      let data = result.data;
      if (this.singleMode) {
        const rows = Array.isArray(data) ? data : data == null ? [] : [data];
        if (rows.length > 1 || this.singleMode === "single" && rows.length !== 1) throw new Error("Expected exactly one result.");
        data = rows[0] ?? null;
      }
      return { data, error: null };
    } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "Request failed." } }; }
  }
  then<TResult1 = ApiResult<any>, TResult2 = never>(onfulfilled?: ((value: ApiResult<any>) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null) { return this.run().then(onfulfilled, onrejected); }
}

type AuthListener = (event: string, session: any) => void;
const authListeners = new Set<AuthListener>();
let sessionCache: any = null;
function emitAuth(event: string, user: any) {
  sessionCache = user ? { user, access_token: "httpOnly-cookie", token_type: "bearer" } : null;
  for (const listener of authListeners) listener(event, sessionCache);
}

export const supabase = {
  from(resource: string) { return new DataQuery(resource); },
  rpc(name: string, args: Record<string, unknown> = {}) {
    return apiRequest<{ data: unknown }>(`/api/rpc/${name}`, { method: "POST", body: JSON.stringify(args) }).then((result) => ({ data: result.data, error: null })).catch((error) => ({ data: null, error: { message: error instanceof Error ? error.message : "Request failed." } }));
  },
  auth: {
    onAuthStateChange(callback: AuthListener) { authListeners.add(callback); return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } }; },
    async getSession() {
      if (sessionCache) return { data: { session: sessionCache }, error: null };
      try { const result = await apiRequest<{ user: any }>("/api/auth/session"); sessionCache = { user: result.user, access_token: "httpOnly-cookie", token_type: "bearer" }; return { data: { session: sessionCache }, error: null }; }
      catch { return { data: { session: null }, error: null }; }
    },
    async signInWithPassword(credentials: { email: string; password: string }) {
      try { const result = await apiRequest<{ user: any }>("/api/auth/login", { method: "POST", body: JSON.stringify(credentials) }); emitAuth("SIGNED_IN", result.user); return { data: { user: result.user }, error: null }; }
      catch (error) { return { data: { user: null }, error: { message: error instanceof Error ? error.message : "Sign in failed." } }; }
    },
    async signOut() { try { await apiRequest("/api/auth/logout", { method: "POST" }); } finally { emitAuth("SIGNED_OUT", null); } return { error: null }; },
    async signUp() { return { data: { user: null, session: null }, error: { message: "Accounts are invite-only. Ask your administrator for an invitation." } }; },
    async resetPasswordForEmail(email: string, _options?: { redirectTo?: string }) {
      try { await apiRequest("/api/auth/request-password-reset", { method: "POST", body: JSON.stringify({ email }) }); return { error: null }; }
      catch (error) { return { error: { message: error instanceof Error ? error.message : "Could not send a reset link." } }; }
    },
  },
};

export async function db<T>(query: PromiseLike<ApiResult<T>>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

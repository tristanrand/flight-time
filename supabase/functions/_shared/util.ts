// Shared helpers for Flight Time edge functions.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

export const fail = (message: string, status = 400) => json({ error: message }, status);

// Newer projects expose secret keys as SUPABASE_SECRET_KEYS (JSON); older ones as SUPABASE_SERVICE_ROLE_KEY.
const secretKey = () => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    return Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"))[0] as string;
  } catch {
    return "";
  }
};

/** Service-role client: bypasses RLS. Only ever used server-side, inside edge functions. */
export const admin = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), { auth: { persistSession: false } });

/**
 * The signed-in user behind a request, or null. Writes made for them go through
 * `admin()` and must always be scoped with `.eq("user_id", user.id)`.
 */
export const callerOf = async (req: Request, db: SupabaseClient) => {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token.startsWith("sb_")) return null; // a publishable key, not a user session
  const { data } = await db.auth.getUser(token);
  return data.user ?? null;
};

/**
 * Read-through cache in public.api_cache. `ttlSeconds` decides how stale a shared
 * answer may be; every user inside that window shares one paid upstream call.
 */
export async function cached<T>(
  db: SupabaseClient,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<{ data: T; cached: boolean }> {
  const { data: hit } = await db.from("api_cache").select("payload, fetched_at").eq("key", key).maybeSingle();
  if (hit && Date.now() - new Date(hit.fetched_at).getTime() < ttlSeconds * 1000) {
    return { data: hit.payload as T, cached: true };
  }
  const fresh = await load();
  await db.from("api_cache").upsert({ key, payload: fresh, fetched_at: new Date().toISOString() });
  return { data: fresh, cached: false };
}

export const logUsage = (db: SupabaseClient, provider: string, endpoint: string, resultSets = 1) =>
  db.from("api_usage").insert({ provider, endpoint, result_sets: resultSets });

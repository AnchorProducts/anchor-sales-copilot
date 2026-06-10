import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// NetSuite Token-Based Auth (OAuth 1.0, HMAC-SHA256) + a RESTlet endpoint.
const NS_ACCOUNT_ID = Deno.env.get("NETSUITE_ACCOUNT_ID") || "";
const NS_RESTLET_URL = Deno.env.get("NETSUITE_RESTLET_URL") || "";
const NS_CONSUMER_KEY = Deno.env.get("NETSUITE_CONSUMER_KEY") || "";
const NS_CONSUMER_SECRET = Deno.env.get("NETSUITE_CONSUMER_SECRET") || "";
const NS_TOKEN_ID = Deno.env.get("NETSUITE_TOKEN_ID") || "";
const NS_TOKEN_SECRET = Deno.env.get("NETSUITE_TOKEN_SECRET") || "";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  if (!h.toLowerCase().startsWith("bearer ")) return "";
  return h.slice(7).trim();
}

function clean(v: any) {
  return String(v || "").trim();
}

function truncate(input: string, max: number) {
  const s = String(input || "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// RFC 3986 percent-encoding (stricter than encodeURIComponent).
function pct(s: string) {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function nonce(len = 24) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

async function hmacSha256Base64(key: string, message: string) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Build the OAuth 1.0 Authorization header for a NetSuite RESTlet request.
async function netsuiteAuthHeader(method: string, fullUrl: string) {
  const url = new URL(fullUrl);
  const baseUrl = `${url.origin}${url.pathname}`;

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: NS_CONSUMER_KEY,
    oauth_token: NS_TOKEN_ID,
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_nonce: nonce(),
    oauth_version: "1.0",
  };

  // Signature base string includes the query params (e.g. script, deploy) too.
  const allParams: Record<string, string> = { ...oauthParams };
  for (const [k, v] of url.searchParams.entries()) allParams[k] = v;

  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${pct(k)}=${pct(allParams[k])}`)
    .join("&");

  const baseString = [method.toUpperCase(), pct(baseUrl), pct(paramString)].join("&");
  const signingKey = `${pct(NS_CONSUMER_SECRET)}&${pct(NS_TOKEN_SECRET)}`;
  const signature = await hmacSha256Base64(signingKey, baseString);

  const headerParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  };

  const header =
    `OAuth realm="${pct(NS_ACCOUNT_ID)}", ` +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${pct(k)}="${pct(headerParams[k])}"`)
      .join(", ");

  return header;
}

async function markFailed(
  supabase: ReturnType<typeof createClient>,
  leadId: string,
  errorMsg: string,
) {
  await supabase
    .from("leads")
    .update({
      netsuite_sync_status: "failed",
      netsuite_sync_error: truncate(errorMsg, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);
}

serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Missing Supabase env." }, 500);

  if (
    !NS_ACCOUNT_ID || !NS_RESTLET_URL || !NS_CONSUMER_KEY ||
    !NS_CONSUMER_SECRET || !NS_TOKEN_ID || !NS_TOKEN_SECRET
  ) {
    return json({ error: "NetSuite is not configured." }, 500);
  }

  const token = bearerToken(req);
  if (!token || token !== SERVICE_KEY) return json({ error: "Unauthorized" }, 401);

  let leadId = "";

  try {
    const body = await req.json().catch(() => ({}));
    const lead_id = String(body?.lead_id || "").trim();
    if (!lead_id) return json({ error: "Missing lead_id" }, 400);
    leadId = lead_id;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadErr) return json({ error: leadErr.message }, 500);
    if (!lead) return json({ error: "Lead not found" }, 404);

    // Status + rep assignment are pulled straight from the app's current state.
    let assignedRepEmail: string | null = null;
    let assignedRepName: string | null = null;
    if (lead.assigned_rep_user_id) {
      const { data: rep } = await supabase
        .from("profiles")
        .select("email,full_name")
        .eq("id", lead.assigned_rep_user_id)
        .maybeSingle();
      assignedRepEmail = clean((rep as any)?.email) || null;
      assignedRepName = clean((rep as any)?.full_name) || null;
    }

    // RESTlet is expected to upsert by external_id and return the NetSuite ids.
    const payload = {
      external_id: lead.id,
      company: clean(lead.customer_company),
      contact_email: clean(lead.created_by_email),
      status: clean(lead.status),
      assigned_rep_email: assignedRepEmail,
      assigned_rep_name: assignedRepName,
      meeting_link: clean(lead.meeting_link) || null,
      region_code: clean(lead.region_code) || null,
      project_address: clean(lead.project_address) || null,
      location_text: clean(lead.location_text) || null,
      details: truncate(clean(lead.details), 2000),
      // Pass back existing ids so the RESTlet can update rather than duplicate.
      netsuite_company_id: lead.netsuite_company_id || null,
      netsuite_contact_id: lead.netsuite_contact_id || null,
      netsuite_deal_id: lead.netsuite_deal_id || null,
    };

    const authHeader = await netsuiteAuthHeader("POST", NS_RESTLET_URL);

    const nsRes = await fetch(NS_RESTLET_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const nsText = await nsRes.text();
    const nsJson = nsText ? (() => { try { return JSON.parse(nsText); } catch { return { raw: nsText }; } })() : {};

    if (!nsRes.ok) {
      const msg = nsJson?.error?.message || nsJson?.error || nsJson?.raw || `NetSuite returned ${nsRes.status}`;
      await markFailed(supabase, lead_id, String(msg));
      return json({ ok: false, error: String(msg) }, 500);
    }

    // Accept a few common field-name shapes from the RESTlet response.
    const companyId = nsJson.company_id ?? nsJson.customer_id ?? nsJson.companyId ?? null;
    const contactId = nsJson.contact_id ?? nsJson.contactId ?? null;
    const dealId = nsJson.deal_id ?? nsJson.opportunity_id ?? nsJson.dealId ?? null;

    const { error: updErr } = await supabase
      .from("leads")
      .update({
        netsuite_company_id: companyId ? String(companyId) : lead.netsuite_company_id,
        netsuite_contact_id: contactId ? String(contactId) : lead.netsuite_contact_id,
        netsuite_deal_id: dealId ? String(dealId) : lead.netsuite_deal_id,
        netsuite_sync_status: "synced",
        netsuite_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead_id);

    if (updErr) return json({ error: updErr.message }, 500);

    return json({
      ok: true,
      netsuite_company_id: companyId,
      netsuite_contact_id: contactId,
      netsuite_deal_id: dealId,
    });
  } catch (e: any) {
    try {
      if (leadId) {
        const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        await markFailed(supabase, leadId, e?.message || "NetSuite sync failed");
      }
    } catch {
      // ignore secondary failures
    }
    return json({ ok: false, error: e?.message || "NetSuite sync failed" }, 500);
  }
});

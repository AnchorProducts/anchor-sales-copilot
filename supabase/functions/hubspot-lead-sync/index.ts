import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const HUBSPOT_TOKEN = Deno.env.get("HUBSPOT_PRIVATE_APP_TOKEN") || "";

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

async function hubspotFetch(path: string, init: RequestInit) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  const jsonBody = text ? JSON.parse(text) : {};
  return { res, json: jsonBody };
}

async function searchObject(objectType: string, propertyName: string, value: string) {
  const body = {
    filterGroups: [
      {
        filters: [
          {
            propertyName,
            operator: "EQ",
            value,
          },
        ],
      },
    ],
    properties: [propertyName],
    limit: 1,
  };

  const { res, json } = await hubspotFetch(`/crm/v3/objects/${objectType}/search`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  const results = json?.results || [];
  return results[0] || null;
}

async function associate(from: string, fromId: string, to: string, toId: string, label: string) {
  try {
    await hubspotFetch(`/crm/v3/objects/${from}/${fromId}/associations/${to}/${toId}/${label}`, {
      method: "PUT",
    });
  } catch {
    // best-effort
  }
}

serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Missing Supabase env." }, 500);
  if (!HUBSPOT_TOKEN) return json({ error: "Missing HUBSPOT_PRIVATE_APP_TOKEN" }, 500);

  const token = bearerToken(req);
  if (!token || token !== SERVICE_KEY) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const lead_id = String(body?.lead_id || "").trim();
    if (!lead_id) return json({ error: "Missing lead_id" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadErr) return json({ error: leadErr.message }, 500);
    if (!lead) return json({ error: "Lead not found" }, 404);

    const companyName = String(lead.customer_company || "").trim();
    const contactEmail = String(lead.created_by_email || "").trim();

    // Company
    let companyId: string | null = null;
    if (companyName) {
      const existing = await searchObject("companies", "name", companyName);
      if (existing?.id) companyId = existing.id;

      if (!companyId) {
        const { res, json: cjson } = await hubspotFetch("/crm/v3/objects/companies", {
          method: "POST",
          body: JSON.stringify({
            properties: { name: companyName },
          }),
        });

        if (res.ok) companyId = cjson?.id || null;
      }
    }

    // Contact
    let contactId: string | null = null;
    if (contactEmail) {
      const existing = await searchObject("contacts", "email", contactEmail);
      if (existing?.id) contactId = existing.id;

      if (!contactId) {
        const { res, json: cjson } = await hubspotFetch("/crm/v3/objects/contacts", {
          method: "POST",
          body: JSON.stringify({
            properties: { email: contactEmail },
          }),
        });

        if (res.ok) contactId = cjson?.id || null;
      }
    }

    // Deal
    let dealId: string | null = null;
    const dealName = companyName ? `${companyName} - Rooftop Lead` : "Rooftop Lead";
    const { res: dres, json: djson } = await hubspotFetch("/crm/v3/objects/deals", {
      method: "POST",
      body: JSON.stringify({
        properties: {
          dealname: dealName,
          region_code: lead.region_code || "",
          lead_source: "Anchor Lead Form",
        },
      }),
    });

    if (dres.ok) dealId = djson?.id || null;

    // Associations (best-effort)
    if (companyId && contactId) await associate("companies", companyId, "contacts", contactId, "company_to_contact");
    if (companyId && dealId) await associate("companies", companyId, "deals", dealId, "company_to_deal");
    if (contactId && dealId) await associate("contacts", contactId, "deals", dealId, "contact_to_deal");

    const { error: updErr } = await supabase
      .from("leads")
      .update({
        hubspot_company_id: companyId,
        hubspot_contact_id: contactId,
        hubspot_deal_id: dealId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead_id);

    if (updErr) return json({ error: updErr.message }, 500);

    return json({ ok: true, hubspot_company_id: companyId, hubspot_contact_id: contactId, hubspot_deal_id: dealId });
  } catch (e: any) {
    return json({ error: e?.message || "HubSpot sync failed" }, 500);
  }
});

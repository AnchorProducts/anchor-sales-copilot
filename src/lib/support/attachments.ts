// Image attachments for support messages. Bytes live in the private "knowledge"
// storage bucket under support/<requestId>/; metadata is stored on the message
// row (support_messages.attachments). Read access is via short-lived signed URLs.
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "knowledge";
const MAX_FILES = 6;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB each
const ALLOWED = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

export type SupportAttachment = {
  path: string;
  filename: string;
  content_type: string;
  size: number;
};

// Pull image File objects from a FormData field (default "images").
export function imagesFromForm(form: FormData, field = "images"): File[] {
  return form.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
}

// Upload images for a request; returns metadata to store on the message. On any
// validation/upload error, returns what uploaded plus an error string.
export async function uploadSupportImages(
  requestId: string,
  files: File[]
): Promise<{ attachments: SupportAttachment[]; error?: string }> {
  const attachments: SupportAttachment[] = [];
  const imgs = files.slice(0, MAX_FILES);
  for (const file of imgs) {
    const ct = (file.type || "").toLowerCase();
    if (!ALLOWED.has(ct)) return { attachments, error: `Unsupported file type: ${file.name}` };
    if (file.size > MAX_BYTES) return { attachments, error: `${file.name} is too large (max 8 MB).` };

    const safeName = (file.name || "image").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "image";
    const path = `support/${requestId}/${crypto.randomUUID()}-${safeName}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: ct, upsert: false });
    if (error) return { attachments, error: error.message };
    attachments.push({ path, filename: safeName, content_type: ct, size: file.size });
  }
  return { attachments };
}

// Attach short-lived signed URLs for display.
export async function signSupportAttachments(
  attachments: SupportAttachment[]
): Promise<Array<SupportAttachment & { url: string | null }>> {
  const out: Array<SupportAttachment & { url: string | null }> = [];
  for (const a of attachments || []) {
    try {
      const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(a.path, 3600);
      out.push({ ...a, url: data?.signedUrl ?? null });
    } catch {
      out.push({ ...a, url: null });
    }
  }
  return out;
}

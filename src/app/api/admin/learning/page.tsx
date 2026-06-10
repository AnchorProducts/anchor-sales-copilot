"use client";

import { useEffect, useState } from "react";

type DocRow = {
  document_id: string;
  title: string;
  allowed: boolean;
  total_downvotes: number;
  total_upvotes: number;
};

export default function LearningAdminPage() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/learning/summary", { cache: "no-store" });
    const json = await res.json();
    setDocs(json.docs || []);
    setLoading(false);
  }

  async function act(body: any) {
    await fetch("/api/admin/learning/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6 text-sm">
      <div className="mb-4 text-lg font-semibold">Learning Admin</div>

      {loading ? (
        <div className="opacity-70">Loading…</div>
      ) : (
        <div className="grid gap-8">
          <section>
            <div className="mb-2 font-medium">Most downvoted documents</div>
            <div className="border border-white/10">
              {docs.length === 0 ? (
                <div className="p-3 opacity-70">No data yet.</div>
              ) : (
                docs.map((d) => (
                  <div
                    key={d.document_id}
                    className="flex items-center justify-between gap-3 border-b border-white/10 p-3"
                  >
                    <div>
                      <div className="font-medium">{d.title}</div>
                      <div className="opacity-70">
                        👎 {d.total_downvotes} / 👍 {d.total_upvotes}{" "}
                        <span className="ml-2">
                          allowed: {String(d.allowed)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {d.allowed ? (
                        <button
                          className="border border-white/20 px-2 py-1"
                          onClick={() =>
                            act({ action: "disable_doc", documentId: d.document_id })
                          }
                        >
                          Disable
                        </button>
                      ) : (
                        <button
                          className="border border-white/20 px-2 py-1"
                          onClick={() =>
                            act({ action: "enable_doc", documentId: d.document_id })
                          }
                        >
                          Enable
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <div className="mb-2 font-medium">Corrections</div>
            <div className="border border-white/10 p-3 opacity-70">
              Correction review and the per-correction on/off toggle now live in
              Admin → Knowledge → Corrections.
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

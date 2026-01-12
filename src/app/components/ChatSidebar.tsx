"use client";

import { useMemo, useState, useEffect, useRef } from "react";

type ConversationRow = {
  id: string;
  title: string | null;
  updated_at: string | null;
};

function formatWhen(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function titleOrNew(title?: string | null) {
  const t = (title || "").trim();
  return t.length ? t : "New chat";
}

export default function ChatSidebar({
  conversations,
  activeId,
  loading,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
}: {
  conversations: ConversationRow[];
  activeId: string | null;
  loading: boolean;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename?: (id: string, title: string) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
}) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const activeIndex = useMemo(
    () => conversations.findIndex((c) => c.id === activeId),
    [conversations, activeId]
  );

  // Close the 3-dot menu when you click anywhere else
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setMenuOpenId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function startRename(id: string, currentTitle: string) {
    setMenuOpenId(null);
    setEditingId(id);
    setDraftTitle(currentTitle);
  }

  async function commitRename(id: string) {
    const t = draftTitle.trim();
    setEditingId(null);
    if (!t) return;
    await onRename?.(id, t);
  }

  async function handleDelete(id: string) {
    setMenuOpenId(null);
    await onDelete?.(id);
  }

  // Anchor dashboard palette
  const PANEL_HEADER = "border-b border-black/10 px-4 py-3 flex items-center justify-between gap-2 shrink-0";
  const MUTED = "text-[#76777B]";

  return (
    <div ref={rootRef} className="h-full min-h-0 flex flex-col bg-transparent">
      {/* Header */}
      <div className={PANEL_HEADER}>
        <div className="text-sm font-semibold text-black">Chats</div>

        <button
          type="button"
          onClick={onNewChat}
          className="rounded-md border border-black/10 bg-white px-3 py-1 text-[12px] font-semibold text-[#047835] hover:bg-black/[0.03] transition"
          title="Start a new chat"
        >
          New chat
        </button>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 bg-transparent">
        {loading ? (
          <div className={`p-3 text-sm ${MUTED}`}>Loading…</div>
        ) : conversations.length === 0 ? (
          <div className={`p-3 text-sm ${MUTED}`}>No chats yet.</div>
        ) : (
          <div className="space-y-1">
            {conversations.map((c) => {
              const isActive = c.id === activeId;
              const isEditing = editingId === c.id;

              return (
                <div key={c.id} className="relative">
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className={[
                      "w-full text-left rounded-xl px-3 py-2 border transition pr-10",
                      isActive
                        ? "border-[#047835]/35 bg-[#9CE2BB]"
                        : "border-black/10 bg-white hover:bg-black/[0.03]",
                    ].join(" ")}
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          autoFocus
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(c.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-full rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] text-black outline-none focus:border-[#047835]"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              commitRename(c.id);
                            }}
                            className="rounded-md border border-black/10 bg-[#047835] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#11500F] transition"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(null);
                            }}
                            className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] text-black/70 hover:bg-black/[0.03] transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="truncate text-[13px] font-semibold text-black">
                          {titleOrNew(c.title)}
                        </div>
                        <div className={`text-[11px] ${MUTED} truncate`}>
                          {formatWhen(c.updated_at)}
                        </div>
                      </>
                    )}
                  </button>

                  {/* 3-dot menu */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId((v) => (v === c.id ? null : c.id));
                    }}
                    className="absolute right-2 top-2 h-7 w-7 rounded-md border border-black/10 bg-white text-black/70 hover:bg-black/[0.03] transition"
                    aria-label="Chat actions"
                    title="Actions"
                  >
                    ⋯
                  </button>

                  {menuOpenId === c.id && (
                    <div
                      className="absolute right-2 top-10 z-20 w-40 overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => startRename(c.id, titleOrNew(c.title))}
                        className="w-full px-3 py-2 text-left text-[12px] text-black hover:bg-black/[0.03] transition"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="w-full px-3 py-2 text-left text-[12px] text-red-600 hover:bg-black/[0.03] transition"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-black/10 px-4 py-3 text-[11px] text-[#76777B] shrink-0">
        Tip: Click a chat to continue where you left off.
        {activeIndex >= 0 ? (
          <span className="ml-2 text-black/40">
            ({activeIndex + 1}/{conversations.length})
          </span>
        ) : null}
      </div>
    </div>
  );
}

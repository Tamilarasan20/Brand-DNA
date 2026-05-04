"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BrandBoard from "@/components/BrandBoard";
import VisualAssetGallery from "@/components/VisualAssetGallery";
import {
  Loader2, FileText, X, Pencil, Trash2, Save, Eye, ChevronRight,
  BookOpen, BarChart2, Users, AlertTriangle, CheckCircle2, Sparkles, RefreshCw, Image as ImageIcon
} from "lucide-react";

// ─────────────────────────────────────────────
// Image sanitizer — strips stored srcset strings into clean URLs
// ─────────────────────────────────────────────
function cleanImageList(raw: any[]): string[] {
  const results: string[] = [];
  for (const item of raw) {
    const src = typeof item === "string" ? item : (item?.url || "");
    if (!src) continue;
    // Srcset strings: "url1 1024w, url2 600w" or "url1 2x, url2 1x"
    if (/\s+\d+(\.\d+)?[wx]/.test(src) || /,\s*https?:\/\//.test(src)) {
      // Extract the highest-res URL (last entry = largest width in ascending srcset)
      const candidates = src.split(",")
        .map((e: string) => e.trim().split(/\s+/)[0])
        .filter((u: string) => u.startsWith("http"));
      if (candidates.length > 0) results.push(candidates[candidates.length - 1]);
    } else if (src.startsWith("http") && !src.includes(" ")) {
      results.push(src);
    }
  }
  // Deduplicate
  return [...new Set(results)];
}

// ─────────────────────────────────────────────
// Markdown renderer
// ─────────────────────────────────────────────
function SimpleMarkdown({ content }: { content: string }) {
  const parseLine = (line: string): string => {
    let html = line.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-[#0f172a]">$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em class="italic text-[#334155]">$1</em>');
    html = html.replace(/`(.*?)`/g, '<code class="bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0] text-[13.5px] px-1.5 py-0.5 rounded-md font-mono">$1</code>');
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-blue-600 underline decoration-blue-600/30 hover:decoration-blue-600 underline-offset-4 transition-colors font-medium">$1</a>');
    return html;
  };

  const parseMarkdown = (md: string) => {
    const blocks = md.split('\n\n');
    return blocks.map((block, i) => {
      const trimmed = block.trim();
      if (!trimmed) return null;

      // H1 (Title)
      if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
        return <h1 key={i} className="text-[28px] md:text-3xl font-extrabold text-[#0f172a] mb-8 mt-2 tracking-tight leading-tight border-b-2 border-gray-100 pb-4">{trimmed.replace(/^# /, '')}</h1>;
      }
      // H3 (Sub-section)
      if (trimmed.startsWith('### ')) {
        return <h3 key={i} className="text-[15px] font-bold text-[#475569] mb-3 mt-8 uppercase tracking-wider">{trimmed.replace(/^### /, '')}</h3>;
      }
      // H2 (Section)
      if (trimmed.startsWith('## ')) {
        return <h2 key={i} className="text-[20px] md:text-[22px] font-bold text-[#0f172a] mb-5 mt-10 first:mt-0 tracking-tight border-b border-gray-100 pb-3">{trimmed.replace(/^## /, '')}</h2>;
      }
      // Blockquote (Executive Summary)
      if (trimmed.startsWith('> ')) {
        const text = trimmed.split('\n').map(line => line.replace(/^>\s?/, '')).join(' ');
        return (
          <blockquote key={i} className="border-l-[3px] border-[#2563eb] pl-5 py-3 my-8 bg-[#eff6ff]/50 rounded-r-xl italic text-[#334155] text-[16px] leading-relaxed">
            <span dangerouslySetInnerHTML={{ __html: parseLine(text) }} />
          </blockquote>
        );
      }
      // Divider
      if (trimmed === '---' || trimmed === '***') {
        return <hr key={i} className="border-t border-[#e2e8f0] my-10" />;
      }
      // Numbered List
      if (/^\d+\.\s/.test(trimmed)) {
        const items = trimmed.split('\n');
        return (
          <ol key={i} className="list-decimal pl-6 mb-6 space-y-3 text-[#334155] marker:text-[#64748b] marker:font-medium">
            {items.map((item, j) => {
              const text = item.replace(/^\d+\.\s/, '');
              if (!text.trim()) return null;
              return <li key={j} className="text-[15.5px] leading-relaxed pl-1"><span dangerouslySetInnerHTML={{ __html: parseLine(text) }} /></li>;
            })}
          </ol>
        );
      }
      // Bullet List
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const items = trimmed.split('\n');
        return (
          <ul key={i} className="mb-6 space-y-3 text-[#334155]">
            {items.map((item, j) => {
              const text = item.replace(/^[-*]\s/, '');
              if (!text.trim()) return null;
              return (
                <li key={j} className="text-[15.5px] leading-relaxed pl-6 relative before:content-[''] before:absolute before:left-1 before:top-[11px] before:w-[5px] before:h-[5px] before:rounded-full before:bg-[#94a3b8]">
                  <span dangerouslySetInnerHTML={{ __html: parseLine(text) }} />
                </li>
              );
            })}
          </ul>
        );
      }
      // Basic Table Support
      if (trimmed.startsWith('|') && trimmed.includes('\n|')) {
        const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
        if (lines.length >= 2) {
          const headers = lines[0].split('|').filter(Boolean).map(s => parseLine(s.trim()));
          const rows = lines.slice(2).map(row => row.split('|').filter(Boolean).map(s => parseLine(s.trim())));
          return (
            <div key={i} className="overflow-x-auto mb-8 mt-6 rounded-xl border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-left text-[14.5px]">
                <thead className="bg-[#f8fafc]">
                  <tr>
                    {headers.map((h, hIdx) => <th key={hIdx} className="px-6 py-4 font-semibold text-gray-700 tracking-wider whitespace-nowrap" dangerouslySetInnerHTML={{ __html: h }} />)}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {rows.map((row, rIdx) => (
                    <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                      {row.map((cell, cIdx) => <td key={cIdx} className="px-6 py-4 text-gray-600 leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: cell }} />)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
      }

      // Default Paragraph
      return <p key={i} className="text-[15.5px] text-[#334155] mb-6 leading-[1.8] whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: parseLine(trimmed) }} />;
    });
  };

  return <div className="markdown-prose font-sans antialiased text-[#0f172a]">{parseMarkdown(content)}</div>;
}

// ─────────────────────────────────────────────
// Document config
// ─────────────────────────────────────────────
type DocKey = 'strategy' | 'marketResearch' | 'businessProfile';

interface DocMeta {
  key: DocKey;
  dbField: string;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  Icon: React.ElementType;
}

const DOC_META: DocMeta[] = [
  {
    key: 'businessProfile',
    dbField: 'business_profile',
    label: 'Business Profile',
    description: 'Overview, products, key selling points & target audience',
    color: '#7C3AED',
    bgColor: '#F5F3FF',
    Icon: Users,
  },
  {
    key: 'marketResearch',
    dbField: 'market_research',
    label: 'Market Research',
    description: 'Market opportunity, competitors, SEO keywords & audiences',
    color: '#0369A1',
    bgColor: '#E0F2FE',
    Icon: BarChart2,
  },
  {
    key: 'strategy',
    dbField: 'social_strategy',
    label: 'Social Strategy',
    description: 'Priority platforms, content pillars, posting cadence & quick wins',
    color: '#15803D',
    bgColor: '#F0FDF4',
    Icon: BookOpen,
  },
];

interface BrandDocuments {
  strategy: string;
  marketResearch: string;
  businessProfile: string;
}

// word count helper
function wordCount(str: string) {
  return str.trim() ? str.trim().split(/\s+/).length : 0;
}

// ─────────────────────────────────────────────
// Document editor modal
// ─────────────────────────────────────────────
interface DocModalProps {
  meta: DocMeta;
  content: string;
  businessId: string;
  onSave: (key: DocKey, newContent: string) => void;
  onDelete: (key: DocKey) => void;
  onClose: () => void;
}

function DocModal({ meta, content, businessId, onSave, onDelete, onClose }: DocModalProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editValue, setEditValue] = useState(content);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/update-business', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: businessId, field: meta.dbField, content: editValue }),
      });
      if (!res.ok) throw new Error('Save failed');
      onSave(meta.key, editValue);
      setMode('view');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/update-business', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: businessId, field: meta.dbField, content: '' }),
      });
      if (!res.ok) throw new Error('Delete failed');
      onDelete(meta.key);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-[860px] max-h-[90vh] rounded-[24px] shadow-2xl flex flex-col relative overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-7 py-5 border-b border-[#F4F4F5] shrink-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: meta.bgColor }}>
            <meta.Icon className="w-4.5 h-4.5" style={{ color: meta.color }} size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-[#111111] tracking-tight leading-none">{meta.label}</h2>
            <p className="text-[12px] text-[#A1A1AA] mt-0.5">{wordCount(mode === 'edit' ? editValue : content).toLocaleString()} words</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Saved indicator */}
            {saved && (
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#15803D] animate-in fade-in duration-200">
                <CheckCircle2 className="w-4 h-4" /> Saved
              </span>
            )}

            {/* Edit / View toggle */}
            {mode === 'view' ? (
              <button
                onClick={() => setMode('edit')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold bg-[#F4F4F5] text-[#111111] hover:bg-[#E5E7EB] transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setMode('view'); setEditValue(content); }}
                  className="px-4 py-2 rounded-full text-[13px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold bg-[#111111] text-white hover:bg-[#27272A] transition-colors disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
              </>
            )}

            {/* Delete */}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-2 rounded-full text-[#A1A1AA] hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Delete document"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-full px-3 py-1.5 animate-in fade-in duration-150">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-[12px] font-semibold text-red-600">Delete?</span>
                <button onClick={handleDelete} disabled={deleting} className="text-[12px] font-bold text-red-600 hover:text-red-800 transition-colors ml-1">
                  {deleting ? '...' : 'Yes'}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-[12px] font-semibold text-[#71717A] hover:text-[#111111] transition-colors">No</button>
              </div>
            )}

            {/* Close */}
            <button onClick={onClose} className="p-2 rounded-full text-[#71717A] hover:bg-[#F4F4F5] transition-colors">
              <X className="w-4.5 h-4.5" size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {mode === 'view' ? (
            <div className="px-10 py-8">
              {content && content.trim() && content !== 'No business profile generated.' && content !== 'No market research generated.' && content !== 'No social strategy generated.' ? (
                <SimpleMarkdown content={content} />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: meta.bgColor }}>
                    <meta.Icon style={{ color: meta.color }} size={24} />
                  </div>
                  <p className="text-[15px] font-semibold text-[#111111] mb-1">No content yet</p>
                  <p className="text-[13px] text-[#A1A1AA] mb-5">{meta.description}</p>
                  <button
                    onClick={() => setMode('edit')}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold bg-[#111111] text-white hover:bg-[#27272A] transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Write content
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 px-7 py-3 bg-[#FAFBFC] border-b border-[#F4F4F5] text-[12px] text-[#A1A1AA]">
                <Eye className="w-3.5 h-3.5" />
                Editing in Markdown — changes are saved to your Knowledge Base
              </div>
              <textarea
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 w-full px-10 py-7 text-[14px] leading-[1.8] text-[#111111] font-mono resize-none outline-none bg-white min-h-[400px]"
                placeholder={`Write ${meta.label} in Markdown...\n\n## Section\n\nYour content here...`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Document file card
// ─────────────────────────────────────────────
interface DocCardProps {
  meta: DocMeta;
  content: string;
  businessId: string;
  onOpen: () => void;
  onDelete: () => void;
  onRegenerate: (key: DocKey, newContent: string) => void;
}

function DocCard({ meta, content, businessId, onOpen, onDelete, onRegenerate }: DocCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState("");
  const hasContent = content && content.trim() && !content.startsWith('No ');
  const wc = wordCount(content);

  const handleRegenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRegenerating(true);
    setRegenError("");
    try {
      const res = await fetch("/api/regenerate-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, docType: { businessProfile: "businessProfile", marketResearch: "marketResearch", strategy: "socialStrategy" }[meta.key] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      onRegenerate(meta.key, data.content);
    } catch (err: any) {
      setRegenError(err.message || "Failed");
      setTimeout(() => setRegenError(""), 4000);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className={`flex items-start gap-4 border transition-all rounded-2xl px-5 py-4 group ${
      !hasContent
        ? "bg-[#FFFBEB] border-[#FDE68A] hover:border-[#F59E0B] hover:shadow-sm"
        : "bg-[#FAFBFC] border-[#F4F4F5] hover:border-[#E5E7EB] hover:shadow-sm"
    }`}>
      {/* Icon */}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 mt-0.5" style={{ backgroundColor: meta.bgColor }}>
        <meta.Icon style={{ color: meta.color }} size={18} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 cursor-pointer" onClick={onOpen}>
          <span className="text-[14px] font-semibold text-[#111111] group-hover:text-[#2563EB] transition-colors">{meta.label}</span>
          {!hasContent && (
            <span className="text-[11px] font-medium text-[#F59E0B] bg-[#FEF9C3] px-2 py-0.5 rounded-full border border-[#FDE68A]">Empty</span>
          )}
          {hasContent && (
            <span className="text-[11px] font-medium text-[#15803D] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
              {wc.toLocaleString()} words
            </span>
          )}
        </div>
        <p className="text-[12px] text-[#A1A1AA] mt-0.5 truncate">{meta.description}</p>

        {/* Empty state CTA */}
        {!hasContent && (
          <div className="mt-3">
            {regenError ? (
              <p className="text-[12px] text-red-500 font-medium">{regenError}</p>
            ) : (
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold bg-[#F59E0B] text-white hover:bg-[#D97706] disabled:opacity-60 transition-colors shadow-sm"
              >
                {regenerating ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</>
                ) : (
                  <><Sparkles className="w-3 h-3" /> Generate with AI</>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions (visible on hover) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={onOpen}
          className="p-2 rounded-full text-[#71717A] hover:text-[#2563EB] hover:bg-[#EEF2FF] transition-colors"
          title="Open"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {hasContent && (
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="p-2 rounded-full text-[#71717A] hover:text-[#7C3AED] hover:bg-[#F5F3FF] transition-colors disabled:opacity-50"
            title="Regenerate with AI"
          >
            {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        )}
        {!confirmDelete ? (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            className="p-2 rounded-full text-[#71717A] hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-full px-3 py-1 animate-in fade-in duration-150">
            <span className="text-[11px] font-semibold text-red-600">Delete?</span>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); setConfirmDelete(false); }} className="text-[11px] font-bold text-red-600 hover:text-red-800">Yes</button>
            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }} className="text-[11px] font-semibold text-[#71717A]">No</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main board content
// ─────────────────────────────────────────────
// Maps board key → regenerate-doc API docType
const REGEN_API_TYPE: Record<DocKey, string> = {
  businessProfile: "businessProfile",
  marketResearch: "marketResearch",
  strategy: "socialStrategy",
};

function isDocEmpty(content: string) {
  return !content || !content.trim() || content.startsWith("No ");
}

function BoardContent() {
  const [dna, setDna] = useState<Record<string, any> | null>(null);
  const [docs, setDocs] = useState<BrandDocuments | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("All");
  const [activeDoc, setActiveDoc] = useState<DocMeta | null>(null);
  const [autoBuilding, setAutoBuilding] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const id = searchParams.get('id');
    setBusinessId(id);
    if (!id) return;

    const fetchBusiness = async () => {
      try {
        const res = await fetch(`/api/get-business?id=${id}`);
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();

        const enriched = data.enriched_data || {};
        const guidelines = data.brand_guidelines || {};

        setDna({
          brandName: data.business_name,
          logoUrl: guidelines.logos?.[0]?.url || "",
          colors: {
            primary: guidelines.colors?.[0]?.hex || "#C4CE83",
            secondary: guidelines.colors?.[1]?.hex || "#FAFAFA",
            background: guidelines.colors?.[2]?.hex || "#FFFFFF",
            textHighContrast: "#111111",
            accent: guidelines.colors?.[3]?.hex || "#99EB00",
          },
          typography: {
            headingFont: guidelines.typography?.[0]?.family || "Inter",
            bodyFont: guidelines.typography?.[1]?.family || "sans-serif",
          },
          tagline: enriched.tagline || "",
          brandValue: (enriched.brandValues || []).join(", "),
          brandAesthetic: enriched.brandAesthetic || "",
          toneOfVoice: enriched.brandTone || "",
          businessOverview: enriched.businessOverview || "",
          images: cleanImageList(guidelines.images || data.scraped_data?.images?.map((img: any) => img.url) || []),
        });

        const freshDocs: BrandDocuments = {
          strategy: data.social_strategy || "",
          marketResearch: data.market_research || "",
          businessProfile: data.business_profile || "",
        };
        setDocs(freshDocs);

        // Auto-generate any empty documents from the knowledge base
        const emptyKeys = (Object.keys(freshDocs) as DocKey[]).filter(k => isDocEmpty(freshDocs[k]));
        if (emptyKeys.length > 0) {
          setAutoBuilding(true);
          Promise.all(
            emptyKeys.map(async (key) => {
              try {
                const r = await fetch("/api/regenerate-doc", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ businessId: id, docType: REGEN_API_TYPE[key] }),
                });
                const d = await r.json();
                if (r.ok && d.content) {
                  setDocs(prev => prev ? { ...prev, [key]: d.content } : prev);
                }
              } catch (e) {
                console.error(`Auto-regen failed for ${key}:`, e);
              }
            })
          ).finally(() => setAutoBuilding(false));
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetchBusiness();
  }, [searchParams, router]);

  const handleDocSave = useCallback((key: DocKey, newContent: string) => {
    setDocs(prev => prev ? { ...prev, [key]: newContent } : prev);
  }, []);

  const handleDocDelete = useCallback((key: DocKey) => {
    setDocs(prev => prev ? { ...prev, [key]: '' } : prev);
  }, []);

  const handleDocDeleteFromCard = useCallback(async (key: DocKey, dbField: string) => {
    if (!businessId) return;
    try {
      await fetch('/api/update-business', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: businessId, field: dbField, content: '' }),
      });
      setDocs(prev => prev ? { ...prev, [key]: '' } : prev);
    } catch (e) {
      console.error(e);
    }
  }, [businessId]);

  if (!businessId) {
    return (
      <div className="flex-1 min-h-screen bg-[#FAFBFC] flex flex-col items-center justify-center gap-4">
        <p className="text-[15px] text-[#71717A]">No knowledge base selected.</p>
        <button onClick={() => router.push('/')} className="px-6 py-2.5 rounded-full bg-[#111111] text-white text-[14px] font-semibold hover:bg-[#27272A] transition-colors">
          ← Analyse a website
        </button>
      </div>
    );
  }

  if (!dna || !docs) {
    return (
      <div className="flex-1 min-h-screen bg-[#FAFBFC] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#3B82F6]" />
      </div>
    );
  }

  const activeDocMeta = activeDoc ? DOC_META.find(d => d.key === activeDoc.key) ?? null : null;

  return (
    <div className="flex-1 bg-[#FAFBFC] text-[#111111] font-sans overflow-x-hidden selection:bg-[#EFF6FF] relative w-full pt-10 px-8 pb-32">
      <div className="max-w-[960px] w-full mx-auto flex flex-col items-center">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-full overflow-hidden border border-[#E5E7EB] shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://ui-avatars.com/api/?name=L+K&background=FDBA74&color=fff" alt="Lora" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-[22px] font-bold text-[#111111] leading-none">Lora Knowledge Base</h1>
            {dna.brandName && <p className="text-[13px] text-[#A1A1AA] mt-1">{dna.brandName}</p>}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-8 bg-white border border-[#E5E7EB] rounded-full p-1 shadow-sm flex-wrap">
          {["All", "Documents", "Visual Assets", "Brand Guidelines"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-full text-[14px] font-semibold transition-colors flex items-center gap-1.5 ${activeTab === tab ? 'bg-[#EEF2FF] text-[#2563EB]' : 'text-[#71717A] hover:bg-gray-50 hover:text-[#111111]'}`}
            >
              {tab === "Visual Assets" && <ImageIcon className="w-3.5 h-3.5" />}
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="w-full flex flex-col gap-8 pb-10">

          {/* ── Documents Block ── */}
          {(activeTab === "All" || activeTab === "Documents") && (
            <div className="bg-white rounded-[24px] p-6 lg:p-8 w-full shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#F4F4F5] animate-in fade-in zoom-in-95 duration-300">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-[17px] font-bold text-[#111111]">Documents</h2>
                  <p className="text-[13px] text-[#A1A1AA] mt-0.5">AI-generated knowledge files — click to view, edit or delete</p>
                </div>
                {autoBuilding ? (
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-[#7C3AED] bg-[#F5F3FF] px-3 py-1.5 rounded-full">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Building from knowledge base…
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[12px] text-[#A1A1AA] font-medium bg-[#F4F4F5] px-3 py-1.5 rounded-full">
                    <FileText className="w-3.5 h-3.5" />
                    {DOC_META.length} files
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {DOC_META.map((meta) => (
                  <DocCard
                    key={meta.key}
                    meta={meta}
                    content={docs[meta.key]}
                    businessId={businessId!}
                    onOpen={() => setActiveDoc(meta)}
                    onDelete={() => handleDocDeleteFromCard(meta.key, meta.dbField)}
                    onRegenerate={(key, newContent) => setDocs(prev => prev ? { ...prev, [key]: newContent } : prev)}
                  />
                ))}
              </div>

              {/* Stage legend */}
              <div className="mt-6 pt-5 border-t border-[#F4F4F5] grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-md bg-[#EEF2FF] flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-[#2563EB]">1</span>
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-[#111111]">Website Scraping</p>
                    <p className="text-[11px] text-[#A1A1AA]">Business name, images, logos, colors, typography</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-md bg-[#F0FDF4] flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-[#15803D]">2</span>
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-[#111111]">LLM Enrichment</p>
                    <p className="text-[11px] text-[#A1A1AA]">Business overview, brand values, aesthetic, tone, tagline</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Visual Assets Block ── */}
          {(activeTab === "All" || activeTab === "Visual Assets") && (
            <div className="bg-white rounded-[24px] p-6 lg:p-8 w-full shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#F4F4F5] animate-in fade-in zoom-in-95 duration-300">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-[17px] font-bold text-[#111111]">Visual Assets</h2>
                  <p className="text-[13px] text-[#A1A1AA] mt-0.5">Brand images stored in Supabase — hover to inspect, click to expand or download</p>
                </div>
                <div className="text-[12px] font-semibold text-[#7C3AED] bg-[#F5F3FF] px-3 py-1.5 rounded-full flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" />
                  {(dna?.images || []).length} assets
                </div>
              </div>
              <VisualAssetGallery
                images={dna?.images || []}
                colors={[
                  { name: 'Primary',    hex: dna?.colors?.primary    || '', usage: 'primary' },
                  { name: 'Secondary',  hex: dna?.colors?.secondary  || '', usage: 'secondary' },
                  { name: 'Background', hex: dna?.colors?.background || '', usage: 'background' },
                  { name: 'Accent',     hex: dna?.colors?.accent     || '', usage: 'accent' },
                ]}
                brandName={dna?.brandName}
              />
            </div>
          )}

          {/* ── Brand Guidelines Block ── */}
          {(activeTab === "All" || activeTab === "Brand Guidelines") && (
            <div className="bg-white rounded-[24px] p-6 lg:p-8 w-full shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#F4F4F5] animate-in fade-in zoom-in-95 duration-300">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-[17px] font-bold text-[#111111]">Brand Guidelines</h2>
                  <p className="text-[13px] text-[#A1A1AA] mt-0.5">Images, logos, colors, typography, tagline, values, aesthetic, tone & overview</p>
                </div>
              </div>
              <BrandBoard initialDna={dna} />
            </div>
          )}
        </div>

        {/* Bottom Action Footer */}
        <div className="fixed bottom-0 left-[260px] right-0 bg-white border-t border-[#E5E7EB] py-4 px-10 flex items-center justify-between z-30 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
          <span className="text-[#71717A] text-[14px] font-medium tracking-wide">
            Next we&apos;ll use your Knowledge Base to generate social media campaigns
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (confirm("Are you sure you want to reset your Knowledge Base?")) {
                  localStorage.removeItem("brandDna");
                  localStorage.removeItem("approvedBusinessId");
                  router.push("/");
                }
              }}
              className="px-6 py-2.5 rounded-xl font-semibold text-[14px] text-[#A1A1AA] hover:text-[#111111] hover:bg-gray-100 transition-colors"
            >
              Reset
            </button>
            <button
              onClick={async () => {
                if (!businessId || !docs) return;
                try {
                  // Persist all KB documents to the backend database
                  const savePromises = DOC_META.map(meta => {
                    const content = docs[meta.key];
                    if (!content || !content.trim()) return Promise.resolve();
                    return fetch("/api/update-business", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        id: businessId,
                        field: meta.dbField,
                        content,
                      }),
                    });
                  });

                  // Also persist brand_memory if we have brand DNA
                  if (dna) {
                    savePromises.push(
                      fetch("/api/update-business", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          id: businessId,
                          field: "brand_guidelines",
                          content: {
                            colors: [
                              { hex: dna.colors?.primary, usage: "primary" },
                              { hex: dna.colors?.secondary, usage: "secondary" },
                              { hex: dna.colors?.background, usage: "background" },
                              { hex: dna.colors?.accent, usage: "accent" },
                            ].filter(c => c.hex),
                            typography: [
                              { family: dna.typography?.headingFont, usage: "headings" },
                              { family: dna.typography?.bodyFont, usage: "body" },
                            ].filter(t => t.family),
                            images: dna.images || [],
                          },
                        }),
                      })
                    );
                  }

                  await Promise.all(savePromises);
                  localStorage.setItem("approvedBusinessId", businessId);
                  router.push(`/chat?id=${businessId}`);
                } catch (err) {
                  console.error("Failed to save Knowledge Base:", err);
                  alert("Failed to save. Please try again.");
                }
              }}
              className="bg-[#2563EB] text-white px-8 py-2.5 rounded-xl font-semibold text-[14px] hover:bg-[#1D4ED8] shadow-md transition-colors shadow-blue-500/20 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Document Modal */}
      {activeDocMeta && businessId && (
        <DocModal
          meta={activeDocMeta}
          content={docs[activeDocMeta.key]}
          businessId={businessId}
          onSave={handleDocSave}
          onDelete={handleDocDelete}
          onClose={() => setActiveDoc(null)}
        />
      )}
    </div>
  );
}

export default function BoardPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 min-h-screen bg-[#FAFBFC] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#3B82F6]" />
      </div>
    }>
      <BoardContent />
    </Suspense>
  );
}

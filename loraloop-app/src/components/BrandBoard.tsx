"use client";

import { useState } from "react";
import { Link, Pencil, X, Image as ImageIcon, Camera, RotateCcw, Dna } from "lucide-react";
import ColorPickerModal from "./ColorPickerModal";
import FontPickerModal from "./FontPickerModal";
import BusinessNameModal from "./BusinessNameModal";
import LogoModal from "./LogoModal";
import ConfirmationModal from "./ConfirmationModal";
import ImageLightboxModal from "./ImageLightboxModal";
import TagsModal from "./TagsModal";

interface BrandDna {
  brandName: string;
  logoUrl: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    textHighContrast: string;
    accent: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
  };
  tagline?: string;
  brandValue?: string;
  brandAesthetic?: string;
  toneOfVoice?: string;
  businessOverview?: string;
  images?: string[];
}

const formatPills = (str?: string) => str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function BrandBoard({ initialDna }: { initialDna: any }) {
  const [dna, setDna] = useState<BrandDna>(initialDna as BrandDna);
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);
  const [isFontModalOpen, setIsFontModalOpen] = useState(false);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [deleteImageIndex, setDeleteImageIndex] = useState<number | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Scraper state
  const [isScraperOpen, setIsScraperOpen] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<{ total: number; raw: number } | null>(null);
  const [scrapeError, setScrapeError] = useState("");
  const [showAllImages, setShowAllImages] = useState(false);

  const handleScrapeImages = async () => {
    if (!scrapeUrl.trim()) { setScrapeError("Please enter a URL."); return; }
    setIsScraping(true); setScrapeError(""); setScrapeResult(null);
    try {
      const res = await fetch("/api/scrape-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: scrapeUrl }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setScrapeError(data.error || "Scrape failed"); return; }
      // Merge new images with existing, deduplicate
      const incoming: string[] = data.images || [];
      setDna(prev => ({
        ...prev,
        images: [...new Set([...incoming, ...(prev.images || [])])].slice(0, 80),
      }));
      setScrapeResult({ total: data.total, raw: data.raw });
      setShowAllImages(false);
    } catch (err: any) {
      setScrapeError(err.message || "Network error");
    } finally {
      setIsScraping(false);
    }
  };
  
  // Tags Modal State
  const [tagsModalConfig, setTagsModalConfig] = useState<{
    isOpen: boolean;
    field: "brandValue" | "brandAesthetic" | "toneOfVoice" | null;
    title: string;
    subtitle: string;
    placeholder: string;
    initialTags: string[];
  }>({ isOpen: false, field: null, title: "", subtitle: "", placeholder: "", initialTags: [] });

  // Fallback for simple text fields
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleTextChange = (key: keyof BrandDna, value: string) => {
    setDna((prev) => ({ ...prev, [key]: value }));
  };

  const openEditor = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const saveEdit = () => {
    if (editingField) {
      handleTextChange(editingField as keyof BrandDna, editValue);
    }
    setEditingField(null);
  };

  const handleResetDna = () => {
    localStorage.removeItem("brandDna");
    window.location.href = "/";
  };

  const colors = dna.colors || {
    primary: "#ffffff",
    secondary: "#aaaaaa",
    background: "#000000",
    textHighContrast: "#ffffff",
    accent: "#cccccc"
  };

  return (
    <div className="w-full relative flex flex-col h-[650px]">
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 flex-1 min-h-0">

        {/* ═══════ COLUMN 1: Brand Info (Left Scrollable) ═══════ */}
        <div className="flex flex-col gap-4 lg:gap-5 flex-1 min-w-0 pr-2 overflow-y-auto scrollbar-thin pb-10">

          {/* Brand Name + URL */}
          <div 
            className="w-full bg-[#FAFAFA] rounded-[24px] p-6 lg:p-8 flex flex-col justify-center min-h-[140px] relative group cursor-pointer hover:ring-1 hover:ring-[#C4CE83] transition-all shrink-0 border border-transparent hover:border-[#C4CE83]"
            onClick={() => setIsNameModalOpen(true)}
          >
            <div className="text-2xl lg:text-[28px] font-bold text-[#111111] mb-3 w-full pr-10 tracking-tight leading-tight break-words">
              {dna.brandName || "Unknown Brand"}
            </div>
            <div className="flex items-center text-[14px] text-[#A1A1AA] gap-2 font-medium">
              <Link className="w-4 h-4" />
              <span>{dna.brandName ? `https://${dna.brandName.toLowerCase().replace(/\s+/g, '')}.com/` : "https://loraloop.com/"}</span>
            </div>
            <div className="absolute top-5 right-5 bg-white shadow-sm border border-[#E5E7EB] rounded-full p-2 text-[#C4CE83] opacity-0 group-hover:opacity-100 transition-opacity">
              <Pencil className="w-4 h-4" />
            </div>
          </div>

          {/* Logo + Fonts side-by-side */}
          <div className="grid grid-cols-2 gap-4 lg:gap-5 shrink-0">
            {/* Logo */}
            <div 
              className="bg-[#FAFAFA] rounded-[24px] p-6 flex flex-col items-center justify-center aspect-[4/3] relative overflow-hidden group cursor-pointer hover:ring-1 hover:ring-[#C4CE83] transition-all border border-transparent hover:border-[#C4CE83]"
              onClick={() => setIsLogoModalOpen(true)}
            >
              {dna.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dna.logoUrl} alt="Logo" className="w-[80%] max-h-[80%] object-contain relative z-0 mix-blend-multiply" />
              ) : (
                <div className="text-[#A1A1AA] flex flex-col items-center justify-center gap-2 h-full">
                  <ImageIcon className="w-8 h-8 opacity-50" />
                  <span className="text-xs font-medium uppercase tracking-widest">No Logo</span>
                </div>
              )}
              <div className="absolute top-4 right-4 bg-white shadow-sm border border-[#E5E7EB] rounded-full p-2 text-[#C4CE83] opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <Pencil className="w-4 h-4" />
              </div>
            </div>

            {/* Fonts */}
            <div 
              className="bg-[#FAFAFA] rounded-[24px] p-6 flex flex-col aspect-[4/3] relative cursor-pointer hover:ring-1 hover:ring-[#C4CE83] transition-all group border border-transparent hover:border-[#C4CE83]"
              onClick={() => setIsFontModalOpen(true)}
            >
              <div className="text-[14px] font-bold text-[#111111]">Fonts</div>
              <div className="flex-1 flex items-center justify-center relative -mt-2">
                <div className="flex flex-col items-center justify-center w-full">
                  <div className="text-6xl lg:text-[72px] text-[#41A511] font-serif leading-none tracking-tight group-hover:scale-105 transition-transform" style={{ fontFamily: dna.typography?.headingFont, color: dna.colors?.primary || '#41A511' }}>Aa</div>
                  <div className="text-[13px] font-bold text-center text-[#111111] w-full mt-4 truncate tracking-wide">
                     {dna.typography?.headingFont || "Londrina Solid"}
                  </div>
                </div>
              </div>
              <div className="absolute top-4 right-4 bg-white shadow-sm border border-[#E5E7EB] rounded-full p-2 text-[#C4CE83] opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <Pencil className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Colors */}
          <div className="bg-[#FAFAFA] border border-transparent hover:border-[#C4CE83] rounded-[24px] p-6 lg:p-8 flex flex-col cursor-pointer transition-all group relative" onClick={() => setIsColorModalOpen(true)}>
             <div className="text-[14px] font-bold text-[#111111] mb-5">Colors</div>
             <div className="flex items-center gap-4">
                {Object.entries(colors).slice(0, 4).map(([key, hex], i) => (
                   <div key={i} className="w-12 h-12 rounded-full shadow-sm flex items-center justify-center shrink-0 border border-black/5 hover:scale-110 transition-transform" style={{ backgroundColor: hex as string }} title={`${key}: ${hex}`} />
                ))}
             </div>
             <div className="absolute top-5 right-5 bg-white shadow-sm border border-[#E5E7EB] rounded-full p-2 text-[#C4CE83] opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <Pencil className="w-4 h-4" />
             </div>
          </div>

          <div className="text-[12px] font-bold text-[#A1A1AA] mt-4 mb-2 tracking-wider">
             ADDITIONAL BRAND DATA
          </div>

          <div className="flex flex-col gap-4 lg:gap-5">
              
              {/* Business Overview (First block) */}
              <div 
                className="bg-[#FAFAFA] border border-transparent hover:border-[#C4CE83] rounded-[24px] p-6 lg:p-8 cursor-pointer group relative transition-all w-full"
                onClick={() => {
                  setEditingField("businessOverview");
                  setEditValue(dna.businessOverview || "");
                }}
              >
                  <div className="text-[14px] font-bold text-[#111111] mb-3">Business overview</div>
                  <div className="text-[15px] leading-relaxed text-[#3F3F46] pr-6">
                     {dna.businessOverview || "Your business overview..."}
                  </div>
                  <div className="absolute top-5 right-5 bg-white shadow-sm border border-[#E5E7EB] rounded-full p-2 text-[#C4CE83] opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <Pencil className="w-4 h-4" />
                  </div>
              </div>

              {/* 2x2 Grid for the other elements */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
                  
                  {/* Tagline */}
                  <div 
                    className="bg-[#FAFAFA] border border-transparent hover:border-[#C4CE83] rounded-[24px] p-6 lg:p-8 cursor-pointer group relative transition-all min-h-[160px]"
                    onClick={() => {
                      setEditingField("tagline");
                      setEditValue(dna.tagline || "");
                    }}
                  >
                      <div className="text-[14px] font-bold text-[#111111] mb-4">Tagline</div>
                      <div className="text-[22px] leading-[1.3] text-[#41A511] font-serif pr-4" style={{ fontFamily: dna.typography?.headingFont, color: dna.colors?.primary || '#41A511' }}>
                         {dna.tagline || "Your tagline... "}
                      </div>
                      <div className="absolute top-5 right-5 bg-white shadow-sm border border-[#E5E7EB] rounded-full p-2 text-[#C4CE83] opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <Pencil className="w-4 h-4" />
                      </div>
                  </div>

                  {/* Brand Values */}
                  <div 
                    className="bg-[#FAFAFA] border border-transparent hover:border-[#C4CE83] rounded-[24px] p-6 lg:p-8 cursor-pointer group relative transition-all min-h-[160px]"
                    onClick={() => {
                      setTagsModalConfig({
                        isOpen: true,
                        title: "Brand Values",
                        subtitle: "What are your core brand values?",
                        placeholder: "e.g., Sustainability",
                        initialTags: (dna.brandValue || "").split(",").map((s: string) => s.trim()).filter(Boolean),
                        field: "brandValue"
                      });
                    }}
                  >
                      <div className="text-[14px] font-bold text-[#111111] mb-4">Brand values</div>
                      <div className="flex flex-wrap gap-2.5 pr-4">
                        {(dna.brandValue || "Nutritional Powerhouse, Authentic Heritage")
                          .split(",")
                          .slice(0, 4)
                          .map((val: string, i: number) => (
                            <div key={i} className="px-4 py-2 border border-[#E5E7EB] rounded-[10px] text-[13px] font-semibold text-[#111111] bg-white shadow-sm hover:shadow-md transition-shadow">
                              {val.trim()}
                            </div>
                        ))}
                      </div>
                      <div className="absolute top-5 right-5 bg-white shadow-sm border border-[#E5E7EB] rounded-full p-2 text-[#C4CE83] opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <Pencil className="w-4 h-4" />
                      </div>
                  </div>

                  {/* Brand Aesthetic */}
                  <div 
                    className="bg-[#FAFAFA] border border-transparent hover:border-[#C4CE83] rounded-[24px] p-6 lg:p-8 cursor-pointer group relative transition-all min-h-[160px]"
                    onClick={() => {
                      setTagsModalConfig({
                        isOpen: true,
                        title: "Brand Aesthetic",
                        subtitle: "What is your visual aesthetic?",
                        placeholder: "e.g., modern athleticism",
                        initialTags: (dna.brandAesthetic || "").split(",").map((s: string) => s.trim()).filter(Boolean),
                        field: "brandAesthetic"
                      });
                    }}
                  >
                      <div className="text-[14px] font-bold text-[#111111] mb-4">Brand aesthetic</div>
                      <div className="flex flex-wrap gap-2.5 pr-4">
                        {(dna.brandAesthetic || "bold minimalism, urban heritage")
                          .split(",")
                          .slice(0, 4)
                          .map((val: string, i: number) => (
                            <div key={i} className="px-4 py-2 border border-[#E5E7EB] rounded-[10px] text-[13px] font-semibold text-[#111111] bg-white shadow-sm hover:shadow-md transition-shadow">
                              {val.trim()}
                            </div>
                        ))}
                      </div>
                      <div className="absolute top-5 right-5 bg-white shadow-sm border border-[#E5E7EB] rounded-full p-2 text-[#C4CE83] opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <Pencil className="w-4 h-4" />
                      </div>
                  </div>

                  {/* Tone of Voice */}
                  <div 
                    className="bg-[#FAFAFA] border border-transparent hover:border-[#C4CE83] rounded-[24px] p-6 lg:p-8 cursor-pointer group relative transition-all min-h-[160px]"
                    onClick={() => {
                      setTagsModalConfig({
                        isOpen: true,
                        title: "Tone of Voice",
                        subtitle: "What is your brand's voice?",
                        placeholder: "e.g., Authoritative",
                        initialTags: (dna.toneOfVoice || "").split(",").map((s: string) => s.trim()).filter(Boolean),
                        field: "toneOfVoice"
                      });
                    }}
                  >
                      <div className="text-[14px] font-bold text-[#111111] mb-4">Brand tone of voice</div>
                      <div className="flex flex-wrap gap-2.5 pr-4">
                        {(dna.toneOfVoice || "Motivational, Inspiring")
                          .split(",")
                          .slice(0, 4)
                          .map((val: string, i: number) => (
                            <div key={i} className="px-4 py-2 border border-[#E5E7EB] rounded-[10px] text-[13px] font-semibold text-[#111111] bg-white shadow-sm hover:shadow-md transition-shadow">
                              {val.trim()}
                            </div>
                        ))}
                      </div>
                      <div className="absolute top-5 right-5 bg-white shadow-sm border border-[#E5E7EB] rounded-full p-2 text-[#C4CE83] opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <Pencil className="w-4 h-4" />
                      </div>
                  </div>

              </div>
          </div>

        </div>

        {/* ═══════ COLUMN 2: Images (Right Scrollable) ═══════ */}
        <div className="flex flex-col w-full lg:w-[480px] shrink-0 pr-2 relative overflow-y-auto scrollbar-thin pb-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="text-[16px] font-bold text-[#111111]">Images</div>
              {(dna.images || []).length > 0 && (
                <span className="text-[11px] font-bold bg-[#EAF5CE] text-[#7BA02D] px-2 py-0.5 rounded-full">
                  {(dna.images || []).length}
                </span>
              )}
            </div>
            <button
              onClick={() => setIsScraperOpen(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${isScraperOpen ? 'bg-[#111] text-white' : 'bg-[#EAF5CE] text-[#7BA02D] hover:bg-[#dff2b0]'}`}
            >
              <Camera className="w-3.5 h-3.5" />
              Scrape Website
            </button>
          </div>

          {/* Scraper Panel */}
          {isScraperOpen && (
            <div className="mb-5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[20px] p-5 flex flex-col gap-3">
              <div className="text-[13px] font-bold text-[#111]">Scrape images from website</div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={scrapeUrl}
                  onChange={e => setScrapeUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleScrapeImages(); }}
                  placeholder="https://example.com"
                  className="flex-1 bg-white border border-[#E2E8F0] rounded-xl px-3 py-2 text-[13px] text-[#111] outline-none focus:ring-2 focus:ring-[#C4CE83] placeholder:text-[#A1A1AA]"
                />
                <button
                  onClick={handleScrapeImages}
                  disabled={isScraping}
                  className="bg-[#111] text-white rounded-xl px-4 py-2 text-[12px] font-bold hover:bg-[#27272A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  {isScraping ? (
                    <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />Scraping...</>
                  ) : (
                    <><Camera className="w-3.5 h-3.5" />Scrape</>
                  )}
                </button>
              </div>
              {scrapeError && (
                <div className="text-[12px] text-red-500 font-medium">{scrapeError}</div>
              )}
              {scrapeResult && (
                <div className="text-[12px] text-[#7BA02D] font-bold">
                  ✅ Found {scrapeResult.total} images ({scrapeResult.raw} raw candidates) — added to board
                </div>
              )}
            </div>
          )}

          {/* Images Grid */}
          <div className="grid grid-cols-4 gap-4 flex-1 content-start auto-rows-max">
            {/* Thumbnails */}
            {(showAllImages ? (dna.images || []) : (dna.images || []).slice(0, 15)).map((img, i) => (
              <div
                key={i}
                className="aspect-square bg-[#F4F4F5] rounded-[20px] overflow-hidden relative group/img cursor-pointer shadow-sm border border-[#E5E7EB]"
                onClick={() => setLightboxImage(img)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img}
                  alt=""
                  className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                {/* Hover Delete Button */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-start justify-end p-2">
                  <button
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-white/90 text-[#111111] backdrop-blur hover:bg-white transition-colors"
                    onClick={(e) => { e.stopPropagation(); setDeleteImageIndex(i); }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Show more / less toggle */}
            {(dna.images || []).length > 15 && (
              <button
                onClick={() => setShowAllImages(v => !v)}
                className="aspect-square bg-[#F4F4F5] border border-[#E5E7EB] rounded-[20px] flex flex-col items-center justify-center text-[#A1A1AA] hover:text-[#7BA02D] hover:bg-[#EAF5CE] transition-colors text-[10px] font-bold uppercase tracking-widest gap-1"
              >
                {showAllImages ? '▲ Less' : `+${(dna.images || []).length - 15} More`}
              </button>
            )}

            {/* Empty state */}
            {(dna.images || []).length === 0 && !isScraping && (
              <div className="col-span-4 flex flex-col items-center justify-center py-10 text-[#A1A1AA] gap-3">
                <Camera className="w-10 h-10 opacity-30" />
                <div className="text-[13px] font-medium text-center">No images yet.<br/>Click "Scrape Website" to import brand images.</div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Modals ── */}
      {tagsModalConfig.isOpen && (
        <TagsModal 
          title={tagsModalConfig.title}
          subtitle={tagsModalConfig.subtitle}
          placeholder={tagsModalConfig.placeholder}
          initialTags={tagsModalConfig.initialTags}
          onApply={(tags) => {
            if (tagsModalConfig.field) {
              setDna(prev => ({ ...prev, [tagsModalConfig.field as string]: tags.join(", ") }));
            }
            setTagsModalConfig({ ...tagsModalConfig, isOpen: false });
          }}
          onClose={() => setTagsModalConfig({ ...tagsModalConfig, isOpen: false })}
        />
      )}

      {editingField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-[#E5E7EB] shadow-[0_2px_12px_rgba(0,0,0,0.03)] rounded-3xl p-6 lg:p-8 w-full max-w-md relative">
            <button onClick={() => setEditingField(null)} className="absolute top-5 right-5 text-gray-400 hover:text-black p-1.5 rounded-full hover:bg-gray-100 transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-black mb-1 capitalize">
              {editingField.replace(/([A-Z])/g, ' $1').trim()}
            </h3>
            <p className="text-[14px] text-gray-500 mb-5">Edit or add comma-separated values.</p>
            <textarea 
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full bg-[#FAFAFA] border border-[#E5E7EB] rounded-xl p-4 text-black text-[15px] outline-none focus:ring-2 focus:ring-[#3B82F6] min-h-[140px] resize-none"
              placeholder="Type here..."
            />
            <div className="flex justify-end mt-5">
               <button 
                 onClick={saveEdit}
                 className="bg-[#111111] text-white hover:bg-[#27272A] px-6 py-2.5 rounded-full font-semibold transition-colors text-[14px]"
               >
                 Apply
               </button>
            </div>
          </div>
        </div>
      )}

      {isColorModalOpen && (
        <ColorPickerModal 
          initialColors={Object.values(colors).slice(0, 4)} 
          onApply={(newColors) => {
            setDna(prev => ({
              ...prev,
              colors: {
                primary: newColors[0] || prev.colors.primary,
                secondary: newColors[1] || prev.colors.secondary,
                background: newColors[2] || prev.colors.background,
                textHighContrast: newColors[3] || prev.colors.textHighContrast,
                accent: prev.colors.accent
              }
            }));
            setIsColorModalOpen(false);
          }}
          onClose={() => setIsColorModalOpen(false)}
        />
      )}

      {isFontModalOpen && (
        <FontPickerModal 
          initialHeadingFont={dna.typography?.headingFont || "Arial"}
          initialBodyFont={dna.typography?.bodyFont || "Arial"}
          onApply={(heading, body) => {
            setDna(prev => ({
              ...prev,
              typography: {
                headingFont: heading,
                bodyFont: body
              }
            }));
            setIsFontModalOpen(false);
          }}
          onClose={() => setIsFontModalOpen(false)}
        />
      )}

      {isNameModalOpen && (
        <BusinessNameModal 
          initialName={dna.brandName || "Unknown Brand"}
          onApply={(name) => {
            setDna(prev => ({ ...prev, brandName: name }));
            setIsNameModalOpen(false);
          }}
          onClose={() => setIsNameModalOpen(false)}
        />
      )}

      {isLogoModalOpen && (
        <LogoModal 
          initialLogoUrl={dna.logoUrl}
          onApply={(newUrl) => {
            setDna(prev => ({ ...prev, logoUrl: newUrl }));
            setIsLogoModalOpen(false);
          }}
          onClose={() => setIsLogoModalOpen(false)}
        />
      )}

      {isResetConfirmOpen && (
        <ConfirmationModal
          title="Reset Business DNA?"
          description="Resetting your DNA will permanently delete all campaigns and creatives. You can't retrieve them."
          confirmLabel="Reset"
          isDestructive={true}
          onConfirm={() => {
            // Actual reset logic would clear state and maybe redirect
            handleResetDna();
            setIsResetConfirmOpen(false);
          }}
          onClose={() => setIsResetConfirmOpen(false)}
        />
      )}

      {deleteImageIndex !== null && (
        <ConfirmationModal
          title="Delete image?"
          description="Are you sure you want to delete this image? It will be removed from your DNA."
          confirmLabel="Delete"
          isDestructive={true}
          onConfirm={() => {
            if (deleteImageIndex !== null) {
              const newImages = [...(dna.images || [])];
              newImages.splice(deleteImageIndex, 1);
              setDna(prev => ({ ...prev, images: newImages }));
            }
          }}
          onClose={() => setDeleteImageIndex(null)}
        />
      )}

      {lightboxImage && (
        <ImageLightboxModal 
          imageUrl={lightboxImage}
          onClose={() => setLightboxImage(null)}
        />
      )}

    </div>
  );
}

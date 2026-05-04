"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Paperclip, ArrowUp, X, Square, Sparkles, Image as LucideImage, Settings } from "lucide-react";
import PlatformPreview from "../../components/social/PlatformPreview";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  widget?: "social-post" | "image-result";
  widgetData?: any;
  imagePreview?: string; // base64 thumbnail for user messages with images
}

type UIAction = "idle" | "generating" | "error" | "cancelled";

const SUGGESTIONS = [
  "Find top 10 trending topic in your niche",
  "Create next 10 posts idea",
  "Create Instagram next post topic",
];

export default function ChatPage() {
  const searchParams = useSearchParams();
  const paramBusinessId = searchParams.get("id");

  const [resolvedBusinessId, setResolvedBusinessId] = useState<string | null>(paramBusinessId);
  const businessId = resolvedBusinessId;

  // If no ?id= in URL, auto-detect the most recent business
  useEffect(() => {
    if (paramBusinessId) {
      setResolvedBusinessId(paramBusinessId);
      return;
    }
    // Try to find the latest business
    fetch("/api/get-all-businesses")
      .then(res => res.json())
      .then(data => {
        const businesses = data.businesses || [];
        if (businesses.length > 0) {
          setResolvedBusinessId(businesses[0].id);
        }
      })
      .catch(() => { /* no businesses — that's ok */ });
  }, [paramBusinessId]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [uiAction, setUiAction] = useState<UIAction>("idle");
  const [isLoaded, setIsLoaded] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null); // base64
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Persist & restore chat history ──
  useEffect(() => {
    if (businessId) {
      const saved = localStorage.getItem(`chat_history_${businessId}`);
      if (saved) {
        try { setMessages(JSON.parse(saved)); } catch { /* ignore */ }
      }
    }
    setIsLoaded(true);
  }, [businessId]);

  useEffect(() => {
    if (!isLoaded || !businessId) return;
    if (messages.length > 0) {
      // Strip base64 image data before saving — it's too large for localStorage
      const lightweight = messages.map(m => ({
        ...m,
        imagePreview: m.imagePreview ? "📷" : undefined, // replace base64 with flag
        widgetData: m.widgetData ? {
          ...m.widgetData,
          // Keep URLs but strip any accidental base64 blobs from widget images
          images: (m.widgetData.images || []).map((img: string) =>
            img.startsWith("data:") ? "📷" : img
          ),
        } : undefined,
      }));
      try {
        localStorage.setItem(`chat_history_${businessId}`, JSON.stringify(lightweight));
      } catch (e) {
        // If still over quota, keep only last 20 messages
        console.warn("localStorage quota exceeded, trimming history");
        try {
          const trimmed = lightweight.slice(-20);
          localStorage.setItem(`chat_history_${businessId}`, JSON.stringify(trimmed));
        } catch {
          // Last resort: clear this chat history
          localStorage.removeItem(`chat_history_${businessId}`);
        }
      }
    } else {
      localStorage.removeItem(`chat_history_${businessId}`);
    }
  }, [messages, isLoaded, businessId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, uiAction, scrollToBottom]);

  // ── Image upload handler ──
  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setUploadedImage(base64);
      setUploadedImagePreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Clipboard paste handler (Ctrl+V / Cmd+V) ──
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) processImageFile(file);
        return;
      }
    }
    // If no image found, let the default text paste through
  }, []);

  // ── Drag and drop handler ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      processImageFile(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const clearUploadedImage = () => {
    setUploadedImage(null);
    setUploadedImagePreview(null);
  };

  // ── Cancel / Stop Generating ──
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUiAction("idle");
    // Keep uploaded image in memory for retry
  };

  // ── Core Send Handler ──
  const handleSend = async (text: string) => {
    if (!text.trim() && !uploadedImage) return;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Add user message (with image preview if present)
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      imagePreview: uploadedImagePreview || undefined,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setUiAction("generating");

    const currentImage = uploadedImage;
    clearUploadedImage();

    try {
      // ── STEP 1: Payload Validation ──
      // If an image is uploaded, validate it against the Brand Knowledge Base
      let validatedPrompt = text;
      let imageValidation: any = null;

      if (currentImage && businessId) {
        const valRes = await fetch("/api/validate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId,
            imageBase64: currentImage,
            userText: text,
          }),
          signal: abortController.signal,
        });
        imageValidation = await valRes.json();
        validatedPrompt = imageValidation.validated_prompt || text;

        // If image is off-brand, notify user and auto-apply brand constraints
        if (imageValidation.image_payload?.status === "rejected" || imageValidation.image_payload?.status === "requires_restyling") {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: "assistant",
            content: `🔄 **Auto-restyling image** (Brand Alignment: ${imageValidation.image_payload.brand_alignment_score}/10)\n\n${imageValidation.image_payload.reasoning}\n\nApplying brand constraints automatically to align with your brand guidelines...`,
          }]);
        }
      }

      // ── STEP 2: Intent Routing ──
      const lower = text.toLowerCase();

      if (lower.includes("post") || lower.includes("instagram") || lower.includes("social") || lower.includes("create")) {

        // Step 1-4: Campaign Analysis + Caption + Image Concept
        setMessages(prev => [...prev, {
          id: `step_${Date.now()}`,
          role: "assistant",
          content: "🔍 **Step 1/4** — Analyzing campaign context & fetching brand guidelines...",
        }]);

        const postRes = await fetch("/api/generate-post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId,
            prompt: validatedPrompt,
            mediaType: lower.includes("tiktok") ? "TikTok video"
              : lower.includes("linkedin") ? "LinkedIn post"
              : lower.includes("twitter") || lower.includes(" x ") ? "X/Twitter post"
              : "Instagram image",
          }),
          signal: abortController.signal,
        });
        const postData = await postRes.json();
        if (postData.error) throw new Error(postData.error);

        // Show campaign analysis
        const analysis = postData.campaign_analysis || {};
        setMessages(prev => {
          const filtered = prev.filter(m => !m.id.startsWith("step_"));
          return [...filtered, {
            id: `step_${Date.now()}`,
            role: "assistant",
            content: `✅ **Campaign Analyzed**\n\n` +
              `📋 **Theme:** ${analysis.theme || "General"}\n` +
              `🎯 **Strategic Angle:** ${analysis.strategic_angle || "Brand awareness"}\n` +
              `🖼️ **Image Concept:** ${postData.image_concept?.description || "Generating..."}\n\n` +
              `🎨 Now generating brand-consistent visual...`,
          }];
        });

        // Step 5: Use brand image from KB or generate AI image as fallback
        let imageUrl = "";
        
        if (postData.use_brand_image && postData.selected_brand_image) {
          // PREFER scraped brand images from the knowledge base
          imageUrl = postData.selected_brand_image;
          console.log("[chat] Using scraped brand image:", imageUrl.slice(0, 80));
        } else {
          // FALLBACK: Generate AI image only when no brand images are available
          try {
            const imageRes = await fetch("/api/generate-media", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: postData.image_prompt, type: "image", businessId }),
              signal: abortController.signal,
            });
            const imageData = await imageRes.json();
            if (imageData.mediaUrl) imageUrl = imageData.mediaUrl;
          } catch (imgErr: any) {
            if (imgErr.name === "AbortError") throw imgErr;
            console.warn("Image generation failed, using brand image fallback:", imgErr);
            imageUrl = postData.heroImage || (postData.brandImages || [])[0] || "";
          }
        }

        // Build the full caption
        const fullCaption = [
          postData.hook || "",
          "",
          postData.caption || "",
          "",
          postData.cta ? `👉 ${postData.cta}` : "",
          "",
          (postData.hashtags || []).join(" "),
        ].filter(Boolean).join("\n");

        // Step 6: Final output with consistency score
        const score = postData.consistency_score || 0;
        const scoreEmoji = score >= 85 ? "🟢" : score >= 60 ? "🟡" : "🔴";

        setMessages(prev => {
          const filtered = prev.filter(m => !m.id.startsWith("step_"));
          return [...filtered, {
            id: Date.now().toString(),
            role: "assistant",
            content: `Here's your brand-consistent post for **${postData.brandName || "your brand"}**:\n\n` +
              `${scoreEmoji} **Brand Consistency Score: ${score}/100**\n\n` +
              `📋 **Campaign:** ${analysis.theme || "General"}\n` +
              `🎯 **Strategy:** ${analysis.strategic_angle || "Brand awareness"}\n\n` +
              `✍️ **Hook:** ${postData.hook || "N/A"}\n` +
              `📝 **Caption:** ${(postData.caption || "").slice(0, 120)}${(postData.caption || "").length > 120 ? "..." : ""}\n` +
              `👉 **CTA:** ${postData.cta || "N/A"}\n` +
              `#️⃣ **Hashtags:** ${(postData.hashtags || []).join(" ")}`,
            widget: "social-post",
            widgetData: {
              content: fullCaption,
              images: imageUrl ? [imageUrl] : (postData.brandImages || []).slice(0, 1),
              platforms: ["instagram-1", "facebook-1", "linkedin-1", "x-1", "youtube-1", "tiktok-1"],
              caption: postData.caption,
              cta: postData.cta,
              hashtags: postData.hashtags,
              hook: postData.hook,
              headline: postData.headline,
              subtitle: postData.subtitle,
              consistencyScore: score,
            }
          }];
        });

      } else if (lower.includes("image") || lower.includes("photo") || lower.includes("picture") || lower.includes("steve")) {
        const imageRes = await fetch("/api/generate-media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: validatedPrompt, type: "image", businessId }),
          signal: abortController.signal,
        });
        const imageData = await imageRes.json();

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: "assistant",
          content: "Here is the visual asset you requested. I used our latest high-fidelity models to generate this.",
          widget: "image-result",
          widgetData: { url: imageData.mediaUrl }
        }]);

      } else {
        // Generic Text Generation
        const contentRes = await fetch("/api/generate-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId, prompt: validatedPrompt }),
          signal: abortController.signal,
        });
        const contentData = await contentRes.json();

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: "assistant",
          content: contentData.content || "I couldn't generate a response for that."
        }]);
      }

      setUiAction("idle");
    } catch (err: any) {
      if (err.name === "AbortError") {
        setUiAction("idle");
        return;
      }
      console.error(err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: `Sorry, I encountered an error: ${err.message || "Unknown error"}`
      }]);
      setUiAction("error");
      setTimeout(() => setUiAction("idle"), 3000);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const isGenerating = uiAction === "generating";

  return (
    <div className="flex h-[calc(100vh)] bg-[#F3F5FA] overflow-hidden">

      {/* ── LORA AGENT SIDEBAR ── */}
      <div className="w-[280px] flex-shrink-0 bg-[#0A3F8E] flex flex-col relative shadow-xl z-10">
        {/* Full-width Avatar Header */}
        <div className="relative w-full h-[240px] shrink-0">
          <img 
            src="/lora-avatar.png" 
            alt="Lora" 
            className="w-full h-full object-cover" 
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>';
            }} 
          />
          {/* Gradient fade into sidebar background */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A3F8E] via-[#0A3F8E]/40 to-transparent"></div>
        </div>

        <div className="px-6 relative z-10 -mt-8">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-white text-[22px] font-bold">Lora</h2>
            <div className="flex gap-2">
              <button className="text-white/80 hover:text-white transition-colors"><LucideImage className="w-4 h-4" /></button>
              <button className="text-white/80 hover:text-white transition-colors"><Settings className="w-4 h-4" /></button>
            </div>
          </div>
          <p className="text-white/80 text-[13px] mb-6">AI Marketing Lead</p>

          <button
            onClick={() => setMessages([])}
            className="w-full bg-[#3B82F6] hover:bg-[#2563EB] text-white py-2.5 rounded-full font-semibold shadow-md transition-colors flex items-center justify-center gap-2 text-[14px]"
          >
            + New Chat
          </button>
        </div>

        {/* Recent chats */}
        <div className="flex-1 px-6 mt-8 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="text-center mt-10">
              <h3 className="text-white font-semibold text-[14px] mb-1">History is empty</h3>
              <p className="text-white/60 text-[12px] leading-relaxed">New conversations will<br/>appear here</p>
            </div>
          ) : (
            <>
              <h3 className="text-white/50 text-[11px] font-bold uppercase tracking-wider mb-3">Recent</h3>
              {messages.filter(m => m.role === "user").slice(-5).reverse().map((m) => (
                <div key={m.id} className="text-white/80 text-[13px] mb-2 truncate hover:text-white cursor-pointer transition-colors py-1.5 hover:bg-white/5 rounded-md -mx-2 px-2">
                  {m.content.slice(0, 40)}...
                </div>
              ))}
            </>
          )}
        </div>

      </div>

      {/* ── MAIN CHAT AREA ── */}
      <div className="flex-1 flex flex-col relative bg-transparent">

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-10 space-y-8 scroll-smooth pb-32">
          {messages.length === 0 && (
            <div className="max-w-3xl mx-auto pt-10">
              <div className="flex items-center gap-3 mb-10">
                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                  <img src="/lora-avatar.png" alt="Lora" className="w-full h-full object-cover" />
                </div>
                <h1 className="text-[17px] italic text-[#111111] font-medium">Hi, How can i help you today?</h1>
              </div>

              <div className="flex flex-col gap-3 max-w-[500px]">
                {SUGGESTIONS.map((sug, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(sug)}
                    className="self-start w-full text-left bg-white border border-[#E5E7EB] hover:border-[#3B82F6] hover:shadow-sm px-6 py-4 rounded-full text-[14px] text-[#3F3F46] hover:text-[#111111] transition-all font-medium flex items-center justify-between"
                  >
                    {sug} <ArrowUp className="w-4 h-4 rotate-45 text-[#A1A1AA]" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="max-w-4xl mx-auto w-full space-y-8">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>

                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-[#3B82F6] flex items-center justify-center shrink-0 shadow-sm mt-1">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                )}

                <div className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} max-w-[85%]`}>

                  {/* User Image Preview */}
                  {msg.role === "user" && msg.imagePreview && (
                    <div className="mb-2 rounded-xl overflow-hidden border border-[#E5E7EB] max-w-[200px]">
                      {msg.imagePreview.startsWith("data:") ? (
                        <img src={msg.imagePreview} alt="Uploaded" className="w-full h-auto object-cover" />
                      ) : (
                        <div className="w-full h-20 bg-gray-50 flex items-center justify-center text-gray-400 text-sm gap-1.5">
                          📷 <span>Image attached</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Text Bubble */}
                  <div className={`px-6 py-4 rounded-[24px] text-[15px] leading-relaxed ${msg.role === "user"
                    ? "bg-[#DDE5EF] text-[#0F172A] rounded-tr-sm font-medium"
                    : "bg-transparent text-[#111111] p-0 mb-3"
                    }`}>
                    {msg.role === "assistant" && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-blue-600 bg-[#EEF2FF] px-2.5 py-1 rounded-full border border-blue-100/50 flex items-center gap-1.5">
                          <div className="w-6 h-3 relative flex items-center justify-center">
                            <div className="absolute w-[20px] h-[12px] bg-blue-500 rounded-full opacity-30 animate-ping"></div>
                            <div className="w-2.5 h-2.5 bg-[#3B82F6] rounded-full z-10 border-2 border-white"></div>
                          </div>
                          AI Agents Deep Analyse
                        </span>
                      </div>
                    )}
                    {msg.content}
                  </div>

                  {/* Widgets */}
                  {msg.widget === "social-post" && msg.widgetData && (
                    <div className="mt-4 border border-[#E5E7EB] bg-white rounded-3xl p-6 shadow-sm w-full max-w-[540px]">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-500 to-orange-400 flex items-center justify-center shadow-md">
                             <img src="/instagram-icon.svg" alt="Instagram" className="w-6 h-6 object-contain filter invert opacity-0" onError={(e) => e.currentTarget.style.display='none'} />
                             <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                           </div>
                           <div>
                             <h3 className="font-bold text-[#111111]">Content Generated</h3>
                             <div className="flex items-center gap-1.5 text-orange-500 text-xs font-semibold mt-0.5">
                               <div className="w-3 h-3 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></div>
                               Needs review
                             </div>
                           </div>
                        </div>
                        <div className="flex gap-2">
                          <button className="px-5 py-2 rounded-full border border-[#E5E7EB] text-sm font-semibold text-[#111111] hover:bg-gray-50 transition-colors bg-[#F9FAFB]">Edit</button>
                          <button className="px-5 py-2 rounded-full bg-[#2563EB] text-white text-sm font-semibold hover:bg-[#1D4ED8] transition-colors">Approve</button>
                        </div>
                      </div>

                      {/* Reuse PlatformPreview for social mockups */}
                      <div className="bg-[#FAFBFC] rounded-2xl p-4 border border-[#F4F4F5]">
                        <PlatformPreview
                          content={msg.widgetData.content}
                          platforms={msg.widgetData.platforms}
                          images={msg.widgetData.images}
                        />
                      </div>
                    </div>
                  )}

                  {msg.widget === "image-result" && msg.widgetData && (
                    <div className="mt-2 rounded-2xl overflow-hidden border border-[#E5E7EB] shadow-md max-w-[400px]">
                      <img src={msg.widgetData.url} alt="Generated" className="w-full h-auto object-cover" />
                    </div>
                  )}

                </div>
              </div>
            ))}

            {/* Generating indicator with Stop button */}
            {isGenerating && (
              <div className="flex gap-4 justify-start">
                <div className="w-8 h-8 rounded-full bg-[#3B82F6] flex items-center justify-center shrink-0 shadow-sm mt-1">
                  <Sparkles className="w-4 h-4 text-white animate-pulse" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-transparent text-[#A1A1AA] text-[24px] px-2 py-2 flex items-center gap-1 font-bold tracking-widest">
                    <span className="animate-pulse" style={{ animationDelay: '0ms' }}>.</span>
                    <span className="animate-pulse" style={{ animationDelay: '150ms' }}>.</span>
                    <span className="animate-pulse" style={{ animationDelay: '300ms' }}>.</span>
                  </div>
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white text-red-500 text-xs font-bold hover:bg-gray-50 transition-colors border border-gray-200"
                  >
                    <Square className="w-3 h-3" fill="currentColor" />
                    Stop
                  </button>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area (Floating) */}
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#F3F5FA] via-[#F3F5FA] to-transparent pt-10 pb-6 px-6">
          <div className="max-w-3xl mx-auto">

            {/* Uploaded Image Preview */}
            {uploadedImagePreview && (
              <div className="mb-3 flex items-start gap-2 bg-white p-2 rounded-2xl border border-[#E5E7EB] shadow-sm inline-flex">
                <div className="relative rounded-xl overflow-hidden w-16 h-16 shrink-0">
                  <img src={uploadedImagePreview} alt="Upload preview" className="w-full h-full object-cover" />
                  <button
                    onClick={clearUploadedImage}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors backdrop-blur-sm"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="py-1 px-2">
                  <span className="text-[13px] font-semibold text-gray-700 block">Image attached</span>
                  <span className="text-[11px] text-gray-400">Ready for brand validation</span>
                </div>
              </div>
            )}

            <div className="relative flex items-center bg-white border border-[#E5E7EB] rounded-full shadow-sm hover:shadow-md transition-shadow" onDrop={handleDrop} onDragOver={handleDragOver}>
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute left-4 text-[#A1A1AA] hover:text-[#111111] transition-colors bg-gray-50 p-1.5 rounded-full"
                title="Upload image"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend(input)}
                onPaste={handlePaste}
                placeholder="How can Loraloop help you today? (Paste images with Ctrl+V)"
                className="w-full bg-transparent rounded-full py-4 pl-[52px] pr-[52px] text-[14px] text-[#111111] outline-none placeholder:text-[#A1A1AA] font-medium"
                disabled={isGenerating}
              />
              <button
                onClick={() => handleSend(input)}
                disabled={(!input.trim() && !uploadedImage) || isGenerating}
                className="absolute right-2.5 w-9 h-9 bg-[#E4E4E7] rounded-full flex items-center justify-center text-white hover:bg-[#A1A1AA] disabled:bg-[#F4F4F5] disabled:text-[#D4D4D8] transition-colors"
              >
                <ArrowUp className="w-4 h-4 rotate-45" strokeWidth={2.5} />
              </button>
            </div>
            <p className="text-center text-[12px] text-[#A1A1AA] mt-3">
              Loraloop Helpers can make mistakes. Verify important information.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
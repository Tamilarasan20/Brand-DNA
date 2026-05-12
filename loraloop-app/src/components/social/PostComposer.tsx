"use client";

import { useState, useRef } from "react";
import { Image as ImageIcon, Video, X, Smile, Hash, AtSign } from "lucide-react";
import PlatformSelector, { DEFAULT_PLATFORMS } from "./PlatformSelector";

interface PostComposerProps {
  content: string;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  selectedPlatforms: string[];
  setSelectedPlatforms: React.Dispatch<React.SetStateAction<string[]>>;
  images: File[];
  setImages: React.Dispatch<React.SetStateAction<File[]>>;
  imagePreviews: string[];
  setImagePreviews: React.Dispatch<React.SetStateAction<string[]>>;
  onPublish?: (data: ComposerData) => void;
  onSchedule?: (data: ComposerData, date: string) => void;
  onSaveDraft?: (data: ComposerData) => void;
}

export interface ComposerData {
  content: string;
  platforms: string[];
  images: File[];
  tags: string[];
}

export default function PostComposer({
  content,
  setContent,
  selectedPlatforms,
  setSelectedPlatforms,
  images,
  setImages,
  imagePreviews,
  setImagePreviews,
  onPublish,
  onSchedule,
  onSaveDraft,
}: PostComposerProps) {
  const [scheduleDate, setScheduleDate] = useState("");
  const [showScheduler, setShowScheduler] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Character limit for the most restrictive selected platform
  const getCharLimit = () => {
    const selected = DEFAULT_PLATFORMS.filter((p) =>
      selectedPlatforms.includes(p.id)
    );
    if (selected.length === 0) return 280;
    return Math.min(...selected.map((p) => p.maxChars));
  };

  const charLimit = getCharLimit();
  const charCount = content.length;
  const isOverLimit = charCount > charLimit;
  const charPercent = Math.min((charCount / charLimit) * 100, 100);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + images.length > 4) return; // Max 4 images

    setImages((prev) => [...prev, ...files]);

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImagePreviews((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const composerData: ComposerData = {
    content,
    platforms: selectedPlatforms,
    images,
    tags: [],
  };

  const canPublish = content.trim().length > 0 && selectedPlatforms.length > 0 && !isOverLimit;

  return (
    <div className="flex flex-col gap-6 w-full max-w-[740px]">
      {/* Platform Selector */}
      <PlatformSelector
        selectedPlatforms={selectedPlatforms}
        onChange={setSelectedPlatforms}
      />

      {/* Composer Card */}
      <div className="bg-[#2C2D2E] border border-white/5 rounded-[24px] overflow-hidden shadow-xl">
        {/* Text Area */}
        <div className="relative">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind? Write your post here..."
            className="w-full bg-transparent text-[#EAEAEA] text-[15px] leading-relaxed p-6 min-h-[200px] resize-none outline-none placeholder-[#525355] font-medium"
            rows={6}
          />

          {/* Character Counter Ring */}
          <div className="absolute bottom-4 right-4 flex items-center gap-3">
            <div className="relative w-8 h-8">
              <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="#363738"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke={isOverLimit ? "#EF4444" : charPercent > 80 ? "#F59E0B" : "#C1CD7D"}
                  strokeWidth="3"
                  strokeDasharray={`${charPercent} ${100 - charPercent}`}
                  strokeLinecap="round"
                />
              </svg>
              {charCount > 0 && (
                <span
                  className={`absolute inset-0 flex items-center justify-center text-[8px] font-bold ${
                    isOverLimit ? "text-red-400" : "text-[#9A9A9C]"
                  }`}
                >
                  {isOverLimit ? `-${charCount - charLimit}` : charLimit - charCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Image Previews */}
        {imagePreviews.length > 0 && (
          <div className="px-6 pb-4 flex gap-3 flex-wrap">
            {imagePreviews.map((preview, i) => (
              <div
                key={i}
                className="relative w-24 h-24 rounded-xl overflow-hidden group bg-[#363738]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt={`Upload ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 backdrop-blur rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
          <div className="flex items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-xl text-[#9A9A9C] hover:text-[#EAEAEA] hover:bg-white/5 transition-colors"
              title="Add image"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />

            <button
              className="p-2.5 rounded-xl text-[#9A9A9C] hover:text-[#EAEAEA] hover:bg-white/5 transition-colors"
              title="Add video"
            >
              <Video className="w-5 h-5" />
            </button>
            <button
              className="p-2.5 rounded-xl text-[#9A9A9C] hover:text-[#EAEAEA] hover:bg-white/5 transition-colors"
              title="Add emoji"
            >
              <Smile className="w-5 h-5" />
            </button>
            <button
              onClick={() => setContent((prev) => prev + " #")}
              className="p-2.5 rounded-xl text-[#9A9A9C] hover:text-[#EAEAEA] hover:bg-white/5 transition-colors"
              title="Add hashtag"
            >
              <Hash className="w-5 h-5" />
            </button>
            <button
              onClick={() => setContent((prev) => prev + " @")}
              className="p-2.5 rounded-xl text-[#9A9A9C] hover:text-[#EAEAEA] hover:bg-white/5 transition-colors"
              title="Mention"
            >
              <AtSign className="w-5 h-5" />
            </button>
          </div>

          {/* Platform char limit indicator */}
          <div className="flex items-center gap-2">
            {selectedPlatforms.length > 0 && (
              <span className="text-[11px] text-[#9A9A9C] font-medium">
                {selectedPlatforms.length} platform{selectedPlatforms.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Scheduling Bar */}
      {showScheduler && (
        <div className="bg-[#2C2D2E] border border-white/5 rounded-2xl p-5 flex items-center gap-4 animate-in slide-in-from-top-4 duration-300">
          <label className="text-[13px] text-[#9A9A9C] font-medium whitespace-nowrap">
            Schedule for:
          </label>
          <input
            type="datetime-local"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
            className="flex-1 bg-[#1B1B1B] border border-transparent rounded-xl px-4 py-3 text-[#EAEAEA] text-[14px] outline-none focus:border-[#4A4B4D] font-medium"
          />
          <button
            onClick={() => {
              if (scheduleDate && canPublish) {
                onSchedule?.(composerData, new Date(scheduleDate).toISOString());
              }
            }}
            disabled={!scheduleDate || !canPublish}
            className={`px-6 py-3 rounded-full font-semibold text-[14px] transition-colors whitespace-nowrap ${
              scheduleDate && canPublish
                ? "bg-[#C1CD7D] text-[#1B1B1B] hover:bg-[#D4E08F] shadow-lg"
                : "bg-[#414244] text-[#9A9A9C] cursor-not-allowed"
            }`}
          >
            Schedule Post
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onSaveDraft?.(composerData)}
          className="text-[#9A9A9C] hover:text-[#EAEAEA] font-medium text-[14px] transition-colors px-4 py-2"
        >
          Save as Draft
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowScheduler(!showScheduler)}
            className={`px-6 py-3 rounded-full font-semibold text-[14px] border-2 transition-colors ${
              showScheduler
                ? "border-[#C1CD7D] text-[#C1CD7D] bg-[#C1CD7D]/5"
                : "border-white/10 text-[#EAEAEA] hover:border-white/20 bg-[#2C2D2E]"
            }`}
          >
            {showScheduler ? "Cancel Schedule" : "Schedule Later"}
          </button>

          <button
            onClick={() => canPublish && onPublish?.(composerData)}
            disabled={!canPublish}
            className={`px-8 py-3 rounded-full font-semibold text-[14px] transition-all shadow-lg ${
              canPublish
                ? "bg-[#C1CD7D] text-[#1B1B1B] hover:bg-[#D4E08F] hover:shadow-xl active:scale-95"
                : "bg-[#414244] text-[#9A9A9C] cursor-not-allowed shadow-none"
            }`}
          >
            Publish Now
          </button>
        </div>
      </div>
    </div>
  );
}

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt, type, businessId } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    if (type === "image") {
      const { generateGeminiImage } = await import("@/lib/gemini");
      const base64Bytes = await generateGeminiImage(prompt, businessId);
      // gemini-3.1-flash-image-preview returns PNG
      const dataUrl = `data:image/png;base64,${base64Bytes}`;
      return NextResponse.json({ mediaUrl: dataUrl, type: "image", source: "gemini-flash-image" });
    }

    if (type === "video") {
      const { generateGeminiVideo } = await import("@/lib/gemini");
      const videoUrl = await generateGeminiVideo(prompt);
      return NextResponse.json({ mediaUrl: videoUrl, type: "video", source: "veo" });
    }

    return NextResponse.json({ error: "Unsupported media type" }, { status: 400 });

  } catch (err: any) {
    console.error("[generate-media] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate media" }, { status: 500 });
  }
}

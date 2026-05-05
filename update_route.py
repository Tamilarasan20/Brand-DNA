import re

with open('loraloop-app/src/app/api/extract-dna/route.ts', 'r') as f:
    content = f.read()

# We want to replace the big block inside try { browser = ... } with our fetch code.
start_marker = "browser = await chromium.launch({"
end_marker = "console.log(`[extract-dna] 📊 Final totals: ${extractedImages.length} images, ${extractedColors.length} colors, ${extractedFonts.length} fonts`);"

new_code = """
      console.log(`[extract-dna] Proxying scrape request to Python backend for ${url}...`);
      const pyRes = await fetch(`http://127.0.0.1:8000/scrape-only?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(60000)
      });
      const pyData = await pyRes.json();
      
      if (pyData && !pyData.error) {
        if (pyData.visual_assets) {
          extractedImages = pyData.visual_assets.all_images || [];
          extractedLogo = pyData.visual_assets.logo_url || "";
          extractedColors = pyData.visual_assets.colors?.all_colors || [];
          extractedFonts = pyData.visual_assets.typography?.all_fonts || [];
        }
        if (pyData.pages && pyData.pages.length > 0) {
           pageTitle = pyData.pages[0].title || "";
           textSample = pyData.pages.map((p: any) => p.text_content).join(" \\n\\n").slice(0, 6000);
        }
      } else {
        throw new Error(pyData.error || "Python backend failed");
      }
    } catch (e) {
      console.error("[extract-dna] Python proxy failed", e);
    }

    if (!extractedLogo || !extractedLogo.startsWith("http")) {
      try {
        const domain = new URL(url).hostname;
        extractedLogo = `https://logo.clearbit.com/${domain}`;
        console.log("[extract-dna] 🔄 Using Clearbit fallback logo:", extractedLogo);
      } catch { /* */ }
    }

    console.log(`[extract-dna] 📊 Final totals: ${extractedImages.length} images, ${extractedColors.length} colors, ${extractedFonts.length} fonts`);
"""

# Extract text before start_marker
before = content[:content.find(start_marker)]
# Extract text after end_marker
after = content[content.find(end_marker) + len(end_marker):]

with open('loraloop-app/src/app/api/extract-dna/route.ts', 'w') as f:
    f.write(before + new_code.strip() + after)

print("Updated route.ts successfully.")

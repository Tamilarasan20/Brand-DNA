# Loraloop — Brand DNA Extractor

Loraloop is a focused Next.js web application that uses Playwright and Google Gemini AI to scrape and reverse-engineer any website into a comprehensive **Brand Knowledge Base**. 

This repository has been strictly stripped down to contain **only** the Brand DNA extraction logic. It acts as an autonomous data collection agent that pulls colors, typography, images, and brand positioning out of a public URL, then generates AI-driven social strategy and market research documents.

## 🚀 Features

- **Deep Visual Scraping**: Extracts high-quality images, logos, colors, and typography using a headless browser (Playwright).
- **AI Enrichment**: Uses Google Gemini to infer brand tone, target audience, tagline, and core aesthetic values.
- **Document Generation**: Automatically drafts a Business Profile, Market Research brief, and Social Media Strategy based on the extracted DNA.
- **Local JSON Database**: All brand data and assets are persisted locally on your machine without requiring Supabase or external databases.

## 🏗️ Repository Structure

- **`/loraloop-app`** — The core Next.js 16 application (App Router, TypeScript).
- **`/loraloop-app/src/app/api/extract-dna`** — The Playwright scraper and Gemini extraction pipeline.
- **`/loraloop-app/src/app/api/process-business`** — The orchestrator that downloads images locally and structures the brand data.

## 🛠️ Quick Start

### 1. Requirements
- **Node.js 18+**
- **Google Gemini API Key**

### 2. Application Setup

Navigate to the app directory:
```bash
cd loraloop-app
```

Install dependencies:
```bash
npm install
```

Set up your environment variables by creating a `.env.local` file inside `loraloop-app/`:
```env
GEMINI_API_KEY="your_google_gemini_api_key_here"
```

Start the development server:
```bash
npm run dev -- --port 3001
```

The application will be available at [http://localhost:3001](http://localhost:3001).

## 🗃️ How Data is Stored

- **Database**: All extracted brand data is stored in a simple, flat `.local-db.json` file at the root of `loraloop-app/`.
- **Assets**: All scraped images are automatically downloaded and stored in the `loraloop-app/public/brand-assets/` folder so they are available offline.

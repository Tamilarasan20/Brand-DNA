"""
Loraloop — Web UI
FastAPI app with real-time SSE progress streaming.
Run: python3 app.py
Then open: http://localhost:8000
"""

from __future__ import annotations

import json
import os
import queue
import threading
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel

load_dotenv()

from lora.scraper    import ScraperEngine
from lora.enrichment import BrandEnricher

app = FastAPI(title="Loraloop Scraper")


class ScrapeImagesRequest(BaseModel):
    url: str

# ── HTML ───────────────────────────────────────────────────────────────────────

HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Loraloop — Brand Intelligence</title>
<style>
  :root {
    --bg: #0d0d0d; --surface: #161616; --surface2: #1e1e1e;
    --border: #2a2a2a; --accent: #7c5cfc; --accent2: #a78bfa;
    --green: #34d399; --red: #f87171; --yellow: #fbbf24;
    --text: #f0f0f0; --muted: #888; --radius: 12px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; }

  /* ── Header ── */
  .header { padding: 28px 40px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
  .logo-mark { width: 32px; height: 32px; background: linear-gradient(135deg, var(--accent), var(--accent2)); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; color: #fff; }
  .logo-text { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
  .logo-text span { color: var(--accent2); }
  .badge { margin-left: auto; background: var(--surface2); border: 1px solid var(--border); padding: 4px 12px; border-radius: 20px; font-size: 12px; color: var(--muted); }

  /* ── Hero / Input ── */
  .hero { max-width: 720px; margin: 60px auto 0; padding: 0 24px; text-align: center; }
  .hero h1 { font-size: 42px; font-weight: 800; letter-spacing: -1px; line-height: 1.15; margin-bottom: 12px; }
  .hero h1 span { background: linear-gradient(135deg, var(--accent), var(--accent2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .hero p { color: var(--muted); font-size: 16px; margin-bottom: 36px; line-height: 1.6; }

  .input-row { display: flex; gap: 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 6px 6px 6px 16px; transition: border-color 0.2s; }
  .input-row:focus-within { border-color: var(--accent); }
  .input-row input { flex: 1; background: transparent; border: none; outline: none; color: var(--text); font-size: 15px; }
  .input-row input::placeholder { color: var(--muted); }
  .btn { background: var(--accent); color: #fff; border: none; padding: 10px 22px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.2s, transform 0.1s; white-space: nowrap; }
  .btn:hover { opacity: 0.9; }
  .btn:active { transform: scale(0.98); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── Progress ── */
  #progress-section { max-width: 720px; margin: 40px auto 0; padding: 0 24px; display: none; }
  .progress-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
  .phase-label { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--accent2); margin-bottom: 10px; }
  .progress-bar-bg { background: var(--surface2); border-radius: 99px; height: 6px; overflow: hidden; margin-bottom: 14px; }
  .progress-bar-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--accent), var(--accent2)); transition: width 0.4s ease; width: 0%; }
  .step-text { font-size: 13px; color: var(--muted); min-height: 20px; }
  .steps-list { margin-top: 20px; display: flex; flex-direction: column; gap: 6px; }
  .step-item { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--muted); }
  .step-item.done { color: var(--green); }
  .step-item.active { color: var(--text); }
  .step-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); flex-shrink: 0; }
  .step-item.done .step-dot { background: var(--green); }
  .step-item.active .step-dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); animation: pulse 1s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

  /* ── Error ── */
  #error-section { max-width: 720px; margin: 24px auto 0; padding: 0 24px; display: none; }
  .error-card { background: #1a0f0f; border: 1px solid #3d1a1a; border-radius: var(--radius); padding: 20px 24px; color: var(--red); font-size: 14px; }

  /* ── Results ── */
  #results-section { max-width: 1100px; margin: 40px auto 60px; padding: 0 24px; display: none; }
  .results-header { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; }
  .results-header h2 { font-size: 22px; font-weight: 700; }
  .confidence-badge { padding: 4px 14px; border-radius: 99px; font-size: 12px; font-weight: 700; }
  .conf-high { background: #0d2e1f; color: var(--green); border: 1px solid #1a4d33; }
  .conf-mid  { background: #2a1f0a; color: var(--yellow); border: 1px solid #4d3a10; }
  .conf-low  { background: #1a0f0f; color: var(--red); border: 1px solid #3d1a1a; }

  /* Tabs */
  .tabs { display: flex; gap: 4px; margin-bottom: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; }
  .tab { flex: 1; padding: 8px 4px; border-radius: 8px; border: none; background: transparent; color: var(--muted); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; text-align: center; }
  .tab.active { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  /* Cards */
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  @media(max-width:700px) { .grid2,.grid3 { grid-template-columns: 1fr; } }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
  .card-full { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 16px; }
  .card h3 { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
  .card-value { font-size: 15px; line-height: 1.6; color: var(--text); }
  .card-value.big { font-size: 22px; font-weight: 700; }
  .tag { display: inline-block; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 3px 10px; font-size: 12px; color: var(--text); margin: 3px 3px 3px 0; }
  .tag.accent { background: #1e1540; border-color: #3d2d80; color: var(--accent2); }
  ul.dot-list { list-style: none; display: flex; flex-direction: column; gap: 7px; }
  ul.dot-list li { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--muted); line-height: 1.5; }
  ul.dot-list li::before { content: '•'; color: var(--accent2); flex-shrink: 0; margin-top: 1px; }

  /* Color swatches */
  .color-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
  .swatch { width: 36px; height: 36px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); position: relative; cursor: default; }
  .swatch-label { font-size: 10px; text-align: center; color: var(--muted); margin-top: 4px; }
  .swatch-wrap { display: flex; flex-direction: column; align-items: center; }
  .swatch-primary { width: 48px; height: 48px; border-radius: 10px; }

  /* Competitor cards */
  .comp-grid { display: flex; flex-direction: column; gap: 12px; }
  .comp-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
  .comp-name { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
  .comp-pos { font-size: 13px; color: var(--muted); margin-bottom: 10px; line-height: 1.5; }
  .comp-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .comp-col h4 { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 6px; }
  .comp-col.str h4 { color: var(--green); }
  .comp-col.wk h4  { color: var(--red); }

  /* Persona cards */
  .persona-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media(max-width:600px) { .persona-grid { grid-template-columns: 1fr; } }
  .persona-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
  .persona-name { font-weight: 700; font-size: 15px; }
  .persona-role { color: var(--muted); font-size: 13px; margin-bottom: 10px; }
  .persona-trigger { font-size: 12px; color: var(--accent2); margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }

  /* Logo */
  .logo-preview { max-height: 60px; max-width: 160px; object-fit: contain; border-radius: 6px; background: #fff; padding: 8px; }

  /* Completeness */
  .completeness-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
  .comp-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .comp-item .dot { width: 8px; height: 8px; border-radius: 50%; }
  .comp-item.ok .dot { background: var(--green); }
  .comp-item.no .dot { background: var(--red); }

  .divider { height: 1px; background: var(--border); margin: 16px 0; }
  .section-gap { margin-top: 16px; }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="logo-mark">L</div>
  <div class="logo-text">Lora<span>loop</span></div>
  <div class="badge">Brand Intelligence Engine</div>
</div>

<!-- Hero -->
<div class="hero">
  <h1>Extract your brand's<br/><span>DNA in seconds</span></h1>
  <p>Paste any website URL. Loraloop crawls it, extracts visual identity,<br/>and generates a full AI-enriched Business Profile.</p>
  <div class="input-row">
    <input id="url-input" type="url" placeholder="https://yourbusiness.com" autofocus/>
    <button class="btn" id="analyze-btn" onclick="startAnalysis()">Analyze →</button>
  </div>
</div>

<!-- Progress -->
<div id="progress-section">
  <div class="progress-card">
    <div class="phase-label" id="phase-label">Phase 1 — Scraping</div>
    <div class="progress-bar-bg"><div class="progress-bar-fill" id="progress-bar"></div></div>
    <div class="step-text" id="step-text">Initializing…</div>
    <div class="steps-list" id="steps-list"></div>
  </div>
</div>

<!-- Error -->
<div id="error-section">
  <div class="error-card" id="error-text"></div>
</div>

<!-- Results -->
<div id="results-section">
  <div class="results-header">
    <h2 id="results-title">Brand Profile</h2>
    <span class="confidence-badge" id="confidence-badge"></span>
  </div>

  <div class="tabs">
    <button class="tab active" onclick="switchTab(0)">Identity</button>
    <button class="tab" onclick="switchTab(1)">Brand Voice</button>
    <button class="tab" onclick="switchTab(2)">Guidelines</button>
    <button class="tab" onclick="switchTab(3)">Audience</button>
    <button class="tab" onclick="switchTab(4)">Competitors</button>
  </div>

  <!-- Tab 0: Identity -->
  <div class="tab-panel active" id="tab-0">
    <div class="grid2" style="margin-bottom:16px">
      <div class="card">
        <h3>Business Name</h3>
        <div class="card-value big" id="r-name">—</div>
      </div>
      <div class="card">
        <h3>Tagline</h3>
        <div class="card-value" id="r-tagline">—</div>
      </div>
    </div>
    <div class="card-full">
      <h3>Business Overview</h3>
      <div class="card-value" id="r-overview">—</div>
    </div>
    <div class="card-full">
      <h3>Elevator Pitch</h3>
      <div class="card-value" id="r-pitch">—</div>
    </div>
    <div class="grid2">
      <div class="card">
        <h3>Brand Values</h3>
        <div id="r-values"></div>
      </div>
      <div class="card">
        <h3>Unique Selling Points</h3>
        <ul class="dot-list" id="r-usps"></ul>
      </div>
    </div>
    <div class="section-gap"></div>
    <div class="grid3">
      <div class="card">
        <h3>Industry</h3>
        <div class="card-value" id="r-industry">—</div>
      </div>
      <div class="card">
        <h3>Business Model</h3>
        <div class="card-value" id="r-model">—</div>
      </div>
      <div class="card">
        <h3>Market Segment</h3>
        <div class="card-value" id="r-segment">—</div>
      </div>
    </div>
    <div id="r-mission-wrap" style="display:none" class="section-gap">
      <div class="card-full">
        <h3>Mission Statement</h3>
        <div class="card-value" id="r-mission">—</div>
      </div>
    </div>
  </div>

  <!-- Tab 1: Brand Voice -->
  <div class="tab-panel" id="tab-1">
    <div class="grid2" style="margin-bottom:16px">
      <div class="card">
        <h3>Formality Level</h3>
        <div class="card-value big" id="r-formality">—</div>
      </div>
      <div class="card">
        <h3>Brand Archetype</h3>
        <div class="card-value big" id="r-archetype">—</div>
      </div>
    </div>
    <div class="card-full">
      <h3>Communication Style</h3>
      <div class="card-value" id="r-style">—</div>
    </div>
    <div class="card-full">
      <h3>Brand Aesthetic</h3>
      <div class="card-value" id="r-aesthetic">—</div>
    </div>
    <div class="grid2">
      <div class="card">
        <h3>Tone Descriptors</h3>
        <div id="r-tone"></div>
      </div>
      <div class="card">
        <h3>Brand Personality</h3>
        <div id="r-personality"></div>
      </div>
    </div>
    <div class="section-gap"></div>
    <div class="card-full">
      <h3>Key Messaging Themes</h3>
      <ul class="dot-list" id="r-themes"></ul>
    </div>
    <div class="card-full">
      <h3>Visual Aesthetics</h3>
      <div id="r-visual-aesthetics"></div>
    </div>
    <div class="card-full">
      <h3>Emotional Associations</h3>
      <div id="r-emotions"></div>
    </div>
  </div>

  <!-- Tab 2: Guidelines -->
  <div class="tab-panel" id="tab-2">
    <div class="card-full">
      <h3>Logo</h3>
      <div id="r-logo-wrap">—</div>
    </div>
    <div class="card-full">
      <h3>Primary Color</h3>
      <div id="r-primary-color"></div>
    </div>
    <div class="card-full">
      <h3>Secondary Colors</h3>
      <div id="r-secondary-colors"></div>
    </div>
    <div class="card-full">
      <h3>Accent Colors</h3>
      <div id="r-accent-colors"></div>
    </div>
    <div class="grid2">
      <div class="card">
        <h3>Primary Font</h3>
        <div class="card-value" id="r-font-primary">—</div>
      </div>
      <div class="card">
        <h3>Secondary Font</h3>
        <div class="card-value" id="r-font-secondary">—</div>
      </div>
    </div>
    <div class="section-gap"></div>
    <div class="card-full">
      <h3>Brand Keywords</h3>
      <div id="r-brand-keywords"></div>
    </div>
  </div>

  <!-- Tab 3: Audience -->
  <div class="tab-panel" id="tab-3">
    <div class="card-full">
      <h3>Primary Segments</h3>
      <ul class="dot-list" id="r-segments"></ul>
    </div>
    <div class="grid2">
      <div class="card">
        <h3>Pain Points</h3>
        <ul class="dot-list" id="r-pains"></ul>
      </div>
      <div class="card">
        <h3>Audience Needs</h3>
        <ul class="dot-list" id="r-needs"></ul>
      </div>
    </div>
    <div class="section-gap"></div>
    <div class="card-full">
      <h3>Buyer Personas</h3>
      <div class="persona-grid" id="r-personas"></div>
    </div>
  </div>

  <!-- Tab 4: Competitors -->
  <div class="tab-panel" id="tab-4">
    <div class="card-full">
      <h3>Competitive Positioning</h3>
      <div class="card-value" id="r-comp-pos">—</div>
    </div>
    <div class="grid2" style="margin-bottom:16px">
      <div class="card">
        <h3>Market Gaps</h3>
        <ul class="dot-list" id="r-gaps"></ul>
      </div>
      <div class="card">
        <h3>Competitive Advantages</h3>
        <ul class="dot-list" id="r-advantages"></ul>
      </div>
    </div>
    <div class="card-full">
      <h3>Top Competitors</h3>
      <div class="comp-grid" id="r-competitors"></div>
    </div>
  </div>
</div>

<script>
let steps = [];

function switchTab(idx) {
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', i===idx));
  document.querySelectorAll('.tab-panel').forEach((p,i) => p.classList.toggle('active', i===idx));
}

function tags(arr, cls='') {
  return (arr||[]).map(v => `<span class="tag ${cls}">${v}</span>`).join('');
}
function dots(arr) {
  return (arr||[]).map(v => `<li>${v}</li>`).join('');
}
function swatch(color, primary=false) {
  const cls = primary ? 'swatch swatch-primary' : 'swatch';
  return `<div class="swatch-wrap"><div class="${cls}" style="background:${color}" title="${color}"></div><div class="swatch-label">${color}</div></div>`;
}

function setStep(step, pct, phase) {
  document.getElementById('phase-label').textContent =
    phase === 'scraping' ? 'Phase 1 — Scraping Website' : 'Phase 2 — AI Enrichment';
  document.getElementById('progress-bar').style.width =
    phase === 'scraping' ? (pct * 0.45) + '%' : (45 + pct * 0.55) + '%';
  document.getElementById('step-text').textContent = step;

  const key = phase + ':' + step;
  if (!steps.find(s => s.key === key)) {
    steps.push({ key, label: step, phase });
    const list = document.getElementById('steps-list');
    const item = document.createElement('div');
    item.className = 'step-item active';
    item.id = 'step-' + steps.length;
    item.innerHTML = `<div class="step-dot"></div><span>${step}</span>`;
    // Mark previous as done
    list.querySelectorAll('.step-item.active').forEach(el => {
      el.classList.remove('active');
      el.classList.add('done');
    });
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
  }
}

function renderProfile(p, raw) {
  // Identity
  document.getElementById('r-name').textContent    = p.business_name || '—';
  document.getElementById('r-tagline').textContent  = p.tagline || '—';
  document.getElementById('r-overview').textContent = p.business_overview || '—';
  document.getElementById('r-pitch').textContent    = p.elevator_pitch || '—';
  document.getElementById('r-industry').textContent = p.industry || '—';
  document.getElementById('r-model').textContent    = p.business_model || '—';
  document.getElementById('r-segment').textContent  = p.market_segment || '—';
  document.getElementById('r-values').innerHTML     = tags(p.brand_values, 'accent');
  document.getElementById('r-usps').innerHTML       = dots(p.unique_selling_points);
  if (p.mission_statement) {
    document.getElementById('r-mission-wrap').style.display = '';
    document.getElementById('r-mission').textContent = p.mission_statement;
  }

  // Voice
  document.getElementById('r-formality').textContent  = p.brand_voice?.formality_level || '—';
  document.getElementById('r-archetype').textContent  = p.brand_descriptors?.brand_archetype || '—';
  document.getElementById('r-style').textContent      = p.brand_voice?.communication_style || '—';
  document.getElementById('r-aesthetic').textContent  = p.brand_aesthetic || '—';
  document.getElementById('r-tone').innerHTML         = tags(p.brand_voice?.tone_descriptors);
  document.getElementById('r-personality').innerHTML  = tags(p.brand_voice?.brand_personality_dimensions);
  document.getElementById('r-themes').innerHTML       = dots(p.brand_voice?.key_messaging_themes);
  document.getElementById('r-visual-aesthetics').innerHTML = tags(p.brand_descriptors?.visual_aesthetics);
  document.getElementById('r-emotions').innerHTML         = tags(p.brand_descriptors?.emotional_associations);

  // Guidelines
  const bg = p.brand_guidelines;
  if (bg?.logo_url) {
    document.getElementById('r-logo-wrap').innerHTML =
      `<img class="logo-preview" src="${bg.logo_url}" onerror="this.style.display='none'" alt="Logo"/>`;
  }
  document.getElementById('r-primary-color').innerHTML =
    bg?.primary_color ? `<div class="color-row">${swatch(bg.primary_color, true)}</div>` : '—';
  document.getElementById('r-secondary-colors').innerHTML =
    (bg?.secondary_colors||[]).length ? `<div class="color-row">${(bg.secondary_colors).map(c=>swatch(c)).join('')}</div>` : '—';
  document.getElementById('r-accent-colors').innerHTML =
    (bg?.accent_colors||[]).length ? `<div class="color-row">${(bg.accent_colors).map(c=>swatch(c)).join('')}</div>` : '—';
  document.getElementById('r-font-primary').textContent   = bg?.primary_font || '—';
  document.getElementById('r-font-secondary').textContent = bg?.secondary_font || '—';
  document.getElementById('r-brand-keywords').innerHTML   = tags(p.brand_descriptors?.brand_personality_keywords, 'accent');

  // Audience
  const ta = p.target_audience;
  document.getElementById('r-segments').innerHTML = dots(ta?.primary_segments);
  document.getElementById('r-pains').innerHTML    = dots(ta?.audience_pain_points);
  document.getElementById('r-needs').innerHTML    = dots(ta?.audience_needs);
  const personasEl = document.getElementById('r-personas');
  personasEl.innerHTML = (ta?.buyer_personas||[]).map(p => `
    <div class="persona-card">
      <div class="persona-name">${p.name}</div>
      <div class="persona-role">${p.role} · ${p.age_range}</div>
      ${p.pain_points?.length ? `<div style="margin-top:8px"><span style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Pain Points</span><ul class="dot-list" style="margin-top:5px">${dots(p.pain_points)}</ul></div>` : ''}
      ${p.goals?.length ? `<div style="margin-top:8px"><span style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Goals</span><ul class="dot-list" style="margin-top:5px">${dots(p.goals)}</ul></div>` : ''}
      ${p.buying_trigger ? `<div class="persona-trigger">⚡ ${p.buying_trigger}</div>` : ''}
    </div>`).join('');

  // Competitive
  document.getElementById('r-comp-pos').textContent = p.competitive_positioning || '—';
  document.getElementById('r-gaps').innerHTML       = dots(p.market_gaps);
  document.getElementById('r-advantages').innerHTML = dots(p.competitive_advantages);
  document.getElementById('r-competitors').innerHTML = (p.competitors||[]).map(c => `
    <div class="comp-card">
      <div class="comp-name">${c.name}${c.website ? ` <a href="${c.website}" target="_blank" style="color:var(--muted);font-size:12px;font-weight:400">${c.website}</a>` : ''}</div>
      <div class="comp-pos">${c.positioning}</div>
      <div class="comp-cols">
        <div class="comp-col str"><h4>Strengths</h4><ul class="dot-list">${dots(c.strengths)}</ul></div>
        <div class="comp-col wk"><h4>Weaknesses</h4><ul class="dot-list">${dots(c.weaknesses)}</ul></div>
      </div>
    </div>`).join('');

  // Confidence
  const pct = Math.round((p.enrichment_confidence||0) * 100);
  const badge = document.getElementById('confidence-badge');
  badge.textContent = pct + '% confidence';
  badge.className = 'confidence-badge ' + (pct >= 80 ? 'conf-high' : pct >= 50 ? 'conf-mid' : 'conf-low');

  document.getElementById('results-title').textContent = p.business_name || 'Brand Profile';
}

async function startAnalysis() {
  const url = document.getElementById('url-input').value.trim();
  if (!url) { document.getElementById('url-input').focus(); return; }

  // Reset UI
  steps = [];
  document.getElementById('steps-list').innerHTML = '';
  document.getElementById('progress-bar').style.width = '0%';
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('error-section').style.display = 'none';
  document.getElementById('progress-section').style.display = 'block';
  document.getElementById('analyze-btn').disabled = true;
  document.getElementById('analyze-btn').textContent = 'Analyzing…';

  try {
    const evtSource = new EventSource('/analyze?url=' + encodeURIComponent(url));

    evtSource.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === 'progress') {
        setStep(data.step, data.pct, data.phase);
      }
      else if (data.type === 'error') {
        evtSource.close();
        document.getElementById('progress-section').style.display = 'none';
        document.getElementById('error-section').style.display = 'block';
        document.getElementById('error-text').textContent = '✗ ' + data.message;
        document.getElementById('analyze-btn').disabled = false;
        document.getElementById('analyze-btn').textContent = 'Analyze →';
      }
      else if (data.type === 'done') {
        evtSource.close();
        // Mark all steps done
        document.querySelectorAll('.step-item.active').forEach(el => {
          el.classList.remove('active'); el.classList.add('done');
        });
        document.getElementById('progress-bar').style.width = '100%';
        document.getElementById('step-text').textContent = 'Complete ✓';
        setTimeout(() => {
          document.getElementById('progress-section').style.display = 'none';
          renderProfile(data.profile, data.raw);
          document.getElementById('results-section').style.display = 'block';
        }, 600);
        document.getElementById('analyze-btn').disabled = false;
        document.getElementById('analyze-btn').textContent = 'Analyze →';
      }
    };

    evtSource.onerror = () => {
      evtSource.close();
      document.getElementById('progress-section').style.display = 'none';
      document.getElementById('error-section').style.display = 'block';
      document.getElementById('error-text').textContent = '✗ Connection lost. Please try again.';
      document.getElementById('analyze-btn').disabled = false;
      document.getElementById('analyze-btn').textContent = 'Analyze →';
    };

  } catch(err) {
    document.getElementById('error-text').textContent = '✗ ' + err.message;
    document.getElementById('error-section').style.display = 'block';
    document.getElementById('progress-section').style.display = 'none';
    document.getElementById('analyze-btn').disabled = false;
    document.getElementById('analyze-btn').textContent = 'Analyze →';
  }
}

document.getElementById('url-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') startAnalysis();
});
</script>
</body>
</html>"""


# ── API ────────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
def index():
    return HTML


@app.get("/analyze")
def analyze(url: str):
    """Stream SSE progress events then return the final enriched profile."""

    q: queue.Queue = queue.Queue()

    def scrape_and_enrich():
        try:
            # Normalize URL
            if not url.startswith(("http://", "https://")):
                target = "https://" + url
            else:
                target = url

            # Phase 1 — Scrape
            def on_scrape(step: str, pct: int):
                q.put({"type": "progress", "phase": "scraping", "step": step, "pct": pct})

            scraper  = ScraperEngine(enable_snapshot=False)
            raw_data = scraper.scrape(target, on_progress=on_scrape)

            if raw_data.crawl_status.value == "failed":
                q.put({"type": "error", "message": raw_data.error or "Failed to crawl website"})
                return

            # Phase 2 — Enrich
            def on_enrich(step: str, pct: int):
                q.put({"type": "progress", "phase": "enriching", "step": step, "pct": pct})

            enricher = BrandEnricher()
            profile  = enricher.enrich(raw_data, on_progress=on_enrich)

            q.put({
                "type":    "done",
                "profile": json.loads(profile.model_dump_json()),
                "raw":     {
                    "url":          raw_data.url,
                    "site_type":    raw_data.site_type.value,
                    "crawl_status": raw_data.crawl_status.value,
                    "pages":        raw_data.pages_crawled,
                    "duration":     raw_data.crawl_duration_seconds,
                },
            })

        except Exception as exc:
            q.put({"type": "error", "message": str(exc)})

    # Run in background thread so the generator can stream
    threading.Thread(target=scrape_and_enrich, daemon=True).start()

    def event_stream():
        while True:
            item = q.get()
            yield f"data: {json.dumps(item)}\n\n"
            if item["type"] in ("done", "error"):
                break

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


from fastapi.staticfiles import StaticFiles

# Create snapshots dir if it doesn't exist
import os
os.makedirs("snapshots", exist_ok=True)
app.mount("/snapshots", StaticFiles(directory="snapshots"), name="snapshots")

@app.get("/scrape-only")
def scrape_only(url: str):
    """Run only the scraper engine and return RawWebsiteData JSON."""
    if not url.startswith(("http://", "https://")):
        target = "https://" + url
    else:
        target = url
        
    try:
        scraper = ScraperEngine(enable_snapshot=True, snapshot_dir="snapshots")
        raw_data = scraper.scrape(target)
        if raw_data.crawl_status.value == "failed":
            return {"error": raw_data.error}
            
        data = json.loads(raw_data.model_dump_json())
        if raw_data.snapshot_path:
            filename = os.path.basename(raw_data.snapshot_path)
            data["snapshot_url"] = f"http://localhost:8000/snapshots/{filename}"
            
        return data
    except Exception as exc:
        return {"error": str(exc)}


@app.post("/scrape-images")
def scrape_images(payload: ScrapeImagesRequest):
    """Run the Python scraper and return image candidates for the knowledge base."""
    raw_url = payload.url.strip()
    if not raw_url:
        return {"error": "URL is required"}

    target = raw_url if raw_url.startswith(("http://", "https://")) else f"https://{raw_url}"

    try:
        scraper = ScraperEngine(enable_snapshot=False)
        raw_data = scraper.scrape(target)
        if raw_data.crawl_status.value == "failed":
            return {"error": raw_data.error or "Scrape failed"}

        images = raw_data.visual_assets.all_images or []
        return {
            "images": images,
            "total": len(images),
            "raw": len(images),
            "logoUrl": raw_data.visual_assets.logo_url,
            "ogImage": raw_data.visual_assets.og_image,
        }
    except Exception as exc:
        return {"error": str(exc)}


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"\n  Loraloop Web UI  →  http://localhost:{port}\n")
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)

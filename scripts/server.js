#!/usr/bin/env node
/**
 * 🚐 VanTripJapan Content Studio — Node.js Server
 *
 * Uses native Node.js http module (no npm install needed)
 * Calls Python scripts for AI generation
 *
 * Usage:  node server.js
 * Open:   http://localhost:5500
 */

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const url = require("url");

// ─── .env ファイルの読み込み（npmパッケージ不要） ───
const envPath = path.join(__dirname, ".env");
try {
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          const val = trimmed.substring(eqIdx + 1).trim();
          if (!process.env[key]) process.env[key] = val;
        }
      }
    });
    console.log("✅ .env ファイルを読み込みました");
  }
} catch (e) {
  console.log("⚠️ .env ファイルを読み込めませんでした（環境変数から設定を取得します）:", e.message);
}

const SCRIPT_DIR = __dirname;
const CONFIG_PATH = path.join(SCRIPT_DIR, "config.json");
const TOPICS_PATH = path.join(SCRIPT_DIR, "topics.json");
const ARTICLES_DIR = path.join(SCRIPT_DIR, "articles");
const TEMPLATES_DIR = path.join(SCRIPT_DIR, "templates");
const PORT = process.env.PORT || 5500;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "vantrip2026";
const AUTH_SECRET = crypto.randomBytes(32).toString("hex");

// microCMS settings
const MICROCMS_SERVICE_ID = process.env.MICROCMS_SERVICE_ID || "";
const MICROCMS_API_KEY = process.env.MICROCMS_API_KEY || "";

// Override config with env vars if present
function applyEnvOverrides(config) {
  if (process.env.GROQ_API_KEY) config.groq_api_key = process.env.GROQ_API_KEY;
  return config;
}

// ─── Auth ───

function generateToken() {
  return crypto.createHmac("sha256", AUTH_SECRET).update(AUTH_PASSWORD).digest("hex");
}

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || "").split(";").forEach((c) => {
    const [k, v] = c.trim().split("=");
    if (k) cookies[k] = v;
  });
  return cookies;
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  return cookies.auth_token === generateToken();
}

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🚐 VanTripJapan Content Studio — ログイン</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: #0f1219; color: #e8ecf4; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
    .login-card { background: #1c2333; border: 1px solid #2a3347; border-radius: 16px; padding: 48px; max-width: 400px; width: 90%; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
    .logo { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
    .subtitle { color: #5a6478; font-size: 13px; margin-bottom: 32px; }
    input { width: 100%; padding: 12px 16px; background: #0f1219; border: 1px solid #2a3347; border-radius: 8px; color: #e8ecf4; font-size: 15px; margin-bottom: 16px; font-family: inherit; }
    input:focus { outline: none; border-color: #2dd4bf; box-shadow: 0 0 0 3px rgba(45,212,191,0.15); }
    button { width: 100%; padding: 12px; background: linear-gradient(135deg, #2dd4bf, #14b8a6); color: #0f1219; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; }
    button:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(45,212,191,0.3); }
    .error { color: #ef4444; font-size: 13px; margin-bottom: 12px; display: none; }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="logo">🚐</div>
    <h1>VanTripJapan Content Studio</h1>
    <p class="subtitle">スタッフ専用ツール</p>
    <form onsubmit="login(event)">
      <p class="error" id="error">パスワードが違います</p>
      <input type="password" id="pw" placeholder="パスワードを入力" autofocus>
      <button type="submit">ログイン</button>
    </form>
  </div>
  <script>
    async function login(e) {
      e.preventDefault();
      const pw = document.getElementById('pw').value;
      const res = await fetch('/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({password: pw}) });
      if (res.ok) { window.location.reload(); } else { document.getElementById('error').style.display = 'block'; }
    }
  </script>
</body>
</html>`;

// ─── Helpers ───

function loadJSON(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf-8"));
  } catch {
    return filepath.endsWith("topics.json") ? [] : {};
  }
}

function saveJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function respond(res, code, data, contentType = "application/json") {
  res.writeHead(code, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
  });
  if (typeof data === "string") {
    res.end(data);
  } else {
    res.end(JSON.stringify(data));
  }
}

function loadArticles() {
  if (!fs.existsSync(ARTICLES_DIR)) fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  const files = fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".json")).sort();
  return files.map((f) => {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(ARTICLES_DIR, f), "utf-8"));
      meta._filename = f;
      meta._html_filename = f.replace(".json", ".html");
      return meta;
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// ─── Python Script Runner ───

function runPython(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPT_DIR, scriptName);
    execFile("python3", [scriptPath, ...args], { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

// ─── Groq API Direct Call (Node.js native, no npm packages needed) ───

async function callGroqAPI(config, messages, temperature = 0.75) {
  config = applyEnvOverrides(config);
  const apiKey = config.groq_api_key;
  const model = config.groq_model || "llama-3.3-70b-versatile";

  if (!apiKey) throw new Error("APIキーが設定されていません。設定画面でキーを入力してください。");

  const postData = JSON.stringify({
    model,
    messages,
    temperature,
    max_tokens: 8000,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = require("https").request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          } else {
            resolve(parsed.choices[0].message.content.trim());
          }
        } catch (e) {
          reject(new Error("AIからの応答を解析できませんでした: " + data.substring(0, 200)));
        }
      });
    });

    req.on("error", (e) => reject(new Error("API接続エラー: " + e.message)));
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error("APIリクエストがタイムアウトしました（2分超過）"));
    });
    req.write(postData);
    req.end();
  });
}

function cleanJSON(raw) {
  let s = raw.trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  s = s.replace(/^```(?:json|JSON)?\s*\n?/m, "");
  s = s.replace(/\n?```\s*$/m, "");
  s = s.trim();

  // Try direct parse first
  try {
    return JSON.parse(s);
  } catch (e1) {
    // Try to find JSON object or array within the text
    const objMatch = s.match(/(\{[\s\S]*\})/m);
    const arrMatch = s.match(/(\[[\s\S]*\])/m);
    const match = objMatch || arrMatch;
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (e2) {
        // Try fixing common issues: trailing commas, unescaped newlines in strings
        let fixed = match[1]
          .replace(/,\s*([}\]])/g, "$1")  // trailing commas
          .replace(/\n/g, "\\n");         // newlines in strings
        try {
          return JSON.parse(fixed);
        } catch (e3) {
          // Last resort: log and throw
          console.error("JSON parse failed. Raw (first 500 chars):", raw.substring(0, 500));
          throw new Error("AIの応答をJSONとして解析できませんでした。もう一度お試しください。");
        }
      }
    }
    console.error("No JSON found in response. Raw (first 500 chars):", raw.substring(0, 500));
    throw new Error("AIの応答にJSONが見つかりませんでした。もう一度お試しください。");
  }
}

// ─── microCMS API ───

async function publishToMicroCMS(article) {
  const serviceId = MICROCMS_SERVICE_ID;
  const apiKey = MICROCMS_API_KEY;

  if (!serviceId || !apiKey) {
    throw new Error("microCMSの設定がされていません。設定画面でService IDとAPIキーを入力してください。");
  }

  const postData = JSON.stringify({
    title: article.title || "",
    content: article.html_content || "",
    description: article.meta_description || "",
    category: article.category || "",
    tags: (article.tags || []).join(", "),
    reading_time: article.reading_time || "",
    slug: article.slug || "",
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: `${serviceId}.microcms.io`,
      path: "/api/v1/blogs",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MICROCMS-API-KEY": apiKey,
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = require("https").request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.message || `microCMS APIエラー (${res.statusCode}): ${data.substring(0, 200)}`));
          }
        } catch (e) {
          reject(new Error("microCMSからの応答を解析できませんでした: " + data.substring(0, 200)));
        }
      });
    });

    req.on("error", (e) => reject(new Error("microCMS接続エラー: " + e.message)));
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("microCMSへの接続がタイムアウトしました"));
    });
    req.write(postData);
    req.end();
  });
}

// ─── Categories ───

const CATEGORIES = {
  destinations: "Specific places, cities, regions, and scenic routes in Japan",
  "how-to": "Practical guides on van life, driving, camping, and logistics in Japan",
  culture: "Japanese culture, food, festivals, and traditions experienced from a campervan",
  itineraries: "Multi-day road trip plans and routes",
  tips: "Insider tips, money-saving hacks, and things nobody tells you",
  gear: "Campervan equipment, packing lists, and must-have items",
  seasonal: "Best times to visit, seasonal events, cherry blossoms, autumn leaves, etc.",
  comparison: "Comparing options (campervans vs hotels, regions, rental companies, etc.)",
};

// ─── Prompts ───

const TOPIC_PROMPT = (count, categoryHint) => `You are an SEO and AI-search optimization expert for travel content.

Generate exactly ${count} blog article topic ideas for VANTRIPJAPAN MAGAZINE — a travel blog about exploring Japan by campervan, targeting international travelers (especially French, Australian, and German visitors).
${categoryHint}

CRITICAL REQUIREMENTS:
1. Topics must be optimized for BOTH Google SEO AND AI search engines (ChatGPT, Perplexity, Google AI Overview)
2. Titles should sound like they come from a REAL person who lives in Japan and drives campervans — NOT like an AI wrote them
3. Include a mix of long-tail keyword topics, question-based topics, "I tried X" personal experience topics, comparison/list topics, seasonal/timely topics
4. Avoid generic titles. Each title should make someone think "I NEED to read this"

For EACH topic, provide:
- "title": A compelling, click-worthy English title (first-person perspective preferred)
- "slug": URL-friendly version (lowercase, hyphens)
- "category": One of: destinations, how-to, culture, itineraries, tips, gear, seasonal, comparison
- "seo_keywords": Array of 3-5 target keywords
- "search_intent": What the reader is actually trying to find out
- "difficulty": "low", "medium", or "high"
- "ai_search_potential": "high", "medium", or "low"
- "suggested_questions": Array of 2-3 FAQ questions this article should answer

RESPOND WITH ONLY a valid JSON array. No markdown, no explanation.`;

const ARTICLE_SYSTEM = `You are a travel writer who has been living in Japan for several years and exploring the country by campervan. You write for VANTRIPJAPAN MAGAZINE, a blog targeting international travelers — especially from France, Australia, and Germany.

YOUR WRITING IDENTITY:
- You are a real person sharing genuine experiences, NOT an AI assistant
- You use first person naturally ("I", "we", "my")
- You share specific details only someone who's been there would know
- You occasionally mention minor frustrations or things that didn't go perfectly
- Your tone is like a knowledgeable friend giving advice over beers

⚠️ ACCURACY RULES (CRITICAL — FOLLOW STRICTLY):
1. NEVER invent specific prices, phone numbers, addresses, business names, or opening hours that you are not confident about
2. If you mention a specific place, restaurant, or campsite, only use well-known, verifiable locations
3. For prices, use ranges like "around ¥500-800" or "typically ¥3,000-5,000 per night" instead of exact made-up numbers
4. NEVER fabricate personal anecdotes with specific dates or companion names — keep them vague but authentic ("last spring", "a friend who joined me")
5. If you're unsure about a fact, phrase it as "from what I've heard" or "locals told me" — do NOT state it as definitive
6. Focus on GENERAL travel knowledge that is likely accurate: how road stations work, general camping etiquette, seasonal weather patterns, etc.
7. DO NOT make up specific campsite names or addresses. Instead, mention areas and suggest readers check Google Maps or camping apps

STRICT WRITING RULES:
1. NEVER use: "In this comprehensive guide", "Whether you're a...", "Let's dive in", "In conclusion", "It's worth noting", "comprehensive", "navigate", "landscape", "delve", "embark on a journey", "hidden gem", "game-changer"
2. NEVER start with a question directed at the reader
3. Start articles with a personal anecdote or bold statement
4. Use contractions naturally (don't, won't, I've, etc.)
5. Mix short punchy sentences with longer descriptive ones
6. Include at least one mild self-deprecating joke or honest admission
7. Include practical details but use realistic ranges, not made-up exact numbers
8. End with a genuine personal recommendation

ARTICLE STRUCTURE:
- H1: The title (only one)
- H2: Major sections (4-6 per article)
- H3: Sub-sections as needed
- Include a FAQ section near the end with 3-5 Q&As
- Include a "Pro Tips" section
- Total length: 1800-2500 words
- Write the meta description (150-160 characters)

OUTPUT FORMAT:
Return ONLY a valid JSON object (no markdown fences, no extra text). The JSON must have these keys:
- "title": string — Article title
- "slug": string — URL-friendly slug
- "meta_description": string — SEO meta description (150-160 chars)
- "category": string — Article category
- "tags": array of strings — Relevant tags
- "reading_time": string — Estimated reading time (e.g. "8 min read")
- "html_content": string — Full article body as clean HTML. Use <h2>, <h3>, <p>, <ul>, <li>, <blockquote> tags. Escape all double quotes inside the HTML as &quot; to keep valid JSON.
- "faq_schema": array of objects with "question" and "answer" keys

IMPORTANT: Your entire response must be a single valid JSON object. Do not wrap it in markdown code fences. Do not include any text before or after the JSON.`;

// ─── Build HTML ───

function buildArticleHTML(article) {
  const title = article.title || "";
  const metaDesc = article.meta_description || "";
  const content = article.html_content || "";
  const faqItems = article.faq_schema || [];
  const readingTime = article.reading_time || "";
  const tags = article.tags || [];

  let faqLD = "";
  if (faqItems.length) {
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map((i) => ({
        "@type": "Question",
        name: i.question || "",
        acceptedAnswer: { "@type": "Answer", text: i.answer || "" },
      })),
    };
    faqLD = `<script type="application/ld+json">\n${JSON.stringify(faqSchema, null, 2)}\n</script>`;
  }

  const articleLD = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description: metaDesc,
    author: { "@type": "Person", name: "VanTripJapan" },
    publisher: { "@type": "Organization", name: "VANTRIPJAPAN MAGAZINE" },
    datePublished: new Date().toISOString().split("T")[0],
    keywords: tags.join(", "),
  }, null, 2);

  const tagsHTML = tags.map((t) => `<span class="tag">${t}</span>`).join(" ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | VANTRIPJAPAN MAGAZINE</title>
    <meta name="description" content="${metaDesc}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${metaDesc}">
    <meta property="og:type" content="article">
    <script type="application/ld+json">
${articleLD}
    </script>
    ${faqLD}
</head>
<body>

<!-- ===== STUDIO用コンテンツ（この部分をコピペ） ===== -->

<article>
    <header>
        <h1>${title}</h1>
        <p class="reading-time">📖 ${readingTime}</p>
        <div class="tags">${tagsHTML}</div>
    </header>

    ${content}
</article>

<!-- ===== ここまで ===== -->

</body>
</html>`;
}

// ─── API Routes ───

async function handleAPI(req, res, pathname) {
  // GET /api/config
  if (pathname === "/api/config" && req.method === "GET") {
    const config = loadJSON(CONFIG_PATH);
    const safe = { ...config };
    if (safe.groq_api_key) safe.groq_api_key = safe.groq_api_key.substring(0, 8) + "...";
    if (safe.openai_api_key) safe.openai_api_key = safe.openai_api_key.substring(0, 8) + "...";
    return respond(res, 200, safe);
  }

  // POST /api/config
  if (pathname === "/api/config" && req.method === "POST") {
    const data = await readBody(req);
    const config = loadJSON(CONFIG_PATH);
    if (data.groq_api_key && !data.groq_api_key.endsWith("...")) config.groq_api_key = data.groq_api_key;
    if (data.api_provider) config.api_provider = data.api_provider;
    if (data.groq_model) config.groq_model = data.groq_model;
    saveJSON(CONFIG_PATH, config);
    return respond(res, 200, { ok: true });
  }

  // GET /api/topics
  if (pathname === "/api/topics" && req.method === "GET") {
    return respond(res, 200, loadJSON(TOPICS_PATH));
  }

  // POST /api/topics/generate
  if (pathname === "/api/topics/generate" && req.method === "POST") {
    const data = await readBody(req);
    const count = data.count || 20;
    const category = data.category || "all";
    const config = loadJSON(CONFIG_PATH);

    let categoryHint = "";
    if (category && category !== "all" && CATEGORIES[category]) {
      categoryHint = `\nFocus specifically on: ${category} — ${CATEGORIES[category]}`;
    } else {
      categoryHint = "\nCover ALL categories evenly: " + Object.entries(CATEGORIES).map(([k, v]) => `${k} (${v})`).join(", ");
    }

    try {
      const raw = await callGroqAPI(config, [{ role: "user", content: TOPIC_PROMPT(count, categoryHint) }], 0.8);
      const newTopics = cleanJSON(raw);

      newTopics.forEach((t) => {
        t.generated_at = new Date().toISOString();
        t.status = "pending";
      });

      const existing = loadJSON(TOPICS_PATH);
      const combined = (Array.isArray(existing) ? existing : []).concat(newTopics);
      saveJSON(TOPICS_PATH, combined);

      return respond(res, 200, { topics: newTopics, total: combined.length });
    } catch (e) {
      return respond(res, 500, { error: e.message });
    }
  }

  // DELETE /api/topics/:index
  const topicDeleteMatch = pathname.match(/^\/api\/topics\/(\d+)$/);
  if (topicDeleteMatch && req.method === "DELETE") {
    const idx = parseInt(topicDeleteMatch[1]);
    const topics = loadJSON(TOPICS_PATH);
    if (idx >= 0 && idx < topics.length) {
      topics.splice(idx, 1);
      saveJSON(TOPICS_PATH, topics);
      return respond(res, 200, { ok: true });
    }
    return respond(res, 404, { error: "Invalid index" });
  }

  // GET /api/articles
  if (pathname === "/api/articles" && req.method === "GET") {
    return respond(res, 200, loadArticles());
  }

  // POST /api/articles/generate
  if (pathname === "/api/articles/generate" && req.method === "POST") {
    const data = await readBody(req);
    const topicIndex = data.topic_index;
    const extraInstructions = data.extra_instructions || "";
    const config = loadJSON(CONFIG_PATH);
    const topics = loadJSON(TOPICS_PATH);

    if (topicIndex == null || topicIndex < 0 || topicIndex >= topics.length) {
      return respond(res, 400, { error: "トピック番号が無効です。" });
    }

    const topic = topics[topicIndex];

    const userPrompt = `Write a full blog article for VANTRIPJAPAN MAGAZINE.

ARTICLE DETAILS:
- Title: ${topic.title || ""}
- Target SEO Keywords: ${(topic.seo_keywords || []).join(", ")}
- Category: ${topic.category || ""}
- Reader's Search Intent: ${topic.search_intent || ""}
- FAQ Questions to Answer: ${JSON.stringify(topic.suggested_questions || [])}

${extraInstructions ? `ADDITIONAL INSTRUCTIONS: ${extraInstructions}` : ""}

Remember: Write as a real campervan traveler in Japan. Make it vivid, practical, and genuinely useful. The article must be in English, approximately 2000 words.`;

    try {
      const raw = await callGroqAPI(config, [
        { role: "system", content: ARTICLE_SYSTEM },
        { role: "user", content: userPrompt },
      ]);

      const article = cleanJSON(raw);
      const slug = article.slug || "untitled";
      const timestamp = new Date().toISOString().replace(/[-:T]/g, "").substring(0, 15);

      if (!fs.existsSync(ARTICLES_DIR)) fs.mkdirSync(ARTICLES_DIR, { recursive: true });

      // Save HTML
      const htmlFilename = `${timestamp}_${slug}.html`;
      fs.writeFileSync(path.join(ARTICLES_DIR, htmlFilename), buildArticleHTML(article), "utf-8");

      // Save JSON meta
      const jsonFilename = `${timestamp}_${slug}.json`;
      const meta = {
        title: article.title,
        slug: article.slug,
        meta_description: article.meta_description,
        category: article.category,
        tags: article.tags || [],
        reading_time: article.reading_time,
        faq_schema: article.faq_schema || [],
        generated_at: new Date().toISOString(),
        topic_index: topicIndex,
        status: "generated",
        _filename: jsonFilename,
        _html_filename: htmlFilename,
      };
      saveJSON(path.join(ARTICLES_DIR, jsonFilename), meta);

      // Update topic status
      topics[topicIndex].status = "generated";
      saveJSON(TOPICS_PATH, topics);

      return respond(res, 200, { ...meta, html_content: article.html_content || "" });
    } catch (e) {
      return respond(res, 500, { error: e.message });
    }
  }

  // GET /api/articles/:filename/content
  const contentMatch = pathname.match(/^\/api\/articles\/(.+)\/content$/);
  if (contentMatch && req.method === "GET") {
    const htmlFile = contentMatch[1].replace(".json", ".html");
    const htmlPath = path.join(ARTICLES_DIR, htmlFile);
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, "utf-8");
      const match = html.match(/<!-- ===== STUDIO用コンテンツ.*?-->([\s\S]*?)<!-- ===== ここまで ===== -->/);
      return respond(res, 200, { content: match ? match[1].trim() : html });
    }
    return respond(res, 404, { error: "Not found" });
  }

  // POST /api/articles/:filename/approve
  const approveMatch = pathname.match(/^\/api\/articles\/(.+)\/approve$/);
  if (approveMatch && req.method === "POST") {
    const jsonPath = path.join(ARTICLES_DIR, approveMatch[1]);
    if (fs.existsSync(jsonPath)) {
      const meta = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      meta.status = "approved";
      meta.approved_at = new Date().toISOString();
      saveJSON(jsonPath, meta);
      return respond(res, 200, { ok: true });
    }
    return respond(res, 404, { error: "Not found" });
  }

  // POST /api/articles/:filename/reject
  const rejectMatch = pathname.match(/^\/api\/articles\/(.+)\/reject$/);
  if (rejectMatch && req.method === "POST") {
    const jsonPath = path.join(ARTICLES_DIR, rejectMatch[1]);
    if (fs.existsSync(jsonPath)) {
      const meta = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      meta.status = "rejected";
      saveJSON(jsonPath, meta);
      return respond(res, 200, { ok: true });
    }
    return respond(res, 404, { error: "Not found" });
  }

  // POST /api/articles/:filename/translate — 日本語訳を生成
  const translateMatch = pathname.match(/^\/api\/articles\/(.+)\/translate$/);
  if (translateMatch && req.method === "POST") {
    const htmlFile = translateMatch[1].replace(".json", ".html");
    const htmlPath = path.join(ARTICLES_DIR, htmlFile);
    if (!fs.existsSync(htmlPath)) return respond(res, 404, { error: "Not found" });

    const html = fs.readFileSync(htmlPath, "utf-8");
    const contentMatch = html.match(/<!-- ===== STUDIO用コンテンツ.*?-->([\s\S]*?)<!-- ===== ここまで ===== -->/);
    const content = contentMatch ? contentMatch[1].trim() : html;

    const config = loadJSON(CONFIG_PATH);
    try {
      const translated = await callGroqAPI(config, [
        { role: "system", content: "あなたは正確な翻訳者です。英語のブログ記事を日本語に翻訳してください。HTMLタグはそのまま保持し、テキスト部分のみ翻訳してください。自然な日本語で訳してください。" },
        { role: "user", content: `以下の英語記事を日本語に翻訳してください。HTMLタグはそのまま残してください:\n\n${content}` },
      ], 0.3);
      return respond(res, 200, { translation: translated });
    } catch (e) {
      return respond(res, 500, { error: e.message });
    }
  }

  // POST /api/articles/:filename/publish (microCMS公開)
  const publishMatch = pathname.match(/^\/api\/articles\/(.+)\/publish$/);
  if (publishMatch && req.method === "POST") {
    const jsonPath = path.join(ARTICLES_DIR, publishMatch[1]);
    if (!fs.existsSync(jsonPath)) return respond(res, 404, { error: "Not found" });

    const meta = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

    // Get HTML content
    const htmlFile = publishMatch[1].replace(".json", ".html");
    const htmlPath = path.join(ARTICLES_DIR, htmlFile);
    let htmlContent = "";
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, "utf-8");
      const match = html.match(/<!-- ===== STUDIO用コンテンツ.*?-->([\s\S]*?)<!-- ===== ここまで ===== -->/);
      htmlContent = match ? match[1].trim() : html;
    }

    try {
      const cmsResult = await publishToMicroCMS({ ...meta, html_content: htmlContent });
      meta.status = "published";
      meta.published_at = new Date().toISOString();
      meta.microcms_id = cmsResult.id || "";
      saveJSON(jsonPath, meta);
      return respond(res, 200, { ok: true, microcms_id: cmsResult.id || "" });
    } catch (e) {
      return respond(res, 500, { error: e.message });
    }
  }

  // GET /api/microcms/status (microCMS設定状態チェック)
  if (pathname === "/api/microcms/status" && req.method === "GET") {
    return respond(res, 200, {
      configured: !!(MICROCMS_SERVICE_ID && MICROCMS_API_KEY),
      service_id: MICROCMS_SERVICE_ID ? MICROCMS_SERVICE_ID.substring(0, 4) + "..." : "",
    });
  }

  // POST /api/articles/:filename/regenerate
  const regenMatch = pathname.match(/^\/api\/articles\/(.+)\/regenerate$/);
  if (regenMatch && req.method === "POST") {
    const jsonPath = path.join(ARTICLES_DIR, regenMatch[1]);
    if (!fs.existsSync(jsonPath)) return respond(res, 404, { error: "Not found" });

    const data = await readBody(req);
    const meta = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

    // Mark old as rejected
    meta.status = "rejected";
    saveJSON(jsonPath, meta);

    // Regenerate — create a new request
    const newReq = {
      method: "POST", on: (ev, cb) => {
        if (ev === "data") cb(JSON.stringify({ topic_index: meta.topic_index, extra_instructions: data.extra_instructions || "" }));
        if (ev === "end") cb();
      }
    };
    // Just call the generate logic directly
    const config = loadJSON(CONFIG_PATH);
    const topics = loadJSON(TOPICS_PATH);
    const topic = topics[meta.topic_index];

    const userPrompt = `Write a full blog article for VANTRIPJAPAN MAGAZINE.

ARTICLE DETAILS:
- Title: ${topic.title || ""}
- Target SEO Keywords: ${(topic.seo_keywords || []).join(", ")}
- Category: ${topic.category || ""}
- Reader's Search Intent: ${topic.search_intent || ""}
- FAQ Questions to Answer: ${JSON.stringify(topic.suggested_questions || [])}

${data.extra_instructions ? `ADDITIONAL INSTRUCTIONS: ${data.extra_instructions}` : ""}

IMPORTANT: This is a REGENERATION. Write a COMPLETELY DIFFERENT article from the previous version. Use different anecdotes, different structure, different opening. Same topic, fresh perspective.

Remember: Write as a real campervan traveler in Japan. The article must be in English, approximately 2000 words.`;

    try {
      const raw = await callGroqAPI(config, [
        { role: "system", content: ARTICLE_SYSTEM },
        { role: "user", content: userPrompt },
      ]);

      const article = cleanJSON(raw);
      const slug = article.slug || "untitled";
      const timestamp = new Date().toISOString().replace(/[-:T]/g, "").substring(0, 15);

      const htmlFilename = `${timestamp}_${slug}.html`;
      fs.writeFileSync(path.join(ARTICLES_DIR, htmlFilename), buildArticleHTML(article), "utf-8");

      const jsonFilename = `${timestamp}_${slug}.json`;
      const newMeta = {
        title: article.title,
        slug: article.slug,
        meta_description: article.meta_description,
        category: article.category,
        tags: article.tags || [],
        reading_time: article.reading_time,
        faq_schema: article.faq_schema || [],
        generated_at: new Date().toISOString(),
        topic_index: meta.topic_index,
        status: "generated",
        _filename: jsonFilename,
        _html_filename: htmlFilename,
      };
      saveJSON(path.join(ARTICLES_DIR, jsonFilename), newMeta);

      return respond(res, 200, { ...newMeta, html_content: article.html_content || "" });
    } catch (e) {
      return respond(res, 500, { error: e.message });
    }
  }

  // DELETE /api/articles/:filename
  const deleteMatch = pathname.match(/^\/api\/articles\/([^/]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    const jsonPath = path.join(ARTICLES_DIR, deleteMatch[1]);
    const htmlPath = path.join(ARTICLES_DIR, deleteMatch[1].replace(".json", ".html"));
    let deleted = false;
    [jsonPath, htmlPath].forEach((p) => {
      if (fs.existsSync(p)) { fs.unlinkSync(p); deleted = true; }
    });
    return respond(res, deleted ? 200 : 404, deleted ? { ok: true } : { error: "Not found" });
  }

  return respond(res, 404, { error: "Not found" });
}

// ─── Server ───

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // Login endpoint (no auth required)
  if (pathname === "/api/login" && req.method === "POST") {
    const data = await readBody(req);
    if (data.password === AUTH_PASSWORD) {
      const token = generateToken();
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Set-Cookie": `auth_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`,
      });
      return res.end(JSON.stringify({ ok: true }));
    }
    return respond(res, 401, { error: "パスワードが違います" });
  }

  // Auth check for all other routes
  if (!isAuthenticated(req)) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(LOGIN_HTML);
  }

  // API routes
  if (pathname.startsWith("/api/")) {
    try {
      return await handleAPI(req, res, pathname);
    } catch (e) {
      console.error("API Error:", e);
      return respond(res, 500, { error: e.message });
    }
  }

  // Serve index.html for root
  if (pathname === "/" || pathname === "/index.html") {
    const indexPath = path.join(TEMPLATES_DIR, "index.html");
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(indexPath, "utf-8"));
    }
  }

  // Serve static files
  const staticPath = path.join(SCRIPT_DIR, "static", pathname.replace(/^\/static\//, ""));
  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    const ext = path.extname(staticPath);
    const types = { ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    return res.end(fs.readFileSync(staticPath));
  }

  respond(res, 404, "Not Found", "text/plain");
});

const HOST = process.env.RAILWAY_ENVIRONMENT ? "0.0.0.0" : "127.0.0.1";
server.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║  🚐 VanTripJapan Content Studio             ║
║                                              ║
║  ブラウザで開いてください:                    ║
║  → http://localhost:${PORT}                    ║
║  パスワード: ${AUTH_PASSWORD}                  ║
║                                              ║
║  終了: Ctrl+C                                ║
╚══════════════════════════════════════════════╝
`);
});

#!/usr/bin/env python3
"""
VanTripJapan Content Studio — Webアプリ版
記事の生成・プレビュー・承認をブラウザで操作できるダッシュボード

使い方:
  python3 app.py
  → ブラウザで http://localhost:5500 を開く
"""

import json
import os
import re
import sys
import threading
from datetime import datetime
from flask import Flask, render_template, request, jsonify

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(SCRIPT_DIR, "config.json")
TOPICS_PATH = os.path.join(SCRIPT_DIR, "topics.json")
ARTICLES_DIR = os.path.join(SCRIPT_DIR, "articles")

app = Flask(__name__, template_folder=os.path.join(SCRIPT_DIR, "templates"),
            static_folder=os.path.join(SCRIPT_DIR, "static"))

# ─── Config helpers ───

def load_config():
    with open(CONFIG_PATH, "r") as f:
        return json.load(f)

def save_config(config):
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

def get_ai_client(config):
    provider = config.get("api_provider", "groq")
    if provider == "groq":
        from groq import Groq
        return Groq(api_key=config["groq_api_key"]), config.get("groq_model", "llama-3.3-70b-versatile")
    else:
        from openai import OpenAI
        return OpenAI(api_key=config["openai_api_key"]), config.get("openai_model", "gpt-4o")

# ─── Data helpers ───

def load_topics():
    if not os.path.exists(TOPICS_PATH):
        return []
    with open(TOPICS_PATH, "r") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []

def save_topics(topics):
    with open(TOPICS_PATH, "w") as f:
        json.dump(topics, f, indent=2, ensure_ascii=False)

def load_articles():
    """articlesフォルダから全記事メタデータを読み込む"""
    os.makedirs(ARTICLES_DIR, exist_ok=True)
    articles = []
    for fname in sorted(os.listdir(ARTICLES_DIR)):
        if fname.endswith(".json"):
            path = os.path.join(ARTICLES_DIR, fname)
            with open(path, "r") as f:
                try:
                    meta = json.load(f)
                    meta["_filename"] = fname
                    meta["_html_filename"] = fname.replace(".json", ".html")
                    articles.append(meta)
                except json.JSONDecodeError:
                    pass
    return articles

def load_article_html(html_filename):
    """記事HTMLを読み込む"""
    path = os.path.join(ARTICLES_DIR, html_filename)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""

# ─── Topic generation prompt ───

CATEGORIES = {
    "destinations": "Specific places, cities, regions, and scenic routes in Japan",
    "how-to": "Practical guides on van life, driving, camping, and logistics in Japan",
    "culture": "Japanese culture, food, festivals, and traditions experienced from a campervan",
    "itineraries": "Multi-day road trip plans and routes",
    "tips": "Insider tips, money-saving hacks, and things nobody tells you",
    "gear": "Campervan equipment, packing lists, and must-have items",
    "seasonal": "Best times to visit, seasonal events, cherry blossoms, autumn leaves, etc.",
    "comparison": "Comparing options (campervans vs hotels, regions, rental companies, etc.)",
}

TOPIC_PROMPT_TEMPLATE = """You are an SEO and AI-search optimization expert for travel content.

Generate exactly {count} blog article topic ideas for VANTRIPJAPAN MAGAZINE — a travel blog about exploring Japan by campervan, targeting international travelers (especially French, Australian, and German visitors).
{category_hint}

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

RESPOND WITH ONLY a valid JSON array. No markdown, no explanation."""


ARTICLE_SYSTEM_PROMPT = """You are a travel writer who has been living in Japan for several years and exploring the country by campervan. You write for VANTRIPJAPAN MAGAZINE, a blog targeting international travelers — especially from France, Australia, and Germany.

YOUR WRITING IDENTITY:
- You are a real person sharing genuine experiences, NOT an AI assistant
- You use first person naturally ("I", "we", "my")
- You share specific details only someone who's been there would know
- You occasionally mention minor frustrations or things that didn't go perfectly
- Your tone is like a knowledgeable friend giving advice over beers

STRICT WRITING RULES:
1. NEVER use: "In this comprehensive guide", "Whether you're a...", "Let's dive in", "In conclusion", "It's worth noting", "comprehensive", "navigate", "landscape", "delve", "embark on a journey", "hidden gem", "game-changer"
2. NEVER start with a question directed at the reader
3. Start articles with a personal anecdote or bold statement
4. Use contractions naturally (don't, won't, I've, etc.)
5. Mix short punchy sentences with longer descriptive ones
6. Include at least one mild self-deprecating joke or honest admission
7. Include real practical details: prices in yen, distances, parking specifics
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
Return a JSON object with:
- "title": Article title
- "slug": URL-friendly slug
- "meta_description": SEO meta description (150-160 chars)
- "category": Article category
- "tags": Array of relevant tags
- "reading_time": Estimated reading time
- "html_content": Full article body as clean HTML
- "faq_schema": Array of {question, answer} objects

RESPOND WITH ONLY valid JSON."""


# ─── Routes ───

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/config", methods=["GET"])
def api_get_config():
    config = load_config()
    # Don't expose full API keys
    safe = {**config}
    for key in ["groq_api_key", "openai_api_key"]:
        if safe.get(key):
            safe[key] = safe[key][:8] + "..." if len(safe[key]) > 8 else "***"
    return jsonify(safe)


@app.route("/api/config", methods=["POST"])
def api_save_config():
    data = request.json
    config = load_config()
    if data.get("groq_api_key") and not data["groq_api_key"].endswith("..."):
        config["groq_api_key"] = data["groq_api_key"]
    if data.get("api_provider"):
        config["api_provider"] = data["api_provider"]
    if data.get("groq_model"):
        config["groq_model"] = data["groq_model"]
    save_config(config)
    return jsonify({"ok": True})


@app.route("/api/topics", methods=["GET"])
def api_get_topics():
    return jsonify(load_topics())


@app.route("/api/topics/generate", methods=["POST"])
def api_generate_topics():
    data = request.json or {}
    count = data.get("count", 20)
    category = data.get("category", "all")
    config = load_config()

    if not config.get(f"{config['api_provider']}_api_key"):
        return jsonify({"error": "APIキーが設定されていません。設定画面でキーを入力してください。"}), 400

    try:
        client, model = get_ai_client(config)

        category_hint = ""
        if category and category in CATEGORIES:
            category_hint = f"\nFocus specifically on: {category} — {CATEGORIES[category]}"
        elif category == "all":
            category_hint = "\nCover ALL categories evenly: " + ", ".join(
                [f"{k} ({v})" for k, v in CATEGORIES.items()]
            )

        prompt = TOPIC_PROMPT_TEMPLATE.format(count=count, category_hint=category_hint)

        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8,
            max_tokens=8000,
        )

        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        new_topics = json.loads(raw)
        for t in new_topics:
            t["generated_at"] = datetime.now().isoformat()
            t["status"] = "pending"

        existing = load_topics()
        combined = existing + new_topics
        save_topics(combined)

        return jsonify({"topics": new_topics, "total": len(combined)})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/topics/<int:index>", methods=["DELETE"])
def api_delete_topic(index):
    topics = load_topics()
    if 0 <= index < len(topics):
        topics.pop(index)
        save_topics(topics)
        return jsonify({"ok": True})
    return jsonify({"error": "Invalid index"}), 404


@app.route("/api/articles", methods=["GET"])
def api_get_articles():
    return jsonify(load_articles())


@app.route("/api/articles/generate", methods=["POST"])
def api_generate_article():
    data = request.json or {}
    topic_index = data.get("topic_index")
    extra_instructions = data.get("extra_instructions", "")
    config = load_config()

    if not config.get(f"{config['api_provider']}_api_key"):
        return jsonify({"error": "APIキーが設定されていません。"}), 400

    topics = load_topics()
    if topic_index is None or topic_index < 0 or topic_index >= len(topics):
        return jsonify({"error": "トピック番号が無効です。"}), 400

    topic = topics[topic_index]

    try:
        client, model = get_ai_client(config)

        user_prompt = f"""Write a full blog article for VANTRIPJAPAN MAGAZINE.

ARTICLE DETAILS:
- Title: {topic.get('title', '')}
- Target SEO Keywords: {', '.join(topic.get('seo_keywords', []))}
- Category: {topic.get('category', '')}
- Reader's Search Intent: {topic.get('search_intent', '')}
- FAQ Questions to Answer: {json.dumps(topic.get('suggested_questions', []))}

{f'ADDITIONAL INSTRUCTIONS: {extra_instructions}' if extra_instructions else ''}

Remember: Write as a real campervan traveler in Japan. Make it vivid, practical, and genuinely useful. The article must be in English, approximately 2000 words."""

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": ARTICLE_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.75,
            max_tokens=8000,
        )

        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:])
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        article = json.loads(raw)

        # Save files
        slug = article.get("slug", "untitled")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        os.makedirs(ARTICLES_DIR, exist_ok=True)

        # Save HTML
        html_filename = f"{timestamp}_{slug}.html"
        html_path = os.path.join(ARTICLES_DIR, html_filename)
        html_content = build_article_html(article)
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        # Save JSON meta
        json_filename = f"{timestamp}_{slug}.json"
        json_path = os.path.join(ARTICLES_DIR, json_filename)
        meta = {
            "title": article.get("title"),
            "slug": article.get("slug"),
            "meta_description": article.get("meta_description"),
            "category": article.get("category"),
            "tags": article.get("tags", []),
            "reading_time": article.get("reading_time"),
            "faq_schema": article.get("faq_schema", []),
            "generated_at": datetime.now().isoformat(),
            "topic_index": topic_index,
            "status": "generated",
            "_filename": json_filename,
            "_html_filename": html_filename,
        }
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)

        # Update topic status
        topics[topic_index]["status"] = "generated"
        save_topics(topics)

        return jsonify({**meta, "html_content": article.get("html_content", "")})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/articles/<filename>/html")
def api_article_html(filename):
    html_filename = filename.replace(".json", ".html")
    html = load_article_html(html_filename)
    if html:
        return html, 200, {"Content-Type": "text/html; charset=utf-8"}
    return "Not found", 404


@app.route("/api/articles/<filename>/content")
def api_article_content(filename):
    """記事の本文コンテンツ部分だけ返す（STUDIOコピペ用）"""
    html_filename = filename.replace(".json", ".html")
    html = load_article_html(html_filename)
    if not html:
        return jsonify({"error": "Not found"}), 404

    # Extract content between STUDIO markers
    match = re.search(r"<!-- ===== STUDIO用コンテンツ.*?-->(.*?)<!-- ===== ここまで ===== -->",
                      html, re.DOTALL)
    if match:
        return jsonify({"content": match.group(1).strip()})
    return jsonify({"content": html})


@app.route("/api/articles/<filename>/approve", methods=["POST"])
def api_approve_article(filename):
    path = os.path.join(ARTICLES_DIR, filename)
    if not os.path.exists(path):
        return jsonify({"error": "Not found"}), 404

    with open(path, "r") as f:
        meta = json.load(f)
    meta["status"] = "approved"
    meta["approved_at"] = datetime.now().isoformat()
    with open(path, "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    return jsonify({"ok": True})


@app.route("/api/articles/<filename>/reject", methods=["POST"])
def api_reject_article(filename):
    path = os.path.join(ARTICLES_DIR, filename)
    if not os.path.exists(path):
        return jsonify({"error": "Not found"}), 404

    with open(path, "r") as f:
        meta = json.load(f)
    meta["status"] = "rejected"
    with open(path, "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    return jsonify({"ok": True})


@app.route("/api/articles/<filename>/regenerate", methods=["POST"])
def api_regenerate_article(filename):
    """同じトピックで記事を再生成"""
    path = os.path.join(ARTICLES_DIR, filename)
    if not os.path.exists(path):
        return jsonify({"error": "Not found"}), 404

    with open(path, "r") as f:
        meta = json.load(f)

    topic_index = meta.get("topic_index")
    extra = request.json.get("extra_instructions", "") if request.json else ""

    # Mark old article as rejected
    meta["status"] = "rejected"
    with open(path, "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    # Generate new via the existing endpoint
    from flask import make_response
    with app.test_request_context(json={"topic_index": topic_index, "extra_instructions": extra}):
        return api_generate_article()


@app.route("/api/articles/<filename>", methods=["DELETE"])
def api_delete_article(filename):
    json_path = os.path.join(ARTICLES_DIR, filename)
    html_path = os.path.join(ARTICLES_DIR, filename.replace(".json", ".html"))

    deleted = False
    for p in [json_path, html_path]:
        if os.path.exists(p):
            os.remove(p)
            deleted = True

    if deleted:
        return jsonify({"ok": True})
    return jsonify({"error": "Not found"}), 404


def build_article_html(article):
    title = article.get("title", "")
    meta_desc = article.get("meta_description", "")
    content = article.get("html_content", "")
    faq_items = article.get("faq_schema", [])
    reading_time = article.get("reading_time", "")
    tags = article.get("tags", [])

    faq_ld = ""
    if faq_items:
        faq_entities = [{"@type": "Question", "name": i.get("question", ""),
                         "acceptedAnswer": {"@type": "Answer", "text": i.get("answer", "")}}
                        for i in faq_items]
        faq_ld = '<script type="application/ld+json">\n' + json.dumps({
            "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faq_entities
        }, indent=2) + '\n</script>'

    article_ld = json.dumps({
        "@context": "https://schema.org", "@type": "BlogPosting",
        "headline": title, "description": meta_desc,
        "author": {"@type": "Person", "name": "VanTripJapan"},
        "publisher": {"@type": "Organization", "name": "VANTRIPJAPAN MAGAZINE"},
        "datePublished": datetime.now().strftime("%Y-%m-%d"),
        "keywords": ", ".join(tags)
    }, indent=2)

    tags_html = " ".join([f'<span class="tag">{t}</span>' for t in tags])

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} | VANTRIPJAPAN MAGAZINE</title>
    <meta name="description" content="{meta_desc}">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{meta_desc}">
    <meta property="og:type" content="article">
    <script type="application/ld+json">
{article_ld}
    </script>
    {faq_ld}
</head>
<body>

<!-- ===== STUDIO用コンテンツ（この部分をコピペ） ===== -->

<article>
    <header>
        <h1>{title}</h1>
        <p class="reading-time">📖 {reading_time}</p>
        <div class="tags">{tags_html}</div>
    </header>

    {content}
</article>

<!-- ===== ここまで ===== -->

</body>
</html>"""


# ─── Main ───

if __name__ == "__main__":
    os.makedirs(ARTICLES_DIR, exist_ok=True)
    port = 5500
    print(f"""
╔══════════════════════════════════════════════╗
║  🚐 VanTripJapan Content Studio             ║
║                                              ║
║  ブラウザで開いてください:                    ║
║  → http://localhost:{port}                    ║
║                                              ║
║  終了: Ctrl+C                                ║
╚══════════════════════════════════════════════╝
""")
    app.run(host="127.0.0.1", port=port, debug=False)

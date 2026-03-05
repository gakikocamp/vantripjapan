#!/usr/bin/env python3
"""
VanTripJapan — 記事本文生成ツール

使い方:
  python3 generate_article.py --topic 1              # トピック番号1の記事を生成
  python3 generate_article.py --title "My Title"      # タイトル指定で記事を生成
  python3 generate_article.py --batch 1-5             # 1〜5番の記事を一括生成
"""

import json
import os
import sys
import re
import argparse
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(SCRIPT_DIR, "config.json")


def load_config():
    with open(CONFIG_PATH, "r") as f:
        return json.load(f)


def save_config(config):
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def setup_api_key(config):
    provider = config.get("api_provider", "groq")
    key_field = f"{provider}_api_key"
    if not config.get(key_field):
        print(f"\n🔑 {provider.upper()} APIキーが設定されていません。")
        if provider == "groq":
            print("   https://console.groq.com/keys で無料取得できます。")
        key = input(f"   {provider.upper()} APIキーを入力: ").strip()
        if not key:
            print("❌ キーが入力されませんでした。")
            sys.exit(1)
        config[key_field] = key
        save_config(config)
        print("✅ 保存しました！\n")
    return config


def get_ai_client(config):
    provider = config.get("api_provider", "groq")
    if provider == "groq":
        from groq import Groq
        return Groq(api_key=config["groq_api_key"]), config.get("groq_model", "llama-3.3-70b-versatile")
    else:
        from openai import OpenAI
        return OpenAI(api_key=config["openai_api_key"]), config.get("openai_model", "gpt-4o")


def load_topics():
    topics_path = os.path.join(SCRIPT_DIR, "topics.json")
    if not os.path.exists(topics_path):
        print("❌ topics.json が見つかりません。先に generate_topics.py を実行してください。")
        sys.exit(1)
    with open(topics_path, "r") as f:
        return json.load(f)


def update_topic_status(topic_index, status):
    topics_path = os.path.join(SCRIPT_DIR, "topics.json")
    with open(topics_path, "r") as f:
        topics = json.load(f)
    if 0 <= topic_index < len(topics):
        topics[topic_index]["status"] = status
    with open(topics_path, "w") as f:
        json.dump(topics, f, indent=2, ensure_ascii=False)


SYSTEM_PROMPT = """You are a travel writer who has been living in Japan for several years and exploring the country by campervan. You write for VANTRIPJAPAN MAGAZINE, a blog targeting international travelers — especially from France, Australia, and Germany — who want to explore Japan off the beaten path.

YOUR WRITING IDENTITY:
- You are a real person sharing genuine experiences, NOT an AI assistant
- You use first person naturally ("I", "we", "my")
- You share specific details only someone who's been there would know (the smell of the onsen, the sound of cicadas at a rest stop, etc.)
- You occasionally mention minor frustrations or things that didn't go perfectly — this adds authenticity
- Your tone is like a knowledgeable friend giving advice over beers, not a textbook

STRICT WRITING RULES — NEVER BREAK THESE:
1. NEVER use these AI cliché phrases: "In this comprehensive guide", "Whether you're a...", "Let's dive in", "In conclusion", "It's worth noting", "comprehensive", "navigate", "landscape", "delve", "embark on a journey", "hidden gem" (unless used ironically), "game-changer", "It goes without saying"
2. NEVER start with a question directed at the reader ("Have you ever wondered...")
3. NEVER use the word "comprehensive" or "ultimate" in the title or text
4. Start articles with a personal anecdote, a specific scene, or a bold statement — NOT a generic intro
5. Use contractions naturally (don't, won't, I've, etc.)
6. Mix short punchy sentences with longer descriptive ones
7. Include at least one mild self-deprecating joke or honest admission
8. Reference specific Japanese words with natural explanations (don't over-translate)
9. Include real practical details: prices in yen, distances, parking specifics, etc.
10. End with a genuine personal recommendation, NOT a "in summary" section

ARTICLE STRUCTURE RULES:
- H1: The title (only one)
- H2: Major sections (4-6 per article)
- H3: Sub-sections as needed
- Include a "Quick Answers" or FAQ section near the end with 3-5 Q&As formatted for AI search engines
- Include a "Pro Tips" section with 3-5 practical tips
- Total length: 1800-2500 words
- Write the meta description (150-160 characters) that sounds human and compelling

OUTPUT FORMAT:
Return a JSON object with these fields:
- "title": The article title
- "slug": URL-friendly slug
- "meta_description": SEO meta description (150-160 chars)
- "category": Article category
- "tags": Array of relevant tags
- "reading_time": Estimated reading time (e.g., "8 min read")
- "html_content": The full article body as clean HTML (use <h2>, <h3>, <p>, <ul>, <li>, <blockquote>, <strong>, <em> tags)
- "faq_schema": Array of {question, answer} objects for FAQ structured data

RESPOND WITH ONLY valid JSON. No markdown wrapping, no explanation."""


def generate_article(config, topic_data):
    """AIを使って記事を生成"""
    client, model = get_ai_client(config)

    title = topic_data.get("title", "")
    keywords = topic_data.get("seo_keywords", [])
    questions = topic_data.get("suggested_questions", [])
    search_intent = topic_data.get("search_intent", "")
    category = topic_data.get("category", "")

    user_prompt = f"""Write a full blog article for VANTRIPJAPAN MAGAZINE.

ARTICLE DETAILS:
- Title: {title}
- Target SEO Keywords: {', '.join(keywords)}
- Category: {category}
- Reader's Search Intent: {search_intent}
- FAQ Questions to Answer: {json.dumps(questions)}

Remember: Write as a real campervan traveler in Japan sharing authentic experiences. Make it vivid, practical, and genuinely useful. Include specific Japanese locations, real prices, and insider details.

The article must be in English and approximately 2000 words."""

    print(f"✍️  記事を生成中: {title}")
    print(f"   （これには30〜60秒かかることがあります...）\n")

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.75,
        max_tokens=8000,
    )

    raw = response.choices[0].message.content.strip()

    # Clean up potential markdown wrapping
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:])
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    article = json.loads(raw)
    return article


def save_article(article, config):
    """記事をHTMLとJSONで保存"""
    articles_dir = os.path.join(SCRIPT_DIR, config.get("articles_output", "articles/"))
    os.makedirs(articles_dir, exist_ok=True)

    slug = article.get("slug", "untitled")
    timestamp = datetime.now().strftime("%Y%m%d")

    # Save HTML file (ready to paste into STUDIO)
    html_path = os.path.join(articles_dir, f"{timestamp}_{slug}.html")
    html_content = build_full_html(article)
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    # Save JSON metadata
    json_path = os.path.join(articles_dir, f"{timestamp}_{slug}.json")
    meta = {
        "title": article.get("title"),
        "slug": article.get("slug"),
        "meta_description": article.get("meta_description"),
        "category": article.get("category"),
        "tags": article.get("tags", []),
        "reading_time": article.get("reading_time"),
        "faq_schema": article.get("faq_schema", []),
        "generated_at": datetime.now().isoformat(),
    }
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    return html_path, json_path


def build_full_html(article):
    """STUDIO用の綺麗なHTMLを生成"""
    title = article.get("title", "")
    meta_desc = article.get("meta_description", "")
    content = article.get("html_content", "")
    faq_items = article.get("faq_schema", [])
    reading_time = article.get("reading_time", "")
    tags = article.get("tags", [])

    # Build FAQ structured data (JSON-LD)
    faq_ld = ""
    if faq_items:
        faq_entities = []
        for item in faq_items:
            faq_entities.append({
                "@type": "Question",
                "name": item.get("question", ""),
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": item.get("answer", "")
                }
            })

        faq_schema = {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": faq_entities
        }
        faq_ld = f'<script type="application/ld+json">\n{json.dumps(faq_schema, indent=2)}\n</script>'

    # Article structured data
    article_ld = json.dumps({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": title,
        "description": meta_desc,
        "author": {
            "@type": "Person",
            "name": "VanTripJapan"
        },
        "publisher": {
            "@type": "Organization",
            "name": "VANTRIPJAPAN MAGAZINE"
        },
        "datePublished": datetime.now().strftime("%Y-%m-%d"),
        "keywords": ", ".join(tags)
    }, indent=2)

    tags_html = " ".join([f'<span class="tag">{tag}</span>' for tag in tags])

    html = f"""<!DOCTYPE html>
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

    return html


def main():
    parser = argparse.ArgumentParser(description="VanTripJapan 記事生成ツール")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--topic", type=int, help="トピック番号（topics.jsonから）")
    group.add_argument("--title", type=str, help="記事タイトルを直接指定")
    group.add_argument("--batch", type=str, help="一括生成 (例: 1-5)")
    args = parser.parse_args()

    config = load_config()
    config = setup_api_key(config)

    if args.batch:
        # バッチモード
        match = re.match(r"(\d+)-(\d+)", args.batch)
        if not match:
            print("❌ バッチ指定は 1-5 のような形式で入力してください。")
            sys.exit(1)

        start, end = int(match.group(1)), int(match.group(2))
        topics = load_topics()

        if start < 1 or end > len(topics):
            print(f"❌ トピック範囲が無効です。1〜{len(topics)}の間で指定してください。")
            sys.exit(1)

        print(f"\n🚀 {start}〜{end}番のトピック({end - start + 1}件)を一括生成します\n")

        for i in range(start - 1, end):
            topic = topics[i]
            print(f"\n{'='*50}")
            print(f"📝 [{i+1}/{end}] {topic['title']}")
            print(f"{'='*50}")

            try:
                update_topic_status(i, "writing")
                article = generate_article(config, topic)
                html_path, json_path = save_article(article, config)
                update_topic_status(i, "published")
                print(f"✅ 保存完了: {os.path.basename(html_path)}")
            except Exception as e:
                print(f"❌ エラー: {e}")
                update_topic_status(i, "error")
                continue

        print(f"\n🎉 一括生成完了！")

    elif args.topic:
        # 単一トピックモード
        topics = load_topics()
        idx = args.topic - 1

        if idx < 0 or idx >= len(topics):
            print(f"❌ トピック番号 {args.topic} が見つかりません。(1〜{len(topics)})")
            sys.exit(1)

        topic = topics[idx]
        update_topic_status(idx, "writing")

        article = generate_article(config, topic)
        html_path, json_path = save_article(article, config)
        update_topic_status(idx, "published")

        print(f"\n✅ 記事を生成しました！")
        print(f"   HTML: {html_path}")
        print(f"   メタ: {json_path}")
        print(f"\n📋 STUDIOへの貼り付け方:")
        print(f"   1. {html_path} を開く")
        print(f"   2. <!-- STUDIO用コンテンツ --> の間にある本文をコピー")
        print(f"   3. STUDIOのCMSダッシュボードに貼り付け")

    else:
        # タイトル直接指定モード
        topic_data = {
            "title": args.title,
            "slug": re.sub(r"[^a-z0-9]+", "-", args.title.lower()).strip("-"),
            "category": "general",
            "seo_keywords": [],
            "search_intent": "",
            "suggested_questions": [],
        }

        article = generate_article(config, topic_data)
        html_path, json_path = save_article(article, config)

        print(f"\n✅ 記事を生成しました！")
        print(f"   HTML: {html_path}")
        print(f"   メタ: {json_path}")


if __name__ == "__main__":
    main()

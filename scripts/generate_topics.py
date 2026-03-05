#!/usr/bin/env python3
"""
VanTripJapan — SEO/AI検索に強いトピック＆タイトル生成ツール

使い方:
  python3 generate_topics.py              # 30件のトピックを生成
  python3 generate_topics.py --count 50   # 50件のトピックを生成
  python3 generate_topics.py --category destinations  # カテゴリ指定
"""

import json
import os
import sys
import argparse
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(SCRIPT_DIR, "config.json")


def load_config():
    """設定ファイルを読み込む"""
    with open(CONFIG_PATH, "r") as f:
        return json.load(f)


def save_config(config):
    """設定ファイルを保存する"""
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def setup_api_key(config):
    """APIキーが未設定なら入力を求める"""
    provider = config.get("api_provider", "groq")
    key_field = f"{provider}_api_key"

    if not config.get(key_field):
        print(f"\n🔑 {provider.upper()} APIキーが設定されていません。")
        if provider == "groq":
            print("   Groqの無料キーは https://console.groq.com/keys で取得できます。")
        else:
            print("   OpenAIキーは https://platform.openai.com/api-keys で取得できます。")

        key = input(f"\n   {provider.upper()} APIキーを入力: ").strip()
        if not key:
            print("❌ キーが入力されませんでした。終了します。")
            sys.exit(1)

        config[key_field] = key
        save_config(config)
        print("✅ キーを保存しました！\n")

    return config


def get_ai_client(config):
    """AI クライアントを作成"""
    provider = config.get("api_provider", "groq")

    if provider == "groq":
        from groq import Groq
        return Groq(api_key=config["groq_api_key"]), config.get("groq_model", "llama-3.3-70b-versatile")
    else:
        from openai import OpenAI
        return OpenAI(api_key=config["openai_api_key"]), config.get("openai_model", "gpt-4o")


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


def generate_topics(config, count=30, category=None):
    """AIを使ってトピックを生成"""
    client, model = get_ai_client(config)

    category_hint = ""
    if category and category in CATEGORIES:
        category_hint = f"\nFocus specifically on this category: {category} — {CATEGORIES[category]}"
    elif category == "all":
        category_hint = "\nCover ALL of these categories evenly: " + ", ".join(
            [f"{k} ({v})" for k, v in CATEGORIES.items()]
        )

    prompt = f"""You are an SEO and AI-search optimization expert for travel content.

Generate exactly {count} blog article topic ideas for VANTRIPJAPAN MAGAZINE — a travel blog about exploring Japan by campervan, targeting international travelers (especially French, Australian, and German visitors).
{category_hint}

CRITICAL REQUIREMENTS:
1. Topics must be optimized for BOTH Google SEO AND AI search engines (ChatGPT, Perplexity, Google AI Overview)
2. Titles should sound like they come from a REAL person who lives in Japan and drives campervans — NOT like an AI wrote them
3. Include a mix of:
   - Long-tail keyword topics (easier to rank for)
   - Question-based topics (great for AI search citations)
   - "I tried X" personal experience topics
   - Comparison/list topics
   - Seasonal/timely topics
4. Avoid generic titles. Each title should make someone think "I NEED to read this"
5. Think about what someone planning a campervan trip to Japan would actually Google or ask an AI

For EACH topic, provide:
- "title": A compelling, click-worthy English title (first-person perspective preferred)
- "slug": URL-friendly version (lowercase, hyphens)
- "category": One of: destinations, how-to, culture, itineraries, tips, gear, seasonal, comparison
- "seo_keywords": Array of 3-5 target keywords
- "search_intent": What the reader is actually trying to find out
- "difficulty": "low", "medium", or "high" (how competitive the keyword is)
- "ai_search_potential": "high", "medium", or "low" (how likely AI search will cite this)
- "suggested_questions": Array of 2-3 FAQ questions this article should answer

RESPOND WITH ONLY a valid JSON array. No markdown, no explanation, just the JSON array."""

    print(f"\n🔍 {count}件のトピックを生成中...\n")

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.8,
        max_tokens=8000,
    )

    raw = response.choices[0].message.content.strip()

    # Clean up potential markdown wrapping
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    topics = json.loads(raw)
    return topics


def save_topics(topics, config):
    """トピックをJSONファイルに保存"""
    output_path = os.path.join(SCRIPT_DIR, config.get("topics_output", "topics.json"))

    # Load existing topics if file exists
    existing = []
    if os.path.exists(output_path):
        with open(output_path, "r") as f:
            try:
                existing = json.load(f)
            except json.JSONDecodeError:
                existing = []

    # Add metadata
    for topic in topics:
        topic["generated_at"] = datetime.now().isoformat()
        topic["status"] = "pending"  # pending, writing, published

    combined = existing + topics

    with open(output_path, "w") as f:
        json.dump(combined, f, indent=2, ensure_ascii=False)

    return output_path, len(combined)


def display_topics(topics):
    """生成されたトピックを見やすく表示"""
    print("=" * 70)
    print("📝 生成されたトピック一覧")
    print("=" * 70)

    for i, topic in enumerate(topics, 1):
        difficulty_emoji = {"low": "🟢", "medium": "🟡", "high": "🔴"}.get(
            topic.get("difficulty", "medium"), "⚪"
        )
        ai_emoji = {"high": "🤖✨", "medium": "🤖", "low": "⚪"}.get(
            topic.get("ai_search_potential", "medium"), "⚪"
        )

        print(f"\n{i}. {topic['title']}")
        print(f"   カテゴリ: {topic.get('category', 'N/A')} | 難易度: {difficulty_emoji} {topic.get('difficulty', 'N/A')} | AI検索: {ai_emoji}")
        print(f"   キーワード: {', '.join(topic.get('seo_keywords', []))}")
        print(f"   検索意図: {topic.get('search_intent', 'N/A')}")

        questions = topic.get("suggested_questions", [])
        if questions:
            print(f"   Q&A候補: {questions[0]}")

    print("\n" + "=" * 70)


def main():
    parser = argparse.ArgumentParser(description="VanTripJapan トピック生成ツール")
    parser.add_argument("--count", type=int, default=30, help="生成するトピック数 (デフォルト: 30)")
    parser.add_argument(
        "--category",
        choices=list(CATEGORIES.keys()) + ["all"],
        default="all",
        help="カテゴリ指定",
    )
    args = parser.parse_args()

    config = load_config()
    config = setup_api_key(config)

    topics = generate_topics(config, count=args.count, category=args.category)
    display_topics(topics)

    output_path, total = save_topics(topics, config)
    print(f"\n✅ {len(topics)}件のトピックを保存しました！")
    print(f"   ファイル: {output_path}")
    print(f"   合計トピック数: {total}")
    print(f"\n📌 次のステップ: python3 generate_article.py --topic 1")


if __name__ == "__main__":
    main()

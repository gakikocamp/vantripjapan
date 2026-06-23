#!/usr/bin/env python3
"""
VanTripJapan — Local's Pick ブログ記事を CMS (D1) に投入するスクリプト
実行方法: python3 post_locals_articles.py
"""
import subprocess
import json
import uuid
import os
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONTENT_DIR = os.path.join(BASE_DIR, "content")

articles = [
    {
        "slug": "summer-kyushu-locals-guide",
        "title": "Summer in Kyushu: A Local's Guide to Beating the Heat",
        "excerpt": "Kyushu summers are brutal — but locals have turned beating the heat into an art form. From secret waterfall swimming holes to the finest kakigōri, morning onsen to wild summer festivals, here's your insider guide to loving summer in southern Japan.",
        "cover_image": "/images/article-summer-kyushu-locals.png",
        "category": "Stories",
        "published_at": "2026-06-23",
        "body_file": "article-summer-kyushu-locals.html",
    },
    {
        "slug": "kyushu-drives-locals-love",
        "title": "5 Kyushu Drives That Locals Actually Love (Not Just the Tourist Routes)",
        "excerpt": "Forget the guidebook routes. These are the drives we do on our days off — the ones where we know exactly when to leave, where to stop for coffee, and which curve has the best view. Five local-favorite Kyushu drives with all the insider details.",
        "cover_image": "/images/article-kyushu-drives-locals.png",
        "category": "Stories",
        "published_at": "2026-06-23",
        "body_file": "article-kyushu-drives-locals.html",
    },
    {
        "slug": "kyushu-local-food-guide",
        "title": "Eating Your Way Through Kyushu: The Local Foods You Won't Find in Tokyo",
        "excerpt": "Ask any Japanese person where the best everyday food is, and they'll say Kyushu. From Hakata udon to Kumamoto horse sashimi, Oita karaage to Kagoshima black pork — a local's guide to the bold, unapologetic flavors of southern Japan.",
        "cover_image": "/images/article-kyushu-local-food.png",
        "category": "Food",
        "published_at": "2026-06-23",
        "body_file": "article-kyushu-local-food.html",
    },
]

def escape_sql(s):
    """Escape single quotes for SQL"""
    return s.replace("'", "''")

def main():
    sql_parts = [
        "-- VanTripJapan Local's Pick シリーズ記事投入SQL",
        f"-- 生成日: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "-- 実行方法: npx wrangler d1 execute camjyo-cms --remote --file=./insert-locals-articles.sql",
        "",
    ]
    
    for i, article in enumerate(articles, 1):
        body_path = os.path.join(CONTENT_DIR, article["body_file"])
        
        if not os.path.exists(body_path):
            print(f"❌ File not found: {body_path}")
            continue
            
        with open(body_path, "r", encoding="utf-8") as f:
            body = f.read().strip()
        
        article_id = str(uuid.uuid4())
        now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        
        sql = f"""-- 記事{i}: {article['title']}
INSERT INTO articles (id, site, type, slug, title, excerpt, body, cover_image, category, status, published_at, created_at, updated_at, author, tags) VALUES (
  '{article_id}',
  'vantrip',
  'article',
  '{escape_sql(article["slug"])}',
  '{escape_sql(article["title"])}',
  '{escape_sql(article["excerpt"])}',
  '{escape_sql(body)}',
  '{escape_sql(article["cover_image"])}',
  '{escape_sql(article["category"])}',
  'published',
  '{article["published_at"]}',
  '{now}',
  '{now}',
  'VanTripJapan',
  'locals-pick'
);
"""
        sql_parts.append(sql)
        print(f"✅ 記事{i}: {article['title']} ({len(body)} bytes)")
    
    # Write SQL file
    sql_path = os.path.join(BASE_DIR, "insert-locals-articles.sql")
    with open(sql_path, "w", encoding="utf-8") as f:
        f.write("\n".join(sql_parts))
    
    print(f"\n📄 SQL file written to: {sql_path}")
    print(f"🚀 Run: npx wrangler d1 execute camjyo-cms --remote --file=./insert-locals-articles.sql")

if __name__ == "__main__":
    main()

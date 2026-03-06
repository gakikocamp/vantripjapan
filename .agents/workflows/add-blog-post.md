---
description: 新しいブログ記事を追加する手順
---

# ブログ記事の追加方法

## 手順

// turbo-all

1. テンプレートをコピーして新しい記事フォルダを作成:
```bash
mkdir -p site/posts/YOUR-SLUG
cp site/posts/_template.html site/posts/YOUR-SLUG/index.html
```

2. `site/posts/YOUR-SLUG/index.html` を開いて以下の変数を置換:

| 変数 | 説明 | 例 |
|------|------|-----|
| `{{TITLE}}` | 記事タイトル | `Best Onsen in Kyushu` |
| `{{DESCRIPTION}}` | 記事の概要（SEO用） | `Discover the top 10...` |
| `{{CATEGORY}}` | カテゴリー名 | `Guide` / `Tips` / `Culture` / `How-To` |
| `{{DATE_DISPLAY}}` | 表示用日付 | `2025.05.01` |
| `{{DATE_ISO}}` | ISO日付 | `2025-05-01` |
| `{{IMAGE_FILE}}` | 画像ファイル名 | `article-kyushu-onsen.png` |
| `{{EXCERPT}}` | 記事の導入文 | `The best hot springs...` |
| `{{READ_TIME}}` | 読了時間（分） | `7` |
| `{{ARTICLE_CONTENT}}` | 記事本文（HTML） | `<h2>...</h2><p>...</p>` |
| `{{RELATED_ARTICLES}}` | 関連記事カード（HTML） | 他の記事カードを3つ |

3. 記事用の画像を `site/images/` に配置する

4. `site/sitemap.xml` に新しい記事のURLを追加:
```xml
<url>
  <loc>https://vantripjapan.jp/posts/YOUR-SLUG/</loc>
  <lastmod>YYYY-MM-DD</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.8</priority>
</url>
```

5. トップページ `site/index.html` の記事グリッドに新しいカードを追加（任意）

6. Gitでコミット＆プッシュ:
```bash
cd "/Users/doko/Library/Mobile Documents/iCloud~md~obsidian/Documents/SecondGaki/VanTripJapan"
git add -A && git commit -m "Add new article: YOUR-TITLE" && git push origin main
```

Cloudflare Pagesが自動でデプロイしてくれます。

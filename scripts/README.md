# VanTripJapan Content Studio

SEO/AI検索に最適化されたブログ記事を生成・管理するスタッフ向けダッシュボード。

## 機能
- 🎯 SEO最適化トピック生成
- ✍️ 体験者視点の英語記事を自動生成
- 👁️ ブログ風プレビュー
- 👍 承認 / 🔄 再生成 ワークフロー
- 📋 STUDIOへのワンクリックコピー
- 🔒 パスワード保護

## デプロイ

### 環境変数（必須）
| 変数 | 説明 |
|------|------|
| `GROQ_API_KEY` | Groq APIキー |
| `AUTH_PASSWORD` | ログインパスワード |

### ローカル実行
```bash
node server.js
```

## Tech
- Node.js (npm パッケージ不要)
- Groq API (Llama 3.3 70B)

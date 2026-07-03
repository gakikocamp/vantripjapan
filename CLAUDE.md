# VanTripJapan — プロジェクトルール

## 🚨 公開ガードレール（最重要・例外なし）

**このリポジトリ（github.com/gakikocamp/vantripjapan）はPUBLICです。pushした内容は誰でも閲覧できます。**

### git push
- pre-push フックが自動で `scripts/security-audit.sh` を実行し、監査FAILならpushは中止される
- **force push・リモートブランチ削除は禁止**（フックがブロックする）
- `--no-verify` によるフック回避は禁止。監査が誤検知した場合は回避ではなく `scripts/security-audit.sh` 冒頭の許可リストを直すこと
- 初回セットアップ（クローン直後に1回）: `git config core.hooksPath .githooks`

### デプロイ
- **`scripts/safe-deploy.sh` だけが公式のデプロイ経路。** `npx wrangler pages deploy` を直接実行しないこと
- safe-deploy は次をすべて強制する: ①作業ツリーがクリーン（=コミット済みでロールバック可能）②セキュリティ監査PASS ③i18n/品質QA PASS ④デプロイ ⑤本番URLのHTTP 200＋言語マーカー実機検証
- 問題発生時は Cloudflare Pages のデプロイ履歴から直前版にロールバックできる

### 秘密情報・PII
- APIキー等は `.env`（gitignore済み）・Cloudflare環境変数・GitHub Secrets のみ。コード直書き禁止
- 顧客の氏名・メール・電話番号をリポジトリに入れない。メール/電話の許可リストは `scripts/security-audit.sh` 冒頭で管理

## 🌍 多言語ページの運用

- `/fr/ /de/ /zh/ /he/` 配下は **生成物**。直接編集せず、EN原本か `site/js/i18n.js` の辞書を直してから `node scripts/build-i18n-pages.js` で再生成する
- 新しいUI文言を足すときは5言語（en/fr/de/zh/he）すべて辞書に追加する（`scripts/qa-i18n-smoke.js` がキー数不一致を検出する）
- メタタイトル/description と JSON-LD 対訳は `scripts/build-i18n-pages.js` 内の META / LD_EXTRA で管理
- sitemap は `functions/sitemap.xml.js` が動的生成（静的 site/sitemap.xml は非公開環境用のフォールバック）

## 📰 記事コンテンツ

- ブログ記事のHTML直打ちは絶対禁止。必ずCMS（camjyo.com/admin、D1 site='vantrip'）経由
- 本番D1への直接書き込み（INSERT/UPDATE/DELETE）は禁止。読み取り確認は品質スクリプト経由で行う
- 記事追加・画像変更後は `/キャンジョ会社用/verify_seo_geo_quality.py` をPASSさせてからデプロイする（親CLAUDE.mdの画像404/Monotonyルール参照）

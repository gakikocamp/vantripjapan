#!/usr/bin/env node
/**
 * Google Flow UI 確認スクリプト
 * Chromeのプロファイルを使用してログイン状態を引き継ぐ
 */

const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

// ログイン情報を保存するフォルダ（初回のみ手動ログインが必要）
const PROFILE_DIR = path.join(os.homedir(), '.vtj-browser-profile');
const OUT_DIR = path.join(__dirname, '..', 'site', 'images');
const FLOW_URL = 'https://labs.google/fx/ja/tools/flow';
// macOS の Chrome 実行ファイルパス
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function main() {
  console.log('Chrome を起動中...');
  console.log(`プロファイル保存先: ${PROFILE_DIR}`);

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--no-first-run', '--no-default-browser-check'],
    viewport: { width: 1280, height: 900 },
  });

  const page = browser.pages()[0] || await browser.newPage();

  console.log(`Flow を開いています: ${FLOW_URL}`);
  await page.goto(FLOW_URL, { waitUntil: 'networkidle', timeout: 30000 });

  // 3秒待ってUIが安定するのを待つ
  await page.waitForTimeout(3000);

  // スクリーンショットを撮る
  const ssPath = path.join(OUT_DIR, '_flow-ui.png');
  await page.screenshot({ path: ssPath, fullPage: false });
  console.log(`スクリーンショット保存: ${ssPath}`);

  // ページのURL（リダイレクト後）とタイトルを表示
  console.log(`現在のURL: ${page.url()}`);
  console.log(`タイトル: ${await page.title()}`);

  // 入力欄・ボタンの候補を探す
  const inputs = await page.$$eval('textarea, input[type="text"]', els =>
    els.map(el => ({ tag: el.tagName, placeholder: el.placeholder, id: el.id, class: el.className.slice(0, 60) }))
  );
  console.log('\n入力欄:', JSON.stringify(inputs, null, 2));

  await browser.close();
  console.log('\n完了。スクリーンショットを確認してください。');
}

main().catch(e => {
  console.error('エラー:', e.message);
  process.exit(1);
});

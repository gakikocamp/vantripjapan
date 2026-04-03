#!/usr/bin/env node
/**
 * Flow ログインセットアップ
 * 初回のみ実行。ブラウザでGoogleにログインしてFlowを開いてください。
 * ログイン完了後、Ctrl+C で終了するとセッションが保存されます。
 */

const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

const PROFILE_DIR = path.join(os.homedir(), '.vtj-browser-profile');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function main() {
  console.log('Chrome を起動中...');
  console.log(`プロファイル: ${PROFILE_DIR}`);
  console.log('');
  console.log('ブラウザが開いたら:');
  console.log('  1. Googleアカウントにログイン');
  console.log('  2. https://labs.google/fx/ja/tools/flow を開いて動作確認');
  console.log('  3. ログイン完了したら Ctrl+C でこのスクリプトを終了');
  console.log('');

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--no-first-run', '--no-default-browser-check'],
    viewport: { width: 1280, height: 900 },
  });

  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('https://accounts.google.com/', { timeout: 30000 });

  console.log('Googleログインページを開きました。');
  console.log('ログイン後に Ctrl+C で終了してください。\n');

  // Ctrl+C まで待機
  process.on('SIGINT', async () => {
    console.log('\nセッションを保存して終了します...');
    await browser.close();
    console.log('完了！次回から自動でログイン状態が引き継がれます。');
    process.exit(0);
  });

  // 無限待機
  await new Promise(() => {});
}

main().catch(e => {
  console.error('エラー:', e.message);
  process.exit(1);
});

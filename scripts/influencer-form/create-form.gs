/**
 * VanTrip Japan / 九州キャンピングカー無償貸出 発信者募集フォーム 自動生成スクリプト
 *
 * 使い方:
 *   1. https://script.google.com/ で新規プロジェクトを作る
 *   2. このファイルの中身を全部貼り付ける
 *   3. 下の CONFIG を書き換える（合言葉は必ず変える）
 *   4. 関数 createVanTripApplicationForm を選んで実行、初回は権限を承認
 *   5. 実行ログに出る「編集URL」「回答URL」を控える
 *   6. ログに出る手動追加リスト（ファイルアップロード設問）だけフォーム画面で足す
 *
 * 設計意図:
 *   本気の応募者は30分かけて埋める。冷やかしは第2セクションで離脱する。
 *   数字は「平均」ではなく「中央値」を、証拠はスクショの共有リンクを要求している。
 *   ここが盛れないので、実力のない応募は自分から消える。
 */

var CONFIG = {
  title: '【九州キャンピングカー無償貸出】発信者募集 応募フォーム',

  // 募集文の本文中にだけ書いておく合言葉。ここを変えたら募集文も変える。
  // 「フォームだけ見て埋めた人」「AIに丸投げした人」をここで落とす。
  passphrase: 'BONGO九州',

  // 引き渡し拠点
  handoverPlace: '福岡市内の指定場所',

  // 応募締切（表示用テキスト）
  deadline: '2026年10月31日 23:59（日本時間）',

  // 回答スプレッドシートも同時に作るか
  createSpreadsheet: true
};

/** メイン関数。これを実行する。 */
function createVanTripApplicationForm() {
  var form = FormApp.create(CONFIG.title);

  form.setDescription(
    [
      'ご応募ありがとうございます。',
      '',
      '選考はこのフォームの記入内容のみで行います。',
      'DM・コメント・メールでのご応募は選考の対象になりません。',
      '',
      '締切: ' + CONFIG.deadline,
      '',
      'SNSの実績は、フォロワー数ではなく直近の投稿のリーチ数とインサイト画面で拝見します。',
      '下記をお手元にそろえてから始めるとスムーズです。',
      '',
      '【始める前にご用意ください】',
      '1. 運用中のSNSアカウントのURL（すべて）',
      '2. 直近10投稿のインサイト画面のスクリーンショット',
      '3. フォロワーの上位国データのスクリーンショット',
      '4. 上記スクショをアップロードした共有リンク',
      '   （Googleドライブ等、閲覧権限を「リンクを知っている全員」にしたもの）',
      '5. 運転免許の情報（発行国・取得年）',
      '6. 希望する旅の日程'
    ].join('\n')
  );

  configureFormSettings(form);

  // 先に「お断りページ」を作らず、最後に足して分岐をつなぐため参照だけ用意する
  var refs = {};

  buildSectionBasic(form);
  buildSectionDriving(form, refs);
  buildSectionSns(form);
  buildSectionLanguage(form);
  buildSectionPlan(form);
  buildSectionSchedule(form, refs);
  buildSectionAgreement(form);
  var lastPage = buildSectionFinal(form);

  // 通常フローは最終セクションで送信して終わる
  lastPage.setGoToPage(FormApp.PageNavigationType.SUBMIT);

  // お断りページを末尾に置き、ゲート設問から飛ばす
  var rejectPage = form.addPageBreakItem()
    .setTitle('今回はご応募をお受けできません')
    .setHelpText(
      [
        'ご回答ありがとうございます。',
        '日本国内で当該車両を運転できる条件（有効な免許および運転歴）を満たしていないため、',
        '今回はご応募をお受けできません。',
        '',
        '条件が変わりましたら、またぜひご応募ください。',
        '下の送信ボタンを押して終了してください。'
      ].join('\n')
    );

  refs.rejectChoices.forEach(function (fn) { fn(rejectPage); });

  form.setConfirmationMessage(
    [
      'ご応募ありがとうございました。',
      '',
      '選考結果は、ご入力いただいたメールアドレス宛に締切後2週間以内にご連絡します。',
      '応募多数のため、通過された方のみへのご連絡となります。ご了承ください。',
      '',
      '結果をお待ちいただく間に、こちらもご覧ください。',
      'https://vantripjapan.jp/'
    ].join('\n')
  );

  if (CONFIG.createSpreadsheet) {
    var ss = SpreadsheetApp.create(CONFIG.title + '（回答）');
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    Logger.log('回答スプレッドシート: ' + ss.getUrl());
  }

  Logger.log('編集URL: ' + form.getEditUrl());
  Logger.log('回答URL: ' + form.getPublishedUrl());
  Logger.log(manualTodo());
}

/* ------------------------------------------------------------------ */
/* フォーム全体設定                                                     */
/* ------------------------------------------------------------------ */

function configureFormSettings(form) {
  // メール自動収集（新旧APIの両対応）
  try {
    form.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED);
  } catch (e) {
    form.setCollectEmail(true);
  }
  form.setProgressBar(true);
  form.setLimitOneResponsePerUser(true);  // Googleログイン必須になり、連投を止められる
  form.setAllowResponseEdits(false);
  form.setShowLinkToRespondAgain(false);
  form.setShuffleQuestions(false);
}

/* ------------------------------------------------------------------ */
/* ヘルパー                                                            */
/* ------------------------------------------------------------------ */

function page(form, title, help) {
  var p = form.addPageBreakItem().setTitle(title);
  if (help) p.setHelpText(help);
  return p;
}

function text(form, title, help, required) {
  var i = form.addTextItem().setTitle(title).setRequired(required !== false);
  if (help) i.setHelpText(help);
  return i;
}

function url(form, title, help, required) {
  return text(form, title, help, required)
    .setValidation(FormApp.createTextValidation().requireTextIsUrl().build());
}

function num(form, title, help, min, required) {
  return text(form, title, help, required)
    .setValidation(
      FormApp.createTextValidation()
        .requireNumberGreaterThanOrEqualTo(min || 0)
        .build()
    );
}

function para(form, title, help, minLen, required) {
  var i = form.addParagraphTextItem().setTitle(title).setRequired(required !== false);
  if (help) i.setHelpText(help);
  if (minLen) {
    i.setValidation(
      FormApp.createParagraphTextValidation()
        .requireTextLengthGreaterThanOrEqualTo(minLen)
        .build()
    );
  }
  return i;
}

function choice(form, title, values, help, required) {
  var i = form.addMultipleChoiceItem()
    .setTitle(title)
    .setChoiceValues(values)
    .setRequired(required !== false);
  if (help) i.setHelpText(help);
  return i;
}

function agree(form, title, help) {
  var i = form.addCheckboxItem()
    .setTitle(title)
    .setChoiceValues(['同意します'])
    .setRequired(true);
  if (help) i.setHelpText(help);
  return i;
}

/* ------------------------------------------------------------------ */
/* セクション1: 基本情報                                                */
/* ------------------------------------------------------------------ */

function buildSectionBasic(form) {
  page(form, '1 / 8　基本情報', '運転免許証の記載と一致する情報をご記入ください。');

  text(form, 'お名前（運転免許証の記載どおり）');
  text(form, 'お名前のローマ字表記（パスポート表記）');
  form.addDateItem().setTitle('生年月日').setRequired(true)
    .setHelpText('車両の貸出条件として満21歳以上とさせていただいています。');
  text(form, '国籍');
  text(form, '現在お住まいの国と市区町村', '例: 日本 / 福岡県福岡市、France / Lyon');
  text(form, 'WhatsApp番号（国番号から）',
    '旅の間の連絡はWhatsAppを使います。国番号を含めてご記入ください。例: +81 90 1234 5678');
  choice(form, 'ご一緒に旅をされる方の人数（ご本人を含む）',
    ['1名（1人旅）', '2名', '3名', '4名', '5名以上']);
  para(form, '同行される方それぞれのお名前・年齢・ご関係・運転の可否',
    '1人旅の場合は「なし」とご記入ください。', 0);
}

/* ------------------------------------------------------------------ */
/* セクション2: 運転（ハードゲート）                                     */
/* ------------------------------------------------------------------ */

function buildSectionDriving(form, refs) {
  page(form, '2 / 8　運転について',
    '日本国内で合法的に運転できることが最低条件です。ここが満たせない場合、この先には進めません。');

  refs.rejectChoices = [];

  var license = form.addMultipleChoiceItem()
    .setTitle('日本国内で有効な運転免許をお持ちですか')
    .setHelpText(
      [
        'スイス・ドイツ・フランス・ベルギー・台湾・モナコ・スロベニア・エストニアの免許は、',
        '国際運転免許証ではなく「日本語による翻訳文」が必要です（ジュネーブ条約の非加盟等のため）。',
        '翻訳文はJAFまたはJDLTC（https://jdltc.jp/）で取得できます。'
      ].join('\n')
    )
    .setRequired(true);

  refs.rejectChoices.push(function (rp) {
    license.setChoices([
      license.createChoice('日本の運転免許証（有効期限内）', FormApp.PageNavigationType.CONTINUE),
      license.createChoice('海外免許 + 国際運転免許証（ジュネーブ条約）', FormApp.PageNavigationType.CONTINUE),
      license.createChoice('海外免許 + 日本語翻訳文（上記8か国・地域の免許）', FormApp.PageNavigationType.CONTINUE),
      license.createChoice('翻訳文はこれから取得する予定', FormApp.PageNavigationType.CONTINUE),
      license.createChoice('上記のいずれにも当てはまらない', rp)
    ]);
  });

  var years = form.addMultipleChoiceItem()
    .setTitle('運転免許を取得してから何年経ちますか')
    .setHelpText('保険の条件により、運転歴3年未満の方はお受けできません。')
    .setRequired(true);

  refs.rejectChoices.push(function (rp) {
    years.setChoices([
      years.createChoice('3年未満', rp),
      years.createChoice('3年以上5年未満', FormApp.PageNavigationType.CONTINUE),
      years.createChoice('5年以上10年未満', FormApp.PageNavigationType.CONTINUE),
      years.createChoice('10年以上', FormApp.PageNavigationType.CONTINUE)
    ]);
  });

  choice(form, '免許の種類（ミッション）', ['AT限定', 'MT可']);
  choice(form, '左側通行での運転経験', [
    '日常的に運転している', '数回ある', 'まったくない'
  ]);
  choice(form, '全長5メートル前後のバン・ハイエースクラスの運転経験', [
    '何度もある', '1回か2回ある', 'ない'
  ]);
  choice(form, '直近3年間の人身事故・物損事故・交通違反', [
    'いずれもない', '軽微な違反のみ', '物損事故がある', '人身事故がある'
  ]);
  para(form, '上で「ない」以外を選んだ方は、内容と時期をご記入ください',
    '該当しない方は「なし」とご記入ください。', 0);
  choice(form, '車中泊の経験', [
    '何度もある', '1回か2回ある', 'ない（今回が初めて）'
  ]);
}

/* ------------------------------------------------------------------ */
/* セクション3: SNS実績                                                 */
/* ------------------------------------------------------------------ */

function buildSectionSns(form) {
  page(form, '3 / 8　SNSの実績',
    [
      'フォロワー数よりも、実際にどれだけ見られているかを重視します。',
      '「平均」ではなく「中央値」でご記入ください。バズった1本に引きずられない数字が知りたいためです。'
    ].join('\n'));

  choice(form, '今回の発信でメインに使うプラットフォーム',
    ['Instagram', 'TikTok', 'YouTube', 'X（旧Twitter）', 'ブログ / note', 'その他']);

  text(form, 'Instagram のURL', '運用していない場合は「なし」とご記入ください。');
  text(form, 'TikTok のURL', '運用していない場合は「なし」とご記入ください。');
  text(form, 'YouTube のURL', '運用していない場合は「なし」とご記入ください。');
  text(form, 'その他のアカウント・ブログのURL', 'なければ「なし」とご記入ください。', false);

  num(form, 'メインアカウントのフォロワー数（登録者数）', '数字のみでご記入ください。', 0);
  num(form, '直近10投稿のリーチ数の「中央値」',
    '平均ではなく中央値です。10件を数字順に並べたときの真ん中の値です。', 0);
  num(form, '直近10投稿の保存数（またはシェア数）の「中央値」', '数字のみ。', 0);
  num(form, '直近10投稿の平均視聴維持率（%）',
    '動画を出していない場合は 0 とご記入ください。', 0);

  url(form, '上の数字が確認できるインサイト画面のスクリーンショット共有リンク',
    [
      'Googleドライブ・Dropbox等にアップロードし、閲覧権限を「リンクを知っている全員」にしてURLを貼ってください。',
      '数字とスクショが一致しない応募は、その時点で選考対象外とします。'
    ].join('\n'));

  para(form, 'フォロワーの上位3か国と、それぞれの割合（%）',
    'インサイトに出ている数字をそのまま書き写してください。例: 日本 62% / アメリカ 11% / フランス 7%', 10);

  para(form, 'ご自身のベスト投稿3本のURL（1行に1本ずつ）',
    '再生数の多い順ではなく、あなたが「これを見て判断してほしい」と思う3本を選んでください。', 30);

  para(form, 'その3本を選んだ理由を、数字の根拠を添えて説明してください',
    '200文字以上。「よく伸びたから」だけでは選考を通りません。', 200);

  choice(form, '直近3か月の投稿頻度', [
    '週3回以上', '週1回から2回', '月2回から3回', '月1回以下'
  ]);
}

/* ------------------------------------------------------------------ */
/* セクション4: 発信言語                                                */
/* ------------------------------------------------------------------ */

function buildSectionLanguage(form) {
  page(form, '4 / 8　発信する言語',
    '海外の方に九州を知ってもらうことが目的なので、ここが今回いちばん大事なセクションです。');

  choice(form, '今回の旅の投稿を、どの言語で行いますか',
    ['英語', 'フランス語', 'ドイツ語', '複数言語（英語＋どれか）']);

  choice(form, 'その言語のレベル', [
    'ネイティブ', 'ビジネスレベル（仕事で使っている）',
    '日常会話レベル', '翻訳ツールを併用する'
  ]);

  para(form, 'その言語で実際に投稿した既存の投稿URLを2本以上',
    [
      '1行に1本ずつ。',
      'まだ一度も外国語で投稿したことがない場合は「なし」とご記入ください（それだけで不合格にはしません）。'
    ].join('\n'), 0);

  para(form,
    '【重要】九州の旅で作りたい動画の企画を1本、上で選んだ言語のまま書いてください',
    [
      '400文字以上。日本語ではなく、実際に投稿する言語で書いてください。',
      '含めていただきたいもの: タイトル / 冒頭3秒のフック / 30秒から60秒の構成 / 想定する視聴者',
      '翻訳ツールを使った場合は、最後に「Translated with (ツール名)」と書き添えてください。',
      '使ったこと自体は減点しません。書かずに使ったことが分かった場合は選考対象外とします。'
    ].join('\n'), 400);
}

/* ------------------------------------------------------------------ */
/* セクション5: 旅の企画                                                */
/* ------------------------------------------------------------------ */

function buildSectionPlan(form) {
  page(form, '5 / 8　旅の企画', '具体的であるほど通ります。');

  para(form, '旅の企画案を3本、タイトルと一言説明でご記入ください',
    '300文字以上。1本ずつ改行して書いてください。', 300);

  para(form, '九州で行きたい場所を、具体的な地名で5つ以上',
    '「大自然」「温泉」ではなく、地名でお願いします。例: 阿蘇中岳、黒川温泉、坊ガツル、糸島、高千穂', 30);

  para(form, 'なぜ九州なのかを教えてください',
    [
      '200文字以上。',
      '「自然が好きだから」「行ったことがないから」だけの回答は選考を通りません。',
      'あなたの発信の文脈で、なぜ九州である必要があるのかを書いてください。'
    ].join('\n'), 200);

  para(form, '撮影に使う機材', '例: iPhone 15 Pro、GoPro Hero12、DJI Mini 4、三脚、ピンマイク', 5);

  choice(form, '編集はどなたが行いますか', [
    '自分で編集する', '外注する', '編集はせずそのまま投稿する'
  ]);

  choice(form, '旅の終了から初回投稿までの日数', [
    '3日以内', '1週間以内', '2週間以内', '1か月以内', '1か月以上かかる'
  ]);

  para(form, '投稿本数のコミットメント',
    [
      '旅の後に何をどれだけ出すか、数字で書いてください。',
      '例: リール3本 / フィード投稿5枚組を2本 / ストーリーズ旅程中は毎日 / YouTube長尺1本'
    ].join('\n'), 30);

  choice(form, '旅の様子をリアルタイムで（旅の最中に）発信できますか', [
    'はい、毎日ストーリーズ等で発信できます',
    '数回であれば可能です',
    'いいえ、旅の後にまとめて投稿します'
  ]);
}

/* ------------------------------------------------------------------ */
/* セクション6: 日程                                                    */
/* ------------------------------------------------------------------ */

function buildSectionSchedule(form, refs) {
  page(form, '6 / 8　日程', '車両は1台のみです。日程が合わない場合はお受けできないことがあります。');

  form.addDateItem().setTitle('希望する旅の開始日').setRequired(true);
  form.addDateItem().setTitle('希望する旅の終了日').setRequired(true);

  choice(form, '日程の融通', [
    '前後1か月ずらせる', '前後2週間ずらせる', '前後数日ならずらせる', 'この日程しか無理'
  ]);

  choice(form, '貸出日数の希望', ['3泊4日', '4泊5日', '5泊6日', '6泊7日', '8日以上']);

  var access = form.addMultipleChoiceItem()
    .setTitle(CONFIG.handoverPlace + 'までの往復の交通費と手配は、ご自身の負担になります。よろしいですか')
    .setRequired(true);

  refs.rejectChoices.push(function (rp) {
    access.setChoices([
      access.createChoice('はい、自分で手配し負担します', FormApp.PageNavigationType.CONTINUE),
      access.createChoice('いいえ、負担できません', rp)
    ]);
  });

  para(form, 'おおまかなルート案（何日目にどこ、というレベルで）',
    '100文字以上。完璧でなくて構いません。距離感をつかんでいるかを見ています。', 100);
}

/* ------------------------------------------------------------------ */
/* セクション7: 費用と責任の確認                                        */
/* ------------------------------------------------------------------ */

function buildSectionAgreement(form) {
  page(form, '7 / 8　費用と責任の確認',
    'すべてご確認のうえチェックをお願いします。1つでも同意いただけない項目があれば、ご応募はお控えください。');

  agree(form, 'ガソリン代・高速道路料金・フェリー代・駐車場代・キャンプ場利用料は自己負担です');
  agree(form, '車両保険には加入していますが、事故の際は免責額（自己負担額）が発生する場合があります',
    '免責額の具体的な金額は、選考通過後の契約時にご案内します。');
  agree(form, '重大な過失（飲酒運転・無免許運転・貸出条件外の使用など）による損害は全額ご負担いただきます');
  agree(form, '車内は禁煙です。ペットの同乗はできません');
  agree(form, '謝礼のやり取りはお互いにありません。金銭の支払いも受け取りもありません');
  agree(form, '旅の期間中に撮影された写真・動画を、VanTrip Japanが自社のSNS・ウェブサイト・広告で使用することを許諾します',
    '使用の際はクレジットを入れます。使用期限は設けません。');
  agree(form, '投稿には広告表記（#PR、Paid partnership、Werbung、Collaboration commerciale など）を入れます',
    '日本の景品表示法（ステルスマーケティング規制）により、金銭のやり取りがなくても物品やサービスの提供を受けた場合は表記が必要です。');
  agree(form, '引き渡しと返却は ' + CONFIG.handoverPlace + ' にて、指定の日時に行います');
  agree(form, '返却時に車内は清掃し、燃料は満タンにして返します');
  agree(form, 'キャンセルされる場合は、開始日の14日前までにご連絡します');
}

/* ------------------------------------------------------------------ */
/* セクション8: 最終確認                                                */
/* ------------------------------------------------------------------ */

function buildSectionFinal(form) {
  var last = page(form, '8 / 8　最後に', 'あと3問です。おつかれさまでした。');

  text(form, '募集文の中に書かれている合言葉を入力してください',
    '募集の投稿本文を最後まで読んだ方だけが分かるようになっています。')
    .setValidation(
      FormApp.createTextValidation()
        .requireTextContainsPattern(CONFIG.passphrase)
        .build()
    );

  para(form, '他の応募者ではなく、あなたに車をお預けすべき理由を教えてください',
    [
      '500文字以上。',
      '熱意ではなく、事実と数字で書いてください。',
      '「誰よりも九州が好き」より「フランス語圏のフォロワーが8,400人いて、直近の温泉リールは中央値2.1万リーチ」のほうが強いです。'
    ].join('\n'), 500);

  para(form, '企業やブランドとのタイアップ経験があれば、相手先と成果をご記入ください',
    'なければ「なし」とご記入ください。経験がないこと自体は減点しません。', 0);

  text(form, '推薦していただける方の連絡先（過去のタイアップ先など）',
    '任意です。あれば選考で有利になります。', false);

  choice(form, 'この募集をどこで知りましたか',
    ['Instagram', 'X（旧Twitter）', 'Facebook', '知人からの紹介', 'その他']);

  agree(form, '記入した内容に虚偽がないことを確認しました',
    '数字の申告とスクリーンショットに食い違いがあった場合、選考対象外となります。');

  return last;
}

/* ------------------------------------------------------------------ */
/* 手動で足す項目の案内                                                 */
/* ------------------------------------------------------------------ */

function manualTodo() {
  return [
    '',
    '================ ここから手動作業 ================',
    'Apps Scriptではファイルアップロード設問を作れないため、',
    'スクショを直接受け取りたい場合は編集画面で下記を追加してください（任意）。',
    '',
    '  [セクション3の末尾] 「インサイト画面のスクリーンショット」',
    '      種類: ファイルのアップロード / 画像のみ / 最大10ファイル / 各10MB',
    '',
    '  [セクション2の末尾] 「運転免許証の表面の画像」',
    '      ※ 個人情報を集めることになるため、選考通過後に個別で回収する方を推奨します。',
    '        このフォームで集めるなら、回答スプレッドシートとドライブの共有範囲を必ず絞ってください。',
    '',
    '共有リンク方式（現状の設計）のままなら、追加作業は不要です。',
    '=================================================='
  ].join('\n');
}

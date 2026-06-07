const fs = require('fs');
const file = 'site/js/i18n.js';
let content = fs.readFileSync(file, 'utf8');

const newKeys = {
    en: {
        "pricing.disclosure_title": "💳 Important: Deposit & Insurance Details",
        "pricing.deposit": "<strong>Security Deposit: ¥50,000</strong> — Collected at pick-up and fully refunded at return (minus ETC tolls, if any).",
        "pricing.deductible": "<strong>Accident Deductible (免責額):</strong> In case of an accident, the driver is responsible for a deductible amount as specified in the rental agreement.",
        "pricing.noc": "<strong>Non-Operation Charge (NOC):</strong> If the vehicle cannot be used due to damage, an additional non-operation charge will apply. Details provided in the rental agreement.",
        "pricing.disclosure_note": "Full details are provided in our <a href=\"/rent/terms/\">Rental Terms & Conditions</a>. We'll explain everything clearly at pick-up — no surprises."
    },
    fr: {
        "pricing.disclosure_title": "💳 Important : Détails de la caution et de l'assurance",
        "pricing.deposit": "<strong>Caution : ¥50,000</strong> — Encaissée à la prise en charge et entièrement remboursée au retour (déduction faite des éventuels péages ETC).",
        "pricing.deductible": "<strong>Franchise en cas d'accident (免責額) :</strong> En cas d'accident, le conducteur est responsable d'une franchise, comme spécifié dans le contrat de location.",
        "pricing.noc": "<strong>Frais d'immobilisation (NOC) :</strong> Si le véhicule ne peut être utilisé en raison de dommages, des frais d'immobilisation supplémentaires s'appliqueront. Détails fournis dans le contrat de location.",
        "pricing.disclosure_note": "Tous les détails sont fournis dans nos <a href=\"/rent/terms/\">Conditions générales de location</a>. Nous vous expliquerons tout clairement lors de la prise en charge — pas de surprises."
    },
    de: {
        "pricing.disclosure_title": "💳 Wichtig: Kaution & Versicherungsdetails",
        "pricing.deposit": "<strong>Kaution: ¥50.000</strong> — Wird bei Abholung hinterlegt und bei Rückgabe vollständig erstattet (abzüglich evtl. ETC-Mautgebühren).",
        "pricing.deductible": "<strong>Selbstbeteiligung (免責額):</strong> Im Falle eines Unfalls haftet der Fahrer für einen im Mietvertrag festgelegten Selbstbehalt.",
        "pricing.noc": "<strong>Nutzungsausfallgebühr (NOC):</strong> Kann das Fahrzeug aufgrund von Schäden nicht genutzt werden, fällt eine zusätzliche Nutzungsausfallgebühr an. Details im Mietvertrag.",
        "pricing.disclosure_note": "Alle Details finden Sie in unseren <a href=\"/rent/terms/\">Mietbedingungen</a>. Wir erklären alles bei der Abholung — keine Überraschungen."
    },
    zh: {
        "pricing.disclosure_title": "💳 重要：押金與保險詳細資訊",
        "pricing.deposit": "<strong>押金：¥50,000</strong> — 取車時收取，還車時全額退還（扣除ETC過路費，若有）。",
        "pricing.deductible": "<strong>意外自負額 (免責額)：</strong> 若發生事故，駕駛人需承擔租賃合約中規定的自負額。",
        "pricing.noc": "<strong>營業損失賠償 (NOC)：</strong> 若車輛因損壞無法使用，將收取額外的營業損失賠償。詳細資訊請參閱租賃合約。",
        "pricing.disclosure_note": "所有詳細資訊皆列於我們的<a href=\"/rent/terms/\">租賃條款</a>。取車時我們會清楚說明 — 絕對沒有隱藏費用。"
    },
    he: {
        "pricing.disclosure_title": "💳 חשוב: פרטי פיקדון וביטוח",
        "pricing.deposit": "<strong>פיקדון: ¥50,000</strong> — נגבה בעת האיסוף ומוחזר במלואו בעת ההחזרה (בניכוי אגרות כביש של ETC, אם ישנן).",
        "pricing.deductible": "<strong>השתתפות עצמית (免責額):</strong> במקרה של תאונה, הנהג אחראי להשתתפות עצמית כפי שמפורט בהסכם השכירות.",
        "pricing.noc": "<strong>דמי אובדן שימוש (NOC):</strong> אם לא ניתן להשתמש ברכב עקב נזק, יחולו דמי אובדן שימוש. פרטים מלאים מופיעים בהסכם השכירות.",
        "pricing.disclosure_note": "הפרטים המלאים מסופקים ב<a href=\"/rent/terms/\">תנאי ההשכרה</a> שלנו. נסביר הכל בצורה ברורה בעת האיסוף — בלי הפתעות."
    }
};

let modifiedContent = content;

const langs = ['en', 'fr', 'de', 'zh', 'he'];

for (const lang of langs) {
    let newPropsStr = "";
    for (const [key, val] of Object.entries(newKeys[lang])) {
        newPropsStr += `        "${key}": ${JSON.stringify(val)},\n`;
    }
    
    // Inject right after "hero.eyebrow"
    const regex = new RegExp(`(${lang}: \\{\\s*\\n(?:\\s*//.*\\n)*\\s*"hero\\.eyebrow")`);
    modifiedContent = modifiedContent.replace(regex, `${newPropsStr}\n$1`);
}

fs.writeFileSync(file, modifiedContent, 'utf8');
console.log('Successfully updated i18n.js');

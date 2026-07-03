#!/usr/bin/env node
/**
 * 🤖 Pinterest Auto-Generator — VanTripJapan
 *
 * 1. Cloudflare D1 から公開済みのブログ記事を取得
 * 2. 未投稿の記事のアイキャッチ画像とタイトルを抽出
 * 3. pin-generator.js で Pinterest 用画像を自動生成
 * 4. caption-generator.js (Groq) で多言語キャプションを生成
 * 5. 投稿キュー (post-queue.json) にステータス "approved" で自動登録
 *
 * Usage: GROQ_API_KEY=xxx node auto-generator.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");

// Load generators
const { generatePin } = require("./pin-generator");
const { generateCaption } = require("./caption-generator");

// ── Config ──
const QUEUE_PATH = path.join(__dirname, "data", "post-queue.json");
const SITE_IMAGES_DIR = path.join(__dirname, "..", "site", "images");
const OUTPUT_DIR = path.join(__dirname, "output");
const TEMP_DIR = path.join(__dirname, "temp");

// Ensure directories
[OUTPUT_DIR, TEMP_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Load Env
const ENV_PATH = path.join(__dirname, ".env");
if (fs.existsSync(ENV_PATH)) {
    const envContent = fs.readFileSync(ENV_PATH, "utf8");
    envContent.split("\n").forEach((line) => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            if (!process.env[key]) process.env[key] = value;
        }
    });
}

function log(emoji, msg) {
    console.log(`  ${emoji}  ${msg}`);
}

/**
 * Fetch published articles for VanTrip from D1
 */
function fetchArticlesFromD1() {
    log("🚣", "Fetching articles from Cloudflare D1 remote database...");
    const command = `npx wrangler d1 execute camjyo-cms --remote --json --command "SELECT id, slug, title, excerpt, cover_image FROM articles WHERE site='vantrip' AND status='published'"`;
    
    try {
        const output = execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        const jsonStart = output.indexOf("[");
        if (jsonStart === -1) {
            throw new Error("Could not find JSON array in wrangler output");
        }
        
        const data = JSON.parse(output.substring(jsonStart));
        const articles = data[0].results || [];
        log("✅", `Fetched ${articles.length} published articles.`);
        return articles;
    } catch (error) {
        log("❌", `Failed to fetch articles from D1: ${error.message}`);
        return [];
    }
}

/**
 * Load existing post queue
 */
function loadQueue() {
    if (!fs.existsSync(QUEUE_PATH)) {
        return [];
    }
    try {
        return JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8"));
    } catch (e) {
        log("⚠️", "Could not parse post-queue.json, resetting queue.");
        return [];
    }
}

/**
 * Save post queue
 */
function saveQueue(queue) {
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
    log("💾", "Post queue updated.");
}

/**
 * Helper to download an image from a URL
 */
function downloadImage(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download image. Status code: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on("finish", () => {
                file.close(resolve);
            });
        }).on("error", (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

/**
 * Resolve local image path or download if remote
 */
async function resolveImagePath(coverImage, slug) {
    if (!coverImage) return null;

    // Check if it starts with /assets/
    if (coverImage.startsWith("/assets/")) {
        const localPath = path.join(__dirname, "..", "site", coverImage);
        if (fs.existsSync(localPath)) {
            return localPath;
        }
    }

    // Check if it's a relative path in the repo
    if (coverImage.startsWith("/images/")) {
        const filename = coverImage.replace("/images/", "");
        const localPath = path.join(SITE_IMAGES_DIR, filename);
        if (fs.existsSync(localPath)) {
            return localPath;
        }
    }

    // Check if it starts with http
    if (coverImage.startsWith("http://") || coverImage.startsWith("https://")) {
        const tempPath = path.join(TEMP_DIR, `temp_${slug}${path.extname(coverImage) || '.png'}`);
        log("⏳", `Downloading remote image for ${slug}...`);
        try {
            await downloadImage(coverImage, tempPath);
            return tempPath;
        } catch (err) {
            log("⚠️", `Failed to download image ${coverImage}: ${err.message}`);
            return null;
        }
    }

    // Direct local path check
    if (fs.existsSync(coverImage)) {
        return coverImage;
    }

    return null;
}

/**
 * Auto-determine design template based on title or slug
 */
function determineTemplate(title) {
    const lowerTitle = title.toLowerCase();
    
    // If it contains a number list pattern like "5 things", "top 10", etc.
    if (/\b\d+\b/.test(lowerTitle) || lowerTitle.includes("must-") || lowerTitle.includes("top ")) {
        return "list";
    }
    
    // Otherwise randomly alternate between overlay and magazine
    return Math.random() > 0.5 ? "magazine" : "overlay";
}

/**
 * Generate list items if template is 'list'
 */
function extractListItems(title, excerpt) {
    // Basic heuristics to generate list items
    // In a real scenario, we could query the article body or use Groq
    // Here we'll return a generic high-quality list related to the title
    return [
        "Fukuoka Gateway",
        "Scenic Aso Volcano Route",
        "Kurokawa Onsen Soaking",
        "Takachiho Gorge Rowing",
        "Beppu Hell Tour Hot Springs"
    ];
}

async function main() {
    console.log("\n  🤖 Starting Pinterest Auto-Generator");
    console.log("  ──────────────────────────────────");

    const articles = fetchArticlesFromD1();
    if (articles.length === 0) {
        log("📋", "No articles fetched. Exiting.");
        return;
    }

    const queue = loadQueue();
    const queuedLinks = new Set(queue.map(p => p.link));

    let generatedCount = 0;

    for (const article of articles) {
        const articleUrl = `https://vantripjapan.com/posts/${article.slug}/`;

        // Skip if already in the queue
        if (queuedLinks.has(articleUrl)) {
            continue;
        }

        log("✨", `Processing new article: "${article.title}"`);

        // Resolve cover image
        const imagePath = await resolveImagePath(article.cover_image, article.slug);
        if (!imagePath) {
            log("⚠️", `Skipping "${article.title}" because cover image could not be resolved.`);
            continue;
        }

        // Determine template and options
        const template = determineTemplate(article.title);
        const options = {
            title: article.title,
            subtitle: article.excerpt || "Explore Kyushu, Japan by Campervan",
            brandName: "VanTripJapan"
        };

        if (template === "list") {
            options.items = extractListItems(article.title, article.excerpt);
        }

        // Generate AI Caption (Groq) first to get list_items if it's a list template
        log("🧠", "Generating AI caption & hashtags via Groq...");
        let captionData;
        try {
            captionData = await generateCaption(article.title, article.excerpt || "", template);
        } catch (err) {
            log("⚠️", `AI Caption generation failed: ${err.message}. Using fallback.`);
            captionData = {
                title: article.title,
                description: `${article.title}. The ultimate campervan travel experience in Kyushu, Japan. Wohnmobil Japan. Voyage Japon en van.`,
                hashtags: ["#VanLifeJapan", "#KyushuRoadTrip", "#JapanTravel", "#CampervanJapan", "#VanTripJapan"],
                alt_text: article.title,
                board_suggestion: "Japan Van Life",
                list_items: []
            };
        }

        // Update list items if AI generated them
        if (template === "list") {
            options.items = (captionData.list_items && captionData.list_items.length > 0)
                ? captionData.list_items
                : extractListItems(article.title, article.excerpt);
        }

        // Generate Pin Image
        const pinFilename = `pin_${article.slug}_${template}.png`;
        const pinOutputPath = path.join(OUTPUT_DIR, pinFilename);
        
        log("🎨", `Generating Pin Image (${template} template) -> ${pinFilename}`);
        try {
            await generatePin(imagePath, template, options, pinOutputPath);
        } catch (err) {
            log("❌", `Failed to generate image: ${err.message}`);
            continue;
        }

        // Add to Queue
        const newQueueItem = {
            id: `gen-${crypto.randomUUID()}`,
            status: "approved", // Set to approved so auto-post.js posts it automatically
            image: `pinterest-tool/output/${pinFilename}`, // Rel path in repo for GitHub Actions
            title: captionData.title,
            subtitle: options.subtitle || "",
            description: captionData.description,
            hashtags: Array.isArray(captionData.hashtags) ? captionData.hashtags.join(" ") : captionData.hashtags,
            board: captionData.board_suggestion || "Japan Van Life",
            link: articleUrl,
            alt_text: captionData.alt_text,
            template: template,
            list_items: captionData.list_items || [],
            reason: `D1 New Article: ${article.slug}`,
            created_at: new Date().toISOString()
        };

        queue.push(newQueueItem);
        generatedCount++;
        log("✅", `Queued successfully for board "${newQueueItem.board}"`);
        console.log();

        // Clean up downloaded temp image if any
        if (imagePath.includes("temp_")) {
            try {
                fs.unlinkSync(imagePath);
            } catch (e) {}
        }
    }

    if (generatedCount > 0) {
        saveQueue(queue);
        log("🎉", `Successfully generated and queued ${generatedCount} new pins.`);
    } else {
        log("📋", "No new articles to process.");
    }
}

main().catch(err => {
    console.error("Fatal Error in Auto-Generator:", err);
    process.exit(1);
});

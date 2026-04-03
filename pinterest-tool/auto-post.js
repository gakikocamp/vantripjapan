#!/usr/bin/env node
/**
 * 📌 Pinterest Auto-Post — VanTripJapan
 *
 * GitHub Actions から毎日自動実行されるスクリプト。
 * post-queue.json からステータスが "queued" の投稿を取り出し、
 * Pinterest API v5 で投稿する。
 *
 * Usage: PINTEREST_ACCESS_TOKEN=xxx GROQ_API_KEY=xxx node auto-post.js
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

// ── Config ──
const PINTEREST_ACCESS_TOKEN = process.env.PINTEREST_ACCESS_TOKEN || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const MAX_POSTS_PER_RUN = parseInt(process.env.MAX_POSTS || "5", 10);
const QUEUE_PATH = path.join(__dirname, "data", "post-queue.json");
const OUTPUT_DIR = path.join(__dirname, "output");
const DRY_RUN = process.env.DRY_RUN === "true";

// GitHub raw URL for images in the repo
const GITHUB_REPO = "gakikocamp/vantripjapan";
const GITHUB_BRANCH = "main";
function githubRawUrl(relativePath) {
    return `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${relativePath}`;
}

// ── Logging ──
function log(emoji, msg) {
    console.log(`  ${emoji}  ${msg}`);
}

// ── Queue ──
function loadQueue() {
    if (!fs.existsSync(QUEUE_PATH)) {
        log("📋", "Queue file not found, creating empty queue");
        fs.writeFileSync(QUEUE_PATH, JSON.stringify([], null, 2));
        return [];
    }
    return JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8"));
}

function saveQueue(queue) {
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
}

// ── Pinterest API ──
function pinterestRequest(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
        const bodyStr = body ? JSON.stringify(body) : null;
        const options = {
            hostname: "api.pinterest.com",
            port: 443,
            path: `/v5${endpoint}`,
            method,
            headers: {
                Authorization: `Bearer ${PINTEREST_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
        };
        if (bodyStr) options.headers["Content-Length"] = Buffer.byteLength(bodyStr);

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject(new Error(`Pinterest ${res.statusCode}: ${JSON.stringify(json)}`));
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject(new Error(`Parse error: ${data.slice(0, 200)}`));
                }
            });
        });
        req.on("error", reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

/**
 * Create a pin using an image URL (from GitHub raw)
 */
async function createPinFromUrl(post) {
    const description = [
        post.description || "",
        "",
        post.hashtags || "",
    ].join("\n").trim();

    const body = {
        title: post.title,
        description,
        link: post.link || "https://vantripjapan.com",
        alt_text: post.alt_text || post.title,
        board_id: post.board_id,
        media_source: {
            source_type: "image_url",
            url: post.image_url,
        },
    };

    return await pinterestRequest("POST", "/pins", body);
}

/**
 * Create a pin using base64 image from local file
 */
async function createPinFromFile(post, imagePath) {
    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image not found: ${imagePath}`);
    }
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString("base64");

    const description = [
        post.description || "",
        "",
        post.hashtags || "",
    ].join("\n").trim();

    const body = {
        title: post.title,
        description,
        link: post.link || "https://vantripjapan.com",
        alt_text: post.alt_text || post.title,
        board_id: post.board_id,
        media_source: {
            source_type: "image_base64",
            content_type: "image/png",
            data: base64,
        },
    };

    return await pinterestRequest("POST", "/pins", body);
}

// ── Groq Caption Generation ──
function generateCaption(title) {
    return new Promise((resolve, reject) => {
        if (!GROQ_API_KEY) {
            resolve(null);
            return;
        }
        const prompt = `Generate a Pinterest caption for: "${title}". 
Return JSON: {"title":"catchy title (max 100 chars)","description":"200-300 char description with 2-3 German and French keywords","hashtags":"15-20 hashtags mixed EN/DE/FR","alt_text":"alt text"}`;

        const body = JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: "Pinterest marketing expert for Japan travel. Respond in valid JSON only." },
                { role: "user", content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 800,
        });

        const options = {
            hostname: "api.groq.com",
            port: 443,
            path: "/openai/v1/chat/completions",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${GROQ_API_KEY}`,
                "Content-Length": Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) { resolve(null); return; }
                    const content = json.choices[0].message.content;
                    const match = content.match(/\{[\s\S]*\}/);
                    resolve(match ? JSON.parse(match[0]) : null);
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on("error", () => resolve(null));
        req.write(body);
        req.end();
    });
}

// ── Get Boards ──
async function getBoards() {
    return await pinterestRequest("GET", "/boards");
}

// ── Find Board ID by name ──
async function findBoardId(boardName) {
    try {
        const result = await getBoards();
        const boards = result.items || [];
        const board = boards.find(
            (b) => b.name.toLowerCase().replace(/\s+/g, "-") === boardName.toLowerCase().replace(/\s+/g, "-")
        );
        return board ? board.id : null;
    } catch (e) {
        log("⚠️", `Could not fetch boards: ${e.message}`);
        return null;
    }
}

// ══════════════════════════════════
//  MAIN
// ══════════════════════════════════
async function main() {
    console.log("\n  📌 VanTripJapan Pinterest Auto-Post");
    console.log("  ──────────────────────────────────");
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log(`  Mode: ${DRY_RUN ? "🧪 DRY RUN (no actual posts)" : "🚀 LIVE"}`);
    console.log(`  Max posts this run: ${MAX_POSTS_PER_RUN}`);
    console.log();

    // Check API
    if (!PINTEREST_ACCESS_TOKEN && !DRY_RUN) {
        log("❌", "PINTEREST_ACCESS_TOKEN is not set. Cannot post.");
        process.exit(1);
    }

    // Load queue
    const queue = loadQueue();
    const pending = queue.filter((p) => p.status === "approved");

    if (pending.length === 0) {
        log("📋", "No queued posts. Nothing to do.");
        process.exit(0);
    }

    log("📋", `Found ${pending.length} queued posts, processing up to ${MAX_POSTS_PER_RUN}`);
    console.log();

    const toPost = pending.slice(0, MAX_POSTS_PER_RUN);
    let successCount = 0;
    let failCount = 0;

    for (const post of toPost) {
        log("📌", `Processing: "${post.title || post.id}"`);

        try {
            // Auto-generate caption if missing
            if (!post.description && GROQ_API_KEY) {
                log("✨", "Generating AI caption...");
                const caption = await generateCaption(post.title || "Van Life in Kyushu");
                if (caption) {
                    post.title = caption.title || post.title;
                    post.description = caption.description || "";
                    post.hashtags = caption.hashtags || "";
                    post.alt_text = caption.alt_text || post.title;
                    log("✅", "Caption generated");
                }
            }

            // Resolve board ID (skip in DRY_RUN)
            if (!post.board_id && post.board && !DRY_RUN) {
                const boardId = await findBoardId(post.board);
                if (boardId) {
                    post.board_id = boardId;
                    log("📋", `Board "${post.board}" → ID: ${boardId}`);
                } else {
                    log("⚠️", `Board "${post.board}" not found, skipping`);
                    post.status = "error";
                    post.error = "Board not found";
                    failCount++;
                    continue;
                }
            }

            if (DRY_RUN) {
                log("🧪", `DRY RUN — would post "${post.title}" to board "${post.board || post.board_id}"`);
                post.status = "dry_run";
                post.posted_at = new Date().toISOString();
                successCount++;
                continue;
            }

            if (!post.board_id) {
                log("⚠️", "No board_id specified, skipping");
                post.status = "error";
                post.error = "No board_id";
                failCount++;
                continue;
            }

            // Post to Pinterest
            let result;
            if (post.image_url) {
                result = await createPinFromUrl(post);
            } else if (post.image) {
                // Local file — construct GitHub raw URL
                const imageUrl = githubRawUrl(post.image);
                post.image_url = imageUrl;
                result = await createPinFromUrl({ ...post, image_url: imageUrl });
            } else {
                log("⚠️", "No image specified, skipping");
                post.status = "error";
                post.error = "No image";
                failCount++;
                continue;
            }

            post.status = "posted";
            post.posted_at = new Date().toISOString();
            post.pin_id = result.id;
            successCount++;
            log("✅", `Posted! Pin ID: ${result.id}`);

            // Small delay between posts
            await new Promise((r) => setTimeout(r, 2000));
        } catch (err) {
            log("❌", `Failed: ${err.message}`);
            post.status = "error";
            post.error = err.message;
            failCount++;
        }

        console.log();
    }

    // Save updated queue
    saveQueue(queue);

    // Summary
    console.log("  ──────────────────────────────────");
    log("📊", `Results: ${successCount} posted, ${failCount} failed, ${pending.length - toPost.length} remaining`);
    console.log();

    if (failCount > 0) process.exit(1);
}

main().catch((err) => {
    log("💥", `Fatal error: ${err.message}`);
    process.exit(1);
});

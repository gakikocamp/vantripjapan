#!/usr/bin/env node
/**
 * 🚐 VanTripJapan Pinterest Tool — Server
 *
 * Web dashboard for managing Pinterest pins.
 * Image text overlay is done in the browser (Canvas API).
 * No npm packages needed — pure Node.js.
 *
 * Usage: node server.js
 * Open:  http://localhost:5600
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");

// ── Load .env ──
const ENV_PATH = path.join(__dirname, ".env");
try {
    if (fs.existsSync(ENV_PATH)) {
        fs.readFileSync(ENV_PATH, "utf8")
            .split("\n")
            .forEach((line) => {
                const match = line.match(/^([^#=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    const val = match[2].trim();
                    if (!process.env[key]) process.env[key] = val;
                }
            });
    }
} catch (e) {
    console.log("  ⚠️  .env file could not be read (iCloud permission). Using environment variables instead.");
}

// Also try loading from scripts/.env as fallback
const SCRIPTS_ENV = path.join(__dirname, "..", "scripts", ".env");
try {
    if (fs.existsSync(SCRIPTS_ENV)) {
        fs.readFileSync(SCRIPTS_ENV, "utf8")
            .split("\n")
            .forEach((line) => {
                const match = line.match(/^([^#=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    const val = match[2].trim();
                    if (!process.env[key]) process.env[key] = val;
                }
            });
    }
} catch (e) {
    // ignore
}

// ── Config ──
const PORT = process.env.PORT || 5600;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "vantrip2026";
const AUTH_SECRET = crypto.randomBytes(32).toString("hex");
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const INPUT_DIR = path.join(__dirname, "input");
const OUTPUT_DIR = path.join(__dirname, "output");
const DATA_DIR = path.join(__dirname, "data");
const PINS_DB = path.join(DATA_DIR, "pins.json");

// Ensure directories
[INPUT_DIR, OUTPUT_DIR, DATA_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Pinterest API
const PINTEREST_ACCESS_TOKEN = process.env.PINTEREST_ACCESS_TOKEN || "";

// ── Database ──
function loadPins() {
    if (fs.existsSync(PINS_DB)) {
        try { return JSON.parse(fs.readFileSync(PINS_DB, "utf8")); } catch (e) { /* ignore */ }
    }
    return { pins: [], queue: [] };
}

function savePins(data) {
    fs.writeFileSync(PINS_DB, JSON.stringify(data, null, 2));
}

// ── Auth ──
function generateToken() {
    return crypto.createHmac("sha256", AUTH_SECRET).update(Date.now().toString()).digest("hex");
}

function parseCookies(req) {
    const cookies = {};
    (req.headers.cookie || "").split(";").forEach((c) => {
        const [k, v] = c.trim().split("=");
        if (k) cookies[k] = v;
    });
    return cookies;
}

function isAuthenticated(req) {
    const cookies = parseCookies(req);
    return cookies.auth_token && cookies.auth_token.length > 10;
}

// ── Helpers ──
function readBody(req, limit = 50 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (c) => {
            size += c.length;
            if (size > limit) { reject(new Error("Body too large")); return; }
            chunks.push(c);
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

function respond(res, code, data, contentType = "application/json") {
    res.writeHead(code, { "Content-Type": contentType });
    if (typeof data === "object" && contentType === "application/json") {
        res.end(JSON.stringify(data));
    } else {
        res.end(data);
    }
}

function serveFile(res, filePath) {
    if (!fs.existsSync(filePath)) {
        respond(res, 404, { error: "Not found" });
        return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
    };
    const contentType = types[ext] || "application/octet-stream";
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stat.size,
        "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
}

function getInputImages() {
    const exts = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    if (!fs.existsSync(INPUT_DIR)) return [];
    return fs
        .readdirSync(INPUT_DIR)
        .filter((f) => exts.includes(path.extname(f).toLowerCase()))
        .map((f) => {
            const stat = fs.statSync(path.join(INPUT_DIR, f));
            return {
                name: f,
                path: `/api/input-image/${encodeURIComponent(f)}`,
                size: stat.size,
                modified: stat.mtime.toISOString(),
            };
        })
        .sort((a, b) => new Date(b.modified) - new Date(a.modified));
}

function getOutputImages() {
    const exts = [".png", ".jpg", ".jpeg"];
    if (!fs.existsSync(OUTPUT_DIR)) return [];
    return fs
        .readdirSync(OUTPUT_DIR)
        .filter((f) => exts.includes(path.extname(f).toLowerCase()))
        .map((f) => {
            const stat = fs.statSync(path.join(OUTPUT_DIR, f));
            return {
                name: f,
                path: `/api/output-image/${encodeURIComponent(f)}`,
                size: stat.size,
                modified: stat.mtime.toISOString(),
            };
        })
        .sort((a, b) => new Date(b.modified) - new Date(a.modified));
}

// ── Groq API Call ──
function callGroq(prompt) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: `You are a Pinterest marketing expert for Japan travel content targeting European travelers (German & French). Respond in valid JSON only.`,
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 1000,
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
                    if (json.error) { reject(new Error(json.error.message)); return; }
                    const content = json.choices[0].message.content;
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    resolve(jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: content });
                } catch (e) {
                    reject(new Error(`Parse error: ${e.message}`));
                }
            });
        });
        req.on("error", reject);
        req.write(body);
        req.end();
    });
}

// ── Server ──
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // CORS for local dev
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
        res.writeHead(200, {
            "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
    }

    // Auth
    if (pathname === "/api/login" && req.method === "POST") {
        const body = await readBody(req);
        const { password } = JSON.parse(body.toString());
        if (password === AUTH_PASSWORD) {
            const token = generateToken();
            res.writeHead(200, {
                "Content-Type": "application/json",
                "Set-Cookie": `auth_token=${token}; Path=/; HttpOnly; Max-Age=86400`,
            });
            res.end(JSON.stringify({ ok: true }));
        } else {
            respond(res, 401, { error: "Wrong password" });
        }
        return;
    }

    // Dashboard
    if (pathname === "/" || pathname === "/index.html") {
        serveFile(res, path.join(__dirname, "templates", "dashboard.html"));
        return;
    }

    // ── Protected API ──
    if (pathname.startsWith("/api/")) {
        if (!isAuthenticated(req) && pathname !== "/api/login") {
            respond(res, 401, { error: "Not authenticated" });
            return;
        }

        // Image list
        if (pathname === "/api/images" && req.method === "GET") {
            respond(res, 200, { input: getInputImages(), output: getOutputImages() });
            return;
        }

        // Serve images
        if (pathname.startsWith("/api/input-image/")) {
            const filename = decodeURIComponent(pathname.replace("/api/input-image/", ""));
            const safeName = path.basename(filename);
            serveFile(res, path.join(INPUT_DIR, safeName));
            return;
        }
        if (pathname.startsWith("/api/output-image/")) {
            const filename = decodeURIComponent(pathname.replace("/api/output-image/", ""));
            const safeName = path.basename(filename);
            serveFile(res, path.join(OUTPUT_DIR, safeName));
            return;
        }

        // Save generated pin (browser sends base64 PNG)
        if (pathname === "/api/save-pin" && req.method === "POST") {
            try {
                const body = JSON.parse((await readBody(req)).toString());
                const { imageData, filename } = body;

                // Strip data URL prefix
                const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(base64Data, "base64");

                const outputName = filename || `pin_${Date.now()}.png`;
                const outputPath = path.join(OUTPUT_DIR, outputName);
                fs.writeFileSync(outputPath, buffer);

                respond(res, 200, {
                    ok: true,
                    outputImage: `/api/output-image/${encodeURIComponent(outputName)}`,
                    outputName,
                });
            } catch (err) {
                respond(res, 500, { error: err.message });
            }
            return;
        }

        // Generate caption (AI)
        if (pathname === "/api/generate-caption" && req.method === "POST") {
            try {
                const body = JSON.parse((await readBody(req)).toString());
                const { title, description, template } = body;

                const prompt = `Generate a Pinterest caption for a Japan van life / Kyushu travel pin.

PIN TITLE: "${title}"
IMAGE DESCRIPTION: "${description || "Scenic photo of Kyushu, Japan"}"
TEMPLATE: ${template}

Generate JSON:
{
  "title": "English Pinterest title (max 100 chars, catchy, SEO-friendly)",
  "description": "English description (200-300 chars). Naturally include 2-3 German keywords (Wohnmobil, Reise, Abenteuer) and 2-3 French keywords (voyage, aventure, camping car).",
  "hashtags": ["15-20 hashtags: 8 English, 4 German, 4 French, 4 location-specific"],
  "alt_text": "Alt text for accessibility (max 200 chars)",
  "board_suggestion": "Best board: 'Japan Van Life', 'Kyushu Road Trip', 'Japan Hot Springs', 'Japanese Camping Spots', or 'Japan Travel Tips'"
}

Tone: adventurous, premium travel brand.`;

                const result = await callGroq(prompt);
                respond(res, 200, {
                    title: result.title || title,
                    description: result.description || "",
                    hashtags: result.hashtags || [],
                    alt_text: result.alt_text || title,
                    board_suggestion: result.board_suggestion || "Japan Van Life",
                });
            } catch (err) {
                respond(res, 500, { error: err.message });
            }
            return;
        }

        // Queue operations
        if (pathname === "/api/queue" && req.method === "POST") {
            try {
                const body = JSON.parse((await readBody(req)).toString());
                const db = loadPins();
                const entry = {
                    id: crypto.randomUUID(),
                    ...body,
                    status: "queued",
                    created_at: new Date().toISOString(),
                };
                db.queue.push(entry);
                savePins(db);
                respond(res, 200, { ok: true, entry });
            } catch (err) {
                respond(res, 500, { error: err.message });
            }
            return;
        }

        if (pathname === "/api/queue" && req.method === "GET") {
            const db = loadPins();
            respond(res, 200, db.queue || []);
            return;
        }

        if (pathname.startsWith("/api/queue/") && req.method === "DELETE") {
            const id = pathname.replace("/api/queue/", "");
            const db = loadPins();
            db.queue = (db.queue || []).filter((q) => q.id !== id);
            savePins(db);
            respond(res, 200, { ok: true });
            return;
        }

        // Pinterest status
        if (pathname === "/api/pinterest-status" && req.method === "GET") {
            respond(res, 200, {
                configured: !!PINTEREST_ACCESS_TOKEN,
            });
            return;
        }

        respond(res, 404, { error: "Not found" });
        return;
    }

    respond(res, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`\n  🚐 VanTripJapan Pinterest Tool`);
    console.log(`  ─────────────────────────────`);
    console.log(`  Dashboard: http://localhost:${PORT}`);
    console.log(`  Password:  ${AUTH_PASSWORD}`);
    console.log(`\n  📁 Input folder:  ${INPUT_DIR}`);
    console.log(`  📤 Output folder: ${OUTPUT_DIR}`);
    console.log(`  📌 Pinterest API: ${PINTEREST_ACCESS_TOKEN ? "✅ Connected" : "⏳ Not configured"}`);
    console.log();
});

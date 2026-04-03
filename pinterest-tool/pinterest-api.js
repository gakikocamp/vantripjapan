#!/usr/bin/env node
/**
 * 📌 Pinterest API — VanTripJapan
 *
 * Pinterest API v5 integration for auto-posting pins.
 * This module handles OAuth and pin creation.
 *
 * NOTE: Requires Pinterest Business Account + App credentials in .env
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

// Load environment
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

const PINTEREST_ACCESS_TOKEN = process.env.PINTEREST_ACCESS_TOKEN || "";

/**
 * Check if Pinterest API is configured
 */
function isConfigured() {
    return !!PINTEREST_ACCESS_TOKEN;
}

/**
 * Make a request to the Pinterest API v5
 */
function apiRequest(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
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

        if (body) {
            const bodyStr = JSON.stringify(body);
            options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
        }

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject(new Error(`Pinterest API error ${res.statusCode}: ${JSON.stringify(json)}`));
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse Pinterest response: ${data}`));
                }
            });
        });

        req.on("error", reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

/**
 * Get list of boards
 */
async function getBoards() {
    if (!isConfigured()) {
        return { error: "Pinterest API is not configured. Add PINTEREST_ACCESS_TOKEN to .env" };
    }
    return await apiRequest("GET", "/boards");
}

/**
 * Create a new pin
 *
 * @param {object} pinData
 * @param {string} pinData.board_id - ID of the board
 * @param {string} pinData.title - Pin title
 * @param {string} pinData.description - Pin description
 * @param {string} pinData.link - Destination URL
 * @param {string} pinData.alt_text - Alt text for accessibility
 * @param {string} pinData.image_base64 - Base64 encoded image
 */
async function createPin(pinData) {
    if (!isConfigured()) {
        return { error: "Pinterest API is not configured. Add PINTEREST_ACCESS_TOKEN to .env" };
    }

    const body = {
        title: pinData.title,
        description: pinData.description,
        link: pinData.link || "https://vantripjapan.com",
        alt_text: pinData.alt_text || pinData.title,
        board_id: pinData.board_id,
        media_source: {
            source_type: "image_base64",
            content_type: "image/png",
            data: pinData.image_base64,
        },
    };

    return await apiRequest("POST", "/pins", body);
}

/**
 * Create a pin from a file path
 */
async function createPinFromFile(pinData, imagePath) {
    const imageBuffer = fs.readFileSync(imagePath);
    const image_base64 = imageBuffer.toString("base64");
    return await createPin({ ...pinData, image_base64 });
}

/**
 * Get user account info
 */
async function getAccountInfo() {
    if (!isConfigured()) {
        return { error: "Pinterest API is not configured" };
    }
    return await apiRequest("GET", "/user_account");
}

/**
 * Generate OAuth URL for user authorization
 */
function getOAuthUrl() {
    const appId = process.env.PINTEREST_APP_ID || "";
    if (!appId) return null;

    const redirectUri = encodeURIComponent("http://localhost:5600/callback");
    const scope = encodeURIComponent("boards:read,boards:write,pins:read,pins:write");
    return `https://api.pinterest.com/oauth/?client_id=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
}

module.exports = {
    isConfigured,
    getBoards,
    createPin,
    createPinFromFile,
    getAccountInfo,
    getOAuthUrl,
};

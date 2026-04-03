#!/usr/bin/env node
/**
 * 💬 Caption Generator — VanTripJapan Pinterest
 *
 * Uses Groq AI to generate multilingual captions,
 * titles, and hashtags for Pinterest pins.
 *
 * Languages: English (main) + German & French keywords
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

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

// ── SEO Keywords Database ──
const SEO_KEYWORDS = {
    english: [
        "van life japan", "kyushu road trip", "japan campervan",
        "japan travel", "vanlife", "road trip japan",
        "camping japan", "kyushu travel", "japan hot springs",
        "michi no eki", "japan camping", "campervan rental",
        "japan adventure", "explore kyushu", "japan nature",
        "onsen road trip", "fukuoka travel", "aso volcano",
        "nagasaki travel", "beppu onsen",
    ],
    german: [
        "Japan Reise", "Wohnmobil Japan", "Roadtrip Japan",
        "Kyushu Reise", "Campervan Japan", "Japan Abenteuer",
        "Onsen Japan", "Japan Camping", "Vanlife Japan",
        "Japan Reisetipps", "Fukuoka Reise", "Japan Natur",
    ],
    french: [
        "voyage Japon", "van aménagé Japon", "road trip Japon",
        "Kyushu voyage", "camping car Japon", "aventure Japon",
        "onsen Japon", "camping Japon", "vanlife Japon",
        "conseils voyage Japon", "Fukuoka voyage", "nature Japon",
    ],
};

/**
 * Call Groq API for caption generation
 */
async function callGroq(prompt, temperature = 0.7) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: `You are a Pinterest marketing expert specializing in Japan travel content. 
You create engaging, SEO-optimized captions that appeal to European travelers 
(especially German and French audiences) interested in van life and road trips in Japan.
Always respond in valid JSON format.`,
                },
                { role: "user", content: prompt },
            ],
            temperature,
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
                    if (json.error) {
                        reject(new Error(json.error.message));
                        return;
                    }
                    const content = json.choices[0].message.content;
                    // Try to extract JSON from the response
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        resolve(JSON.parse(jsonMatch[0]));
                    } else {
                        resolve({ raw: content });
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse Groq response: ${e.message}`));
                }
            });
        });

        req.on("error", reject);
        req.write(body);
        req.end();
    });
}

/**
 * Generate a complete Pinterest caption from an image description or title
 *
 * @param {string} pinTitle - The text overlay title of the pin
 * @param {string} pinDescription - Brief description of the image content
 * @param {string} template - Which template was used (overlay/magazine/list)
 * @returns {Promise<object>} - Generated caption data
 */
async function generateCaption(pinTitle, pinDescription = "", template = "overlay") {
    const prompt = `Generate a Pinterest caption for a pin about Japan van life / Kyushu travel.

PIN TITLE: "${pinTitle}"
IMAGE DESCRIPTION: "${pinDescription || "A scenic photo of Kyushu, Japan"}"
TEMPLATE STYLE: ${template}

Generate the following in JSON format:
{
  "title": "English Pinterest title (max 100 chars, catchy and SEO-friendly)",
  "description": "English description (150-300 chars). Include 2-3 German keywords naturally and 2-3 French keywords. Example: '...A perfect Kyushu road trip destination. Ideal for Wohnmobil Japan adventures and voyage Japon en van...'",
  "hashtags": ["array of 15-20 hashtags mixing English, German, and French. Focus on: van life, japan travel, kyushu, road trip, campervan, onsen. Include location-specific tags when possible."],
  "alt_text": "Descriptive alt text for accessibility (max 200 chars)",
  "board_suggestion": "Which board this pin fits best: 'Japan Van Life', 'Kyushu Road Trip', 'Japan Hot Springs', 'Japanese Camping Spots', or 'Japan Travel Tips'"
}

IMPORTANT:
- Title should be compelling and create curiosity
- Description must naturally weave in German (Wohnmobil, Reise, Abenteuer) and French (voyage, aventure, camping car) keywords
- Hashtags should be a mix: 8 English, 4 German, 4 French, and 4 location-specific
- Keep the tone adventurous but premium — this is a high-end travel brand`;

    try {
        const result = await callGroq(prompt);
        return {
            title: result.title || pinTitle,
            description: result.description || "",
            hashtags: result.hashtags || getDefaultHashtags(),
            alt_text: result.alt_text || pinTitle,
            board_suggestion: result.board_suggestion || "Japan Van Life",
            generated_at: new Date().toISOString(),
        };
    } catch (error) {
        console.error("Caption generation error:", error.message);
        // Return fallback captions
        return {
            title: pinTitle,
            description: `Discover ${pinTitle}. The ultimate van life experience in Kyushu, Japan. Wohnmobil Japan Abenteuer. Voyage Japon en van aménagé.`,
            hashtags: getDefaultHashtags(),
            alt_text: pinTitle,
            board_suggestion: "Japan Van Life",
            generated_at: new Date().toISOString(),
            error: error.message,
        };
    }
}

/**
 * Default hashtags when AI is unavailable
 */
function getDefaultHashtags() {
    return [
        "#VanLifeJapan", "#KyushuRoadTrip", "#JapanTravel",
        "#CampervanJapan", "#VanTripJapan", "#JapanVanLife",
        "#RoadTripJapan", "#ExplorKyushu", "#OnsenJapan",
        "#JapanCamping", "#MichiNoEki", "#JapanAdventure",
        "#WohnmobilJapan", "#JapanReise", "#RoadtripJapan",
        "#VoyageJapon", "#CampingCarJapon", "#JaponVoyage",
        "#AsoVolcano", "#Fukuoka",
    ];
}

/**
 * Get relevant hashtags by category
 */
function getHashtagsByCategory(category) {
    const categories = {
        onsen: ["#OnsenJapan", "#JapaneseHotSprings", "#BeppuOnsen", "#OnsenRoadTrip", "#ThermenJapan", "#SourcesChaudesJapon"],
        camping: ["#JapanCamping", "#CampingJapan", "#CampgroundJapan", "#CampingCarJapon", "#WohnmobilJapan", "#VanLifeCamping"],
        nature: ["#JapanNature", "#KyushuNature", "#AsoVolcano", "#TakachihGorge", "#NaturJapan", "#NatureJapon"],
        food: ["#JapaneseFood", "#FukuokaFood", "#Ramen", "#JapaneseCuisine", "#CuisineJaponaise", "#JapanischesEssen"],
        driving: ["#JapanDriving", "#RoadTripJapan", "#KyushuDrive", "#ScenicDrive", "#AutofahrenJapan", "#RouteJapon"],
    };
    return categories[category] || [];
}

module.exports = {
    generateCaption,
    getDefaultHashtags,
    getHashtagsByCategory,
    SEO_KEYWORDS,
};

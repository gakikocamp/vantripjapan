#!/usr/bin/env node
/**
 * 🎨 Pin Generator — VanTripJapan
 *
 * Generates Pinterest-ready pin images (1000x1500px, 2:3 ratio)
 * with text overlays in 3 design templates.
 *
 * Uses node-canvas for image manipulation.
 */

const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");

// ── Brand Colors ──
const BRAND = {
    accent: "#BF4E30",
    accentHover: "#A3421F",
    dark: "#1D1D1F",
    light: "#FAFAFA",
    surface: "#FFFFFF",
    textSecondary: "#86868B",
};

// ── Pin Dimensions ──
const PIN_WIDTH = 1000;
const PIN_HEIGHT = 1500;

/**
 * Template A: Simple Overlay
 * Photo fills the entire pin, with a semi-transparent band at the bottom
 * containing the text. Clean, minimal, lets the photo shine.
 */
async function templateOverlay(imagePath, options = {}) {
    const {
        title = "Van Life in Kyushu",
        subtitle = "",
        brandName = "VanTripJapan",
    } = options;

    const canvas = createCanvas(PIN_WIDTH, PIN_HEIGHT);
    const ctx = canvas.getContext("2d");

    // Load and draw the background image
    const img = await loadImage(imagePath);
    const imgRatio = img.width / img.height;
    const pinRatio = PIN_WIDTH / PIN_HEIGHT;

    let sx, sy, sw, sh;
    if (imgRatio > pinRatio) {
        // Image is wider — crop sides
        sh = img.height;
        sw = sh * pinRatio;
        sx = (img.width - sw) / 2;
        sy = 0;
    } else {
        // Image is taller — crop top/bottom
        sw = img.width;
        sh = sw / pinRatio;
        sx = 0;
        sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, PIN_WIDTH, PIN_HEIGHT);

    // Bottom gradient overlay
    const gradientHeight = PIN_HEIGHT * 0.45;
    const gradient = ctx.createLinearGradient(
        0,
        PIN_HEIGHT - gradientHeight,
        0,
        PIN_HEIGHT
    );
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(0.4, "rgba(0, 0, 0, 0.4)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.85)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, PIN_HEIGHT - gradientHeight, PIN_WIDTH, gradientHeight);

    // Title text
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";

    // Title — large bold
    const titleSize = title.length > 30 ? 48 : title.length > 20 ? 56 : 64;
    ctx.font = `800 ${titleSize}px "Inter", "Helvetica Neue", Arial, sans-serif`;
    const titleLines = wrapText(ctx, title, PIN_WIDTH - 120);
    const lineHeight = titleSize * 1.15;

    let titleY = PIN_HEIGHT - 180 - (titleLines.length - 1) * lineHeight;

    for (const line of titleLines) {
        ctx.fillText(line, 60, titleY);
        titleY += lineHeight;
    }

    // Subtitle
    if (subtitle) {
        ctx.font = `300 24px "Inter", "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.fillText(subtitle, 60, titleY + 10);
    }

    // Brand bar at very bottom
    drawBrandBar(ctx, brandName);

    return canvas;
}

/**
 * Template B: Magazine Style
 * Top portion has a colored header with large text,
 * bottom portion shows the photo. Premium editorial feel.
 */
async function templateMagazine(imagePath, options = {}) {
    const {
        title = "TOP 5 HOT SPRINGS IN KYUSHU",
        subtitle = "A complete guide to Japan's hidden gems",
        brandName = "VanTripJapan",
        accentColor = BRAND.accent,
    } = options;

    const canvas = createCanvas(PIN_WIDTH, PIN_HEIGHT);
    const ctx = canvas.getContext("2d");

    // Top header area (40% of pin)
    const headerHeight = PIN_HEIGHT * 0.38;

    // Fill header with dark background
    ctx.fillStyle = BRAND.dark;
    ctx.fillRect(0, 0, PIN_WIDTH, headerHeight);

    // Accent line
    ctx.fillStyle = accentColor;
    ctx.fillRect(60, 80, 60, 5);

    // Category / tag
    if (subtitle) {
        ctx.font = `500 16px "Inter", "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.textAlign = "left";
        ctx.letterSpacing = "3px";
        ctx.fillText(subtitle.toUpperCase(), 60, 130);
    }

    // Title text — big, bold
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    const titleSize = title.length > 30 ? 46 : title.length > 20 ? 54 : 62;
    ctx.font = `800 ${titleSize}px "Inter", "Helvetica Neue", Arial, sans-serif`;
    const titleLines = wrapText(ctx, title.toUpperCase(), PIN_WIDTH - 120);
    const lineHeight = titleSize * 1.1;
    let titleY = 180;

    for (const line of titleLines) {
        ctx.fillText(line, 60, titleY);
        titleY += lineHeight;
    }

    // Photo area (bottom 60%)
    const img = await loadImage(imagePath);
    const photoY = headerHeight;
    const photoHeight = PIN_HEIGHT - headerHeight - 60; // leave space for brand bar

    const imgRatio = img.width / img.height;
    const photoRatio = PIN_WIDTH / photoHeight;

    let sx, sy, sw, sh;
    if (imgRatio > photoRatio) {
        sh = img.height;
        sw = sh * photoRatio;
        sx = (img.width - sw) / 2;
        sy = 0;
    } else {
        sw = img.width;
        sh = sw / photoRatio;
        sx = 0;
        sy = (img.height - sh) / 2;
    }

    // Rounded clipping for the image
    const imgPadding = 20;
    const imgX = imgPadding;
    const imgY = photoY + 10;
    const imgW = PIN_WIDTH - imgPadding * 2;
    const imgH = photoHeight - 10;
    const imgRadius = 16;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgW, imgH, imgRadius);
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, imgX, imgY, imgW, imgH);
    ctx.restore();

    // Brand bar at bottom
    ctx.fillStyle = BRAND.dark;
    ctx.fillRect(0, PIN_HEIGHT - 60, PIN_WIDTH, 60);
    drawBrandBar(ctx, brandName);

    return canvas;
}

/**
 * Template C: Numbered List / Infographic
 * Great for listicles: "5 Must-Visit Spots" etc.
 * Dark background, numbered items with clean typography.
 */
async function templateList(imagePath, options = {}) {
    const {
        title = "5 MUST-DO ROAD TRIPS",
        items = ["Aso Volcano", "Takachiho Gorge", "Beppu Onsen", "Nagasaki Coast", "Itoshima Beach"],
        brandName = "VanTripJapan",
        accentColor = BRAND.accent,
    } = options;

    const canvas = createCanvas(PIN_WIDTH, PIN_HEIGHT);
    const ctx = canvas.getContext("2d");

    // Load background image and darken
    const img = await loadImage(imagePath);
    const imgRatio = img.width / img.height;
    const pinRatio = PIN_WIDTH / PIN_HEIGHT;

    let sx, sy, sw, sh;
    if (imgRatio > pinRatio) {
        sh = img.height;
        sw = sh * pinRatio;
        sx = (img.width - sw) / 2;
        sy = 0;
    } else {
        sw = img.width;
        sh = sw / pinRatio;
        sx = 0;
        sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, PIN_WIDTH, PIN_HEIGHT);

    // Dark overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(0, 0, PIN_WIDTH, PIN_HEIGHT);

    // Accent line at top
    ctx.fillStyle = accentColor;
    ctx.fillRect(60, 80, 60, 5);

    // Title
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    const titleSize = title.length > 25 ? 48 : 58;
    ctx.font = `800 ${titleSize}px "Inter", "Helvetica Neue", Arial, sans-serif`;
    const titleLines = wrapText(ctx, title.toUpperCase(), PIN_WIDTH - 120);
    const lineHeight = titleSize * 1.1;
    let y = 140;

    for (const line of titleLines) {
        ctx.fillText(line, 60, y);
        y += lineHeight;
    }

    // Numbered list
    y += 40;
    const itemHeight = Math.min(140, (PIN_HEIGHT - y - 120) / items.length);

    items.forEach((item, i) => {
        const itemY = y + i * itemHeight;

        // Number circle
        ctx.beginPath();
        ctx.arc(100, itemY + 5, 28, 0, Math.PI * 2);
        ctx.fillStyle = accentColor;
        ctx.fill();

        ctx.fillStyle = "#FFFFFF";
        ctx.font = `700 22px "Inter", "Helvetica Neue", Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(`${i + 1}`, 100, itemY + 13);

        // Item text
        ctx.textAlign = "left";
        ctx.font = `500 28px "Inter", "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(item, 150, itemY + 13);

        // Divider line
        if (i < items.length - 1) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(60, itemY + itemHeight - 15);
            ctx.lineTo(PIN_WIDTH - 60, itemY + itemHeight - 15);
            ctx.stroke();
        }
    });

    // Brand bar
    drawBrandBar(ctx, brandName);

    return canvas;
}

/**
 * Draw the brand bar at the bottom of the pin
 */
function drawBrandBar(ctx, brandName = "VanTripJapan") {
    const barY = PIN_HEIGHT - 50;

    // Subtle brand mark
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = `600 14px "Inter", "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`🚐  ${brandName}`, PIN_WIDTH / 2, barY + 10);
}

/**
 * Word wrap helper for canvas text
 */
function wrapText(ctx, text, maxWidth) {
    const words = text.split(" ");
    const lines = [];
    let currentLine = "";

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}

/**
 * Generate a pin image from input
 *
 * @param {string} imagePath - Path to the source image
 * @param {string} template - Template name: 'overlay', 'magazine', or 'list'
 * @param {object} options - Template-specific options (title, subtitle, items, etc.)
 * @param {string} outputPath - Where to save the generated pin
 * @returns {Promise<string>} - Path to the generated image
 */
async function generatePin(imagePath, template, options = {}, outputPath = null) {
    let canvas;

    switch (template) {
        case "magazine":
            canvas = await templateMagazine(imagePath, options);
            break;
        case "list":
            canvas = await templateList(imagePath, options);
            break;
        case "overlay":
        default:
            canvas = await templateOverlay(imagePath, options);
            break;
    }

    // Default output path
    if (!outputPath) {
        const baseName = path.basename(imagePath, path.extname(imagePath));
        const timestamp = Date.now();
        outputPath = path.join(
            __dirname,
            "output",
            `${baseName}_${template}_${timestamp}.png`
        );
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save to file
    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
}

module.exports = {
    generatePin,
    templateOverlay,
    templateMagazine,
    templateList,
    BRAND,
    PIN_WIDTH,
    PIN_HEIGHT,
};

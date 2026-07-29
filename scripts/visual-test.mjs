import { chromium } from "file:///C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3210";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.screenshot({ path: "qa/desktop-home.png", fullPage: false });
await page.locator("#foundation").scrollIntoViewIfNeeded();
await page.screenshot({ path: "qa/desktop-foundation.png", fullPage: false });
await page.locator("#agent").scrollIntoViewIfNeeded();
await page.screenshot({ path: "qa/desktop-agent.png", fullPage: false });
await page.getByRole("button", { name: /两分钟汇报/ }).first().click();
await page.screenshot({ path: "qa/presentation.png", fullPage: false });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
mobile.on("pageerror", (error) => errors.push(`mobile: ${error.message}`));
await mobile.goto(baseUrl, { waitUntil: "networkidle" });
await mobile.screenshot({ path: "qa/mobile-home.png", fullPage: false });
const overflow = await mobile.evaluate(() => ({
  body: document.body.scrollWidth,
  viewport: document.documentElement.clientWidth,
}));
console.log(JSON.stringify({
  title: await page.title(),
  errors,
  overflow,
}, null, 2));
await browser.close();

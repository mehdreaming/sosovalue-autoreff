import axios from "axios";
import fs from "fs";
import path from "path";
import express from 'express';
import { connect } from 'puppeteer-real-browser';
import { randomInt } from 'crypto';
import { randomBytes } from 'crypto';

const configPath = path.resolve(__dirname, "../../config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const conf2Captcha = config.captcha2;

// Cloudflare bypass server setup
const tokens: string[] = [];
const key = randomBytes(20).toString('hex');
const prt = randomInt(5000, 9000);
const template = `<!DOCTYPE html><html><!-- Same HTML template from Python code --></html>`;

const app = express();
app.get('/reserve_token', (req, res) => {
    const token = req.query.token as string;
    tokens.push(token);
    res.send('ok');
});

app.get('/get', (req, res) => {
    try {
        const latestToken = tokens.pop();
        res.send(latestToken || 'No tokens available');
    } catch {
        res.send('No tokens available');
    }
});

app.get('/', (req, res) => {
    res.send(template);
});

app.listen(prt, () => {
    console.log(`\x1b[32mCloudflare bypass server running on http://localhost:${prt}\x1b[0m`);
});

// Modified CAPTCHA solving functions
export async function solveTurnstileCaptchaLocal(): Promise<string | null> {
    try {
        const response = await axios.get(`http://localhost:${prt}/get`);
        return response.data !== 'No tokens available' ? response.data : null;
    } catch (error) {
        console.error('Error fetching local token:', error);
        return null;
    }
}

export async function solveTurnstileCaptchaPuppeter(): Promise<string | null> {
    let browser;
    try {
        const { browser: connectedBrowser, page } = await connect({
            headless: false,
            args: [],
            customConfig: {},
            turnstile: true,
            connectOption: {},
            disableXvfb: false,
            ignoreAllFlags: false,
        });

        browser = connectedBrowser;
        await page.goto(`http://localhost:${prt}`);
        
        // Wait for CAPTCHA to be solved
        await page.waitForFunction(() => {
            const statusElement = document.getElementById('status');
            return statusElement?.textContent?.includes('successfully');
        }, { timeout: 60000 });

        // Get the latest token from the server
        const token = await solveTurnstileCaptchaLocal();
        return token;
    } catch (error) {
        console.error("Error solving CAPTCHA:", error);
        return null;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Original 2Captcha function remains the same
export async function solveTurnstileCaptcha(
    siteKey: string,
    pageUrl: string
): Promise<string | null> {
    try {
        const captchaRequest = await axios.post(
            "http://2captcha.com/in.php",
            null,
            {
                params: {
                    key: conf2Captcha,
                    method: "turnstile",
                    sitekey: siteKey,
                    pageurl: pageUrl,
                    json: 1,
                },
            }
        );

        const captchaId = captchaRequest.data.request;
        while (true) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            const captchaResult = await axios.get("http://2captcha.com/res.php", {
                params: {
                    key: conf2Captcha,
                    action: "get",
                    id: captchaId,
                    json: 1,
                },
            });

            if (captchaResult.data.status === 1) {
                return captchaResult.data.request;
            } else if (captchaResult.data.request !== "CAPCHA_NOT_READY") {
                return null;
            }
        }
    } catch (error) {
        console.error("Error solving CAPTCHA:", error);
        return null;
    }
          }

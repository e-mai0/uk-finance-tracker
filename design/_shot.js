// Throwaway: screenshot the authed dashboard via installed Edge + session cookie.
const { chromium } = require("playwright-core");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function sessionCookie() {
  const v = process.env.TRK_COOKIE;
  if (!v) throw new Error("TRK_COOKIE env not set");
  return v;
}

(async () => {
  const value = sessionCookie();
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1600 }, deviceScaleFactor: 2 });
  await ctx.addCookies([
    { name: "authjs.session-token", value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await ctx.newPage();
  const resp = await page.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle", timeout: 30000 });
  console.log("status", resp && resp.status());
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "design/_shot_dashboard.png", clip: { x: 0, y: 0, width: 1440, height: 760 } });
  console.log("shot written");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

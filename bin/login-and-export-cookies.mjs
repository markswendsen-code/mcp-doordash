#!/usr/bin/env node

/**
 * Local helper for headless/k8s deployments.
 *
 * Opens a real, visible browser on your machine, lets you log in to DoorDash
 * once, then saves the session cookies to the same file the MCP server reads
 * (~/.config/striderlabs-mcp-doordash/cookies.json) and prints a ready-to-run
 * `kubectl` command to ship that file into your cluster as a Secret.
 *
 * Requires a build first: `npm run build`
 * Usage: node bin/login-and-export-cookies.mjs [--secret-name NAME] [--namespace NS]
 */

import { chromium } from "patchright";
import { loadCookies, saveCookies, getCookiesPath } from "../dist/auth.js";

const DOORDASH_BASE_URL = "https://www.doordash.com";
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

function parseArgs(argv) {
  const opts = { secretName: "doordash-cookies", namespace: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--secret-name") opts.secretName = argv[++i];
    else if (argv[i] === "--namespace") opts.namespace = argv[++i];
  }
  return opts;
}

async function isLoggedIn(page) {
  const signInVisible = await page
    .locator('button:has-text("Sign In"), a:has-text("Sign In"), text="Sign in or Sign up"')
    .first()
    .isVisible()
    .catch(() => false);
  return !signInVisible;
}

async function main() {
  const { secretName, namespace } = parseArgs(process.argv.slice(2));
  const cookiesPath = getCookiesPath();

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });
  await loadCookies(context);
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  await page.goto(`${DOORDASH_BASE_URL}/consumer/login`, { waitUntil: "domcontentloaded" });
  console.log("Log in to DoorDash in the browser window that just opened...");

  const start = Date.now();
  let loggedIn = false;
  // Poll the live page without forcing navigation, so an in-progress email/OTP
  // entry never gets interrupted mid-flow.
  while (Date.now() - start < LOGIN_TIMEOUT_MS) {
    await page.waitForTimeout(4000);
    loggedIn = (await isLoggedIn(page)) && !page.url().includes("/consumer/login");
    if (loggedIn) break;
  }

  if (!loggedIn) {
    console.error("Timed out waiting for login.");
    await browser.close();
    process.exit(1);
  }

  // One confirmatory check on the homepage to rule out false positives
  // (e.g. a transient state on the login page itself).
  await page.goto(DOORDASH_BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  if (!(await isLoggedIn(page))) {
    console.error("Login did not persist - please try again.");
    await browser.close();
    process.exit(1);
  }

  await saveCookies(context);
  await browser.close();

  console.log(`\nLogged in. Cookies saved to: ${cookiesPath}\n`);
  console.log("Run this to create/update the k8s Secret:\n");
  const nsFlag = namespace ? ` --namespace ${namespace}` : "";
  console.log(
    `kubectl create secret generic ${secretName}${nsFlag} --from-file=cookies.json=${cookiesPath} --dry-run=client -o yaml | kubectl apply -f -\n`
  );
  console.log(
    "DoorDash sessions expire - re-run this script and re-run the command above whenever the container's session goes stale."
  );

  process.exit(0);
}

main().catch((error) => {
  console.error("Failed to export cookies:", error);
  process.exit(1);
});

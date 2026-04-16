/**
 * DoorDash Authentication & Session Management
 * 
 * Handles cookie persistence and login state detection.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { BrowserContext, Cookie } from "patchright";

// Default cookie storage location
const CONFIG_DIR = join(homedir(), ".config", "striderlabs-mcp-doordash");
const COOKIES_FILE = join(CONFIG_DIR, "cookies.json");

export interface AuthState {
  isLoggedIn: boolean;
  email?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Save cookies from browser context to disk
 */
export async function saveCookies(context: BrowserContext): Promise<void> {
  ensureConfigDir();
  const cookies = await context.cookies();
  writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

/**
 * Load cookies from disk and add to browser context
 */
export async function loadCookies(context: BrowserContext): Promise<boolean> {
  if (!existsSync(COOKIES_FILE)) {
    return false;
  }

  try {
    const cookiesData = readFileSync(COOKIES_FILE, "utf-8");
    const cookies: Cookie[] = JSON.parse(cookiesData);
    
    if (cookies.length > 0) {
      await context.addCookies(cookies);
      return true;
    }
  } catch (error) {
    console.error("Failed to load cookies:", error);
  }
  
  return false;
}

/**
 * Clear stored cookies
 */
export function clearCookies(): void {
  if (existsSync(COOKIES_FILE)) {
    writeFileSync(COOKIES_FILE, "[]");
  }
}

/**
 * Check if we have stored cookies
 */
export function hasStoredCookies(): boolean {
  if (!existsSync(COOKIES_FILE)) {
    return false;
  }
  
  try {
    const cookiesData = readFileSync(COOKIES_FILE, "utf-8");
    const cookies = JSON.parse(cookiesData);
    return Array.isArray(cookies) && cookies.length > 0;
  } catch {
    return false;
  }
}

/**
 * Extract auth state from DoorDash page
 */
export async function getAuthState(context: BrowserContext): Promise<AuthState> {
  const cookies = await context.cookies("https://www.doordash.com");
  
  // Check for session cookies that indicate logged in state.
  // Includes current cookie names as well as legacy names kept for backwards compatibility.
  const SESSION_COOKIE_NAMES = new Set([
    "consumer_session",   // current primary session cookie
    "Cx-Auth-Token",      // current auth token cookie
    "cx_auth_token",      // alternate casing
    "dd_session",         // legacy
    "ddsid",              // legacy
    "dd_login",           // legacy
  ]);
  const hasSessionCookie = cookies.some((c) => SESSION_COOKIE_NAMES.has(c.name));

  // Also check for user ID cookie (current and legacy names).
  const userIdCookie = cookies.find(
    (c) => c.name === "consumer_id" || c.name === "dd_user_id"
  );
  
  if (hasSessionCookie || userIdCookie) {
    return {
      isLoggedIn: true,
    };
  }
  
  return {
    isLoggedIn: false,
  };
}

/**
 * Get the path where cookies are stored
 */
export function getCookiesPath(): string {
  return COOKIES_FILE;
}

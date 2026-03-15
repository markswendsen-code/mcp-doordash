/**
 * DoorDash Browser Automation
 * 
 * Patchright-based stealth automation for DoorDash operations.
 */

import { chromium, Browser, BrowserContext, Page } from "patchright";
import { saveCookies, loadCookies, getAuthState, AuthState } from "./auth.js";

const DOORDASH_BASE_URL = "https://www.doordash.com";
const DEFAULT_TIMEOUT = 60000;

// Singleton browser instance
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string[];
  rating: number;
  deliveryTime: string;
  deliveryFee: string;
  imageUrl?: string;
  distance?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  popular?: boolean;
}

export interface MenuCategory {
  name: string;
  items: MenuItem[];
}

export interface CartItem {
  name: string;
  quantity: number;
  price: number;
  customizations?: string[];
}

export interface OrderStatus {
  orderId: string;
  status: string;
  estimatedDelivery?: string;
  restaurant: string;
  dasher?: {
    name: string;
    phoneLastFour?: string;
  };
  items: CartItem[];
  total: number;
}

/**
 * Initialize browser with stealth settings
 */
async function initBrowser(): Promise<void> {
  if (browser) return;

  browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });

  // Load saved cookies
  await loadCookies(context);

  page = await context.newPage();
  
  // Set default timeout
  page.setDefaultTimeout(DEFAULT_TIMEOUT);
}

/**
 * Get the current page, initializing if needed
 */
async function getPage(): Promise<Page> {
  await initBrowser();
  if (!page) throw new Error("Page not initialized");
  return page;
}

/**
 * Get current context
 */
async function getContext(): Promise<BrowserContext> {
  await initBrowser();
  if (!context) throw new Error("Context not initialized");
  return context;
}

/**
 * Check if user is logged in
 */
export async function checkAuth(): Promise<AuthState> {
  const ctx = await getContext();
  const p = await getPage();
  
  // Navigate to DoorDash to check auth state
  await p.goto(DOORDASH_BASE_URL, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
  
  // Wait for page to stabilize
  await p.waitForTimeout(3000);
  
  const authState = await getAuthState(ctx);
  
  // Save cookies after check
  await saveCookies(ctx);
  
  return authState;
}

/**
 * Set delivery address
 */
export async function setAddress(address: string): Promise<{ success: boolean; formattedAddress?: string; error?: string }> {
  const p = await getPage();
  const ctx = await getContext();
  
  try {
    await p.goto(DOORDASH_BASE_URL, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    await p.waitForTimeout(2000);
    
    // Close any sign-in dialog that pops up
    const closeButton = p.locator('button:has-text("Close")').first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await p.waitForTimeout(500);
    }
    
    // Look for the address input combobox on homepage
    const addressCombobox = p.locator('input[placeholder*="delivery address"], input[placeholder*="Enter delivery"], [role="combobox"][aria-label*="address"]').first();
    
    // Or the "Your Address" button on search pages
    const addressButton = p.locator('button:has-text("Your Address"), button:has-text("Enter delivery address")').first();
    
    if (await addressCombobox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addressCombobox.click();
      await addressCombobox.fill(address);
      await p.waitForTimeout(1500);
    } else if (await addressButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addressButton.click();
      await p.waitForTimeout(1000);
      
      // Find the address input in the modal/dropdown
      const modalInput = p.locator('input[placeholder*="address"], input[placeholder*="Address"]').first();
      await modalInput.waitFor({ timeout: 5000 });
      await modalInput.fill(address);
      await p.waitForTimeout(1500);
    } else {
      throw new Error("Could not find address input field");
    }
    
    // Click first suggestion from autocomplete
    const suggestion = p.locator('[role="option"], [role="listbox"] >> text=' + address.split(',')[0]).first();
    if (await suggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
      await suggestion.click();
      await p.waitForTimeout(1000);
    }
    
    // Try clicking save/confirm button if present
    const saveButton = p.locator('button:has-text("Save"), button:has-text("Done"), button:has-text("Confirm"), button:has-text("Find Restaurants")').first();
    if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveButton.click();
    }
    
    await p.waitForTimeout(2000);
    await saveCookies(ctx);
    
    return {
      success: true,
      formattedAddress: address,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to set address",
    };
  }
}

/**
 * Search restaurants by location and/or cuisine
 */
export async function searchRestaurants(
  query: string,
  options?: { cuisine?: string; sortBy?: string }
): Promise<{ success: boolean; restaurants?: Restaurant[]; error?: string }> {
  const p = await getPage();
  const ctx = await getContext();

  try {
    // Build search URL
    let searchUrl = `${DOORDASH_BASE_URL}/search/store/${encodeURIComponent(query)}`;
    if (options?.cuisine) {
      searchUrl = `${DOORDASH_BASE_URL}/cuisine/${encodeURIComponent(options.cuisine)}`;
    }
    
    await p.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    await p.waitForTimeout(5000);
    
    const restaurants: Restaurant[] = [];
    
    // Find all links that contain /store/ pattern - these are restaurant cards
    const storeLinks = await p.locator('a[href*="/store/"]').all();
    
    // Track seen store IDs to avoid duplicates
    const seenIds = new Set<string>();
    
    for (const link of storeLinks) {
      try {
        const href = await link.getAttribute('href');
        if (!href) continue;
        
        // Extract store ID from URL
        const storeIdMatch = href.match(/\/store\/(\d+)/);
        if (!storeIdMatch) continue;
        
        const storeId = storeIdMatch[1];
        if (seenIds.has(storeId)) continue;
        
        // Get the link text which contains restaurant info
        const linkText = await link.textContent() || "";
        if (!linkText.trim()) continue;
        
        // Skip if text is too short (likely just an image link)
        if (linkText.length < 10) continue;
        
        // Parse the text content to extract restaurant info
        // Format: "Restaurant Name4.7(3k+)•0.8 mi•29 min$0 delivery fee, first order"
        // Note: No spaces between name and rating!
        
        // Split by bullet points (•)
        const parts = linkText.split('•').map(s => s.trim());
        const firstPart = parts[0] || "";
        
        // Extract rating pattern like "4.7" followed by parens - no space before rating
        const ratingMatch = firstPart.match(/(\d+\.\d+)\s*\(([^)]+)\)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
        
        // Get restaurant name - everything before the rating number
        let name = firstPart;
        if (ratingMatch) {
          // Find where the rating starts (the digit)
          const ratingIndex = firstPart.indexOf(ratingMatch[0]);
          name = firstPart.substring(0, ratingIndex).trim();
        } else {
          // No rating found, try to find where numbers start
          const numIndex = firstPart.search(/\d/);
          if (numIndex > 0) {
            name = firstPart.substring(0, numIndex).trim();
          }
        }
        
        // Remove any remaining parenthetical content from name
        name = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
        
        // Skip if no valid name
        if (!name || name.length < 2) continue;
        
        // Mark this ID as seen only after we have a valid name
        seenIds.add(storeId);
        
        // Parse distance and delivery time from remaining parts
        // Format after bullet split: ["Name4.7(3k+)", "0.8 mi", "29 min$0 delivery fee..."]
        let distance = "";
        let deliveryTime = "";
        let deliveryFee = "";
        
        for (const part of parts.slice(1)) {
          // Distance: contains "mi" or "ft" but NOT "min"
          if ((part.includes(' mi') || part.includes(' ft')) && !part.includes('min')) {
            distance = part;
          } 
          // Time + delivery fee: contains "min"
          else if (part.includes('min')) {
            // Extract just the time portion (number + min)
            const timeMatch = part.match(/(\d+)\s*min/);
            if (timeMatch) {
              deliveryTime = timeMatch[0];
            }
            // Extract delivery fee from this part
            const feeMatch = part.match(/\$\d+\.?\d*\s*delivery fee[^$]*|free delivery[^$]*/i);
            if (feeMatch) {
              deliveryFee = feeMatch[0].trim();
            }
          }
        }
        
        // Fallback: try to extract delivery fee from full text if not found
        if (!deliveryFee && linkText.includes('delivery fee')) {
          const feeMatch = linkText.match(/\$\d+\.?\d*\s*delivery fee[^•]*/i);
          if (feeMatch) {
            deliveryFee = feeMatch[0].trim();
          }
        }
        
        restaurants.push({
          id: storeId,
          name: name,
          cuisine: [],
          rating: rating,
          deliveryTime: deliveryTime,
          deliveryFee: deliveryFee,
          distance: distance,
        });
        
        // Stop after 20 restaurants
        if (restaurants.length >= 20) break;
        
      } catch {
        // Skip problematic elements
        continue;
      }
    }
    
    await saveCookies(ctx);
    
    return {
      success: true,
      restaurants,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to search restaurants",
    };
  }
}

/**
 * Get restaurant menu
 */
export async function getMenu(
  restaurantId: string
): Promise<{ success: boolean; restaurant?: string; categories?: MenuCategory[]; error?: string }> {
  const p = await getPage();
  const ctx = await getContext();

  try {
    await p.goto(`${DOORDASH_BASE_URL}/store/${restaurantId}`, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT,
    });
    await p.waitForTimeout(4000);
    
    // Get restaurant name from h1 or page content
    const restaurantName = await p.locator('h1').first().textContent().catch(() => "") || "Unknown Restaurant";
    
    // Wait for menu items to load
    await p.waitForTimeout(2000);
    
    const categories: MenuCategory[] = [];
    
    // Find menu sections - they usually have h2 or h3 headings
    const sections = await p.locator('section, div:has(> h2), div:has(> h3)').all();
    
    for (const section of sections) {
      try {
        // Get section heading
        const heading = await section.locator('h2, h3').first().textContent().catch(() => "");
        if (!heading || heading.length < 2) continue;
        
        const items: MenuItem[] = [];
        
        // Find items within this section - look for clickable elements with prices
        const itemElements = await section.locator('button, [role="button"], article, div:has(span:has-text("$"))').all();
        
        for (const item of itemElements) {
          try {
            const itemText = await item.textContent() || "";
            
            // Must have a price to be a menu item
            if (!itemText.includes('$')) continue;
            
            // Extract item name and price
            // Format: "Item Name $XX.XX" or "Item Name - $XX.XX description..."
            const priceMatch = itemText.match(/\$(\d+\.?\d*)/);
            if (!priceMatch) continue;
            
            const price = parseFloat(priceMatch[1]);
            
            // Get item name - text before the price
            let itemName = itemText.substring(0, itemText.indexOf('$')).trim();
            itemName = itemName.replace(/[-–—]\s*$/, '').trim();
            
            // Skip if name is too short or looks like a section
            if (!itemName || itemName.length < 2 || itemName === heading) continue;
            
            // Get description - text after price (if any)
            let description = "";
            const afterPrice = itemText.substring(itemText.indexOf(priceMatch[0]) + priceMatch[0].length);
            if (afterPrice) {
              description = afterPrice.trim().substring(0, 200);
            }
            
            // Check if popular/liked
            const popular = itemText.toLowerCase().includes('popular') || 
                           itemText.toLowerCase().includes('most liked') ||
                           itemText.includes('%');
            
            items.push({
              id: `${restaurantId}-${items.length}`,
              name: itemName,
              description: description,
              price: price,
              popular: popular,
            });
            
            // Limit items per category
            if (items.length >= 30) break;
            
          } catch {
            continue;
          }
        }
        
        if (items.length > 0) {
          categories.push({
            name: heading.trim(),
            items,
          });
        }
        
        // Limit categories
        if (categories.length >= 15) break;
        
      } catch {
        continue;
      }
    }
    
    await saveCookies(ctx);
    
    return {
      success: true,
      restaurant: restaurantName.trim(),
      categories,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get menu",
    };
  }
}

/**
 * Add item to cart
 */
export async function addToCart(
  restaurantId: string,
  itemName: string,
  quantity: number = 1,
  specialInstructions?: string
): Promise<{ success: boolean; cartTotal?: number; error?: string }> {
  const p = await getPage();
  const ctx = await getContext();

  try {
    // Make sure we're on the restaurant page
    const currentUrl = p.url();
    if (!currentUrl.includes(`/store/${restaurantId}`)) {
      await p.goto(`${DOORDASH_BASE_URL}/store/${restaurantId}`, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
      await p.waitForTimeout(3000);
    }
    
    // Find and click the menu item by name
    const menuItem = p.locator(`button:has-text("${itemName}"), [role="button"]:has-text("${itemName}")`).first();
    await menuItem.waitFor({ timeout: 10000 });
    await menuItem.click();
    await p.waitForTimeout(2000);
    
    // Handle quantity if more than 1
    if (quantity > 1) {
      for (let i = 1; i < quantity; i++) {
        const increaseButton = p.locator('button[aria-label*="increase"], button[aria-label*="Increase"], button:has-text("+")').first();
        if (await increaseButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await increaseButton.click();
          await p.waitForTimeout(300);
        }
      }
    }
    
    // Add special instructions if provided
    if (specialInstructions) {
      const instructionsInput = p.locator('textarea[placeholder*="instruction"], textarea[placeholder*="special"], input[placeholder*="instruction"]');
      if (await instructionsInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await instructionsInput.fill(specialInstructions);
      }
    }
    
    // Click add to cart button
    const addButton = p.locator('button:has-text("Add to Cart"), button:has-text("Add to Order"), button:has-text("Add")').first();
    await addButton.waitFor({ timeout: 5000 });
    await addButton.click();
    await p.waitForTimeout(2000);
    
    // Get cart total from cart icon or button
    const cartButton = p.locator('button[aria-label*="cart"], button:has-text("Cart")').first();
    const cartText = await cartButton.textContent().catch(() => "") || "";
    const totalMatch = cartText.match(/\$(\d+\.?\d*)/);
    const cartTotal = totalMatch ? parseFloat(totalMatch[1]) : 0;
    
    await saveCookies(ctx);
    
    return {
      success: true,
      cartTotal: cartTotal,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add item to cart",
    };
  }
}

/**
 * Get current cart contents
 */
export async function getCart(): Promise<{ success: boolean; items?: CartItem[]; subtotal?: number; fees?: number; total?: number; error?: string }> {
  const p = await getPage();
  const ctx = await getContext();

  try {
    // Click on cart to open it
    const cartButton = p.locator('button[aria-label*="cart"], button[aria-label*="Cart"]').first();
    if (await cartButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cartButton.click();
      await p.waitForTimeout(2000);
    }
    
    const items: CartItem[] = [];
    
    // Find cart items - they usually contain price and quantity info
    const cartItems = await p.locator('[data-testid*="cart"], [aria-label*="cart"] >> div:has(span:has-text("$"))').all();
    
    for (const item of cartItems) {
      try {
        const itemText = await item.textContent() || "";
        if (!itemText.includes('$')) continue;
        
        // Extract name and price
        const priceMatch = itemText.match(/\$(\d+\.?\d*)/);
        if (!priceMatch) continue;
        
        const name = itemText.substring(0, itemText.indexOf('$')).trim();
        const price = parseFloat(priceMatch[1]);
        
        // Try to find quantity
        const qtyMatch = itemText.match(/(\d+)\s*x/i) || itemText.match(/x\s*(\d+)/i);
        const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;
        
        if (name) {
          items.push({
            name: name.trim(),
            quantity,
            price,
          });
        }
      } catch {
        continue;
      }
    }
    
    // Get totals from visible text
    const pageText = await p.textContent('body') || "";
    const subtotalMatch = pageText.match(/Subtotal[:\s]*\$(\d+\.?\d*)/i);
    const totalMatch = pageText.match(/Total[:\s]*\$(\d+\.?\d*)/i);
    
    await saveCookies(ctx);
    
    return {
      success: true,
      items,
      subtotal: subtotalMatch ? parseFloat(subtotalMatch[1]) : 0,
      total: totalMatch ? parseFloat(totalMatch[1]) : 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get cart",
    };
  }
}

/**
 * Place order (with confirmation step - returns order summary, doesn't actually place without confirmation)
 */
export async function placeOrder(
  confirm: boolean = false
): Promise<{ success: boolean; orderId?: string; summary?: { items: CartItem[]; total: number; deliveryAddress?: string; estimatedDelivery?: string }; requiresConfirmation?: boolean; error?: string }> {
  const p = await getPage();
  const ctx = await getContext();

  try {
    // Navigate to checkout
    const checkoutButton = p.locator('button:has-text("Checkout"), a:has-text("Checkout")').first();
    if (await checkoutButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkoutButton.click();
      await p.waitForTimeout(3000);
    }
    
    // Get order summary
    const items: CartItem[] = [];
    const pageText = await p.textContent('body') || "";
    
    // Extract total from page
    const totalMatch = pageText.match(/Total[:\s]*\$(\d+\.?\d*)/i);
    const total = totalMatch ? parseFloat(totalMatch[1]) : 0;
    
    // Extract delivery info
    const deliveryMatch = pageText.match(/Deliver to[:\s]*([^\n$]+)/i);
    const deliveryAddress = deliveryMatch ? deliveryMatch[1].trim() : "";
    
    const timeMatch = pageText.match(/(\d+[-–]\d+\s*min)/);
    const estimatedDelivery = timeMatch ? timeMatch[1] : "";
    
    // If not confirmed, return summary for user to confirm
    if (!confirm) {
      return {
        success: true,
        requiresConfirmation: true,
        summary: {
          items,
          total,
          deliveryAddress,
          estimatedDelivery,
        },
      };
    }
    
    // If confirmed, place the order
    const placeOrderButton = p.locator('button:has-text("Place Order")').first();
    await placeOrderButton.waitFor({ timeout: 5000 });
    await placeOrderButton.click();
    await p.waitForTimeout(5000);
    
    // Get order confirmation
    const orderIdMatch = p.url().match(/order\/(\w+)/);
    const orderId = orderIdMatch?.[1] || `order-${Date.now()}`;
    
    await saveCookies(ctx);
    
    return {
      success: true,
      orderId,
      summary: {
        items,
        total,
        deliveryAddress,
        estimatedDelivery,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to place order",
    };
  }
}

/**
 * Track order status
 */
export async function trackOrder(
  orderId?: string
): Promise<{ success: boolean; status?: OrderStatus; error?: string }> {
  const p = await getPage();
  const ctx = await getContext();

  try {
    // Navigate to orders page
    let orderUrl = `${DOORDASH_BASE_URL}/orders`;
    if (orderId) {
      orderUrl = `${DOORDASH_BASE_URL}/orders/${orderId}`;
    }
    
    await p.goto(orderUrl, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    await p.waitForTimeout(3000);
    
    // If on orders list, click the most recent/active order
    if (!orderId) {
      const activeOrder = p.locator('a[href*="/orders/"]').first();
      if (await activeOrder.isVisible({ timeout: 3000 }).catch(() => false)) {
        await activeOrder.click();
        await p.waitForTimeout(2000);
      }
    }
    
    // Get order details from page
    const pageText = await p.textContent('body') || "";
    
    // Extract status - look for common status phrases
    let status = "Unknown";
    if (pageText.includes("Preparing")) status = "Preparing";
    else if (pageText.includes("On the way")) status = "On the way";
    else if (pageText.includes("Delivered")) status = "Delivered";
    else if (pageText.includes("Picking up")) status = "Picking up";
    
    // Extract restaurant name
    const restaurantMatch = pageText.match(/from\s+([^\n]+)/i);
    const restaurantName = restaurantMatch ? restaurantMatch[1].trim() : "";
    
    // Extract delivery time
    const deliveryMatch = pageText.match(/(\d+[-–]\d+\s*min)/);
    const estimatedDelivery = deliveryMatch ? deliveryMatch[1] : "";
    
    // Extract total
    const totalMatch = pageText.match(/Total[:\s]*\$(\d+\.?\d*)/i);
    const total = totalMatch ? parseFloat(totalMatch[1]) : 0;
    
    await saveCookies(ctx);
    
    return {
      success: true,
      status: {
        orderId: orderId || p.url().match(/orders\/(\w+)/)?.[1] || "unknown",
        status: status,
        estimatedDelivery: estimatedDelivery,
        restaurant: restaurantName,
        items: [],
        total: total,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to track order",
    };
  }
}

/**
 * Login prompt - returns URL and instructions for user to log in
 */
export async function getLoginUrl(): Promise<{ url: string; instructions: string }> {
  const p = await getPage();
  await p.goto(`${DOORDASH_BASE_URL}/consumer/login`, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
  
  return {
    url: `${DOORDASH_BASE_URL}/consumer/login`,
    instructions: "Please log in to DoorDash in your browser. After logging in, run the 'doordash_auth_check' tool to verify authentication and save your session.",
  };
}

/**
 * Cleanup browser resources
 */
export async function cleanup(): Promise<void> {
  if (context) {
    await saveCookies(context);
  }
  if (browser) {
    await browser.close();
    browser = null;
    context = null;
    page = null;
  }
}

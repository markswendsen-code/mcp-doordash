/**
 * DoorDash Browser Automation
 * 
 * Playwright-based automation for DoorDash operations.
 */

import { chromium, Browser, BrowserContext, Page } from "playwright";
import { saveCookies, loadCookies, getAuthState, AuthState } from "./auth.js";

const DOORDASH_BASE_URL = "https://www.doordash.com";
const DEFAULT_TIMEOUT = 30000;

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
    ],
  });

  context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });

  // Load saved cookies
  await loadCookies(context);

  page = await context.newPage();
  
  // Block unnecessary resources for speed
  await page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2}", (route) =>
    route.abort()
  );
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
  
  // Wait a bit for any auth redirects
  await p.waitForTimeout(2000);
  
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
    
    // Click on address input/button
    const addressButton = p.locator('[data-anchor-id="AddressModalButton"], [data-testid="AddressModalButton"], button:has-text("Enter delivery address")');
    
    if (await addressButton.isVisible({ timeout: 5000 })) {
      await addressButton.click();
      await p.waitForTimeout(1000);
    }
    
    // Find and fill address input
    const addressInput = p.locator('input[placeholder*="address"], input[placeholder*="Address"], input[data-testid="AddressAutocompleteInput"]');
    await addressInput.waitFor({ timeout: 5000 });
    await addressInput.fill(address);
    await p.waitForTimeout(1500);
    
    // Click first suggestion
    const suggestion = p.locator('[data-testid="AddressAutocompleteSuggestion"], [role="option"]').first();
    if (await suggestion.isVisible({ timeout: 3000 })) {
      await suggestion.click();
      await p.waitForTimeout(1000);
    }
    
    // Confirm address if there's a save button
    const saveButton = p.locator('button:has-text("Save"), button:has-text("Done"), button:has-text("Confirm")');
    if (await saveButton.isVisible({ timeout: 2000 })) {
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
    await p.waitForTimeout(3000);
    
    // Wait for restaurant cards to load
    const restaurantCards = p.locator('[data-testid="StoreCard"], [data-anchor-id="StoreCard"], article[role="article"]');
    await restaurantCards.first().waitFor({ timeout: 10000 }).catch(() => {});
    
    const restaurants: Restaurant[] = [];
    const cardCount = await restaurantCards.count();
    
    for (let i = 0; i < Math.min(cardCount, 20); i++) {
      const card = restaurantCards.nth(i);
      
      try {
        const name = await card.locator('span[data-telemetry-id="store.name"], h3, [data-testid="StoreName"]').first().textContent() || "";
        const cuisineText = await card.locator('[data-testid="StoreCuisines"], span:has-text("•")').first().textContent().catch(() => "") || "";
        const ratingText = await card.locator('[data-testid="StoreRating"], span:has-text("★")').first().textContent().catch(() => "0") || "0";
        const deliveryTimeText = await card.locator('[data-testid="DeliveryTime"], span:has-text("min")').first().textContent().catch(() => "") || "";
        const feeText = await card.locator('[data-testid="DeliveryFee"], span:has-text("$")').first().textContent().catch(() => "") || "";
        
        // Extract store ID from link
        const link = await card.locator('a[href*="/store/"]').first().getAttribute('href').catch(() => "");
        const storeIdMatch = link?.match(/\/store\/(\d+)/);
        
        if (name) {
          restaurants.push({
            id: storeIdMatch?.[1] || String(i),
            name: name.trim(),
            cuisine: cuisineText.split("•").map((c) => c.trim()).filter(Boolean),
            rating: parseFloat(ratingText.replace(/[^0-9.]/g, "")) || 0,
            deliveryTime: deliveryTimeText.trim(),
            deliveryFee: feeText.trim(),
          });
        }
      } catch {
        // Skip problematic cards
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
    await p.waitForTimeout(3000);
    
    // Get restaurant name
    const restaurantName = await p.locator('h1, [data-testid="StoreName"]').first().textContent() || "Unknown Restaurant";
    
    // Wait for menu to load
    await p.locator('[data-testid="MenuItem"], [data-anchor-id="MenuItem"], article').first().waitFor({ timeout: 10000 }).catch(() => {});
    
    const categories: MenuCategory[] = [];
    
    // Get menu sections
    const sections = p.locator('section[data-testid="MenuSection"], div[data-anchor-id="MenuCategory"], section:has(h2)');
    const sectionCount = await sections.count();
    
    for (let s = 0; s < sectionCount; s++) {
      const section = sections.nth(s);
      const categoryName = await section.locator('h2, h3').first().textContent().catch(() => "") || "Menu";
      
      const items: MenuItem[] = [];
      const menuItems = section.locator('[data-testid="MenuItem"], [data-anchor-id="MenuItem"], article');
      const itemCount = await menuItems.count();
      
      for (let i = 0; i < Math.min(itemCount, 30); i++) {
        const item = menuItems.nth(i);
        
        try {
          const itemName = await item.locator('span[data-testid="ItemName"], h3, [data-anchor-id="ItemName"]').first().textContent() || "";
          const description = await item.locator('[data-testid="ItemDescription"], p').first().textContent().catch(() => "") || "";
          const priceText = await item.locator('[data-testid="ItemPrice"], span:has-text("$")').first().textContent().catch(() => "$0") || "$0";
          const popular = await item.locator('span:has-text("Popular"), [data-testid="PopularBadge"]').isVisible().catch(() => false);
          
          // Extract item ID from data attribute or generate one
          const itemId = await item.getAttribute('data-item-id').catch(() => "") || `item-${s}-${i}`;
          
          if (itemName) {
            items.push({
              id: itemId,
              name: itemName.trim(),
              description: description.trim(),
              price: parseFloat(priceText.replace(/[^0-9.]/g, "")) || 0,
              popular,
            });
          }
        } catch {
          // Skip problematic items
        }
      }
      
      if (items.length > 0) {
        categories.push({
          name: categoryName.trim(),
          items,
        });
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
    
    // Find and click the menu item
    const menuItem = p.locator(`[data-testid="MenuItem"]:has-text("${itemName}"), article:has-text("${itemName}")`).first();
    await menuItem.waitFor({ timeout: 5000 });
    await menuItem.click();
    await p.waitForTimeout(2000);
    
    // Handle quantity if more than 1
    if (quantity > 1) {
      for (let i = 1; i < quantity; i++) {
        const increaseButton = p.locator('button[aria-label*="increase"], button:has-text("+"), [data-testid="QuantityIncrease"]').first();
        if (await increaseButton.isVisible({ timeout: 2000 })) {
          await increaseButton.click();
          await p.waitForTimeout(300);
        }
      }
    }
    
    // Add special instructions if provided
    if (specialInstructions) {
      const instructionsInput = p.locator('textarea[placeholder*="instruction"], input[placeholder*="instruction"], [data-testid="SpecialInstructions"]');
      if (await instructionsInput.isVisible({ timeout: 2000 })) {
        await instructionsInput.fill(specialInstructions);
      }
    }
    
    // Click add to cart button
    const addButton = p.locator('button:has-text("Add to Cart"), button:has-text("Add to Order"), button[data-testid="AddToCartButton"]').first();
    await addButton.waitFor({ timeout: 5000 });
    await addButton.click();
    await p.waitForTimeout(2000);
    
    // Get cart total
    const cartTotal = await p.locator('[data-testid="CartTotal"], span:has-text("$")').last().textContent().catch(() => "$0") || "$0";
    
    await saveCookies(ctx);
    
    return {
      success: true,
      cartTotal: parseFloat(cartTotal.replace(/[^0-9.]/g, "")) || 0,
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
    const cartButton = p.locator('[data-testid="CartButton"], button[aria-label*="cart"], button:has-text("Cart")').first();
    if (await cartButton.isVisible({ timeout: 3000 })) {
      await cartButton.click();
      await p.waitForTimeout(2000);
    }
    
    const items: CartItem[] = [];
    const cartItems = p.locator('[data-testid="CartItem"], [data-anchor-id="CartItem"]');
    const itemCount = await cartItems.count();
    
    for (let i = 0; i < itemCount; i++) {
      const item = cartItems.nth(i);
      const name = await item.locator('[data-testid="CartItemName"], span').first().textContent() || "";
      const quantityText = await item.locator('[data-testid="CartItemQuantity"], span:has-text("x")').textContent().catch(() => "1") || "1";
      const priceText = await item.locator('[data-testid="CartItemPrice"], span:has-text("$")').textContent().catch(() => "$0") || "$0";
      
      if (name) {
        items.push({
          name: name.trim(),
          quantity: parseInt(quantityText.replace(/[^0-9]/g, "")) || 1,
          price: parseFloat(priceText.replace(/[^0-9.]/g, "")) || 0,
        });
      }
    }
    
    // Get totals
    const subtotalText = await p.locator('[data-testid="Subtotal"], span:has-text("Subtotal")').textContent().catch(() => "") || "";
    const totalText = await p.locator('[data-testid="Total"], span:has-text("Total")').last().textContent().catch(() => "") || "";
    
    await saveCookies(ctx);
    
    return {
      success: true,
      items,
      subtotal: parseFloat(subtotalText.replace(/[^0-9.]/g, "")) || 0,
      total: parseFloat(totalText.replace(/[^0-9.]/g, "")) || 0,
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
    const checkoutButton = p.locator('button:has-text("Checkout"), a:has-text("Checkout"), [data-testid="CheckoutButton"]').first();
    if (await checkoutButton.isVisible({ timeout: 3000 })) {
      await checkoutButton.click();
      await p.waitForTimeout(3000);
    }
    
    // Get order summary
    const items: CartItem[] = [];
    const cartItems = p.locator('[data-testid="CartItem"], [data-testid="CheckoutItem"]');
    const itemCount = await cartItems.count();
    
    for (let i = 0; i < itemCount; i++) {
      const item = cartItems.nth(i);
      const name = await item.locator('span').first().textContent() || "";
      const quantityText = await item.locator('span:has-text("x")').textContent().catch(() => "1") || "1";
      const priceText = await item.locator('span:has-text("$")').first().textContent().catch(() => "$0") || "$0";
      
      if (name) {
        items.push({
          name: name.trim(),
          quantity: parseInt(quantityText.replace(/[^0-9]/g, "")) || 1,
          price: parseFloat(priceText.replace(/[^0-9.]/g, "")) || 0,
        });
      }
    }
    
    const totalText = await p.locator('[data-testid="Total"], span:has-text("Total")').last().textContent().catch(() => "") || "";
    const total = parseFloat(totalText.replace(/[^0-9.]/g, "")) || 0;
    
    const addressText = await p.locator('[data-testid="DeliveryAddress"], span:has-text("Deliver to")').textContent().catch(() => "") || "";
    const deliveryTimeText = await p.locator('[data-testid="DeliveryTime"], span:has-text("min")').textContent().catch(() => "") || "";
    
    // If not confirmed, return summary for user to confirm
    if (!confirm) {
      return {
        success: true,
        requiresConfirmation: true,
        summary: {
          items,
          total,
          deliveryAddress: addressText.trim(),
          estimatedDelivery: deliveryTimeText.trim(),
        },
      };
    }
    
    // If confirmed, place the order
    const placeOrderButton = p.locator('button:has-text("Place Order"), button[data-testid="PlaceOrderButton"]').first();
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
        deliveryAddress: addressText.trim(),
        estimatedDelivery: deliveryTimeText.trim(),
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
      const activeOrder = p.locator('[data-testid="ActiveOrder"], [data-testid="OrderCard"]').first();
      if (await activeOrder.isVisible({ timeout: 3000 })) {
        await activeOrder.click();
        await p.waitForTimeout(2000);
      }
    }
    
    // Get order details
    const statusText = await p.locator('[data-testid="OrderStatus"], h1, h2').first().textContent() || "Unknown";
    const restaurantName = await p.locator('[data-testid="RestaurantName"], span:has-text("from")').textContent().catch(() => "") || "";
    const deliveryTimeText = await p.locator('[data-testid="EstimatedDelivery"], span:has-text("min")').textContent().catch(() => "") || "";
    
    // Get dasher info if available
    let dasher;
    const dasherName = await p.locator('[data-testid="DasherName"]').textContent().catch(() => "");
    if (dasherName) {
      dasher = { name: dasherName.trim() };
    }
    
    // Get order items
    const items: CartItem[] = [];
    const orderItems = p.locator('[data-testid="OrderItem"]');
    const itemCount = await orderItems.count();
    
    for (let i = 0; i < itemCount; i++) {
      const item = orderItems.nth(i);
      const name = await item.locator('span').first().textContent() || "";
      const quantityText = await item.locator('span:has-text("x")').textContent().catch(() => "1") || "1";
      const priceText = await item.locator('span:has-text("$")').first().textContent().catch(() => "$0") || "$0";
      
      if (name) {
        items.push({
          name: name.trim(),
          quantity: parseInt(quantityText.replace(/[^0-9]/g, "")) || 1,
          price: parseFloat(priceText.replace(/[^0-9.]/g, "")) || 0,
        });
      }
    }
    
    const totalText = await p.locator('[data-testid="OrderTotal"], span:has-text("Total")').textContent().catch(() => "") || "";
    
    await saveCookies(ctx);
    
    return {
      success: true,
      status: {
        orderId: orderId || p.url().match(/orders\/(\w+)/)?.[1] || "unknown",
        status: statusText.trim(),
        estimatedDelivery: deliveryTimeText.trim(),
        restaurant: restaurantName.trim(),
        dasher,
        items,
        total: parseFloat(totalText.replace(/[^0-9.]/g, "")) || 0,
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

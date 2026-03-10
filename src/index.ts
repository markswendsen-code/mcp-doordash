#!/usr/bin/env node

/**
 * Strider Labs DoorDash MCP Server
 * 
 * MCP server that gives AI agents the ability to search restaurants,
 * browse menus, add items to cart, place orders, and track deliveries.
 * https://striderlabs.ai
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  checkAuth,
  searchRestaurants,
  getMenu,
  addToCart,
  getCart,
  placeOrder,
  trackOrder,
  setAddress,
  getLoginUrl,
  cleanup,
} from "./browser.js";
import { hasStoredCookies, clearCookies, getCookiesPath } from "./auth.js";

// Initialize server
const server = new Server(
  {
    name: "strider-doordash",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "doordash_auth_check",
        description:
          "Check if user is logged in to DoorDash. Returns login status and instructions if not authenticated. Call this before any other DoorDash operations.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "doordash_auth_clear",
        description:
          "Clear stored DoorDash session cookies. Use this to log out or reset authentication state.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "doordash_set_address",
        description:
          "Set the delivery address for DoorDash orders. Must be set before searching for restaurants.",
        inputSchema: {
          type: "object",
          properties: {
            address: {
              type: "string",
              description: "Full delivery address (e.g., '123 Main St, San Francisco, CA 94102')",
            },
          },
          required: ["address"],
        },
      },
      {
        name: "doordash_search",
        description:
          "Search for restaurants on DoorDash. Can search by restaurant name, food type, or cuisine.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (restaurant name, food type, or cuisine)",
            },
            cuisine: {
              type: "string",
              description: "Filter by cuisine type (e.g., 'pizza', 'chinese', 'mexican')",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "doordash_menu",
        description:
          "Get the full menu for a specific restaurant. Returns categories and items with prices.",
        inputSchema: {
          type: "object",
          properties: {
            restaurantId: {
              type: "string",
              description: "The restaurant ID (from search results)",
            },
          },
          required: ["restaurantId"],
        },
      },
      {
        name: "doordash_add_to_cart",
        description:
          "Add a menu item to the cart. Must be on a restaurant page first (use doordash_menu).",
        inputSchema: {
          type: "object",
          properties: {
            restaurantId: {
              type: "string",
              description: "The restaurant ID",
            },
            itemName: {
              type: "string",
              description: "Name of the menu item to add",
            },
            quantity: {
              type: "number",
              description: "Quantity to add (default: 1)",
            },
            specialInstructions: {
              type: "string",
              description: "Special instructions for the item (optional)",
            },
          },
          required: ["restaurantId", "itemName"],
        },
      },
      {
        name: "doordash_cart",
        description:
          "View current cart contents, including items, quantities, and totals.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "doordash_checkout",
        description:
          "Proceed to checkout and optionally place the order. Set confirm=false to preview order details, confirm=true to actually place the order.",
        inputSchema: {
          type: "object",
          properties: {
            confirm: {
              type: "boolean",
              description: "Set to true to actually place the order, false to just preview",
            },
          },
          required: ["confirm"],
        },
      },
      {
        name: "doordash_track_order",
        description:
          "Track the status of an order. Shows delivery progress, estimated time, and dasher info if available.",
        inputSchema: {
          type: "object",
          properties: {
            orderId: {
              type: "string",
              description: "Order ID to track (optional - defaults to most recent active order)",
            },
          },
        },
      },
    ],
  };
});

// Tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "doordash_auth_check": {
        const hasCookies = hasStoredCookies();
        
        if (!hasCookies) {
          const loginInfo = await getLoginUrl();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  isLoggedIn: false,
                  message: "Not logged in to DoorDash.",
                  loginUrl: loginInfo.url,
                  instructions: loginInfo.instructions,
                  cookiesPath: getCookiesPath(),
                }),
              },
            ],
          };
        }
        
        const authState = await checkAuth();
        
        if (!authState.isLoggedIn) {
          const loginInfo = await getLoginUrl();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  isLoggedIn: false,
                  message: "Session expired. Please log in again.",
                  loginUrl: loginInfo.url,
                  instructions: loginInfo.instructions,
                }),
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                isLoggedIn: true,
                message: "Logged in to DoorDash.",
                email: authState.email,
              }),
            },
          ],
        };
      }

      case "doordash_auth_clear": {
        clearCookies();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: "DoorDash session cleared. You will need to log in again.",
              }),
            },
          ],
        };
      }

      case "doordash_set_address": {
        const { address } = args as { address: string };
        const result = await setAddress(address);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          isError: !result.success,
        };
      }

      case "doordash_search": {
        const { query, cuisine } = args as { query: string; cuisine?: string };
        const result = await searchRestaurants(query, { cuisine });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          isError: !result.success,
        };
      }

      case "doordash_menu": {
        const { restaurantId } = args as { restaurantId: string };
        const result = await getMenu(restaurantId);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          isError: !result.success,
        };
      }

      case "doordash_add_to_cart": {
        const { restaurantId, itemName, quantity, specialInstructions } = args as {
          restaurantId: string;
          itemName: string;
          quantity?: number;
          specialInstructions?: string;
        };
        const result = await addToCart(restaurantId, itemName, quantity, specialInstructions);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          isError: !result.success,
        };
      }

      case "doordash_cart": {
        const result = await getCart();
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          isError: !result.success,
        };
      }

      case "doordash_checkout": {
        const { confirm } = args as { confirm: boolean };
        const result = await placeOrder(confirm);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          isError: !result.success,
        };
      }

      case "doordash_track_order": {
        const { orderId } = args as { orderId?: string };
        const result = await trackOrder(orderId);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          isError: !result.success,
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Unknown tool: ${name}`,
              }),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: errorMessage,
          }),
        },
      ],
      isError: true,
    };
  }
});

// Cleanup on exit
process.on("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Strider DoorDash MCP server running");
}

main().catch(console.error);

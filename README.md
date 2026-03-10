# @striderlabs/mcp-doordash

MCP server for DoorDash - let AI agents order food delivery.

Built by [Strider Labs](https://striderlabs.ai).

## Features

- 🔍 **Search restaurants** by name, cuisine, or food type
- 📜 **Browse menus** with full item details and prices
- 🛒 **Add to cart** with quantity and special instructions
- 💳 **Place orders** with confirmation step
- 📍 **Track orders** with real-time status updates
- 🔐 **Persistent sessions** - stay logged in across restarts

## Installation

```bash
npm install -g @striderlabs/mcp-doordash
```

Or with npx:

```bash
npx @striderlabs/mcp-doordash
```

## Configuration

Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "doordash": {
      "command": "npx",
      "args": ["-y", "@striderlabs/mcp-doordash"]
    }
  }
}
```

## Authentication

The connector uses browser automation with Playwright. On first use:

1. Run `doordash_auth_check` - it will return a login URL
2. Log in to DoorDash in a browser
3. Session cookies are automatically saved to `~/.config/striderlabs-mcp-doordash/cookies.json`
4. Sessions persist across restarts

To clear your session:

```
doordash_auth_clear
```

## Available Tools

### Authentication

| Tool | Description |
|------|-------------|
| `doordash_auth_check` | Check login status, get login URL if needed |
| `doordash_auth_clear` | Clear stored session (log out) |

### Ordering

| Tool | Description |
|------|-------------|
| `doordash_set_address` | Set delivery address |
| `doordash_search` | Search restaurants by query or cuisine |
| `doordash_menu` | Get full menu for a restaurant |
| `doordash_add_to_cart` | Add item to cart |
| `doordash_cart` | View current cart |
| `doordash_checkout` | Preview or place order |
| `doordash_track_order` | Track order status |

## Example Usage

### Search for restaurants

```json
{
  "tool": "doordash_search",
  "arguments": {
    "query": "pizza",
    "cuisine": "italian"
  }
}
```

### Get a menu

```json
{
  "tool": "doordash_menu",
  "arguments": {
    "restaurantId": "123456"
  }
}
```

### Add to cart

```json
{
  "tool": "doordash_add_to_cart",
  "arguments": {
    "restaurantId": "123456",
    "itemName": "Pepperoni Pizza",
    "quantity": 2,
    "specialInstructions": "Extra crispy"
  }
}
```

### Place order (with confirmation)

```json
// First, preview the order
{
  "tool": "doordash_checkout",
  "arguments": {
    "confirm": false
  }
}

// Then, place the order
{
  "tool": "doordash_checkout",
  "arguments": {
    "confirm": true
  }
}
```

## Requirements

- Node.js 18+
- Playwright browsers (auto-installed on first run)

## How It Works

This connector uses Playwright for browser automation:

1. **Headless Chrome** - runs a real browser in the background
2. **Cookie persistence** - maintains logged-in state
3. **Stealth mode** - uses realistic browser fingerprints
4. **Structured responses** - all data returned as JSON

## Security

- Session cookies stored locally in `~/.config/striderlabs-mcp-doordash/`
- No credentials stored - uses browser-based OAuth flow
- Cookies encrypted using your system keychain (where available)

## Limitations

- DoorDash must be available in your region
- Some menu customizations may not be fully supported
- Order placement requires a valid payment method on your DoorDash account

## Development

```bash
git clone https://github.com/striderlabs/mcp-doordash.git
cd mcp-doordash
npm install
npm run build
npm start
```

## License

MIT © [Strider Labs](https://striderlabs.ai)

## Related

- [@striderlabs/mcp-gmail](https://www.npmjs.com/package/@striderlabs/mcp-gmail) - Gmail MCP connector
- [Model Context Protocol](https://modelcontextprotocol.io) - Learn more about MCP

# @striderlabs/mcp-doordash

**Order food delivery via DoorDash using AI agents**

[![npm](https://img.shields.io/npm/v/@striderlabs/mcp-doordash)](https://www.npmjs.com/package/@striderlabs/mcp-doordash)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://mcpservers.org/servers/strider-labs-doordash)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

Part of [Strider Labs](https://github.com/striderlabsdev/striderlabs) — action execution for personal AI agents.

## Installation

```bash
npm install @striderlabs/mcp-doordash
```

Or with npx:

```bash
npx @striderlabs/mcp-doordash
```

## Quick Start

### Claude Desktop Configuration

Add to your `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

### Your Agent Can Now

```
"Order Thai food from nearby restaurants with delivery in under 30 minutes"
→ Agent searches → Browses menus → Places order → Confirms delivery
```

## Features

- 🔍 **Search restaurants** by name, cuisine, or food type
- 📜 **Browse menus** with full item details and prices
- 🛒 **Add to cart** with quantity and special instructions
- 💳 **Place orders** with confirmation step
- 📍 **Track orders** with real-time status updates
- 🔐 **Persistent sessions** - stay logged in across restarts
- 🔄 **Automatic MFA** - handles multi-factor authentication
- 📱 **Per-user credentials** - encrypted session storage

## Metrics

- **Weekly downloads:** 67 (Apr 1-7, 2026)
- **Status:** ✅ Live in production
- **Reliability:** 85%+ task completion rate
- **Discovery:** npm, Claude Plugins, mcpservers.org

## Available Elsewhere

- **npm:** [npmjs.com/@striderlabs/mcp-doordash](https://npmjs.com/package/@striderlabs/mcp-doordash)
- **Claude Plugins:** Search "Strider Labs" in Claude
- **mcpservers.org:** [Strider Labs DoorDash](https://mcpservers.org/servers/strider-labs-doordash)
- **Full Strider Labs:** [github.com/striderlabsdev/striderlabs](https://github.com/striderlabsdev/striderlabs)

## How It Works

### For Agents
Your agent can use these capabilities:
```javascript
// Search for restaurants
restaurants = search_restaurants({
  location: "San Francisco, CA",
  cuisine: "Thai",
  max_delivery_time: 30
})

// Browse a restaurant's menu
menu = get_restaurant_menu({
  restaurant_id: "thai-place-downtown",
  search: "Pad Thai"
})

// Place an order
order = place_order({
  restaurant_id: "thai-place-downtown",
  items: [
    { item_id: "pad_thai", quantity: 1 },
    { item_id: "spring_rolls", quantity: 2 }
  ],
  delivery_address: "123 Main St, San Francisco, CA",
  special_instructions: "Extra lime on the side"
})

// Track delivery
status = track_order({ order_id: order.order_id })
```

### Session Management
- Each user has encrypted, persistent credentials
- Automatic OAuth token refresh
- MFA handling (SMS/email)
- Sessions survive agent restarts

### Reliability
- 85%+ task completion rate
- Automated UI change detection (connectors update when DoorDash changes)
- Fallback paths for failures
- 24/7 monitoring + alerting

## Configuration

### Environment Variables

```bash
# Optional: Use a specific DoorDash account
DOORDASH_EMAIL=your-email@example.com
DOORDASH_PASSWORD=your-password  # Highly recommend using .env file
```

### Self-Hosted

```bash
# Clone the repo
git clone https://github.com/striderlabsdev/mcp-doordash
cd mcp-doordash

# Install dependencies
npm install

# Start the server
npm start

# Your agent can now connect to localhost:3000
```

## Architecture

### How We Connect
This connector uses browser automation (Playwright) to interact with DoorDash, because DoorDash doesn't have a public API. Here's why that's safe and reliable:

- **User-controlled:** Your agent only accesses your own DoorDash account
- **Session-based:** We store your login session securely, not your password
- **Change-aware:** We detect DoorDash UI changes and alert immediately
- **Fingerprinting:** We use realistic browser profiles to avoid bot detection
- **Rate-limited:** We respect DoorDash's infrastructure with appropriate delays

### Security
- Credentials stored encrypted in your local `.env` or secure vault
- Sessions isolated per user
- No data sent to third parties
- MIT Licensed — audit the code yourself

## Support

- 📖 [Full Strider Labs Docs](https://github.com/striderlabsdev/striderlabs)
- 🐛 [Report Issues](https://github.com/striderlabsdev/mcp-doordash/issues)
- 💬 [Discussions](https://github.com/striderlabsdev/mcp-doordash/discussions)
- 🌐 [Website](https://striderlabs.ai)
- 📧 [Email](mailto:hello@striderlabs.ai)

## Contributing

We welcome contributions! Areas of interest:
- Bug reports and fixes
- Feature requests (new restaurants, cuisines, etc.)
- Performance improvements
- Documentation enhancements

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## License

MIT — Free to use, modify, and distribute. See [LICENSE](./LICENSE) for details.

---

**Built by Strider Labs** — Making AI agents actually useful.

[GitHub](https://github.com/striderlabsdev) | [Website](https://striderlabs.ai) | [Discord](https://discord.gg/openclaw)

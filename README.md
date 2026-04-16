# kicklight.

A locally-hosted web app that syncs a Philips Hue gradient light strip with live football match statistics. The strip splits into two team colours — the proportion mirrors a chosen stat (possession, shots, corners, or goals) in real time. Built with Next.js, powered by football-data.org and the Philips Hue local API.

## Prerequisites

- Node.js 18+ (or Bun)
- A Philips Hue Bridge on your local network
- A gradient-capable Hue light strip (Hue Flux, Hue Ambiance Gradient, or Hue Play Gradient)
- A free API key from football-data.org

## Getting a football-data.org API key

1. Register at [football-data.org](https://www.football-data.org/client/register)
2. A free API key will be emailed to you immediately

## Setup

```bash
# Install dependencies
bun install

# Add your API key
echo "FOOTBALL_DATA_API_KEY=your_key_here" > .env.local

# Start the dev server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## First run

On first load, the in-app setup wizard will guide you through:

1. **Discover** your Hue Bridge on the local network
2. **Connect** by pressing the physical link button on the bridge
3. **Select** a gradient-capable light strip
4. **Configure** the polling interval (30–300 seconds, default 60s)

Your machine and Hue Bridge must be on the same network.

## Supported light strips

Only gradient-capable strips will appear in the setup wizard:

- Philips Hue Flux gradient strip
- Philips Hue Ambiance Gradient lightstrip
- Philips Hue Play Gradient light tube / bar

Single-colour lights are not supported.

## Polling interval

The app polls football-data.org at a configurable interval (default: 60 seconds). This can be adjusted during setup. The free API tier has rate limits — the app automatically slows down when approaching the limit.

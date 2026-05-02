# kicklight.

A locally-hosted web app that syncs a Philips Hue gradient light strip with live football match statistics. The strip splits into two team colours — the proportion mirrors a chosen stat (possession, shots, corners, or goals) in real time. Built with Next.js, powered by football-data.org and the Philips Hue local API.

## Prerequisites

- [Bun](https://bun.sh) runtime
- A Philips Hue Bridge on your local network
- A gradient-capable Hue light strip (Hue Flux, Hue Ambiance Gradient, or Hue Play Gradient)
- A free API key from [football-data.org](https://www.football-data.org/client/register)

## Getting a football-data.org API key

1. Register at [football-data.org](https://www.football-data.org/client/register)
2. A free API key will be emailed to you immediately

## Development

```bash
# Install dependencies
bun install

# Add your API key
cp .env.example .env.local
# Edit .env.local and replace the placeholder with your key

# Start the dev server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Self-hosting (recommended)

kicklight. is designed to run as a persistent server on any machine that shares a network with your Hue Bridge — a Mac, Raspberry Pi, or home server all work.

```bash
# Install dependencies
bun install

# Add your API key
cp .env.example .env.local
# Edit .env.local and replace the placeholder with your key

# Build and start the production server
bun run build
bun start
```

The app runs on port 3000. Open it from any device on the same network using your host machine's local IP:

```
http://<your-machine-ip>:3000
```

To find your machine's local IP: **System Settings → Wi-Fi → Details** (macOS), or run `ipconfig getifaddr en0` in a terminal.

### Keeping it running

To run kicklight. in the background and have it restart automatically, use [pm2](https://pm2.keymetrics.io):

```bash
bun add -g pm2
pm2 start bun --name kicklight -- start
pm2 save
pm2 startup  # follow the printed instruction to auto-start on boot
```

### Remote access

To access kicklight. from outside your home network, install [Tailscale](https://tailscale.com) on the host machine. Once connected, use the Tailscale IP instead of the local one — no port forwarding or firewall changes needed.

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

The app polls football-data.org at a configurable interval (default: 60 seconds). The free API tier has rate limits — the app automatically slows down when approaching the limit.

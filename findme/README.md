# FindMe

Self-hosted location sharing service. Track your devices on a private map with no third-party dependencies.

## Features

- Real-time device tracking on a dark-themed Leaflet map
- Multi-device support (iOS, Android, web)
- Location history with path visualization
- Shareable links (no login required for viewers)
- JWT-based mobile API + NextAuth session-based web dashboard
- Admin panel for user/device management
- Data retention controls
- Docker-ready deployment

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.local.example .env.local
# Edit .env.local with your secrets

# Run database migration
npx prisma migrate dev

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and register your first account (automatically becomes admin).

### Docker

```bash
# Build and run
docker compose up -d

# Or with custom secrets
NEXTAUTH_SECRET=my-secret JWT_SECRET=my-jwt-secret docker compose up -d
```

## Project Structure

```
/app
  /api              REST API routes
  /auth             Login/register page
  /dashboard        Protected web dashboard
  /share/[token]    Public share view
/components         React components
/lib                Database, auth, utilities
/prisma             Schema and migrations
/types              Shared TypeScript types
```

## API

All endpoints return a consistent envelope:

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": {}
}
```

### Authentication

- `POST /api/auth/register` — Create account (first user = admin)
- `POST /api/auth/login` — Get JWT tokens
- `POST /api/auth/refresh` — Refresh JWT
- `GET /api/auth/me` — Current user info

### Devices

- `POST /api/devices/register` — Register a device
- `GET /api/devices` — List your devices
- `PATCH /api/devices/:id` — Rename device
- `DELETE /api/devices/:id` — Deactivate device

### Location

- `POST /api/location/update` — Send location (device token auth)
- `GET /api/location/latest` — Latest location per device
- `GET /api/location/:deviceId/history` — Location history

### Sharing

- `POST /api/share` — Create share link
- `GET /api/share/:token` — View shared location (public)
- `DELETE /api/share?id=:id` — Revoke share

### Admin

- `GET /api/admin/users` — List all users
- `GET /api/admin/devices` — List all devices

## Mobile Integration

See [MOBILE_INTEGRATION.md](./MOBILE_INTEGRATION.md) for the complete guide on integrating a React Native app.

Key files:
- `types/api.ts` — All TypeScript interfaces (import in your mobile app)
- `lib/mobileClient.ts` — Ready-to-use API client

## Tech Stack

- Next.js 15 (App Router) + TypeScript
- Prisma ORM + SQLite (dev) / PostgreSQL (prod)
- NextAuth.js v5
- Leaflet.js + react-leaflet
- Tailwind CSS
- Zod validation

## License

MIT

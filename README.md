<p align="center">
  <img src="findme/public/logo.svg" width="128" height="128" alt="FindMe Logo"/>
</p>

<h1 align="center">FindMe</h1>

<p align="center">
  <strong>Self-hosted, privacy-first location sharing for families and teams.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#mobile-app">Mobile App</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#api">API</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

---

## Features

- **Real-time location tracking** &mdash; See devices and people on a live map with auto-updating positions via Server-Sent Events (SSE)
- **Privacy-first** &mdash; Self-hosted, your data stays on your server. No third-party tracking or analytics
- **Multi-device support** &mdash; Track multiple devices per user with primary device designation
- **People sharing** &mdash; Invite-based mutual location sharing between users
- **Temporary share links** &mdash; Generate time-limited location share links (1h, 24h, 7d, or never expiring) for anyone
- **Geofencing** &mdash; Create geofences with enter/exit alerts via push and email notifications
- **Location history** &mdash; View historical tracks with trip statistics (distance, speed, elevation)
- **Export** &mdash; Export location history as GPX or CSV files
- **Dark mode** &mdash; Full light/dark/system theme support on web and mobile
- **Multiple map styles** &mdash; OpenStreetMap, satellite, dark, and topographic tile layers
- **Push notifications** &mdash; Geofence alerts via Expo push notifications on mobile
- **Email notifications** &mdash; Optional SMTP integration for invitation and alert emails
- **Passkey authentication** &mdash; Passwordless login with WebAuthn/FIDO2 passkeys
- **QR code pairing** &mdash; Pair mobile devices by scanning a QR code from the web dashboard
- **Admin panel** &mdash; User management, password reset, role management, device overview
- **Brute force protection** &mdash; Rate limiting on login and registration endpoints
- **Multi-language** &mdash; English, German, Spanish, French, Japanese (extensible)
- **Structured logging** &mdash; Docker-friendly structured logs with rotation, readable in Portainer
- **Docker ready** &mdash; Single-command deployment with Docker Compose
- **Automated releases** &mdash; GitHub Actions workflow builds and attaches signed APKs to releases

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Web Server | Next.js 16, React 19, TypeScript |
| Database | SQLite (default) or PostgreSQL |
| ORM | Prisma |
| Auth | NextAuth.js v5 + JWT (mobile) + WebAuthn passkeys |
| Mobile App | React Native (Expo) |
| Styling | Tailwind CSS v4 |
| Maps | Leaflet |
| Real-time | Server-Sent Events (SSE) |
| Push | Expo Push Notifications |

## Quick Start

### Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-username/findme.git
cd findme/findme

# Copy and edit environment variables
cp .env.example .env.local
# Edit .env.local with your values (at minimum, change the secrets)

# Start with Docker Compose
docker compose up -d
```

The web dashboard will be available at `http://localhost:3000`.

The first user to register automatically becomes the admin.

### Manual Setup

```bash
cd findme

# Install dependencies
npm install

# Set up the database
npx prisma generate
npx prisma db push

# Copy environment variables
cp .env.example .env.local

# Start development server
npm run dev
```

## Mobile App

The FindMe mobile app is built with React Native (Expo) and supports Android. iOS is planned.

### Install

Download the latest APK from [GitHub Releases](../../releases) and install it on your Android device.

### Building the APK Locally

```bash
cd findme-app
npm install
npx expo export --platform android
cd android
./gradlew assembleRelease
```

The APK will be at `android/app/build/outputs/apk/release/app-release.apk`.

### Connecting to Your Server

1. Open the app and enter your server URL (e.g. `http://192.168.1.100:3000`)
2. Register a new account or log in

**QR Code pairing:** Open the web dashboard, go to Settings, click Generate Pairing Code, and scan it from the app's login screen.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite file path or PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Yes | Random secret for session encryption |
| `NEXTAUTH_URL` | Yes | Public URL of your FindMe instance |
| `JWT_SECRET` | Yes | Random secret for JWT token signing |
| `FINDME_PUBLIC_URL` | Yes | Public URL used in QR codes for mobile pairing |
| `SMTP_HOST` | No | SMTP server for email notifications |
| `SMTP_PORT` | No | SMTP port (default: 587) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_FROM` | No | Email sender address |
| `SMTP_SECURE` | No | Use TLS for SMTP (default: `false`) |
| `LOG_LEVEL` | No | Log verbosity: `debug`, `info`, `warn`, `error` (default: `info`) |

See `.env.example` for a complete reference.

### PostgreSQL (Production)

For production deployments, PostgreSQL is recommended:

1. Update `docker-compose.yml` to uncomment the PostgreSQL service
2. Set `DATABASE_URL=postgresql://findme:findme@postgres:5432/findme`
3. Run migrations: `npx prisma db push`

## API

FindMe exposes a RESTful API for all operations. Mobile clients use JWT Bearer tokens for authentication.

### Authentication

- `POST /api/auth/register` &mdash; Create account
- `POST /api/auth/login` &mdash; Login (returns JWT tokens)
- `POST /api/auth/refresh` &mdash; Refresh access token
- `POST /api/auth/qr-session` &mdash; Create QR pairing session
- `GET /api/auth/qr-session` &mdash; Poll QR session status
- `POST /api/auth/passkey/login-options` &mdash; Passkey login challenge
- `POST /api/auth/passkey/login-verify` &mdash; Passkey login verification
- `POST /api/auth/passkey/register-options` &mdash; Passkey registration challenge
- `POST /api/auth/passkey/register-verify` &mdash; Passkey registration

### Location

- `POST /api/location/update` &mdash; Submit location update (device token auth)
- `GET /api/location/latest` &mdash; Get latest locations for all devices
- `GET /api/location/{deviceId}/history` &mdash; Get location history
- `GET /api/location/{deviceId}/export?format=gpx|csv` &mdash; Export history

### People

- `GET /api/people` &mdash; List connected people
- `POST /api/people/invite` &mdash; Send sharing invitation
- `POST /api/people/respond` &mdash; Accept/decline invitation

### Geofences

- `GET /api/geofences` &mdash; List geofences
- `POST /api/geofences` &mdash; Create geofence
- `PATCH /api/geofences` &mdash; Update geofence
- `DELETE /api/geofences` &mdash; Delete geofence

### Share Links

- `POST /api/share` &mdash; Generate temporary share link
- `GET /api/share` &mdash; List active shares
- `GET /api/share/{token}` &mdash; Access shared location (public)
- `DELETE /api/share` &mdash; Revoke share link

### Real-time

- `GET /api/sse` &mdash; Server-Sent Events stream for live updates

### Admin

- `GET /api/admin/users` &mdash; List all users
- `DELETE /api/admin/users` &mdash; Delete user
- `PATCH /api/admin/users` &mdash; Reset password / toggle role

## Releasing

A GitHub Actions workflow automatically builds a signed APK and attaches it to the release.

### One-time setup

1. Generate a release keystore:
   ```bash
   keytool -genkeypair -v -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 \
     -storepass YOUR_PASSWORD -keypass YOUR_PASSWORD -alias findme \
     -keystore findme-release.jks \
     -dname "CN=FindMe, OU=FindMe, O=FindMe, L=Unknown, ST=Unknown, C=US"
   ```
2. Add repository secrets in GitHub &rarr; Settings &rarr; Secrets &rarr; Actions:
   - `RELEASE_KEYSTORE_BASE64` &mdash; `base64 -i findme-release.jks | pbcopy`
   - `RELEASE_KEYSTORE_PASSWORD`
   - `RELEASE_KEY_ALIAS` &mdash; `findme`
   - `RELEASE_KEY_PASSWORD`

### Creating a release

1. Go to GitHub &rarr; Releases &rarr; **Draft a new release**
2. Create a tag (e.g. `v1.0.0`) and write your release notes
3. Click **Publish release**

The workflow builds and attaches `FindMe-v1.0.0.apk` to the release automatically. Version code is calculated from the tag.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Project Structure

```
FindMe/
├── findme/                      # Next.js web application & API server
│   ├── app/
│   │   ├── api/                 # REST API routes
│   │   └── dashboard/           # Web dashboard pages
│   ├── lib/                     # Shared utilities (logger, email, push, i18n)
│   ├── prisma/                  # Database schema & migrations
│   ├── Dockerfile
│   └── docker-compose.yml
├── findme-app/                  # React Native mobile app (Expo)
│   ├── app/                     # Screens (Expo Router file-based routing)
│   │   ├── (auth)/              # Login, register, QR scan
│   │   └── (tabs)/              # Map, people, settings
│   ├── lib/                     # Mobile utilities (theme, storage, map tiles)
│   └── android/                 # Android native project
└── .github/workflows/           # CI/CD (APK release build)
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

# FindMe Mobile Integration Guide

This guide explains how to integrate a React Native mobile app with the FindMe server.

## Prerequisites

- FindMe server running and accessible
- React Native / Expo project
- Required packages:
  - `expo-location` — GPS location tracking
  - `expo-task-manager` — Background task registration
  - `expo-background-fetch` — Periodic background updates
  - `expo-secure-store` — Secure token storage

## Auth Flow

### 1. Register or Login

```typescript
import { FindMeClient } from './lib/mobileClient';

const client = new FindMeClient('https://findme.example.com');

// Register (first user becomes ADMIN)
const { data } = await client.register({
  email: 'user@example.com',
  password: 'securepassword',
  name: 'John',
});

// Or login
const { data } = await client.login({
  email: 'user@example.com',
  password: 'securepassword',
});

// Store tokens securely
await SecureStore.setItemAsync('accessToken', data.accessToken);
await SecureStore.setItemAsync('refreshToken', data.refreshToken);
```

### 2. On App Launch — Restore Tokens

```typescript
const accessToken = await SecureStore.getItemAsync('accessToken');
const refreshToken = await SecureStore.getItemAsync('refreshToken');

if (accessToken && refreshToken) {
  client.setTokens(accessToken, refreshToken);
}
```

### 3. Token Refresh

The client automatically refreshes on 401 responses. Store updated tokens:

```typescript
// After any API call, check if tokens were refreshed
// and persist the new ones
```

## Device Registration

### Register This Device

```typescript
const { data } = await client.registerDevice({
  name: 'My iPhone',
  platform: 'ios', // or 'android'
});

// Save the device token — this is used for location updates
await SecureStore.setItemAsync('deviceToken', data.token);

// Set it on the client
client.setDeviceToken(data.token);
```

The device token (`fmd_...`) is separate from the user JWT. It authenticates
location update requests specifically from this device.

## Sending Location Updates

### Foreground Updates

```typescript
import * as Location from 'expo-location';

const { status } = await Location.requestForegroundPermissionsAsync();
if (status !== 'granted') return;

const location = await Location.getCurrentPositionAsync({});

await client.sendLocationUpdate({
  lat: location.coords.latitude,
  lng: location.coords.longitude,
  accuracy: location.coords.accuracy ?? undefined,
  altitude: location.coords.altitude ?? undefined,
  speed: location.coords.speed ?? undefined,
  heading: location.coords.heading ?? undefined,
  batteryLevel: 85, // Get from expo-battery
});
```

### Background Updates (Recommended)

```typescript
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';

const LOCATION_TASK = 'background-location-task';

// Define the background task
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const deviceToken = await SecureStore.getItemAsync('deviceToken');

  if (!deviceToken || !locations.length) return;

  const loc = locations[locations.length - 1];

  await fetch('https://findme.example.com/api/location/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${deviceToken}`,
    },
    body: JSON.stringify({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      altitude: loc.coords.altitude,
      speed: loc.coords.speed,
      heading: loc.coords.heading,
    }),
  });
});

// Start background tracking
async function startBackgroundTracking() {
  const { status } = await Location.requestBackgroundPermissionsAsync();
  if (status !== 'granted') return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 5 * 60 * 1000,      // Every 5 minutes
    distanceInterval: 100,              // Or every 100 meters
    deferredUpdatesInterval: 5 * 60 * 1000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'FindMe',
      notificationBody: 'Tracking location in background',
    },
  });
}
```

## API Reference

### Authentication

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/register` | POST | None | Create account |
| `/api/auth/login` | POST | None | Get JWT tokens |
| `/api/auth/refresh` | POST | None | Refresh JWT |
| `/api/auth/me` | GET | JWT | Get current user |

### Devices

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/devices/register` | POST | JWT | Register device |
| `/api/devices` | GET | JWT | List devices |
| `/api/devices/:id` | PATCH | JWT | Update device |
| `/api/devices/:id` | DELETE | JWT | Deactivate device |

### Location

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/location/update` | POST | Device Token | Send location |
| `/api/location/latest` | GET | JWT | Latest locations |
| `/api/location/:deviceId/history` | GET | JWT | History |

### Sharing

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/share` | POST | JWT | Create share |
| `/api/share` | GET | JWT | List shares |
| `/api/share/:token` | GET | None | View shared location |
| `/api/share?id=:id` | DELETE | JWT | Revoke share |

## Response Format

All responses follow this envelope:

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": { ... }
}
```

## Rate Limits

- Location updates: 60 per minute per device
- Other endpoints: No rate limit in v1

## Recommendations

- **Update frequency**: Every 5 minutes in background, real-time in foreground
- **Significant location changes**: Also send on >100m movement
- **Battery**: Include battery level in updates when available
- **Offline queue**: Queue failed updates and retry when connectivity returns
- **Token storage**: Always use SecureStore, never AsyncStorage for tokens

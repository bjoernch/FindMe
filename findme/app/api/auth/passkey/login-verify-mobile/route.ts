import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getChallenge } from "@/lib/passkey-challenges";
import { signJwt, signRefreshToken } from "@/lib/jwt";
import type { UserPublic } from "@/types/api";

function getRpId(req: NextRequest): string {
  const host = req.headers.get("host") || "localhost";
  return host.split(":")[0];
}

function getExpectedOrigins(req: NextRequest): string[] {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "localhost:3000";
  const origins: string[] = [`${proto}://${host}`];

  // Android passkey origin: android:apk-key-hash:<base64url-sha256>
  const androidKeyHash = process.env.ANDROID_APK_KEY_HASH;
  if (androidKeyHash) {
    origins.push(`android:apk-key-hash:${androidKeyHash}`);
  }

  return origins;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { credential, sessionKey } = body as {
      credential: AuthenticationResponseJSON;
      sessionKey: string;
    };

    if (!credential || !sessionKey) {
      return apiError("Missing credential or sessionKey", 400);
    }

    const rpID = getRpId(req);
    const expectedOrigins = getExpectedOrigins(req);

    // Retrieve stored challenge
    const expectedChallenge = getChallenge(`login_${sessionKey}`);
    if (!expectedChallenge) {
      return apiError("Challenge expired or not found. Please try again.", 400);
    }

    // Find the passkey by credential ID
    const passkey = await prisma.passkey.findUnique({
      where: { credentialId: credential.id },
      include: { user: true },
    });

    if (!passkey) {
      return apiError("Passkey not recognized", 401);
    }

    // Reconstruct the WebAuthnCredential for verification
    const webAuthnCredential = {
      id: passkey.credentialId,
      publicKey: isoBase64URL.toBuffer(passkey.publicKey),
      counter: passkey.counter,
      transports: passkey.transports
        ? (JSON.parse(passkey.transports) as (
            | "ble"
            | "cable"
            | "hybrid"
            | "internal"
            | "nfc"
            | "smart-card"
            | "usb"
          )[])
        : undefined,
    };

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: expectedOrigins,
      expectedRPID: [rpID],
      credential: webAuthnCredential,
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return apiError("Passkey authentication failed", 401);
    }

    // Update the counter
    await prisma.passkey.update({
      where: { id: passkey.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        deviceType: verification.authenticationInfo.credentialDeviceType,
        backedUp: verification.authenticationInfo.credentialBackedUp,
      },
    });

    const user = passkey.user;
    const jwtPayload = { userId: user.id, email: user.email, role: user.role };

    // Return full AuthTokens for mobile (not short-lived passkeyLoginToken)
    const accessToken = signJwt(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    const userPublic: UserPublic = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role as UserPublic["role"],
      createdAt: user.createdAt.toISOString(),
    };

    log.info("auth.passkey.login-verify-mobile", `Passkey login (mobile): ${user.email}`);

    return apiSuccess({
      accessToken,
      refreshToken,
      user: userPublic,
    });
  } catch (error) {
    log.error("auth.passkey.login-verify-mobile", "Passkey mobile login failed", error);
    return apiError("Internal server error", 500);
  }
}

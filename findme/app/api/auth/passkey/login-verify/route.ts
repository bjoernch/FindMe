import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getChallenge } from "@/lib/passkey-challenges";
import { signJwt } from "@/lib/jwt";
import { rateLimit } from "@/lib/rate-limit";
import type { UserPublic } from "@/types/api";

function getRpId(req: NextRequest): string {
  const host = req.headers.get("host") || "localhost";
  return host.split(":")[0];
}

function getOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "localhost:3001";
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = rateLimit(`passkey-login-verify:${ip}`, 10, 60_000);
    if (!allowed) return apiError("Too many requests", 429);

    const body = await req.json();
    const { credential, sessionKey } = body as {
      credential: AuthenticationResponseJSON;
      sessionKey: string;
    };

    if (!credential || !sessionKey) {
      return apiError("Missing credential or sessionKey", 400);
    }

    const rpID = getRpId(req);
    const origin = getOrigin(req);

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
      expectedOrigin: origin,
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

    // Generate a short-lived passkey login token for NextAuth sign-in
    const passkeyLoginToken = signJwt(
      { userId: user.id, email: user.email, role: user.role },
      60 // 60 seconds validity
    );

    const userPublic: UserPublic = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role as UserPublic["role"],
      createdAt: user.createdAt.toISOString(),
    };

    return apiSuccess({
      user: userPublic,
      passkeyLoginToken,
    });
  } catch (error) {
    log.error("auth.passkey.login-verify", "Passkey login-verify failed", error);
    return apiError("Internal server error", 500);
  }
}

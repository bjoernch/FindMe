import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import { getChallenge } from "@/lib/passkey-challenges";

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
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;
    const user = authResult;

    const body = await req.json();
    const { credential, name: passkeyName } = body as {
      credential: RegistrationResponseJSON;
      name?: string;
    };

    if (!credential) {
      return apiError("Missing credential data", 400);
    }

    const rpID = getRpId(req);
    const origin = getOrigin(req);

    // Retrieve stored challenge
    const expectedChallenge = getChallenge(`reg_${user.id}`);
    if (!expectedChallenge) {
      return apiError("Challenge expired or not found. Please try again.", 400);
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return apiError("Passkey verification failed", 400);
    }

    const { credential: cred, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    // Store the public key as base64url
    const publicKeyBase64 = isoBase64URL.fromBuffer(cred.publicKey);

    // Save passkey to database
    const passkey = await prisma.passkey.create({
      data: {
        userId: user.id,
        credentialId: cred.id,
        publicKey: publicKeyBase64,
        counter: cred.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: cred.transports ? JSON.stringify(cred.transports) : null,
        name: passkeyName || "Passkey",
      },
    });

    return apiSuccess({
      id: passkey.id,
      name: passkey.name,
      createdAt: passkey.createdAt.toISOString(),
    });
  } catch (error) {
    log.error("auth.passkey.register-verify", "Passkey register-verify failed", error);
    return apiError("Internal server error", 500);
  }
}

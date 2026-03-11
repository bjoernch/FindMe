import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";
import { storeChallenge } from "@/lib/passkey-challenges";

function getRpId(req: NextRequest): string {
  const host = req.headers.get("host") || "localhost";
  return host.split(":")[0];
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;
    const user = authResult;

    const rpID = getRpId(req);

    // Get existing passkeys for exclude list
    const existingPasskeys = await prisma.passkey.findMany({
      where: { userId: user.id },
      select: { credentialId: true, transports: true },
    });

    const excludeCredentials = existingPasskeys.map((pk) => ({
      id: pk.credentialId,
      transports: pk.transports
        ? (JSON.parse(pk.transports) as (
            | "ble"
            | "cable"
            | "hybrid"
            | "internal"
            | "nfc"
            | "smart-card"
            | "usb"
          )[])
        : undefined,
    }));

    const options = await generateRegistrationOptions({
      rpName: "FindMe",
      rpID,
      userName: user.email,
      userDisplayName: user.email,
      attestationType: "none",
      excludeCredentials,
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "preferred",
      },
    });

    // Store challenge for verification
    storeChallenge(`reg_${user.id}`, options.challenge);

    return apiSuccess(options);
  } catch (error) {
    log.error("auth.passkey.register-options", "Passkey register-options failed", error);
    return apiError("Internal server error", 500);
  }
}

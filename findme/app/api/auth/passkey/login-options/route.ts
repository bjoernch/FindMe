import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { apiSuccess, apiError } from "@/lib/api-response";
import { storeChallenge } from "@/lib/passkey-challenges";
import { v4 as uuidv4 } from "uuid";

function getRpId(req: NextRequest): string {
  const host = req.headers.get("host") || "localhost";
  return host.split(":")[0];
}

export async function POST(req: NextRequest) {
  try {
    const rpID = getRpId(req);

    // Generate a random session key since user is not authenticated yet
    const sessionKey = uuidv4();

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      // No allowCredentials - let the browser show all available passkeys (usernameless flow)
    });

    // Store challenge keyed by session
    storeChallenge(`login_${sessionKey}`, options.challenge);

    return apiSuccess({ options, sessionKey });
  } catch (error) {
    log.error("auth.passkey.login-options", "Passkey login-options failed", error);
    return apiError("Internal server error", 500);
  }
}

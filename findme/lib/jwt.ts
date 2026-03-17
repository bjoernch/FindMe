import jwt, { type SignOptions } from "jsonwebtoken";

const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required. Set it or let docker-entrypoint.sh auto-generate one.");
  }
  return secret;
})();

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export function signJwt(payload: JwtPayload, expiresInSeconds = 7 * 24 * 60 * 60): string {
  const options: SignOptions = { expiresIn: expiresInSeconds };
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function signRefreshToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: 30 * 24 * 60 * 60 };
  return jwt.sign(payload, JWT_SECRET, options);
}

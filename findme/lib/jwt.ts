import jwt, { type SignOptions } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret";

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

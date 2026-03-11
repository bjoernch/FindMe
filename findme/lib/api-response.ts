import { NextResponse } from "next/server";

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta?: Record<string, unknown>;
}

export function apiSuccess<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  const body: ApiEnvelope<T> = { success: true, data, error: null };
  if (meta) body.meta = meta;
  return NextResponse.json(body, { status });
}

export function apiError(error: string, status = 400) {
  const body: ApiEnvelope<null> = { success: false, data: null, error };
  return NextResponse.json(body, { status });
}

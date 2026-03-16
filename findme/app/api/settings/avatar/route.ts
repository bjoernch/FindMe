import { NextRequest } from "next/server";
import { log } from "@/lib/logger";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { authenticateRequest } from "@/lib/auth-guard";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB upload limit
const OUTPUT_SIZE = 256; // px

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const contentType = req.headers.get("content-type") || "";

    let imageBuffer: Buffer;

    if (contentType.includes("application/json")) {
      // Base64 upload from mobile app
      const body = await req.json();
      if (!body.image) return apiError("No image provided", 400);

      // Strip data URL prefix if present
      const base64Data = body.image.replace(/^data:image\/\w+;base64,/, "");
      imageBuffer = Buffer.from(base64Data, "base64");
    } else {
      // Raw binary upload
      const arrayBuffer = await req.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    }

    if (imageBuffer.length > MAX_SIZE) {
      return apiError("Image too large (max 5MB)", 400);
    }

    if (imageBuffer.length === 0) {
      return apiError("Empty image", 400);
    }

    // Process with sharp: resize to 256x256, crop to square, compress as JPEG
    const processed = await sharp(imageBuffer)
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
        fit: "cover",
        position: "center",
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    const dataUrl = `data:image/jpeg;base64,${processed.toString("base64")}`;

    await prisma.user.update({
      where: { id: authResult.id },
      data: { avatar: dataUrl },
    });

    return apiSuccess({ avatar: dataUrl });
  } catch (error) {
    log.error("settings.avatar", "Avatar upload failed", error);
    return apiError("Failed to process image", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    await prisma.user.update({
      where: { id: authResult.id },
      data: { avatar: null },
    });

    return apiSuccess({ avatar: null });
  } catch (error) {
    log.error("settings.avatar", "Avatar delete failed", error);
    return apiError("Failed to delete avatar", 500);
  }
}

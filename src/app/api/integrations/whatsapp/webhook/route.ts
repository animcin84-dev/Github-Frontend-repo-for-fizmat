import { NextResponse } from "next/server";
import { SupportError } from "@/server/errors";
import { apiError } from "@/server/http";
import { requireWhatsAppIngestionConfig } from "@/server/integrations/whatsapp/config";
import { parseWhatsAppWebhook, verifyWhatsAppChallenge, verifyWhatsAppSignature } from "@/server/integrations/whatsapp/webhook";
import { ingestWhatsAppWebhook } from "@/server/services/whatsapp-service";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 1_048_576;

async function readBoundedBody(request: Request) {
  const tooLarge = () => new SupportError("validation_failed", "WhatsApp webhook payload exceeds 1 MiB", { status: 413 });
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks);
  } finally {
    reader.releaseLock();
  }
}

export async function GET(request: Request) {
  try {
    return new Response(verifyWhatsAppChallenge(new URL(request.url)), {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const configured = requireWhatsAppIngestionConfig();
    const rawBody = await readBoundedBody(request);
    verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"), configured.appSecret);
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new SupportError("validation_failed", "Invalid WhatsApp webhook JSON", { status: 400 });
    }
    return NextResponse.json(await ingestWhatsAppWebhook(parseWhatsAppWebhook(payload), configured));
  } catch (error) {
    return apiError(error);
  }
}

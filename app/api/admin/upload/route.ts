import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAdminRole } from "@/lib/adminAuth";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const auth = await requireAdminRole(["owner", "operator"]);
  if ("response" in auth) return auth.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Неподдерживаемый формат файла" }, { status: 400 });
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "Файл слишком большой" }, { status: 400 });
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const fileName = `${Date.now()}-${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`uploads/${fileName}`, buffer, {
        access: "public",
        contentType: file.type,
      });
      return NextResponse.json({ ok: true, url: blob.url });
    }

    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Blob-хранилище не настроено" }, { status: 500 });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, fileName), buffer);

    return NextResponse.json({ ok: true, url: `/uploads/${fileName}` });
  } catch (error: unknown) {
    console.error("Admin upload failed:", error);
    let message =
      error instanceof Error && error.message.trim() ? error.message : "Не удалось загрузить файл";

    if (
      error instanceof Error &&
      error.message.includes("Cannot use public access on a private store")
    ) {
      message =
        "Vercel Blob store настроен как private. Для фото меню нужен public store.";
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

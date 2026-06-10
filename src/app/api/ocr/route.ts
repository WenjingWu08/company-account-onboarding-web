import path from "node:path";

import { NextResponse } from "next/server";
import { PSM } from "tesseract.js";

export const runtime = "nodejs";

type OcrWorkerHandle = {
  recognize: (
    image: Buffer,
  ) => Promise<{
    data: {
      text: string;
    };
  }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
};

const ocrWorkers = new Map<string, Promise<OcrWorkerHandle>>();
const supportedLanguages = new Set(["eng", "chi_sim"]);

const getLanguages = (raw: string | null) => {
  if (!raw) {
    return ["eng", "chi_sim"];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return ["eng", "chi_sim"];
    }

    const languages = parsed
      .filter((value): value is string => typeof value === "string")
      .filter((value) => supportedLanguages.has(value));

    return languages.length > 0 ? languages : ["eng", "chi_sim"];
  } catch {
    return ["eng", "chi_sim"];
  }
};

const getWorker = async (languages: string[]) => {
  const key = languages.join("+");
  const existing = ocrWorkers.get(key);
  if (existing) {
    return existing;
  }

  const workerPromise = (async () => {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(languages, 1, {
      cachePath: path.join(process.cwd(), ".tesseract-cache-api"),
      langPath: path.join(process.cwd(), "public", "tesseract-lang"),
      logger: () => undefined,
    });

    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      user_defined_dpi: "300",
    });

    return worker;
  })().catch((error) => {
    ocrWorkers.delete(key);
    throw error;
  });

  ocrWorkers.set(key, workerPromise);
  return workerPromise;
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "OCR file is required." },
        { status: 400 },
      );
    }

    const languages = getLanguages(String(formData.get("languages") ?? ""));
    const bytes = Buffer.from(await file.arrayBuffer());
    const worker = await getWorker(languages);
    const result = await worker.recognize(bytes);

    return NextResponse.json({
      text: result.data.text ?? "",
      languages,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "OCR request failed.",
      },
      { status: 500 },
    );
  }
}

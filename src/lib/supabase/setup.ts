import { Client } from "pg";

import {
  DOCUMENTS_BUCKET,
  PDFS_BUCKET,
  SUBMISSIONS_TABLE,
} from "@/lib/account-opening-constants";
import { assertSupabaseServerEnv } from "@/lib/supabase/env";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

let infrastructureReady = false;
let pendingInitialization: Promise<void> | null = null;

const normalizeConnectionString = (value: string) =>
  value.includes("sslmode=")
    ? value.replace(/sslmode=[^&]*/g, "sslmode=no-verify")
    : `${value}${value.includes("?") ? "&" : "?"}sslmode=no-verify`;

const ensureSubmissionTable = async () => {
  const { postgresUrl } = assertSupabaseServerEnv();
  const client = new Client({
    connectionString: normalizeConnectionString(postgresUrl),
  });

  await client.connect();

  try {
    await client.query("create extension if not exists pgcrypto;");
    await client.query(`
      create table if not exists public.${SUBMISSIONS_TABLE} (
        id uuid primary key default gen_random_uuid(),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        signed_at timestamptz,
        status text not null default 'draft',
        company_name_english text,
        company_name_chinese text,
        client_signature_name text,
        review_notes text,
        form_data jsonb not null default '{}'::jsonb,
        findings jsonb not null default '[]'::jsonb,
        documents jsonb not null default '[]'::jsonb,
        latest_review_pdf_path text,
        latest_signed_pdf_path text
      );
    `);
    await client.query(`
      create index if not exists ${SUBMISSIONS_TABLE}_status_created_at_idx
      on public.${SUBMISSIONS_TABLE} (status, created_at desc);
    `);
    await client.query(`
      create index if not exists ${SUBMISSIONS_TABLE}_company_name_idx
      on public.${SUBMISSIONS_TABLE} (company_name_english);
    `);
    await client.query(`alter table public.${SUBMISSIONS_TABLE} disable row level security;`);
    await client.query("notify pgrst, 'reload schema';");
  } finally {
    await client.end();
  }
};

const ensureBucket = async (bucketName: string) => {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage.listBuckets();

  if (error) {
    throw new Error(error.message);
  }

  if (data.some((bucket) => bucket.name === bucketName)) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
  });

  if (createError) {
    throw new Error(createError.message);
  }
};

const ensureStorageBuckets = async () => {
  await ensureBucket(DOCUMENTS_BUCKET);
  await ensureBucket(PDFS_BUCKET);
};

export const ensureSubmissionInfrastructure = async () => {
  if (infrastructureReady) {
    return;
  }

  if (!pendingInitialization) {
    pendingInitialization = (async () => {
      await ensureSubmissionTable();
      await ensureStorageBuckets();
      infrastructureReady = true;
    })().catch((error) => {
      pendingInitialization = null;
      throw error;
    });
  }

  await pendingInitialization;
};

# Company Account Onboarding Web

Browser-based workflow for digitizing a corporate account opening pack from the original blank PDF template.

## What this version does

- Accepts customer materials uploaded from desktop or mobile.
- Extracts fields from text-based PDF, TXT, CSV, Markdown, and JSON files for first-pass prefill.
- Captures remaining information in a responsive web form aligned to the original account-opening pack.
- Generates a review PDF using the original blank `companyAccount.pdf` template instead of recreating the layout.
- Supports review notes, correction loops, signature capture, and signed-PDF export.

## Current scope

- Text document extraction is implemented.
- Image OCR is not yet implemented.
- PDF output currently fills the embedded AcroForm fields plus key overlay areas on pages 2, 5, 6, and 9.
- Signature is drawn back into the template review/signature areas.

## Local run

```bash
npm install
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Open `http://127.0.0.1:3001`.

## Build

Use webpack build mode in restricted environments:

```bash
npm run build -- --webpack
```

## Key files

- `public/companyAccount.pdf`: original blank account-opening PDF template
- `src/app/page.tsx`: responsive onboarding workspace UI
- `src/lib/company-account-schema.ts`: form schema and option sets
- `src/lib/company-account-utils.ts`: upload parsing, prefill, validation
- `src/lib/company-account-pdf.ts`: template-based PDF generation and signature overlay

## Recommended next steps

- Add OCR for uploaded images and scans
- Persist forms, uploads, and signatures to a backend
- Add role-based review and approval flow
- Expand PDF coverage for the remaining unfilled pages

# Local Data Folder (your computer only — never committed)

This folder is where YOU place real or exported project files so the app can
work with them locally. No enterprise APIs, no uploads, nothing leaves this
machine.

> ⚠️ Privacy rule: everything you put here stays out of git (see `.gitignore`).
> Only this README and `TEMPLATE.md` are committed. Never copy secrets,
> credentials, or confidential material you are not authorized to use locally.

## How to use it

**Option A — validate a folder (recommended first step)**

```bash
npm.cmd run ingest -- --source "C:\Users\Kdatt\OneDrive - ALEC\Documents\Resources\Kevin\Qubators AI Foundry\project 2 - AI Site Memory\local-data"
```

You get a full inventory: which registers were found, row counts, and any
errors (missing columns, dangling links) or warnings.

**Option B — ask questions against your files**

Open the app (`npm.cmd run dev` → http://localhost:5173/), click
**Load local files**, and select the files from this folder. Answers,
evidence and verification badges then run against YOUR data for that session.
Click **Reset to synthetic** to go back to the demo data.

## What to put here

### Using `.xlsx` workbooks directly (recommended)

Drop your workbooks in as-is — no manual reformatting needed. The app:

1. Finds each register by **sheet name** (a sheet with `wir`, `mir`, `ncr`,
   `rfi`, `drawing` or `submittal` anywhere in its name).
2. Maps **your header wording** to the required columns — `WIR ID`,
   `Current Holder`, `Date Submitted`, `NCR Ref` and similar variants are
   recognized automatically (full variant list lives in the code:
   `src/connectors/xlsx.ts`, `ALIASES`).
3. **Cleans the data**: trims spaces, drops fully-empty rows, converts Excel
   dates to `YYYY-MM-DD`.
4. **Reports instead of guessing**: unknown columns are listed as dropped,
   sheets missing required columns are skipped with the reason shown, and
   explicit CSV files always win over workbook sheets for the same register.

| File kind | Naming | How it is used today |
|---|---|---|
| Register CSVs | filename contains `wir`, `mir`, `ncr`, `rfi`, `drawing`, `submittal` (e.g. `WIR_Register.csv`) | Fully ingested — see `TEMPLATE.md` for exact columns |
| Text notes | `.md` / `.txt` with a `Records: WIR-1842, NCR-031` line | Parsed as source documents (in-app picker only for now) |
| PDFs | any `.pdf` | Indexed by name only — content extraction is a later phase |
| Workbooks | `.xlsx` / `.xls` | **Parsed automatically** — sheets matched by name, headers cleaned (see below) |

## Suggested layout

```text
local-data/
  README.md            ← this file (committed)
  TEMPLATE.md          ← exact column requirements (committed)
  WIR_Register.csv     ← your files (ignored by git)
  MIR_Register.csv
  ...
  my-drawing.pdf
```

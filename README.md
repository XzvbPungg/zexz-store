# ZENZX JOKI ELITE — Vercel Only

## Deploy
1. Import this project into Vercel with the project root set to the folder containing this `package.json` (the ZIP already places it at the top level).
2. Framework Preset: Other. Build Command: leave empty. Output Directory: leave empty. Install Command: `npm install`.
3. In Vercel Storage, create a **Private Blob** store and connect it to this project so `BLOB_READ_WRITE_TOKEN` is added to the project environment variables.
4. Deploy (or redeploy after connecting Blob).

The original `public/index.html` is preserved. All website paths are routed to the Vercel Function in `api/index.js`; no VPS or long-running Node server is required.

Initial admin login: `admin` / `admin@2026`. Change it immediately after login.

## Notes
- Data is stored in Vercel Blob (`zenzx/db.json`), not the temporary serverless filesystem.
- Payment gateway settings are configured from the admin dashboard. Configure a webhook token or status verification before enabling automatic payments.
- The original app's manual QR mode expects `public/qris.jpg` if you use that mode; add your own QR image there if needed.

import { makeSampleRegistryPdf } from "@/lib/registry-draft";

export const runtime = "nodejs";

/** Fully fictional practice document — not an official title certificate. */
export function GET(): Response {
  return new Response(makeSampleRegistryPdf(), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="directhome-synthetic-registry-demo.pdf"',
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

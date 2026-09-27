/** An .xlsx download. The Hebrew file name goes in filename*, with an ASCII fallback. */
export function xlsxResponse(body: Buffer, fileName: string, asciiFallback: string): Response {
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

"use client";

import { useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormError } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { LOGO_MAX_BYTES, LOGO_MAX_SIDE } from "@/modules/branding/types";
import { removeLogoAction, setLogoAction } from "./actions";

/** Scales the image down to LOGO_MAX_SIDE and re-encodes it as PNG (keeps transparency). */
async function toPngDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function BrandingCard({ logoUrl }: { logoUrl: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const { run, pending, error } = useAction();
  const shown = preview ?? logoUrl;

  async function choose(file: File | undefined) {
    setLocalError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) return setLocalError("יש לבחור קובץ תמונה");
    let dataUrl: string;
    try {
      dataUrl = await toPngDataUrl(file);
    } catch {
      return setLocalError("לא ניתן לקרוא את התמונה. נסו קובץ PNG או JPG");
    }
    if ((dataUrl.length * 3) / 4 > LOGO_MAX_BYTES)
      return setLocalError("הלוגו גדול מדי גם אחרי הקטנה. נסו תמונה פשוטה יותר");
    setPreview(dataUrl);
    // Shown right away; the page's logo URL takes over once saved.
    run(() => setLogoAction(dataUrl), {
      onSuccess: () => setPreview(null),
      onError: () => setPreview(null),
    });
  }

  return (
    <Card>
      <CardHeader
        title="לוגו החברה"
        description="מופיע בתפריט, במסך הכניסה, בקובצי ה-PDF וה-Excel ובסידור ששותף עם הנציגים"
      />
      <CardBody>
        <div className="space-y-4">
          <FormError error={localError ?? error} />
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-24 w-48 items-center justify-center rounded-xl border border-dashed border-border bg-muted/50 p-3">
              {shown ? (
                // eslint-disable-next-line @next/next/no-img-element -- a dynamic, user-uploaded image
                <img
                  src={shown}
                  alt="לוגו החברה"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-xs text-fg-subtle">אין לוגו</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => input.current?.click()} loading={pending}>
                <ImageUp className="h-4 w-4" />
                {shown ? "החלפת לוגו" : "העלאת לוגו"}
              </Button>
              {shown ? (
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(() => removeLogoAction(), { onSuccess: () => setPreview(null) })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  הסרה
                </Button>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-fg-muted">
            PNG או JPG. מומלץ לוגו רחב על רקע שקוף. תמונה גדולה מוקטנת אוטומטית.
          </p>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </CardBody>
    </Card>
  );
}

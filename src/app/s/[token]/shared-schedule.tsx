"use client";

import { useRef, useState } from "react";
import { ImageDown } from "lucide-react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { SharedWeek } from "@/modules/sharing/types";

const key = (agentId: string, date: string) => `${agentId}_${date}`;

/** The shared week as a table (also on phones, scrolling sideways), with "save as image". */
export function SharedSchedule({
  data,
  dayLabels,
  logoUrl,
}: {
  data: SharedWeek;
  logoUrl: string | null;
  dayLabels: Array<{ date: string; title: string }>;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  async function saveImage() {
    if (!sheet.current) return;
    setSaving(true);
    try {
      // Render the full table, not just the part visible in a scrolled phone view.
      const node = sheet.current;
      const url = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        width: node.scrollWidth,
        height: node.scrollHeight,
        style: { overflow: "visible" },
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `סידור עבודה - ${data.teamName} - ${data.weekStart}.png`;
      a.click();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={saveImage} loading={saving}>
          <ImageDown className="h-4 w-4" />
          שמירה כתמונה
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <div ref={sheet} className="w-max min-w-full bg-white p-3" dir="rtl">
          <div className="mb-2 flex items-center justify-between gap-4">
            <p className="text-sm font-bold">
              סידור עבודה · {data.teamName} · {data.label}
            </p>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- captured into the saved image
              <img src={logoUrl} alt="לוגו" className="h-8 max-w-28 object-contain" />
            ) : null}
          </div>
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky start-0 z-10 min-w-32 border border-gray-300 bg-gray-100 px-2 py-1.5 text-start">
                  נציג
                </th>
                {dayLabels.map((d) => {
                  const info = data.dayInfo[d.date];
                  return (
                    <th
                      key={d.date}
                      className={cn(
                        "min-w-24 border border-gray-300 bg-gray-100 px-2 py-1.5",
                        info?.kind === "closed" && "bg-gray-200",
                      )}
                    >
                      <div>{d.title}</div>
                      {info?.name || info?.kind === "closed" ? (
                        <div
                          className={cn(
                            "text-[11px] font-medium",
                            info.kind === "closed" && "text-red-700",
                            info.kind === "eve" && "text-amber-700",
                            info.kind === "regular" && "text-gray-500",
                          )}
                        >
                          {info.name ?? "חג"}
                          {info.kind === "closed" ? " · סגור" : ""}
                        </div>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.agents.map((a) => (
                <tr key={a.id}>
                  <th className="sticky start-0 z-10 border border-gray-300 bg-white px-2 py-1.5 text-start font-medium">
                    {a.name}
                  </th>
                  {dayLabels.map((d) => {
                    const cell = data.cells[key(a.id, d.date)];
                    const closed = data.dayInfo[d.date]?.kind === "closed";
                    return (
                      <td
                        key={d.date}
                        className={cn(
                          "border border-gray-300 px-2 py-1.5 text-center",
                          closed && "bg-gray-100",
                        )}
                      >
                        {cell ? (
                          <>
                            <div className="font-semibold" style={{ color: cell.color }}>
                              {cell.text}
                            </div>
                            {cell.sub ? (
                              <div className="text-[11px] text-gray-500">{cell.sub}</div>
                            ) : null}
                          </>
                        ) : closed ? (
                          <span className="text-xs text-gray-400">סגור</span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

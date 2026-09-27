import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The company logo when one was uploaded (settings), otherwise the app's calendar mark.
 * The logo keeps its proportions within the given height.
 */
export function BrandMark({
  logoUrl,
  size = "md",
  className,
}: {
  logoUrl: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  if (logoUrl) {
    const h = { sm: "h-6 max-w-24", md: "h-8 max-w-32", lg: "h-14 max-w-56" }[size];
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a small, user-uploaded image
      <img src={logoUrl} alt="לוגו" className={cn(h, "w-auto object-contain", className)} />
    );
  }
  const box = {
    sm: "h-6 w-6 rounded-md",
    md: "h-8 w-8 rounded-lg",
    lg: "h-12 w-12 rounded-2xl shadow-md",
  }[size];
  const icon = { sm: "h-3.5 w-3.5", md: "h-4.5 w-4.5", lg: "h-6 w-6" }[size];
  return (
    <span className={cn("flex items-center justify-center bg-primary text-white", box, className)}>
      <CalendarDays className={icon} />
    </span>
  );
}

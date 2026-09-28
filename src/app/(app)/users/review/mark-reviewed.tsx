"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/ui/use-action";
import { markReviewedAction } from "../actions";

export function MarkReviewed() {
  const [note, setNote] = useState("");
  const { run, pending } = useAction();
  return (
    <Card className="mt-4">
      <CardBody className="space-y-3">
        <Field
          label="תיעוד הבדיקה"
          htmlFor="review-note"
          hint="אופציונלי: מה נבדק ומה שונה, למשל ״הושבתו 2 משתמשים שעזבו״"
        >
          <Textarea
            id="review-note"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <Button
          loading={pending}
          onClick={() => run(() => markReviewedAction(note), { onSuccess: () => setNote("") })}
        >
          <CheckCircle2 className="h-4 w-4" />
          סימון שהבדיקה בוצעה
        </Button>
      </CardBody>
    </Card>
  );
}

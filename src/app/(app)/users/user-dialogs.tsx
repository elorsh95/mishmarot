"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useAction } from "@/components/ui/use-action";
import type { UserListItem } from "@/modules/users/service";
import {
  createUserAction,
  deleteUserAction,
  resetPasswordAction,
  updateUserAction,
} from "./actions";

export type RoleOption = { id: string; name: string };
export type TeamOption = { id: string; name: string; isActive: boolean };

const PASSWORD_HINT = "לפחות 8 תווים, כולל אות באנגלית וספרה";

export function UserDialog({
  user,
  roles,
  teams,
  isSelf,
  onClose,
}: {
  user: UserListItem | null;
  roles: RoleOption[];
  teams: TeamOption[];
  isSelf: boolean;
  onClose: () => void;
}) {
  const [username, setUsername] = useState(user?.username ?? "");
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [roleId, setRoleId] = useState(user?.roleId ?? "");
  const [managedTeamIds, setManagedTeamIds] = useState<string[]>(user?.managedTeamIds ?? []);
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const { run, pending, error, fieldErrors } = useAction();
  const toast = useToast();

  const visibleTeams = teams.filter((t) => t.isActive || managedTeamIds.includes(t.id));

  function toggleTeam(id: string, checked: boolean) {
    setManagedTeamIds((ids) => (checked ? [...ids, id] : ids.filter((x) => x !== id)));
  }

  function save() {
    const base = { username, fullName, email, roleId, managedTeamIds };
    if (user) {
      run(() => updateUserAction(user.id, { ...base, isActive }), { onSuccess: onClose });
      return;
    }
    run(() => createUserAction(base), {
      onSuccess: (result) => {
        if (result.emailSent) toast.success(`המשתמש נוצר ונשלחה הזמנה ל-${result.email}`);
        else toast.error("המשתמש נוצר, אך שליחת ההזמנה נכשלה. אפשר לשלוח שוב מרשימת המשתמשים");
        onClose();
      },
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={user ? `עריכת משתמש: ${user.fullName}` : "משתמש חדש"}
      description={user ? undefined : "המשתמש יקבל מייל עם קישור לקביעת סיסמה"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
          <Button onClick={save} loading={pending}>
            {user ? "שמירה" : "יצירה ושליחת הזמנה"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError error={error} />
        <Field label="שם מלא" htmlFor="user-fullname" error={fieldErrors.fullName}>
          <Input
            id="user-fullname"
            value={fullName}
            autoComplete="off"
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>
        <Field
          label="שם משתמש"
          htmlFor="user-username"
          error={fieldErrors.username}
          hint="אותיות באנגלית, ספרות, נקודה, מקף וקו תחתון"
        >
          <Input
            id="user-username"
            dir="ltr"
            value={username}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field
          label="מייל"
          htmlFor="user-email"
          error={fieldErrors.email}
          hint={
            user
              ? user.email
                ? "שינוי המייל משנה גם את הכתובת לשליחת קישורי סיסמה"
                : "יש להוסיף מייל כדי לאפשר שליחת קישור לאיפוס סיסמה"
              : "יישלח קישור שבו המשתמש יבחר סיסמה ויכנס למערכת"
          }
        >
          <Input
            id="user-email"
            type="email"
            dir="ltr"
            value={email}
            autoComplete="off"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field
          label="תפקיד"
          htmlFor="user-role"
          error={fieldErrors.roleId}
          hint={isSelf ? "לא ניתן לשנות את התפקיד של המשתמש שלך" : undefined}
        >
          <Select
            id="user-role"
            value={roleId}
            disabled={isSelf}
            onChange={(e) => setRoleId(e.target.value)}
          >
            <option value="" disabled>
              בחירת תפקיד…
            </option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="צוותים בניהולו"
          error={fieldErrors.managedTeamIds}
          hint="מנהל צוות רואה ומנהל רק את הצוותים שסומנו כאן"
        >
          {visibleTeams.length === 0 ? (
            <p className="text-sm text-fg-muted">אין צוותים</p>
          ) : (
            <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-2">
              {visibleTeams.map((t) => (
                <Checkbox
                  key={t.id}
                  label={t.isActive ? t.name : `${t.name} (לא פעיל)`}
                  checked={managedTeamIds.includes(t.id)}
                  onChange={(e) => toggleTeam(t.id, e.target.checked)}
                />
              ))}
            </div>
          )}
        </Field>
        {user ? (
          <Checkbox
            label="משתמש פעיל"
            checked={isActive}
            disabled={isSelf}
            onChange={(e) => setIsActive(e.target.checked)}
          />
        ) : null}
      </div>
    </Dialog>
  );
}

export function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: UserListItem;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const { run, pending, error, fieldErrors } = useAction();

  function save() {
    run(() => resetPasswordAction(user.id, password), { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="הגדרת סיסמה ידנית"
      description={`${user.fullName} (${user.username})`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
          <Button onClick={save} loading={pending}>
            איפוס סיסמה
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError error={error} />
        <Field
          label="סיסמה חדשה"
          htmlFor="reset-password"
          error={fieldErrors._}
          hint={PASSWORD_HINT}
        >
          <Input
            id="reset-password"
            type="password"
            dir="ltr"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <p className="text-sm text-fg-muted">
          עדיף לשלוח למשתמש קישור במייל, כך שרק הוא יודע את הסיסמה. אחרי הגדרה ידנית המשתמש ינותק
          מכל המכשירים ויצטרך להתחבר עם הסיסמה החדשה.
        </p>
      </div>
    </Dialog>
  );
}

export function DeleteUserDialog({ user, onClose }: { user: UserListItem; onClose: () => void }) {
  const { run, pending, error } = useAction();
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="מחיקת משתמש"
      description={`${user.fullName} (${user.username})`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() => run(() => deleteUserAction(user.id), { onSuccess: onClose })}
          >
            מחיקה לצמיתות
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormError error={error} />
        <p className="text-sm">
          למחוק את המשתמש <strong>{user.fullName}</strong>? המשתמש לא יוכל להתחבר, ויוסר מניהול
          הצוותים שלו. לא ניתן לבטל את הפעולה.
        </p>
        <p className="text-sm text-fg-muted">
          ההיסטוריה (יומן פעולות, אישורים והעברות) נשמרת עם שמו. כדי לחסום כניסה בלי למחוק, אפשר
          להשבית את המשתמש בעריכה.
        </p>
      </div>
    </Dialog>
  );
}

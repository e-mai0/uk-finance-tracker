"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RoleFamily } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleChipGroup } from "@/components/ui/toggle-chip";
import { cn } from "@/lib/utils";
import {
  DEGREE_TYPES,
  ROLE_FAMILIES,
  UK_UNIVERSITIES,
} from "@/lib/constants";
import { updateSettings, type SettingsResult } from "@/server/actions/settings";

export interface SettingsInitial {
  name: string;
  email: string;
  university: string;
  degreeSubject: string;
  degreeType: string;
  graduationYear: number;
  currentYear: number;
  targetRoleFamilies: RoleFamily[];
}

const YEAR_OPTIONS = ["2026", "2027", "2028", "2029", "2030", "2031"];

export function SettingsForm({
  initial,
}: {
  initial: SettingsInitial;
}) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof SettingsInitial>(
    key: K,
    value: SettingsInitial[K],
  ) => setS((prev) => ({ ...prev, [key]: value }));

  const onSave = () => {
    setErrors({});
    setMessage(null);
    const payload = {
      university: s.university,
      degreeSubject: s.degreeSubject,
      degreeType: s.degreeType,
      graduationYear: Number(s.graduationYear),
      currentYear: Number(s.currentYear),
      targetRoleFamilies: s.targetRoleFamilies,
    };

    startTransition(async () => {
      const res: SettingsResult = await updateSettings(payload);
      if (res.fieldErrors) {
        setErrors(res.fieldErrors);
        setMessage("Please fix the highlighted fields.");
        return;
      }
      if (res.error) {
        setMessage(res.error);
        return;
      }
      setMessage("Saved. Your matches have been recalculated.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input className="mt-1.5" value={s.name} disabled />
          </div>
          <div>
            <Label>Email</Label>
            <Input className="mt-1.5" value={s.email} disabled />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Education</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>University</Label>
            <Input
              list="settings-uni"
              className="mt-1.5"
              value={s.university}
              onChange={(e) => set("university", e.target.value)}
            />
            <datalist id="settings-uni">
              {UK_UNIVERSITIES.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            <FieldError message={errors.university?.[0]} />
          </div>
          <div>
            <Label>Degree subject</Label>
            <Input
              className="mt-1.5"
              value={s.degreeSubject}
              onChange={(e) => set("degreeSubject", e.target.value)}
            />
            <FieldError message={errors.degreeSubject?.[0]} />
          </div>
          <div>
            <Label>Degree type</Label>
            <Select
              className="mt-1.5"
              value={s.degreeType}
              onChange={(e) => set("degreeType", e.target.value)}
            >
              <option value="">Select…</option>
              {DEGREE_TYPES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
            <FieldError message={errors.degreeType?.[0]} />
          </div>
          <div>
            <Label>Graduation year</Label>
            <Select
              className="mt-1.5"
              value={String(s.graduationYear)}
              onChange={(e) => set("graduationYear", Number(e.target.value))}
            >
              <option value="">Select…</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
            <FieldError message={errors.graduationYear?.[0]} />
          </div>
          <div>
            <Label>Current year of study</Label>
            <Select
              className="mt-1.5"
              value={String(s.currentYear)}
              onChange={(e) => set("currentYear", Number(e.target.value))}
            >
              <option value="">Select…</option>
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </Select>
            <FieldError message={errors.currentYear?.[0]} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Interests</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <div>
            <Label>Target role families</Label>
            <div className="mt-2">
              <ToggleChipGroup
                options={ROLE_FAMILIES.map((r) => ({
                  value: r.value,
                  label: r.label,
                }))}
                selected={s.targetRoleFamilies}
                onChange={(v) => set("targetRoleFamilies", v)}
              />
            </div>
            <FieldError message={errors.targetRoleFamilies?.[0]} />
          </div>
        </CardBody>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-canvas/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <span
          className={cn(
            "text-sm",
            message?.startsWith("Saved") ? "text-success" : "text-muted",
          )}
        >
          {message}
        </span>
        <Button onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

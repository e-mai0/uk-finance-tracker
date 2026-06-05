"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RoleFamily, WorkAuth } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleChipGroup } from "@/components/ui/toggle-chip";
import { TagInput } from "@/components/ui/tag-input";
import { cn } from "@/lib/utils";
import {
  DEGREE_TYPES,
  ROLE_FAMILIES,
  UK_LOCATIONS,
  UK_UNIVERSITIES,
  WORK_AUTH_OPTIONS,
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
  skills: string[];
  workAuth: WorkAuth;
  aLevels: string;
  gcseSummary: string;
  gpaOrEquivalent: string;
  preferredLocations: string[];
  openToAnywhereUk: boolean;
  targetEmployers: string[];
}

const YEAR_OPTIONS = ["2026", "2027", "2028", "2029", "2030", "2031"];

export function SettingsForm({
  initial,
  employerSuggestions,
}: {
  initial: SettingsInitial;
  employerSuggestions: string[];
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
      skills: s.skills,
      workAuth: s.workAuth,
      gradeInfo: {
        aLevels: s.aLevels,
        gcseSummary: s.gcseSummary,
        gpaOrEquivalent: s.gpaOrEquivalent,
      },
      preferredLocations: s.preferredLocations,
      openToAnywhereUk: s.openToAnywhereUk,
      targetEmployers: s.targetEmployers,
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
          <div>
            <Label>Skills &amp; interests</Label>
            <div className="mt-2">
              <TagInput
                value={s.skills}
                onChange={(v) => set("skills", v)}
                placeholder="Add a skill and press Enter"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eligibility</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <div>
            <Label>UK work authorization</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {WORK_AUTH_OPTIONS.map((o) => {
                const active = s.workAuth === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => set("workAuth", o.value)}
                    className={cn(
                      "rounded-lg border px-3.5 py-2.5 text-left text-sm font-medium transition-colors",
                      active
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border-strong bg-surface text-muted hover:border-ink/30 hover:text-ink",
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <FieldError message={errors.workAuth?.[0]} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              value={s.aLevels}
              onChange={(e) => set("aLevels", e.target.value)}
              placeholder="A-levels"
            />
            <Input
              value={s.gcseSummary}
              onChange={(e) => set("gcseSummary", e.target.value)}
              placeholder="GCSEs"
            />
            <Input
              value={s.gpaOrEquivalent}
              onChange={(e) => set("gpaOrEquivalent", e.target.value)}
              placeholder="Degree grade / GPA"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences &amp; targets</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <div>
            <Label>Preferred UK locations</Label>
            <div className="mt-2">
              <ToggleChipGroup
                options={UK_LOCATIONS.map((l) => ({ value: l, label: l }))}
                selected={s.preferredLocations}
                onChange={(v) => set("preferredLocations", v)}
              />
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={s.openToAnywhereUk}
                onChange={(e) => set("openToAnywhereUk", e.target.checked)}
                className="h-4 w-4 rounded border-border-strong accent-[var(--color-accent)]"
              />
              I&apos;m open to roles anywhere in the UK
            </label>
            <FieldError message={errors.preferredLocations?.[0]} />
          </div>
          <div>
            <Label>Target employers</Label>
            <div className="mt-2">
              <TagInput
                value={s.targetEmployers}
                onChange={(v) => set("targetEmployers", v)}
                suggestions={employerSuggestions}
                placeholder="Add a firm and press Enter"
              />
            </div>
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

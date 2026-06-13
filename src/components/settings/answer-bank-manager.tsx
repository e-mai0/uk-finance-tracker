"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label, FieldError } from "@/components/ui/input";
import {
  saveAnswerBankItem,
  deleteAnswerBankItem,
} from "@/server/actions/applyProfile";

export interface AnswerItem {
  id: string;
  questionText: string;
  answer: string;
  employer: string | null;
  usageCount: number;
}

function Editor({
  initial,
  onDone,
}: {
  initial?: AnswerItem;
  onDone: () => void;
}) {
  const [question, setQuestion] = useState(initial?.questionText ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [employer, setEmployer] = useState(initial?.employer ?? "");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    setErrors({});
    startTransition(async () => {
      const res = await saveAnswerBankItem(
        { questionText: question, answer, employer, tags: [] },
        initial?.id,
      );
      if (res.fieldErrors) setErrors(res.fieldErrors);
      else if (res.ok) onDone();
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-2/40 p-4">
      <div>
        <Label htmlFor="q">Question</Label>
        <Input
          id="q"
          value={question}
          placeholder="Why do you want to work at our firm?"
          onChange={(e) => setQuestion(e.target.value)}
          className="mt-1"
        />
        <FieldError message={errors.questionText?.[0]} />
      </div>
      <div>
        <Label htmlFor="a">Answer</Label>
        <Textarea
          id="a"
          rows={4}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          className="mt-1"
        />
        <FieldError message={errors.answer?.[0]} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grow">
          <Label htmlFor="emp">Employer (optional)</Label>
          <Input
            id="emp"
            value={employer}
            placeholder="Leave blank for a generic answer"
            onChange={(e) => setEmployer(e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ item }: { item: AnswerItem }) {
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();

  if (editing) return <Editor initial={item} onDone={() => setEditing(false)} />;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink">{item.questionText}</p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-muted hover:text-ink"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => startTransition(() => deleteAnswerBankItem(item.id).then())}
            className="text-xs font-medium text-danger hover:underline"
          >
            Delete
          </button>
        </div>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted">{item.answer}</p>
      <div className="mt-2 flex gap-2 text-[0.6875rem] text-subtle">
        {item.employer && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5">{item.employer}</span>
        )}
        {item.usageCount > 0 && (
          <span className="tabular">used {item.usageCount}×</span>
        )}
      </div>
    </div>
  );
}

export function AnswerBankManager({ items }: { items: AnswerItem[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <div>
          <CardTitle>Answer bank</CardTitle>
          <p className="mt-0.5 text-xs text-muted">
            Reusable answers to common questions. The copilot reuses a close match
            and saves new ones as you apply.
          </p>
        </div>
        {!adding && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => setAdding(true)}
          >
            Add
          </Button>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {adding && <Editor onDone={() => setAdding(false)} />}
        {items.length === 0 && !adding && (
          <p className="text-sm text-muted">
            No saved answers yet. They’ll appear here as you generate and save them.
          </p>
        )}
        {items.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </CardBody>
    </Card>
  );
}

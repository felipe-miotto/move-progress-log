/**
 * Fields reutilizáveis pelas 8 telas do Questionário Precision 12.
 *
 * Todos seguem o padrão shadcn Form + react-hook-form:
 *   - Label associada por id/htmlFor
 *   - Erros visíveis via FormMessage (texto, não só cor — WCAG 1.4.1)
 *   - Cada opção radio/checkbox tem foco navegável por teclado
 */

import { useId } from "react";
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────────────────
// Tipos auxiliares
// ────────────────────────────────────────────────────────────────────────────

export interface Option<Code extends string = string> {
  code: Code;
  label: string;
}

interface BaseFieldProps<TFieldValues extends FieldValues> {
  name: FieldPath<TFieldValues>;
  label: string;
  description?: string;
  required?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// TextField — input curto (text/email/tel)
// ────────────────────────────────────────────────────────────────────────────

interface TextFieldProps<TFieldValues extends FieldValues>
  extends BaseFieldProps<TFieldValues> {
  type?: "text" | "email" | "tel" | "date";
  placeholder?: string;
  inputMode?: "text" | "email" | "tel" | "numeric";
  autoComplete?: string;
  maxLength?: number;
}

export function TextField<TFieldValues extends FieldValues>({
  name,
  label,
  description,
  required,
  type = "text",
  placeholder,
  inputMode,
  autoComplete,
  maxLength,
}: TextFieldProps<TFieldValues>) {
  const form = useFormContext<TFieldValues>();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
          </FormLabel>
          <FormControl>
            <Input
              type={type}
              inputMode={inputMode}
              autoComplete={autoComplete}
              placeholder={placeholder}
              maxLength={maxLength}
              {...field}
              value={(field.value as string | null | undefined) ?? ""}
              onChange={(e) =>
                field.onChange(e.target.value === "" ? null : e.target.value)
              }
            />
          </FormControl>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TextAreaField
// ────────────────────────────────────────────────────────────────────────────

interface TextAreaFieldProps<TFieldValues extends FieldValues>
  extends BaseFieldProps<TFieldValues> {
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}

export function TextAreaField<TFieldValues extends FieldValues>({
  name,
  label,
  description,
  required,
  placeholder,
  rows = 3,
  maxLength,
}: TextAreaFieldProps<TFieldValues>) {
  const form = useFormContext<TFieldValues>();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
          </FormLabel>
          <FormControl>
            <Textarea
              placeholder={placeholder}
              rows={rows}
              maxLength={maxLength}
              {...field}
              value={(field.value as string | null | undefined) ?? ""}
              onChange={(e) =>
                field.onChange(e.target.value === "" ? null : e.target.value)
              }
            />
          </FormControl>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────────
// RadioField — single-choice de array de Option
// ────────────────────────────────────────────────────────────────────────────

interface RadioFieldProps<TFieldValues extends FieldValues>
  extends BaseFieldProps<TFieldValues> {
  options: readonly Option[];
  /** Coerce valor pro tipo do campo. Default: string. Use number pra Likert. */
  valueCoerce?: "string" | "number";
}

export function RadioField<TFieldValues extends FieldValues>({
  name,
  label,
  description,
  required,
  options,
  valueCoerce = "string",
}: RadioFieldProps<TFieldValues>) {
  const form = useFormContext<TFieldValues>();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
          </FormLabel>
          <FormControl>
            <RadioGroup
              value={
                field.value !== undefined && field.value !== null
                  ? String(field.value)
                  : undefined
              }
              onValueChange={(value) => {
                field.onChange(
                  valueCoerce === "number" ? Number(value) : value,
                );
              }}
              className="space-y-1.5"
            >
              {options.map((opt) => (
                <RadioOption
                  key={opt.code}
                  fieldName={String(name)}
                  code={opt.code}
                  label={opt.label}
                />
              ))}
            </RadioGroup>
          </FormControl>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function RadioOption({
  fieldName,
  code,
  label,
}: {
  fieldName: string;
  code: string;
  label: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2 rounded-md border bg-background p-2">
      <RadioGroupItem value={code} id={`${fieldName}-${id}`} />
      <Label htmlFor={`${fieldName}-${id}`} className="cursor-pointer text-sm">
        {label}
      </Label>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// BooleanField — Sim/Não como radio
// ────────────────────────────────────────────────────────────────────────────

interface BooleanFieldProps<TFieldValues extends FieldValues>
  extends BaseFieldProps<TFieldValues> {
  trueLabel?: string;
  falseLabel?: string;
}

export function BooleanField<TFieldValues extends FieldValues>({
  name,
  label,
  description,
  required,
  trueLabel = "Sim",
  falseLabel = "Não",
}: BooleanFieldProps<TFieldValues>) {
  const form = useFormContext<TFieldValues>();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
          </FormLabel>
          <FormControl>
            <RadioGroup
              value={
                field.value === true
                  ? "true"
                  : field.value === false
                    ? "false"
                    : undefined
              }
              onValueChange={(value) => field.onChange(value === "true")}
              className="flex gap-2"
            >
              <BooleanOption fieldName={String(name)} value="false" label={falseLabel} />
              <BooleanOption fieldName={String(name)} value="true" label={trueLabel} />
            </RadioGroup>
          </FormControl>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function BooleanOption({
  fieldName,
  value,
  label,
}: {
  fieldName: string;
  value: string;
  label: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-1 items-center gap-2 rounded-md border bg-background p-2">
      <RadioGroupItem value={value} id={`${fieldName}-${value}-${id}`} />
      <Label htmlFor={`${fieldName}-${value}-${id}`} className="cursor-pointer text-sm">
        {label}
      </Label>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// LikertField — escala 1-5 com extremidades nomeadas
// ────────────────────────────────────────────────────────────────────────────

interface LikertFieldProps<TFieldValues extends FieldValues>
  extends BaseFieldProps<TFieldValues> {
  lowLabel: string;
  highLabel: string;
}

export function LikertField<TFieldValues extends FieldValues>({
  name,
  label,
  description,
  required,
  lowLabel,
  highLabel,
}: LikertFieldProps<TFieldValues>) {
  const form = useFormContext<TFieldValues>();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
          </FormLabel>
          <FormControl>
            <RadioGroup
              value={
                field.value !== undefined && field.value !== null
                  ? String(field.value)
                  : undefined
              }
              onValueChange={(value) => field.onChange(Number(value))}
              className="flex items-center justify-between gap-1"
              aria-label={`${label} (escala 1 a 5: ${lowLabel} a ${highLabel})`}
            >
              <span className="text-xs text-muted-foreground">{lowLabel}</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <LikertOption
                  key={n}
                  fieldName={String(name)}
                  value={n}
                  isSelected={field.value === n}
                />
              ))}
              <span className="text-xs text-muted-foreground">{highLabel}</span>
            </RadioGroup>
          </FormControl>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function LikertOption({
  fieldName,
  value,
  isSelected,
}: {
  fieldName: string;
  value: number;
  isSelected: boolean;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full border",
        isSelected && "border-primary bg-primary/10",
      )}
    >
      <RadioGroupItem
        value={String(value)}
        id={`${fieldName}-${value}-${id}`}
        className="sr-only"
      />
      <Label
        htmlFor={`${fieldName}-${value}-${id}`}
        className="flex h-full w-full cursor-pointer items-center justify-center text-sm font-medium"
      >
        {value}
      </Label>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CheckboxArrayField — múltipla escolha
// ────────────────────────────────────────────────────────────────────────────

interface CheckboxArrayFieldProps<TFieldValues extends FieldValues>
  extends BaseFieldProps<TFieldValues> {
  options: readonly Option[];
  maxItems?: number;
}

export function CheckboxArrayField<TFieldValues extends FieldValues>({
  name,
  label,
  description,
  required,
  options,
  maxItems,
}: CheckboxArrayFieldProps<TFieldValues>) {
  const form = useFormContext<TFieldValues>();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => {
        const selected = (field.value as string[] | null | undefined) ?? [];
        const toggle = (code: string) => {
          const isOn = selected.includes(code);
          if (isOn) {
            field.onChange(selected.filter((c) => c !== code));
            return;
          }
          if (maxItems && selected.length >= maxItems) return;
          field.onChange([...selected, code]);
        };
        return (
          <FormItem>
            <FormLabel>
              {label}
              {required && <span className="ml-0.5 text-destructive">*</span>}
              {maxItems && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  (até {maxItems})
                </span>
              )}
            </FormLabel>
            <FormControl>
              <div className="space-y-1.5">
                {options.map((opt) => (
                  <CheckboxOption
                    key={opt.code}
                    fieldName={String(name)}
                    code={opt.code}
                    label={opt.label}
                    isOn={selected.includes(opt.code)}
                    isDisabled={
                      !!maxItems &&
                      selected.length >= maxItems &&
                      !selected.includes(opt.code)
                    }
                    onToggle={toggle}
                  />
                ))}
              </div>
            </FormControl>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function CheckboxOption({
  fieldName,
  code,
  label,
  isOn,
  isDisabled,
  onToggle,
}: {
  fieldName: string;
  code: string;
  label: string;
  isOn: boolean;
  isDisabled: boolean;
  onToggle: (code: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2 rounded-md border bg-background p-2">
      <Checkbox
        id={`${fieldName}-${id}`}
        checked={isOn}
        disabled={isDisabled}
        onCheckedChange={() => onToggle(code)}
      />
      <Label htmlFor={`${fieldName}-${id}`} className="cursor-pointer text-sm">
        {label}
      </Label>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ConsentField — checkbox obrigatório (precisa ser true)
// ────────────────────────────────────────────────────────────────────────────

type ConsentFieldProps<TFieldValues extends FieldValues> =
  BaseFieldProps<TFieldValues>;

export function ConsentField<TFieldValues extends FieldValues>({
  name,
  label,
}: ConsentFieldProps<TFieldValues>) {
  const form = useFormContext<TFieldValues>();
  const id = useId();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="rounded-md border bg-background p-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id={`consent-${id}`}
              checked={field.value === true}
              onCheckedChange={(v) => field.onChange(v === true ? true : false)}
              className="mt-0.5"
            />
            <Label
              htmlFor={`consent-${id}`}
              className="cursor-pointer text-sm leading-snug"
            >
              {label}
            </Label>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

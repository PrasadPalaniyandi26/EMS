"use client"

import { useState, type ReactNode } from "react"
import { ListFilter } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, NativeSelect } from "@/components/shared/modal-primitives"
import { ModuleModal } from "@/components/shared/module/module-modal"
import { cn } from "@/lib/utils"

export interface FilterDef {
  id: string
  /** Names the control: the field label in the dialog and the accessible name inline */
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  /** The value that means "not filtering". The first option when left out */
  defaultValue?: string
  /** More controls under the select in the dialog, for example the dates of a custom range */
  extra?: (value: string) => ReactNode
  /** What the toolbar select reads while it is not filtering, so plain values such as All, Yes and No still say what they filter. Not listed in the menu */
  placeholder?: string
}

// A screen shows up to this many filters in the toolbar; more than that go into one "Filters…" dialog so the row stays clean
export const MAX_INLINE_FILTERS = 2

const isActive = (f: FilterDef) => f.value !== (f.defaultValue ?? f.options[0]?.value)

export function Filters({ defs }: { defs: FilterDef[] }) {
  const [open, setOpen] = useState(false)
  if (defs.length === 0) return null

  if (defs.length <= MAX_INLINE_FILTERS) {
    return (
      <>
        {defs.map((f) => (
          <NativeSelect key={f.id} aria-label={f.label} value={f.value} onChange={(e) => f.onChange(e.target.value)} className="!h-8 !w-auto">
            {f.placeholder && <option value={f.defaultValue ?? f.options[0]?.value} hidden>{f.placeholder}</option>}
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NativeSelect>
        ))}
      </>
    )
  }

  const active = defs.filter(isActive).length
  const reset = () => defs.filter(isActive).forEach((f) => f.onChange(f.defaultValue ?? f.options[0]?.value ?? ""))
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="h-8 gap-1.5 px-3 text-[13px] font-medium">
        <ListFilter aria-hidden className="h-4 w-4 text-[var(--shell-text-muted)]" />
        Filters…
        {active > 0 && <span aria-label={`${active} active`} className="tabular-nums font-semibold text-[var(--shell-accent)]">{active}</span>}
      </Button>
      <ModuleModal
        isOpen={open}
        onClose={() => setOpen(false)}
        size="md"
        title="Filters"
        icon={<ListFilter className="h-4 w-4" />}
        footerLeft={<Button type="button" variant="ghost" onClick={reset} disabled={active === 0} className="h-9 px-3 text-[13px] font-medium" style={{ color: "var(--shell-text-muted)" }}>Clear all</Button>}
        footer={<Button onClick={() => setOpen(false)} className="h-9 px-5 text-[13px] font-medium">Done</Button>}
      >
        <div className="space-y-3">
          <p className="text-[12px] text-[var(--shell-text-muted)]">The list changes as you choose. Combine as many as you need.</p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            {defs.map((f) => {
              const extra = f.extra?.(f.value)
              return (
                <div key={f.id} className={cn("space-y-2", extra && "sm:col-span-2")}>
                  <Field label={f.label}>
                    <NativeSelect value={f.value} onChange={(e) => f.onChange(e.target.value)}>
                      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </NativeSelect>
                  </Field>
                  {extra}
                </div>
              )
            })}
          </div>
        </div>
      </ModuleModal>
    </>
  )
}

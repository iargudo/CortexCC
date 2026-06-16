import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_DAY_SLOTS,
  DEFAULT_SCHEDULE,
  createDefaultDaySlots,
  type TimeSlot,
  WEEK_DAYS,
  WEEKDAY_KEYS,
  type WeekDayKey,
  type WeekSchedule,
} from "@/lib/businessHours";
import { Copy, Plus, Trash2 } from "lucide-react";

type Props = {
  value: WeekSchedule;
  onChange: (schedule: WeekSchedule) => void;
};

const EXTRA_SLOT: TimeSlot = { ...DEFAULT_DAY_SLOTS[1] };

function isDayOpen(slots: TimeSlot[] | undefined): boolean {
  return Array.isArray(slots) && slots.length > 0;
}

export function BusinessHoursScheduleEditor({ value, onChange }: Props) {
  const updateDay = (day: WeekDayKey, slots: TimeSlot[]) => {
    onChange({ ...value, [day]: slots });
  };

  const toggleDay = (day: WeekDayKey, open: boolean) => {
    updateDay(day, open ? createDefaultDaySlots() : []);
  };

  const updateSlot = (day: WeekDayKey, index: number, field: keyof TimeSlot, fieldValue: string) => {
    const slots = [...(value[day] ?? [])];
    slots[index] = { ...slots[index], [field]: fieldValue };
    updateDay(day, slots);
  };

  const addSlot = (day: WeekDayKey) => {
    const slots = [...(value[day] ?? [])];
    slots.push({ ...EXTRA_SLOT });
    updateDay(day, slots);
  };

  const removeSlot = (day: WeekDayKey, index: number) => {
    const slots = [...(value[day] ?? [])];
    slots.splice(index, 1);
    updateDay(day, slots);
  };

  const applyWeekdaysFromMonday = () => {
    const mondaySlots = value.monday?.length ? value.monday.map((slot) => ({ ...slot })) : [];
    const next = { ...value };
    for (const day of WEEKDAY_KEYS) {
      next[day] = mondaySlots.map((slot) => ({ ...slot }));
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Horario semanal</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={applyWeekdaysFromMonday}>
          <Copy size={12} />
          Copiar lunes a días laborables
        </Button>
      </div>

      <div className="rounded-md border divide-y max-h-[320px] overflow-y-auto">
        {WEEK_DAYS.map(({ key, label }) => {
          const slots = value[key] ?? [];
          const open = isDayOpen(slots);

          return (
            <div key={key} className="p-3 space-y-2">
              <div className="flex items-center gap-3">
                <Checkbox
                  id={`bh-day-${key}`}
                  checked={open}
                  onCheckedChange={(checked) => toggleDay(key, Boolean(checked))}
                />
                <Label htmlFor={`bh-day-${key}`} className="text-sm font-medium w-24 shrink-0">
                  {label}
                </Label>
                {!open && <span className="text-xs text-muted-foreground">Cerrado</span>}
              </div>

              {open &&
                slots.map((slot, index) => (
                  <div key={`${key}-${index}`} className="flex items-center gap-2 pl-7">
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        type="time"
                        value={slot.start}
                        onChange={(e) => updateSlot(key, index, "start", e.target.value)}
                        className="h-8 text-sm w-[7.5rem]"
                      />
                      <span className="text-xs text-muted-foreground">a</span>
                      <Input
                        type="time"
                        value={slot.end}
                        onChange={(e) => updateSlot(key, index, "end", e.target.value)}
                        className="h-8 text-sm w-[7.5rem]"
                      />
                    </div>
                    {slots.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive shrink-0"
                        onClick={() => removeSlot(key, index)}
                      >
                        <Trash2 size={12} />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => addSlot(key)}
                        title="Agregar otro bloque horario"
                      >
                        <Plus size={12} />
                      </Button>
                    )}
                  </div>
                ))}

              {open && slots.length > 1 && (
                <div className="pl-7">
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => addSlot(key)}>
                    <Plus size={12} />
                    Agregar bloque
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { DEFAULT_SCHEDULE };

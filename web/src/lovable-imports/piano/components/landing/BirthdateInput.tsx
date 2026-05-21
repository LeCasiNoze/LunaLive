import { useRef, useState, useEffect, type KeyboardEvent, type ChangeEvent } from "react";

export type BirthdateValue = { day: string; month: string; year: string };

export function BirthdateInput({
  value,
  onChange,
  onValidityChange,
}: {
  value: BirthdateValue;
  onChange: (v: BirthdateValue) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);

  const { day, month, year } = value;
  const currentYear = new Date().getFullYear();

  const dayNum = parseInt(day, 10);
  const monthNum = parseInt(month, 10);
  const yearNum = parseInt(year, 10);

  const dayValid = day.length === 2 && dayNum >= 1 && dayNum <= 31;
  const monthValid = month.length === 2 && monthNum >= 1 && monthNum <= 12;
  const yearValid =
    year.length === 4 && yearNum >= 1925 && yearNum <= currentYear - 18;

  let ageOk = false;
  if (dayValid && monthValid && yearValid) {
    const dob = new Date(yearNum, monthNum - 1, dayNum);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    ageOk = age >= 18 && dob.getDate() === dayNum && dob.getMonth() === monthNum - 1;
  }

  const allValid = dayValid && monthValid && yearValid && ageOk;

  useEffect(() => {
    onValidityChange?.(allValid);
  }, [allValid, onValidityChange]);

  const showError =
    touched &&
    ((day.length > 0 && !dayValid) ||
      (month.length > 0 && !monthValid) ||
      (year.length === 4 && !yearValid) ||
      (dayValid && monthValid && year.length === 4 && !ageOk));

  const handleChange = (
    field: keyof BirthdateValue,
    maxLen: number,
    nextRef: React.RefObject<HTMLInputElement | null> | null,
  ) => (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, maxLen);
    onChange({ ...value, [field]: raw });
    if (raw.length === maxLen && nextRef?.current) {
      nextRef.current.focus();
    }
  };

  const handleKeyDown = (
    field: keyof BirthdateValue,
    prevRef: React.RefObject<HTMLInputElement | null> | null,
  ) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && value[field].length === 0 && prevRef?.current) {
      prevRef.current.focus();
    }
  };

  const errMsg = (() => {
    if (!showError) return null;
    if (year.length === 4 && yearValid === false && yearNum > currentYear - 18)
      return "Tu dois avoir 18 ans minimum.";
    if (dayValid && monthValid && yearValid && !ageOk) return "Date invalide.";
    return "Format invalide (JJ / MM / AAAA).";
  })();

  const borderClass = showError
    ? "border-[#FA375F]/70 shadow-[0_0_0_3px_color-mix(in_oklab,#FA375F_18%,transparent)]"
    : allValid
      ? "border-[var(--bet-green)]/50"
      : "border-white/10";

  return (
    <div>
      <div
        className={`relative rounded-xl border bg-white/[0.04] px-3.5 pb-1.5 pt-2 transition-all ${borderClass}`}
      >
        <div className="text-[9px] uppercase tracking-widest text-[#FA375F]">
          Date de naissance
        </div>
        <div className="flex items-center gap-1 text-[18px] font-semibold text-foreground">
          <input
            ref={dayRef}
            value={day}
            onChange={handleChange("day", 2, monthRef)}
            onKeyDown={handleKeyDown("day", null)}
            onBlur={() => setTouched(true)}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="JJ"
            enterKeyHint="next"
            aria-label="Jour"
            maxLength={2}
            className="w-9 bg-transparent text-center tabular-nums outline-none placeholder:text-muted-foreground/40"
          />
          <span className="text-muted-foreground/50">/</span>
          <input
            ref={monthRef}
            value={month}
            onChange={handleChange("month", 2, yearRef)}
            onKeyDown={handleKeyDown("month", dayRef)}
            onBlur={() => setTouched(true)}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="MM"
            enterKeyHint="next"
            aria-label="Mois"
            maxLength={2}
            className="w-10 bg-transparent text-center tabular-nums outline-none placeholder:text-muted-foreground/40"
          />
          <span className="text-muted-foreground/50">/</span>
          <input
            ref={yearRef}
            value={year}
            onChange={handleChange("year", 4, null)}
            onKeyDown={handleKeyDown("year", monthRef)}
            onBlur={() => setTouched(true)}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="AAAA"
            enterKeyHint="done"
            aria-label="Année"
            maxLength={4}
            className="w-16 bg-transparent text-center tabular-nums outline-none placeholder:text-muted-foreground/40"
          />
        </div>
      </div>
      <p
        className={`mt-1 pl-1 text-[10.5px] ${
          showError ? "text-[#FA375F]" : "text-muted-foreground/80"
        }`}
      >
        {errMsg ?? "Tu dois avoir 18 ans minimum."}
      </p>
    </div>
  );
}

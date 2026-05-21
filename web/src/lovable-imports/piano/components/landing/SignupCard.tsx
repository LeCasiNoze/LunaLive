import { useState, useEffect, useRef, useMemo, forwardRef, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { BirthdateInput, type BirthdateValue } from "./BirthdateInput";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "@/piano/lib/countries";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

function passwordScore(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

export function SignupCard() {
  const [step, setStep] = useState<1 | 2>(1);
  const [showPw, setShowPw] = useState(false);
  const [accept, setAccept] = useState(true);
  const [values, setValues] = useState({
    username: "",
    email: "",
    password: "",
    phone: "",
  });
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [birth, setBirth] = useState<BirthdateValue>({ day: "", month: "", year: "" });
  const [birthValid, setBirthValid] = useState(false);

  const [touched, setTouched] = useState({
    username: false,
    email: false,
    password: false,
    phone: false,
  });

  const usernameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 1) {
      const t = setTimeout(() => usernameRef.current?.focus(), 250);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => phoneRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [step]);

  const usernameError = touched.username && values.username.trim().length < 3 ? "Min. 3 caractères" : "";
  const emailError = touched.email && !EMAIL_RE.test(values.email) ? "E-mail invalide" : "";
  const passwordError = touched.password && values.password.length < 8 ? "Min. 8 caractères" : "";
  const phoneError = touched.phone && values.phone.replace(/\D/g, "").length < 9 ? "Numéro incomplet" : "";

  const pwScore = useMemo(() => passwordScore(values.password), [values.password]);

  const step1Ready =
    values.username.trim().length >= 3 &&
    EMAIL_RE.test(values.email) &&
    values.password.length >= 8 &&
    accept;

  const onSubmitStep1 = (e: FormEvent) => {
    e.preventDefault();
    setTouched((t) => ({ ...t, username: true, email: true, password: true }));
    if (!accept) return toast.error("Tu dois accepter les conditions");
    if (!step1Ready) return;
    setStep(2);
  };

  const onSubmitStep2 = (e: FormEvent) => {
    e.preventDefault();
    setTouched((t) => ({ ...t, phone: true }));
    if (values.phone.replace(/\D/g, "").length < 9) return;
    if (!birthValid) return;
    toast.success("Maquette — connectez le backend Celsius pour activer l'inscription.");
  };

  const skipStep2 = () => {
    toast.success("Compte créé — tu pourras compléter ton profil plus tard.");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
      className="relative w-full"
    >
      <div
        className="pointer-events-none absolute -inset-px rounded-3xl opacity-70 blur-2xl"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--primary) 45%, transparent), transparent 70%)",
        }}
      />

      <div className="glass relative rounded-3xl p-4">
        <h2 className="mb-1 text-center text-[20px] font-extrabold tracking-tight text-white">
          {step === 1 ? "S'inscrire maintenant" : "Complétez votre profil"}
        </h2>

        <p className="mb-2 text-center text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground">
          Étape {step} sur 2
        </p>

        {/* Stepper 2 segments */}
        <div className="mx-auto mb-3 flex w-32 items-center gap-1.5">
          <div className={`h-[3px] flex-1 rounded-full ${step >= 1 ? "bg-[#FA375F]" : "bg-white/15"}`} />
          <div className={`h-[3px] flex-1 rounded-full ${step >= 2 ? "bg-[var(--bet-green)]" : "bg-white/15"}`} />
        </div>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.form
              key="s1"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              onSubmit={onSubmitStep1}
              className="space-y-2"
            >
              <FloatingInput
                ref={usernameRef}
                label="Nom d'utilisateur"
                value={values.username}
                onChange={(v) => setValues((p) => ({ ...p, username: v }))}
                onBlur={() => setTouched((t) => ({ ...t, username: true }))}
                error={usernameError}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="next"
              />
              <FloatingInput
                label="E-mail"
                type="email"
                value={values.email}
                onChange={(v) => setValues((p) => ({ ...p, email: v }))}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                error={emailError}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="next"
              />
              <FloatingInput
                label="Mot de passe"
                type={showPw ? "text" : "password"}
                value={values.password}
                onChange={(v) => setValues((p) => ({ ...p, password: v }))}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                error={passwordError}
                autoComplete="new-password"
                spellCheck={false}
                enterKeyHint="done"
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPw ? "Masquer" : "Afficher"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              {/* Password strength */}
              {values.password.length > 0 && (
                <div className="flex items-center gap-2 px-1">
                  <div className="flex flex-1 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i < pwScore
                            ? pwScore <= 1
                              ? "bg-[#FA375F]"
                              : pwScore === 2
                                ? "bg-amber-400"
                                : "bg-[var(--bet-green)]"
                            : "bg-white/10"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {pwScore <= 1 ? "Faible" : pwScore === 2 ? "Moyen" : pwScore === 3 ? "Bon" : "Fort"}
                  </span>
                </div>
              )}

              <label className="flex items-start gap-2.5 pt-0.5 text-[11px] leading-snug text-muted-foreground select-none cursor-pointer">
                <button
                  type="button"
                  onClick={() => setAccept((a) => !a)}
                  className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border transition-all ${
                    accept ? "border-[#FA375F] bg-[#FA375F]" : "border-white/20 bg-white/5"
                  }`}
                  aria-pressed={accept}
                  aria-label="Accepter les conditions"
                >
                  {accept && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </button>
                <span>
                  J'ai 18 ans et j'accepte les{" "}
                  <a href="#" className="text-foreground underline underline-offset-2">conditions</a>.
                </span>
              </label>

              <CtaButton label="Commence ton voyage" disabled={!step1Ready} />

              <div className="my-2 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">ou</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <button
                type="button"
                onClick={() => toast.message("Connectez Google OAuth côté Celsius")}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-2.5 text-[13px] font-semibold text-zinc-900 transition-transform active:scale-[0.98]"
              >
                <GoogleIcon /> Continuer avec Google
              </button>

              <p className="pt-0.5 text-center text-[11px] text-muted-foreground">
                Déjà inscrit ?{" "}
                <a href="#" className="font-semibold text-foreground underline underline-offset-2">
                  Se connecter
                </a>
              </p>
            </motion.form>
          ) : (
            <motion.form
              key="s2"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              onSubmit={onSubmitStep2}
              className="space-y-2"
            >
              {/* Téléphone avec préfixe pays sélectionnable */}
              <PhoneInput
                ref={phoneRef}
                value={values.phone}
                onChange={(v) => setValues((p) => ({ ...p, phone: formatPhone(v) }))}
                onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                error={phoneError}
                country={country}
                onCountryChange={setCountry}
              />

              <BirthdateInput
                value={birth}
                onChange={setBirth}
                onValidityChange={setBirthValid}
              />

              <CountrySelect country={country} onChange={setCountry} />

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full border border-white/15 bg-white/[0.03] py-3 text-[13px] font-semibold text-white/80 transition-colors hover:bg-white/[0.07]"
                >
                  Retour
                </button>
                <CtaButton label="Créer mon compte" />
              </div>

              <button
                type="button"
                onClick={skipStep2}
                className="block w-full pt-1 text-center text-[11.5px] font-medium text-muted-foreground underline-offset-2 hover:text-white hover:underline"
              >
                Compléter plus tard
              </button>

              <p className="pt-0.5 text-center text-[10.5px] text-muted-foreground">
                Tes infos restent confidentielles
              </p>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function CtaButton({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <motion.button
      type="submit"
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      disabled={disabled}
      className={`cta-gradient relative w-full overflow-hidden rounded-full py-3 text-[13px] font-extrabold uppercase tracking-wide text-white shadow-glow-celsius transition-opacity ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
    >
      <span className="relative z-10">{label}</span>
      {!disabled && (
        <motion.span
          aria-hidden
          className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-white/30"
          animate={{ x: ["0%", "500%"] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.6 }}
        />
      )}
    </motion.button>
  );
}

type FloatingInputProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  type?: string;
  rightIcon?: React.ReactNode;
  autoComplete?: string;
  autoCapitalize?: string;
  spellCheck?: boolean;
  enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  placeholder?: string;
  error?: string;
};

const FloatingInput = forwardRef<HTMLInputElement, FloatingInputProps>(function FloatingInput(
  {
    label,
    value,
    onChange,
    onBlur,
    type = "text",
    rightIcon,
    autoComplete,
    autoCapitalize,
    spellCheck,
    enterKeyHint,
    placeholder,
    error,
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const float = focused || value.length > 0;
  const hasError = !!error;

  return (
    <div>
      <div
        className={`relative rounded-xl border bg-white/[0.04] transition-all ${
          hasError
            ? "border-[#FA375F]/70"
            : focused
              ? "border-[#FA375F]/60 shadow-glow-celsius"
              : "border-white/10"
        }`}
      >
        <label
          className={`pointer-events-none absolute left-3.5 transition-all ${
            float
              ? "top-1 text-[9px] uppercase tracking-widest text-[#FA375F]"
              : "top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground"
          }`}
        >
          {label}
        </label>
        <input
          ref={ref}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          placeholder={float ? placeholder : ""}
          className="w-full bg-transparent px-3.5 pb-1.5 pt-4 text-[16px] text-foreground outline-none placeholder:text-muted-foreground/50"
          autoComplete={autoComplete}
          autoCapitalize={autoCapitalize}
          spellCheck={spellCheck}
          enterKeyHint={enterKeyHint}
          inputMode={type === "email" ? "email" : type === "tel" ? "tel" : undefined}
        />
        {rightIcon && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{rightIcon}</div>}
      </div>
      {hasError && (
        <p className="mt-1 pl-1 text-[10.5px] font-medium text-[#FA375F]">{error}</p>
      )}
    </div>
  );
});

type PhoneProps = {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  country: Country;
  onCountryChange: (c: Country) => void;
};

const PhoneInput = forwardRef<HTMLInputElement, PhoneProps>(function PhoneInput(
  { value, onChange, onBlur, error, country, onCountryChange },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const float = focused || value.length > 0;
  const hasError = !!error;
  return (
    <div>
      <div
        className={`relative flex items-stretch rounded-xl border bg-white/[0.04] transition-all ${
          hasError
            ? "border-[#FA375F]/70"
            : focused
              ? "border-[#FA375F]/60 shadow-glow-celsius"
              : "border-white/10"
        }`}
      >
        {/* Préfixe pays cliquable (native select overlay pour mobile) */}
        <label className="relative flex cursor-pointer items-center gap-1 border-r border-white/10 pl-3 pr-2 text-[14px] active:opacity-70">
          <span aria-hidden className="text-[16px] leading-none">{country.flag}</span>
          <span className="text-[12px] font-semibold text-white/90">{country.dial}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
          <select
            aria-label="Indicatif pays"
            value={country.code}
            onChange={(e) => {
              const next = COUNTRIES.find((c) => c.code === e.target.value);
              if (next) onCountryChange(next);
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code} className="bg-[color:var(--surface)] text-foreground">
                {c.flag} {c.name} ({c.dial})
              </option>
            ))}
          </select>
        </label>

        <div className="relative flex-1">
          <label
            className={`pointer-events-none absolute left-3 transition-all ${
              float
                ? "top-1 text-[9px] uppercase tracking-widest text-[#FA375F]"
                : "top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground"
            }`}
          >
            Numéro de téléphone
          </label>
          <input
            ref={ref}
            type="tel"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              onBlur?.();
            }}
            placeholder={float ? "6 12 34 56 78" : ""}
            className="w-full bg-transparent px-3 pb-1.5 pt-4 text-[16px] text-foreground outline-none placeholder:text-muted-foreground/50"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="next"
          />
        </div>
      </div>
      {hasError && (
        <p className="mt-1 pl-1 text-[10.5px] font-medium text-[#FA375F]">{error}</p>
      )}
    </div>
  );
});

function CountrySelect({
  country,
  onChange,
}: {
  country: Country;
  onChange: (c: Country) => void;
}) {
  return (
    <div className="relative rounded-xl border border-white/10 bg-white/[0.04] transition-all focus-within:border-[#FA375F]/60 focus-within:shadow-glow-celsius">
      <label className="pointer-events-none absolute left-3 top-1 text-[9px] uppercase tracking-widest text-[#FA375F]">
        Pays de résidence
      </label>
      <div className="flex items-center gap-2 px-3 pb-1.5 pt-4 pr-8">
        <span aria-hidden className="text-[16px] leading-none">{country.flag}</span>
        <span className="text-[14px] font-semibold text-foreground">{country.name}</span>
      </div>
      <select
        aria-label="Pays de résidence"
        value={country.code}
        onChange={(e) => {
          const next = COUNTRIES.find((c) => c.code === e.target.value);
          if (next) onChange(next);
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code} className="bg-[color:var(--surface)] text-foreground">
            {c.flag} {c.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative rounded-xl border border-white/10 bg-white/[0.04] transition-all focus-within:border-[#FA375F]/60 focus-within:shadow-glow-celsius">
      <label className="pointer-events-none absolute left-3 top-1 text-[9px] uppercase tracking-widest text-[#FA375F]">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-transparent px-3 pb-1.5 pt-4 pr-8 text-[14px] font-semibold text-foreground outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-[color:var(--surface)] text-foreground">
            {o}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}

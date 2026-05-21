import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

export function LoginModal({
  open,
  onOpenChange,
  onSwitchToSignup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitchToSignup: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error("Renseigne email et mot de passe");
    toast.success("Maquette — connectez le backend Celsius pour activer la connexion.");
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[95vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[color:var(--background)] shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom duration-300 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
        >
          <DialogPrimitive.Title className="sr-only">
            Connexion Celsius Piano
          </DialogPrimitive.Title>

          <DialogPrimitive.Close
            className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-black/60"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>

          <div className="absolute inset-x-0 top-2 z-20 mx-auto h-1 w-10 rounded-full bg-white/30 sm:hidden" />

          <div className="relative px-5 pb-6 pt-10">
            <h2 className="mb-1 text-center text-[22px] font-extrabold tracking-tight text-white">
              Content de te revoir 👋
            </h2>
            <p className="mb-5 text-center text-[12px] text-muted-foreground">
              Connecte-toi à ton compte Celsius
            </p>

            <form onSubmit={onSubmit} className="space-y-2.5">
              <div className="relative rounded-xl border border-white/10 bg-white/[0.04] focus-within:border-[#FA375F]/60 focus-within:shadow-glow-celsius">
                <label className="pointer-events-none absolute left-3.5 top-1 text-[9px] uppercase tracking-widest text-[#FA375F]">
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="email"
                  enterKeyHint="next"
                  className="w-full bg-transparent px-3.5 pb-2 pt-5 text-[16px] text-foreground outline-none"
                />
              </div>

              <div className="relative rounded-xl border border-white/10 bg-white/[0.04] focus-within:border-[#FA375F]/60 focus-within:shadow-glow-celsius">
                <label className="pointer-events-none absolute left-3.5 top-1 text-[9px] uppercase tracking-widest text-[#FA375F]">
                  Mot de passe
                </label>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  spellCheck={false}
                  enterKeyHint="done"
                  className="w-full bg-transparent px-3.5 pb-2 pt-5 pr-10 text-[16px] text-foreground outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPw ? "Masquer" : "Afficher"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex justify-end">
                <a href="#" className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-white hover:underline">
                  Mot de passe oublié ?
                </a>
              </div>

              <motion.button
                type="submit"
                whileTap={{ scale: 0.97 }}
                className="cta-gradient relative mt-1 w-full overflow-hidden rounded-full py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-white shadow-glow-celsius"
              >
                <span className="relative z-10">Se connecter</span>
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-white/30"
                  animate={{ x: ["0%", "500%"] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.6 }}
                />
              </motion.button>
            </form>

            <p className="mt-4 text-center text-[12px] text-muted-foreground">
              Pas encore de compte ?{" "}
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  setTimeout(onSwitchToSignup, 150);
                }}
                className="font-bold text-white underline underline-offset-2"
              >
                S'inscrire
              </button>
            </p>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

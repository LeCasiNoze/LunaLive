import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { SignupCard } from "./SignupCard";
import playmeBanner from "@/piano/assets/playme.webp";
import streamerAvatar from "@/piano/assets/streamer-avatar.png";

export function SignupModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[95vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[color:var(--background)] shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom duration-300 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
        >
          <DialogPrimitive.Title className="sr-only">
            Inscription Celsius Piano
          </DialogPrimitive.Title>

          <DialogPrimitive.Close
            className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-black/60"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>

          {/* drag handle (mobile feel) */}
          <div className="absolute inset-x-0 top-2 z-20 mx-auto h-1 w-10 rounded-full bg-white/30 sm:hidden" />

          <div className="relative overflow-y-auto">
            {/* PlayMe banner */}
            <div className="relative">
              <img
                src={playmeBanner}
                alt="Jeu Piano Celsius PlayMe"
                className="h-auto w-full object-cover"
              />
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--background) 95%, transparent))",
                }}
              />
            </div>

            <div className="relative -mt-6 px-4 pb-5">
              {/* Social proof */}
              <div className="mb-3 flex items-center justify-center gap-2">
                <div className="flex -space-x-2">
                  {[0, 1, 2].map((i) => (
                    <img
                      key={i}
                      src={streamerAvatar}
                      alt=""
                      className="h-6 w-6 rounded-full border-2 border-[color:var(--background)] object-cover"
                    />
                  ))}
                </div>
                <p className="text-[10.5px] font-medium text-muted-foreground">
                  Rejoins tes influenceurs préférés —{" "}
                  <span className="font-bold text-white">50+ sur Celsius</span>
                </p>
              </div>

              <SignupCard />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

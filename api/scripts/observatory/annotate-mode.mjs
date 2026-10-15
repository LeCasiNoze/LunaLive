// An observation annotation only. Never controls OBS, AutoMod or publication.
import { readFile, writeFile, rename } from "node:fs/promises";
const [file, mode, startText, endText, ...evidence] = process.argv.slice(2);
const start = Date.parse(startText),
  end = Date.parse(endText);
if (
  !file ||
  !["personal", "automod"].includes(mode) ||
  !Number.isFinite(start) ||
  !Number.isFinite(end) ||
  end <= start ||
  end > Date.now() + 60000 ||
  !evidence.length
)
  throw new Error(
    "Usage: node annotate-mode.mjs CONFIG personal|automod START_ISO END_ISO EVIDENCE (verified elapsed interval only)",
  );
const cfg = JSON.parse(await readFile(file, "utf8"));
cfg.modes ??= [];
if (cfg.modes.some((i) => start < i.end && end > i.start))
  throw new Error("overlapping_mode_interval");
cfg.modes.push({
  start,
  end,
  mode,
  evidence: evidence.join(" ").slice(0, 300),
});
cfg.modes.sort((a, b) => a.start - b.start);
await writeFile(file + ".tmp", JSON.stringify(cfg, null, 2) + "\n", {
  mode: 0o644,
});
await rename(file + ".tmp", file);
console.log(
  "Verified interval saved; the observatory reloads annotations within one minute.",
);

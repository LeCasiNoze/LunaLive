// web/src/components/dashboard/sections/StreamSection.tsx
import type { ApiMyStreamer } from "../../../lib/api";

import { TitleEditorCard } from "../TitleEditorCard";
import { StreamKeysCard } from "../StreamKeysCard";

export function StreamSection({
  streamer,
  onSaveTitle,
}: {
  streamer: ApiMyStreamer;
  onSaveTitle: (title: string) => Promise<void>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <TitleEditorCard streamer={streamer} onSave={onSaveTitle} />
      <StreamKeysCard />
    </div>
  );
}

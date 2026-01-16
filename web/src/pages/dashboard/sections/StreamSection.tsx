// web/src/components/dashboard/sections/StreamSection.tsx
import type { ApiMyStreamer, ApiStreamConnection } from "../../../lib/api";

import { TitleEditorCard } from "../TitleEditorCard";
import { StreamKeysCard } from "../StreamKeysCard";

export function StreamSection({
  streamer,
  connection,
  onSaveTitle,
}: {
  streamer: ApiMyStreamer;
  connection: ApiStreamConnection | null;
  onSaveTitle: (title: string) => Promise<void>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <TitleEditorCard streamer={streamer} onSave={onSaveTitle} />
      <StreamKeysCard connection={connection} />
    </div>
  );
}

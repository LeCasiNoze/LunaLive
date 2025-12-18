import type { ApiMyStreamer, ApiStreamConnection } from "../../../lib/api";

import { TitleEditorCard } from "../TitleEditorCard";
import { StreamKeysCard } from "../StreamKeysCard";
import { PlaceholdersCard } from "../PlaceholdersCard";

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TitleEditorCard
        streamer={streamer}
        onSave={onSaveTitle}
      />

      <StreamKeysCard connection={connection} />

      <PlaceholdersCard />
    </div>
  );
}

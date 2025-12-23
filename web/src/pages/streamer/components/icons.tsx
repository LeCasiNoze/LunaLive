// web/src/pages/streamer/components/icons.tsx
export function EyeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function ChatIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 13.5c0 1.4-.6 2.7-1.6 3.6-1.4 1.3-3.6 2.1-6.1 2.1-.7 0-1.5-.1-2.2-.2L5 20l1-2.8c-1.3-1-2-2.3-2-3.7 0-3.5 3.6-6.3 8-6.3s8 2.8 8 6.3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8.2 13.3h.01M12 13.3h.01M15.8 13.3h.01"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BellIcon({ size = 18, on = true }: { size?: number; on?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22c1.2 0 2.1-.9 2.1-2.1H9.9C9.9 21.1 10.8 22 12 22Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M18 8.8c0-3.3-2.1-5.8-6-5.8s-6 2.5-6 5.8c0 3.8-1.4 5.1-2.3 6.1-.5.6-.1 1.6.7 1.6h15.2c.8 0 1.2-1 .7-1.6-.9-1-2.3-2.3-2.3-6.1Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      {on ? (
        <path
          d="M19.2 4.8c1.1 1 1.8 2.4 1.8 4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      ) : (
        <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  );
}

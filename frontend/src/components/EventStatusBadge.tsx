const S: Record<string,{ bg:string; color:string; border:string; dot:string }> = {
  received:     { bg:"rgba(63,63,70,.3)",  color:"#71717a", border:"#3f3f46", dot:"#52525b" },
  queued:       { bg:"rgba(96,165,250,.1)",color:"#60a5fa", border:"rgba(96,165,250,.3)",  dot:"#60a5fa" },
  processing:   { bg:"rgba(251,191,36,.1)",color:"#fbbf24", border:"rgba(251,191,36,.3)",  dot:"#f59e0b" },
  succeeded:    { bg:"rgba(74,222,128,.1)",color:"#4ade80", border:"rgba(74,222,128,.3)",  dot:"#22c55e" },
  failed:       { bg:"rgba(248,113,113,.1)",color:"#f87171",border:"rgba(248,113,113,.3)", dot:"#ef4444" },
  retrying:     { bg:"rgba(251,146,60,.1)",color:"#fb923c", border:"rgba(251,146,60,.3)",  dot:"#f97316" },
  dead_lettered:{ bg:"rgba(248,113,113,.12)",color:"#fca5a5",border:"rgba(248,113,113,.3)",dot:"#f87171" },
  replayed:     { bg:"rgba(167,139,250,.1)",color:"#a78bfa",border:"rgba(167,139,250,.3)", dot:"#8b5cf6" },
  cancelled:    { bg:"rgba(63,63,70,.3)",  color:"#52525b", border:"#3f3f46", dot:"#3f3f46" },
  pending:      { bg:"rgba(96,165,250,.1)",color:"#60a5fa", border:"rgba(96,165,250,.3)",  dot:"#60a5fa" },
};

export function EventStatusBadge({ status }: { status: string }) {
  const s = S[status] ?? S.received;
  return (
    <span className="badge" style={{ background:s.bg, color:s.color, borderColor:s.border }}>
      <span className="dot" style={{ background:s.dot }} />
      {status.replace(/_/g," ")}
    </span>
  );
}

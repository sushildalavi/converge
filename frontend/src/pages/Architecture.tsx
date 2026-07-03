import { FadeUp, SI, Stagger } from "../components/Animated";

const nodes = [
  "FastAPI control plane",
  "Transactional outbox",
  "Redis Streams",
  "Go replay workers",
  "PostgreSQL claim locking",
  "Supabase-backed trace store",
  "OpenAI / Gemini judge layer",
  "React dashboard on Vercel",
];

const lifecycle = [
  "Ingest agent step or generic workflow event through FastAPI",
  "Persist event + outbox row in PostgreSQL in one transaction",
  "Publish to Redis Streams or recover unpublished outbox rows",
  "Claim work in Go workers with database-before-ack ordering",
  "Write trace, eval, and comparison artifacts to Supabase-backed Postgres",
  "Compare original vs replayed traces with OpenAI or Gemini judges",
  "Render confidence, DLQ, and convergence evidence in the Vercel dashboard",
];

export default function Architecture() {
  return (
    <div className="page-stack">
      <FadeUp>
        <div className="page-toolbar">
          <div>
            <div className="eyebrow">System Architecture</div>
            <h2 className="page-heading">AI workflow recovery platform</h2>
            <p className="page-copy">
              The stack is organized around trace recovery, replay confidence, Supabase-backed storage, and evidence-backed convergence.
            </p>
          </div>
        </div>
      </FadeUp>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="panel-title">Component map</p>
            <p className="panel-copy">Core surfaces that support replay, evaluation, and chaos evidence.</p>
          </div>
        </div>
        <div className="architecture-grid">
          {nodes.map((node, index) => (
            <div key={node} className="architecture-node">
              <span className="architecture-index">{String(index + 1).padStart(2, "0")}</span>
              <p>{node}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="two-column-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-title">Replay lifecycle</p>
            </div>
          </div>
          <Stagger className="stack-list">
            {lifecycle.map((item) => (
              <SI key={item}>
                <div className="note-row">{item}</div>
              </SI>
            ))}
          </Stagger>
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-title">Truth boundaries</p>
            </div>
          </div>
          <div className="stack-list">
            <div className="note-row">No benchmark claim appears in the UI unless it comes from a checked-in JSON artifact or a freshly generated local run.</div>
            <div className="note-row">External judges are optional; deterministic fake judges are the default for local tests and offline runs.</div>
            <div className="note-row">The outbox closes the DB-commit / Redis-publish gap with recovery instead of best-effort logging.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

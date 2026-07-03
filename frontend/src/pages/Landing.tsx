import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  ArrowDownRight,
} from "lucide-react";
import {
  appRoutes,
  architectureNodes,
  demoFlow,
  featureCards,
  formatRate,
  formatSeconds,
  heroStats,
  lifecycleSteps,
  measuredArtifacts,
  productProblems,
} from "../data/recoveryProduct";
import { FadeUp, SI, Stagger } from "../components/Animated";

function SectionTitle({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div style={{ maxWidth: 760 }}>
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="section-title">{title}</h2>
      <p className="section-copy">{copy}</p>
    </div>
  );
}

function ArtifactCard({ title, artifact }: { title: string; artifact: (typeof measuredArtifacts)[number] }) {
  return (
    <div className="artifact-card">
      <div className="artifact-head">
        <div>
          <div className="eyebrow">{title}</div>
          <p className="artifact-title">{artifact.title}</p>
          <p className="artifact-source">{artifact.source}</p>
        </div>
        <span className={artifact.kind === "chaos" ? "status-pill status-pill-chaos" : "status-pill status-pill-benchmark"}>
          {artifact.kind}
        </span>
      </div>

      <div className="artifact-stats">
        <div>
          <p className="artifact-stat-value">{artifact.submitted}</p>
          <p className="artifact-stat-label">Submitted</p>
        </div>
        <div>
          <p className="artifact-stat-value">{formatSeconds(artifact.recovery_time_seconds)}</p>
          <p className="artifact-stat-label">Recovery time</p>
        </div>
        <div>
          <p className="artifact-stat-value">{formatRate(artifact.end_to_end_throughput_events_per_sec)}</p>
          <p className="artifact-stat-label">End-to-end</p>
        </div>
        <div>
          <p className="artifact-stat-value">{artifact.dead_letters}</p>
          <p className="artifact-stat-label">DLQ</p>
        </div>
      </div>

      <p className="artifact-note">{artifact.note}</p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="landing-page">
      <section className="hero-shell">
        <FadeUp>
          <div className="hero-badge">
            <ShieldCheck size={12} />
            AI workflow recovery and agent-execution reliability
          </div>
          <div className="hero-grid">
            <div className="hero-copy">
              <h1>Replay failed agent workflows until the system converges.</h1>
              <p className="hero-subtitle">
                Converge follows events from FastAPI into Redis Streams, Go workers, and PostgreSQL claim state,
                then stores trace and recovery evidence in Supabase-backed Postgres before rendering the dashboard on
                Vercel. It shows retries, DLQ replay, worker heartbeats, and benchmark evidence without inflating claims.
              </p>

              <div className="hero-actions">
                <Link className="btn-amber hero-cta" to="/app">
                  Open AI Console
                  <ArrowRight size={13} />
                </Link>
                <Link className="btn-outline hero-cta" to="/app/benchmarks">
                  Open Benchmark Explorer
                  <ArrowDownRight size={13} />
                </Link>
                <a className="hero-link" href="https://github.com/sushildalavi/converge" target="_blank" rel="noreferrer">
                  <ExternalLink size={13} />
                  GitHub
                </a>
              </div>

              <div className="hero-proof">
                {heroStats.map((item) => (
                  <div key={item.label} className="hero-proof-card">
                    <p className="hero-proof-value">{item.value}</p>
                    <p className="hero-proof-label">{item.label}</p>
                    <p className="hero-proof-copy">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="hero-console">
              <div className="hero-console-header">
                <p className="eyebrow">Guided AI-ops demo</p>
                <p className="hero-console-title">What the operator sees</p>
              </div>
              <div className="hero-demo-grid">
                {demoFlow.map((item) => (
                  <div key={item.label} className="hero-demo-card">
                    <p className="hero-demo-label">{item.label}</p>
                    <p className="hero-demo-value">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="hero-console-footer">
                <span className="mono">Measured from benchmarks/benchmark_replay_20260702T213707Z.json</span>
              </div>
            </div>
          </div>
        </FadeUp>
      </section>

      <section className="section-shell">
        <SectionTitle
          eyebrow="Why it exists"
          title="Operators need proof of recovery, not a dashboard full of green lights."
          copy="Converge is built for the failure modes that matter in distributed systems: partial commits, stuck pending entries, retries that duplicate work, and DLQ items that need a traceable replay path."
        />

        <div className="problem-grid">
          <div className="problem-card">
            <p className="eyebrow">Operational pain points</p>
            <ul className="problem-list">
              {productProblems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>

          <div className="lifecycle-card">
            <div className="lifecycle-head">
              <p className="eyebrow">Event lifecycle</p>
              <p className="lifecycle-title">A clean recovery path from ingest to convergence</p>
            </div>
            <div className="lifecycle-flow">
              {lifecycleSteps.map((step, index) => (
                <motion.div
                  key={step}
                  className="lifecycle-step"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <span className="lifecycle-index">{String(index + 1).padStart(2, "0")}</span>
                  <span>{step}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell">
        <SectionTitle
          eyebrow="How it works"
          title="A recovery engine with a clear lifecycle, explicit checkpoints, and no chatbot detour."
          copy="The app is organised around operator tasks: inspect the worker fleet, check stream backlog, replay dead letters, verify convergence, and review measured chaos artifacts."
        />

        <Stagger className="feature-grid">
          {featureCards.map((card) => (
            <SI key={card.title}>
              <div className="feature-card">
                <p className="feature-title">{card.title}</p>
                <p className="feature-copy">{card.description}</p>
              </div>
            </SI>
          ))}
        </Stagger>
      </section>

      <section className="section-shell">
        <SectionTitle
          eyebrow="Console preview"
          title="The app surface is split by operational job, not by generic AI features."
          copy="Each route is focused on a single question: what is the worker fleet doing, what is stuck in Redis, what should be replayed, and did the system converge?"
        />

        <div className="route-grid">
          {appRoutes.map((route) => (
            <Link key={route.to} to={route.to} className="route-card">
              <p className="route-label">{route.label}</p>
              <p className="route-copy">{route.description}</p>
              <span className="route-arrow">
                Open
                <ArrowRight size={12} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-shell">
        <SectionTitle
          eyebrow="Benchmark and chaos"
          title="Only real measured values from checked-in artifacts are shown here."
          copy="The latest replay artifact and the latest chaos artifact are surfaced directly so the site can stand up to technical review."
        />

        <div className="artifact-grid">
          <ArtifactCard title="Latest replay artifact" artifact={measuredArtifacts[0]} />
          <ArtifactCard title="Latest chaos artifact" artifact={measuredArtifacts[1]} />
        </div>
      </section>

      <section className="section-shell">
        <SectionTitle
          eyebrow="Architecture"
          title="A clean recovery stack with no unnecessary platform bloat."
          copy="FastAPI orchestrates the control plane, Redis Streams buffers work, Go workers process events, PostgreSQL stores runtime state, and the React console gives operators a readable view of the system."
        />

        <div className="architecture-card">
          <div className="architecture-flow">
            <div className="architecture-node">FastAPI Control Plane</div>
            <div className="architecture-node">Redis Streams</div>
            <div className="architecture-node">Go Workers</div>
            <div className="architecture-node">PostgreSQL</div>
            <div className="architecture-node">React Console</div>
            <div className="architecture-node">Docker Compose</div>
          </div>
          <div className="architecture-links">
            {architectureNodes.map((node) => (
              <span key={node}>{node}</span>
            ))}
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div>
          <p className="footer-title">Converge</p>
          <p className="footer-copy">Recovery Intelligence & Crash-Safe Replay Platform</p>
        </div>
        <div className="footer-links">
          <Link to="/app">AI Console</Link>
          <Link to="/app/chaos">Chaos Results</Link>
          <Link to="/app/convergence">Convergence</Link>
          <a href="https://github.com/sushildalavi/converge" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </footer>
    </div>
  );
}

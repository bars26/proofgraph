"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const CAPABILITIES = ["Research", "Coding", "Solidity Audit", "Data Analysis"] as const;
type Capability = (typeof CAPABILITIES)[number];
const PRESETS = ["2", "6", "42", "7"];
const SPEC_URL = "https://github.com/bars26/proofgraph/blob/v2/SPEC.md";
const EXPLORER = "https://testnet.arcscan.app";

type Term = {
  key: string;
  value: number;
  weight: number;
  applicable: boolean;
  contribution: number;
};
type EvidenceRow = {
  id: number;
  outcome: "Success" | "Failure" | "Disputed";
  verifier: string;
  counterparty: string;
  at: string;
  performedAt: string | null;
  uri: string;
  evidenceHash: string;
  verified: boolean | null;
  verifyReason: string;
};
type CapScore = {
  capability: Capability;
  score: number;
  confidence: "none" | "low" | "medium" | "high";
  penalty: number;
  counts: {
    evidence: number;
    verifiers: number;
    counterparties: number;
    successes: number;
    failures: number;
    disputed: number;
  };
  successRate: number | null;
  lastEvidenceAt: string | null;
  reasons: string[];
  terms: Term[];
  evidence: EvidenceRow[];
};
type Scorecard = {
  agent: {
    agentId: string;
    owner: string;
    cardUri: string;
    card:
      | { ok: true; source: string; card: { name?: string; description?: string; skills: string[]; endpoints: Record<string, string> } }
      | { ok: false; reason: string };
  };
  erc8004: {
    signal: { repMean01: number; validationPassRate: number } | null;
    reputation: { total: number; active: number; revoked: number; meanValue01: number | null; tags: Record<string, number> };
    validations: unknown[];
  };
  capabilities: CapScore[];
  formulaVersion: string;
  computedAt: string;
};

const CONF_STYLE: Record<CapScore["confidence"], string> = {
  none: "border-slate-700 bg-slate-800 text-slate-400",
  low: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  medium: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  high: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
};
const OUTCOME_STYLE: Record<EvidenceRow["outcome"], string> = {
  Success: "bg-emerald-400/10 text-emerald-300",
  Failure: "bg-red-400/10 text-red-300",
  Disputed: "bg-amber-400/10 text-amber-300",
};
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function V2Page() {
  const [input, setInput] = useState("42");
  const [agentId, setAgentId] = useState("42");
  const [data, setData] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Capability>("Solidity Audit");

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/v2/api/agents/${encodeURIComponent(agentId)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.hint || j.error || `HTTP ${r.status}`);
        if (!ignore) setData(j as Scorecard);
      } catch (e) {
        if (!ignore) {
          setData(null);
          setError((e as Error).message);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    void run();
    return () => {
      ignore = true;
    };
  }, [agentId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) setAgentId(input.trim());
  };

  const cap = useMemo(() => data?.capabilities.find((c) => c.capability === tab), [data, tab]);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              ProofGraph <span className="text-cyan-400">V2</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Task-aware agent trust, backed by verifiable evidence + ERC-8004 signals.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/" className="text-slate-400 underline-offset-2 hover:text-cyan-300 hover:underline">
              ← V1
            </Link>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-300">
              Arc Testnet
            </span>
          </div>
        </header>

        <form onSubmit={submit} className="mb-6 flex flex-wrap items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ERC-8004 agentId or 0x address"
            className="w-72 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            className="rounded-lg border border-cyan-400/50 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-400/20"
          >
            Score
          </button>
          <span className="ml-2 text-xs text-slate-500">seed agents:</span>
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setInput(p);
                setAgentId(p);
              }}
              className={`rounded-md border px-2.5 py-1 text-xs transition ${
                agentId === p
                  ? "border-cyan-400 text-cyan-300"
                  : "border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
            >
              #{p}
            </button>
          ))}
        </form>

        {loading && <p className="text-sm text-slate-400">Reading Arc Testnet…</p>}
        {error && (
          <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {data && !loading && (
          <>
            <IdentityPanel data={data} />
            <Erc8004Panel data={data} />

            <div className="mt-8 flex flex-wrap gap-2">
              {CAPABILITIES.map((c) => {
                const s = data.capabilities.find((x) => x.capability === c);
                const active = tab === c;
                return (
                  <button
                    key={c}
                    onClick={() => setTab(c)}
                    className={`rounded-xl border px-4 py-2.5 text-left text-sm transition ${
                      active
                        ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                        : "border-slate-800 bg-slate-900 hover:border-slate-600"
                    }`}
                  >
                    <span className="font-medium">{c}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {s && s.confidence !== "none" ? `${s.score}` : "—"}
                    </span>
                  </button>
                );
              })}
            </div>

            {cap && <CapabilityPanel cap={cap} agentId={data.agent.agentId} formulaVersion={data.formulaVersion} />}
          </>
        )}

        <footer className="mt-16 border-t border-slate-800 pt-6 text-xs text-slate-600">
          {data && (
            <>
              formula {data.formulaVersion} · computed {new Date(data.computedAt).toUTCString()} ·{" "}
            </>
          )}
          ProofGraph scores are advisory, not a guarantee.{" "}
          <a href={SPEC_URL} className="underline hover:text-slate-400">
            spec
          </a>
        </footer>
      </div>
    </main>
  );
}

function IdentityPanel({ data }: { data: Scorecard }) {
  const { agent } = data;
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">ERC-8004 identity</p>
          <p className="mt-1 text-lg font-semibold">
            {agent.card.ok && agent.card.card.name ? agent.card.card.name : `Agent #${agent.agentId}`}
            <span className="ml-2 text-sm font-normal text-slate-500">agentId {agent.agentId}</span>
          </p>
          <a
            href={`${EXPLORER}/address/${agent.owner}`}
            className="mt-1 block text-xs text-slate-400 hover:text-cyan-300"
          >
            owner {short(agent.owner)}
          </a>
        </div>
        <div className="max-w-xs text-right text-xs">
          {agent.card.ok ? (
            <>
              {agent.card.card.skills.length > 0 && (
                <p className="text-slate-400">skills: {agent.card.card.skills.join(", ")}</p>
              )}
              {Object.entries(agent.card.card.endpoints).map(([k, v]) => (
                <p key={k} className="truncate text-slate-500">
                  {k}: {v}
                </p>
              ))}
            </>
          ) : (
            <p className="text-slate-600">agent card: {agent.card.reason}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Erc8004Panel({ data }: { data: Scorecard }) {
  const { erc8004 } = data;
  const tags = Object.entries(erc8004.reputation.tags).sort((a, b) => b[1] - a[1]);
  return (
    <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs uppercase tracking-widest text-slate-500">ERC-8004 signal</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <Stat
          label="reputation"
          value={erc8004.reputation.meanValue01 == null ? "—" : erc8004.reputation.meanValue01.toFixed(2)}
          sub={`${erc8004.reputation.active} feedback`}
        />
        <Stat
          label="validation pass rate"
          value={erc8004.signal ? erc8004.signal.validationPassRate.toFixed(2) : "—"}
          sub={`${erc8004.validations.length} validations`}
        />
        <Stat
          label="feeds scoring"
          value={erc8004.signal ? "yes" : "no"}
          sub={erc8004.signal ? "erc8004 term active" : "term dropped"}
        />
      </div>
      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map(([t, n]) => (
            <span key={t} className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-400">
              {t} <span className="text-slate-600">×{n}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-slate-950 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      <p className="text-xs text-slate-600">{sub}</p>
    </div>
  );
}

function CapabilityPanel({
  cap,
  agentId,
  formulaVersion,
}: {
  cap: CapScore;
  agentId: string;
  formulaVersion: string;
}) {
  const curl = `curl "${typeof window !== "undefined" ? window.location.origin : ""}/v2/api/score?agent=${agentId}&capability=${encodeURIComponent(cap.capability)}"`;
  return (
    <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">{cap.capability}</p>
          <div className="mt-1 flex items-end gap-3">
            <span className="text-5xl font-bold text-cyan-300">
              {cap.confidence === "none" ? "—" : cap.score}
            </span>
            <span
              className={`mb-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${CONF_STYLE[cap.confidence]}`}
            >
              {cap.confidence}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center text-xs">
          <Mini label="evidence" value={cap.counts.evidence} />
          <Mini label="verifiers" value={cap.counts.verifiers} />
          <Mini
            label="success"
            value={cap.successRate == null ? "—" : `${Math.round(cap.successRate * 100)}%`}
          />
        </div>
      </div>

      {cap.confidence === "none" ? (
        <p className="mt-6 text-sm text-slate-500">No evidence for this agent + capability yet.</p>
      ) : (
        <>
          <div className="mt-6 space-y-3">
            {cap.terms.map((t) => (
              <div key={t.key}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className={t.applicable ? "text-slate-300" : "text-slate-600"}>
                    {t.key}
                    <span className="ml-1 text-slate-600">w{t.weight}</span>
                  </span>
                  <span className="text-slate-500">
                    {t.applicable ? `${t.value.toFixed(2)} → +${(t.contribution * 100).toFixed(1)}` : "not assessed"}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full ${t.applicable ? "bg-cyan-400" : "bg-slate-700"}`}
                    style={{ width: `${Math.round((t.applicable ? t.value : 0) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {cap.penalty > 0 && (
              <p className="text-xs text-amber-300">dispute penalty ×{(1 - cap.penalty).toFixed(2)}</p>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Why this score
            </p>
            <ul className="space-y-1 text-sm text-slate-300">
              {cap.reasons.map((r, i) => (
                <li key={i}>· {r}</li>
              ))}
            </ul>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-2 pr-3 font-medium">#</th>
                  <th className="pb-2 pr-3 font-medium">outcome</th>
                  <th className="pb-2 pr-3 font-medium">verifier</th>
                  <th className="pb-2 pr-3 font-medium">performed</th>
                  <th className="pb-2 pr-3 font-medium">hash</th>
                  <th className="pb-2 font-medium">links</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {cap.evidence.map((e) => (
                  <tr key={e.id} className="border-t border-slate-800">
                    <td className="py-2 pr-3">{e.id}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded px-1.5 py-0.5 ${OUTCOME_STYLE[e.outcome]}`}>{e.outcome}</span>
                    </td>
                    <td className="py-2 pr-3 font-mono">{short(e.verifier)}</td>
                    <td className="py-2 pr-3">{(e.performedAt ?? e.at).slice(0, 10)}</td>
                    <td className="py-2 pr-3">
                      {e.verified === true ? (
                        <span className="text-emerald-300" title={e.verifyReason}>
                          ✓ verified
                        </span>
                      ) : e.verified === false ? (
                        <span className="text-red-300" title={e.verifyReason}>
                          ✗ mismatch
                        </span>
                      ) : (
                        <span className="text-slate-500" title={e.verifyReason}>
                          — unfetched
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      <a href={e.uri} className="text-slate-400 hover:text-cyan-300">
                        doc
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">API</p>
              <button
                onClick={() => navigator.clipboard?.writeText(curl)}
                className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-400 hover:border-cyan-400 hover:text-cyan-300"
              >
                copy curl
              </button>
            </div>
            <code className="block overflow-x-auto whitespace-pre text-xs text-slate-400">{curl}</code>
            <p className="mt-2 text-xs text-slate-600">formula {formulaVersion}</p>
          </div>
        </>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-950 px-3 py-2">
      <p className="text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

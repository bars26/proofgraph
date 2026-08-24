"use client";

import { useEffect, useMemo, useState } from "react";
import {
  publicClient,
  evidenceRegistryAddress,
  evidenceRegistryAbi,
} from "../lib/proofgraph";

type Task = "Research" | "Solidity Audit" | "Coding" | "Data Analysis";

type Evidence = {
  id: string;
  title: string;
  capability: string;
  result: "Successful" | "Failed";
  payment: string;
  verifier: string;
  source: string;
};

type OnchainEvidence = {
  id: bigint;
  agent: `0x${string}`;
  capability: string;
  evidenceHash: `0x${string}`;
  verifier: `0x${string}`;
  timestamp: bigint;
};

type Agent = {
  name: string;
  address?: `0x${string}`;
  evidence: number;
  independence: number;
  skills: {
    Research: number;
    Coding: number;
    Solidity: number;
    "Data Analysis": number;
  };
  records: Evidence[];
};

const tasks: Task[] = [
  "Research",
  "Solidity Audit",
  "Coding",
  "Data Analysis",
];

const agents: Agent[] = [
  {
    name: "SecurityAgent #03",
    evidence: 89,
    independence: 91,
    skills: {
      Research: 57,
      Coding: 88,
      Solidity: 96,
      "Data Analysis": 74,
    },
    records: [
      {
        id: "PG-101",
        title: "Smart Contract Vulnerability Review",
        capability: "Solidity",
        result: "Successful",
        payment: "18.00 USDC",
        verifier: "0x81...4D2",
        source: "Arc",
      },
      {
        id: "PG-102",
        title: "Access Control Analysis",
        capability: "Solidity",
        result: "Successful",
        payment: "11.50 USDC",
        verifier: "0x39...A71",
        source: "ERC-8183",
      },
      {
        id: "PG-103",
        title: "Protocol Security Research",
        capability: "Research",
        result: "Successful",
        payment: "7.00 USDC",
        verifier: "0x92...C18",
        source: "ERC-8004",
      },
    ],
  },
  {
    name: "ResearchAgent #11",
    evidence: 93,
    independence: 87,
    skills: {
      Research: 97,
      Coding: 61,
      Solidity: 42,
      "Data Analysis": 90,
    },
    records: [
      {
        id: "PG-201",
        title: "Market Research Report",
        capability: "Research",
        result: "Successful",
        payment: "12.50 USDC",
        verifier: "0xA1...8E3",
        source: "Arc",
      },
      {
        id: "PG-202",
        title: "On-chain Data Analysis",
        capability: "Data Analysis",
        result: "Successful",
        payment: "8.00 USDC",
        verifier: "0xB7...11F",
        source: "Arc",
      },
      {
        id: "PG-203",
        title: "Protocol Comparison",
        capability: "Research",
        result: "Successful",
        payment: "5.00 USDC",
        verifier: "0x77...9C2",
        source: "ERC-8004",
      },
    ],
  },
  {
    name: "BuilderAgent #07",
    evidence: 84,
    independence: 79,
    skills: {
      Research: 74,
      Coding: 92,
      Solidity: 81,
      "Data Analysis": 68,
    },
    records: [
      {
        id: "PG-301",
        title: "API Integration Build",
        capability: "Coding",
        result: "Successful",
        payment: "15.00 USDC",
        verifier: "0x34...DD1",
        source: "x402",
      },
      {
        id: "PG-302",
        title: "Frontend Component Delivery",
        capability: "Coding",
        result: "Successful",
        payment: "9.50 USDC",
        verifier: "0x55...1AA",
        source: "Arc",
      },
      {
        id: "PG-303",
        title: "Smart Contract Integration",
        capability: "Solidity",
        result: "Successful",
        payment: "14.00 USDC",
        verifier: "0x66...F42",
        source: "ERC-8183",
      },
    ],
  },
];

function getTaskMatch(
  agent: Agent,
  task: Task,
  onchainEvidence: OnchainEvidence | null,
  liveCapabilityEvidence = 0
) {
  const capability =
    task === "Solidity Audit" ? agent.skills.Solidity : agent.skills[task];

  const hasMatchingOnchainEvidence =
    Boolean(agent.address) &&
    Boolean(onchainEvidence) &&
    agent.address?.toLowerCase() === onchainEvidence?.agent.toLowerCase() &&
    onchainEvidence?.capability === task;

  const liveEvidenceBonus = hasMatchingOnchainEvidence
    ? Math.min(liveCapabilityEvidence * 2, 10)
    : 0;

  const evidenceScore = Math.min(agent.evidence + liveEvidenceBonus, 100);

  const score =
    capability * 0.7 +
    evidenceScore * 0.2 +
    agent.independence * 0.1;

  return Math.round(score);
}

export default function Home() {
  const [selectedTask, setSelectedTask] =
    useState<Task>("Solidity Audit");

  const [openAgent, setOpenAgent] = useState<string | null>(null);

  const [onchainEvidence, setOnchainEvidence] =
    useState<OnchainEvidence | null>(null);

  const [onchainCount, setOnchainCount] = useState<bigint>(0n);
  const [researchEvidenceCount, setResearchEvidenceCount] = useState<bigint>(0n);
  const [arcLoading, setArcLoading] = useState(true);
  const [arcError, setArcError] = useState<string | null>(null);

  useEffect(() => {
    async function loadArcEvidence() {
      try {
        const count = await publicClient.readContract({
          address: evidenceRegistryAddress,
          abi: evidenceRegistryAbi,
          functionName: "evidenceCount",
        });

        setOnchainCount(count);

        if (count > 0n) {
          const evidence = await publicClient.readContract({
            address: evidenceRegistryAddress,
            abi: evidenceRegistryAbi,
            functionName: "getEvidence",
            args: [1n],
          });

          setOnchainEvidence(evidence);

          const researchCount = await publicClient.readContract({
            address: evidenceRegistryAddress,
            abi: evidenceRegistryAbi,
            functionName: "getAgentCapabilityEvidenceCount",
            args: [evidence.agent, "Research"],
          });

          setResearchEvidenceCount(researchCount);
        }
      } catch (error) {
        console.error(error);
        setArcError("Could not read Arc Testnet evidence.");
      } finally {
        setArcLoading(false);
      }
    }

    loadArcEvidence();
  }, []);

  const rankedAgents = useMemo(() => {
    return agents
      .map((agent) => ({
        ...agent,
        match: getTaskMatch(
          agent,
          selectedTask,
          onchainEvidence,
          Number(researchEvidenceCount)
        ),
      }))
      .sort((a, b) => b.match - a.match);
  }, [selectedTask, onchainEvidence, researchEvidenceCount]);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-14 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              ProofGraph
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Task-aware trust for AI agents
            </p>
          </div>

          <div className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300">
            Arc Testnet
          </div>
        </header>

        <section className="mb-12 rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-widest text-cyan-400">
                Live Arc Evidence
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                EvidenceRegistry is live on Arc Testnet
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Data below is read directly from the deployed ProofGraph smart contract.
              </p>
            </div>

            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
              ONCHAIN
            </span>
          </div>

          {arcLoading && (
            <p className="mt-6 text-sm text-slate-400">
              Reading Arc Testnet...
            </p>
          )}

          {arcError && (
            <p className="mt-6 text-sm text-red-300">
              {arcError}
            </p>
          )}

          {!arcLoading && !arcError && onchainEvidence && (
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs text-slate-500">Evidence</p>
                <p className="mt-1 text-lg font-semibold">
                  #{onchainEvidence.id.toString()}
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  Registry Count
                </p>
                <p className="mt-1">
                  {onchainCount.toString()}
                </p>

                <p className="mt-3 text-xs text-slate-500">
                  Research Evidence
                </p>
                <p className="mt-1 font-semibold text-cyan-300">
                  {researchEvidenceCount.toString()}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs text-slate-500">Capability</p>
                <p className="mt-1 text-lg font-semibold text-cyan-300">
                  {onchainEvidence.capability}
                </p>
                <p className="mt-3 text-xs text-slate-500">Agent</p>
                <p className="mt-1 break-all text-sm">
                  {onchainEvidence.agent}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs text-slate-500">Verifier</p>
                <p className="mt-1 break-all text-sm">
                  {onchainEvidence.verifier}
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  Evidence Hash
                </p>
                <p className="mt-1 break-all text-xs text-slate-300">
                  {onchainEvidence.evidenceHash}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="mb-12">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-cyan-400">
            Find the right agent
          </p>

          <h2 className="max-w-3xl text-4xl font-semibold leading-tight">
            Which AI agent can you actually trust for your task?
          </h2>

          <p className="mt-4 max-w-2xl text-slate-400">
            ProofGraph ranks agents using verifiable work history,
            capability-specific evidence and evidence independence.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tasks.map((task) => {
              const active = selectedTask === task;

              return (
                <button
                  key={task}
                  onClick={() => {
                    setSelectedTask(task);
                    setOpenAgent(null);
                  }}
                  className={`rounded-xl border px-5 py-4 text-left transition ${
                    active
                      ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                      : "border-slate-700 bg-slate-900 hover:border-cyan-400 hover:bg-slate-800"
                  }`}
                >
                  <span className="font-medium">{task}</span>

                  {active && (
                    <p className="mt-1 text-xs text-cyan-400">
                      Selected task
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-5">
            <p className="text-sm uppercase tracking-widest text-slate-500">
              Live ranking
            </p>

            <h3 className="mt-1 text-2xl font-semibold">
              Best agents for {selectedTask}
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Task Match = 70% capability + 20% evidence quality +
              10% evidence independence
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {rankedAgents.map((agent, index) => {
              const isOpen = openAgent === agent.name;

              return (
                <article
                  key={agent.name}
                  className={`rounded-2xl border bg-slate-900 p-6 transition ${
                    index === 0
                      ? "border-cyan-400/50"
                      : "border-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500">
                        Rank #{index + 1}
                      </p>

                      <h4 className="mt-1 text-xl font-semibold">
                        {agent.name}
                      </h4>

                      {index === 0 && (
                        <p className="mt-2 text-xs font-medium text-cyan-400">
                          BEST MATCH
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl bg-cyan-400/10 px-3 py-2 text-right">
                      <p className="text-xs text-cyan-300">
                        Task Match
                      </p>

                      <p className="text-2xl font-bold text-cyan-300">
                        {agent.match}%
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-950 p-3">
                      <p className="text-xs text-slate-500">
                        Evidence Quality
                      </p>

                      <p className="mt-1 text-lg font-semibold">
                        {agent.evidence}%
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-950 p-3">
                      <p className="text-xs text-slate-500">
                        Independence
                      </p>

                      <p className="mt-1 text-lg font-semibold">
                        {agent.independence}%
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    {Object.entries(agent.skills).map(([skill, value]) => (
                      <div key={skill}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-slate-300">
                            {skill}
                          </span>

                          <span className="text-slate-500">
                            {value}
                          </span>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-cyan-400 transition-all duration-500"
                            style={{ width: `${value}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() =>
                      setOpenAgent(isOpen ? null : agent.name)
                    }
                    className="mt-7 w-full rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium transition hover:border-cyan-400 hover:text-cyan-300"
                  >
                    {isOpen ? "Hide Evidence" : "View Evidence"}
                  </button>

                  {isOpen && (
                    <div className="mt-6 border-t border-slate-800 pt-6">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">
                            Verifiable Evidence
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Demo records for ProofGraph V1
                          </p>
                        </div>

                        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-300">
                          DEMO EVIDENCE
                        </span>
                      </div>

                      <div className="space-y-3">
                        {agent.records.map((record) => (
                          <div
                            key={record.id}
                            className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="font-medium">
                                  {record.title}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Evidence ID: {record.id}
                                </p>
                              </div>

                              <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300">
                                {record.result}
                              </span>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <p className="text-xs text-slate-500">
                                  Capability
                                </p>
                                <p className="mt-1">
                                  {record.capability}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-slate-500">
                                  Payment
                                </p>
                                <p className="mt-1">
                                  {record.payment}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-slate-500">
                                  Verifier
                                </p>
                                <p className="mt-1">
                                  {record.verifier}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-slate-500">
                                  Source
                                </p>
                                <p className="mt-1">
                                  {record.source}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

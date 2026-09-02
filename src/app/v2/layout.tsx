import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ProofGraph V2 — Task-aware agent trust on Arc",
  description:
    "Capability-specific reputation for AI agents, backed by verifiable on-chain evidence and ERC-8004 signals on Arc Testnet.",
};

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return children;
}

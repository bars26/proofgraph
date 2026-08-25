# ProofGraph

**Task-aware trust and verifiable evidence for AI agents on Arc.**

ProofGraph is a reputation and evidence layer designed to help users answer a simple question:

> Which AI agent can I actually trust for this specific task?

Instead of relying on a single global reputation score, ProofGraph evaluates agents using capability-specific performance, evidence quality, and evidence independence.

## Why ProofGraph?

AI agents can be good at very different things.

An agent that performs well at research may not be the best choice for Solidity auditing. A coding agent may have a strong overall reputation but little verifiable evidence for data analysis.

ProofGraph makes reputation task-aware.

Agent ranking is based on:

- 70% capability score
- 20% evidence quality
- 10% evidence independence

## Verifiable Evidence

ProofGraph connects agent reputation to verifiable work records.

Evidence can include:

- Agent address
- Capability
- Evidence hash
- Verifier address
- Payment amount
- Timestamp
- Evidence source

The frontend reads registry data directly from the deployed smart contract.

This allows reputation signals to be backed by verifiable onchain records rather than only UI-generated scores.

## Live Arc Testnet Integration
### Verified Live Transaction

ProofGraph V1 has been verified end-to-end on Arc Public Testnet.

- EvidenceRegistry: `0x08bAa6fE21c76aF38a574c891394d5b43258EdcE`
- Chain ID: `5042002`
- Evidence ID: `2`
- Capability: `Research`
- Transaction: `0x8fb0a7823c524e210623566af1625cc6bf9d575b6eb0d37c44be3295e023f07c`
- Block: `58548629`
- Status: `success`

The transaction registers evidence onchain and the resulting record is read back directly from the deployed EvidenceRegistry contract.
ProofGraph V1 currently includes:

- EvidenceRegistry smart contract
- Deployment on Arc Testnet
- Onchain evidence registration
- Onchain evidence reading
- Capability-specific agent ranking
- Evidence quality scoring
- Evidence independence scoring
- Interactive ProofGraph frontend
- Arc Testnet integration scripts

## Architecture

AI Agent  
↓  
Completed Work  
↓  
Verifier / Evidence Source  
↓  
EvidenceRegistry (Arc Testnet)  
↓  
ProofGraph Evidence Layer  
↓  
Task-Aware Ranking Engine  
↓  
User selects task  
↓  
Best matching AI agents

## Tech Stack

- Next.js
- TypeScript
- Solidity
- Hardhat
- Arc Testnet
- viem

## Development

Install dependencies:

npm install

Run the development server:

npm run dev

TypeScript check:

npx tsc --noEmit

## Status

ProofGraph V1 is an experimental builder project running with a live EvidenceRegistry deployment on Arc Testnet.

The current version demonstrates how task-specific AI agent reputation can be connected to verifiable onchain evidence.

## Vision

ProofGraph aims to become a portable trust layer for an agent-driven economy where reputation is not just claimed — it is backed by evidence.

## Onchain Evidence → Agent Ranking

ProofGraph connects Arc Testnet evidence directly to agent identity and task-aware ranking.

In the current V1 implementation:

1. Evidence is registered in the deployed `EvidenceRegistry` contract on Arc Testnet.
2. The frontend reads the evidence record directly from the contract.
3. The onchain agent address is mapped to `ResearchAgent #11`.
4. Capability-specific evidence is queried for the `Research` capability.
5. That evidence becomes part of the agent's verifiable reputation context used by the ranking interface.

This creates an end-to-end path:

`Arc EvidenceRegistry → Onchain Evidence → Agent Identity → Capability → Task-Aware Ranking`

The live V1 demo currently proves this flow with `ResearchAgent #11` and a verified `Research` evidence record on Arc Testnet.

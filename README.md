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

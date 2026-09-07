/**
 * Client side of the ProofGraph x402 flow: a `fetch` that auto-pays 402s.
 *
 * Give it a funded Arc wallet key; it signs an EIP-3009 authorization when the score
 * API answers `402 Payment Required` and retries. Used by the demo and by any agent
 * that wants to buy a trust score.
 */
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";

import { arcTestnet } from "./erc8004";

const ARC_NETWORK = `eip155:${arcTestnet.id}` as const;

/** A `fetch` that pays x402 charges from `privateKey` (a funded Arc wallet). */
export function makePayingFetch(privateKey: string, baseFetch: typeof fetch = fetch) {
  const account = privateKeyToAccount(
    privateKey.startsWith("0x") ? (privateKey as `0x${string}`) : (`0x${privateKey}` as `0x${string}`),
  );
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
  const signer = toClientEvmSigner(account, publicClient);
  const client = new x402Client().register(ARC_NETWORK, new ExactEvmScheme(signer));
  return {
    payerAddress: account.address,
    fetch: wrapFetchWithPayment(baseFetch, client),
  };
}

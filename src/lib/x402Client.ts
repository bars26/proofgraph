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

// Arc's native USDC (6-decimal ERC-20 view). x402's client spend controls only
// trust assets its `findDefaultAsset` table knows; Arc USDC isn't in it, so we
// allow it explicitly and cap each payment at $1 (1_000_000 atomic units).
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const MAX_PER_PAYMENT_ATOMIC = "1000000";

/** A `fetch` that pays x402 charges from `privateKey` (a funded Arc wallet). */
export function makePayingFetch(privateKey: string, baseFetch: typeof fetch = fetch) {
  const account = privateKeyToAccount(
    privateKey.startsWith("0x") ? (privateKey as `0x${string}`) : (`0x${privateKey}` as `0x${string}`),
  );
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
  const signer = toClientEvmSigner(account, publicClient);
  const client = new x402Client()
    .setSpendControls({
      allowedAssets: [
        { network: ARC_NETWORK, asset: ARC_USDC, maxAmountPerPayment: MAX_PER_PAYMENT_ATOMIC },
      ],
    })
    .register(ARC_NETWORK, new ExactEvmScheme(signer));
  return {
    payerAddress: account.address,
    fetch: wrapFetchWithPayment(baseFetch, client),
  };
}

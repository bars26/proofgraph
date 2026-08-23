import { createPublicClient, http, defineChain } from "viem";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.network"],
    },
  },
});

export const evidenceRegistryAddress =
  "0x08bAa6fE21c76aF38a574c891394d5b43258EdcE" as const;

export const evidenceRegistryAbi = [
  {
    type: "function",
    name: "evidenceCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getEvidence",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "agent", type: "address" },
          { name: "capability", type: "string" },
          { name: "evidenceHash", type: "bytes32" },
          { name: "verifier", type: "address" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
  },
] as const;

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

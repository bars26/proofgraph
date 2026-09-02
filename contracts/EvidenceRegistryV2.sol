// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ProofGraph Evidence Registry V2
/// @notice Stores capability-structured, hash-committed evidence about AI agent work.
/// @dev V2 additions over V1: ERC-8004 `agentId` as the identity key, an explicit
///      `outcome` enum, a `counterparty`, and an off-chain `uri` alongside the hash.
///      Kept self-contained (no external registry calls) so it stays cheap and easy to
///      audit. Callers are expected to pass a real ERC-8004 IdentityRegistry `agentId`.
contract EvidenceRegistryV2 {
    enum Outcome {
        Success,
        Failure,
        Disputed
    }

    struct Evidence {
        uint256 id;
        uint256 agentId;
        string capability;
        Outcome outcome;
        address counterparty;
        bytes32 evidenceHash;
        string uri;
        address verifier;
        uint256 timestamp;
    }

    uint256 public evidenceCount;

    mapping(uint256 => Evidence) private evidences;
    mapping(uint256 => uint256[]) private agentEvidenceIds;
    mapping(uint256 => mapping(bytes32 => uint256[])) private agentCapabilityEvidenceIds;

    event EvidenceSubmitted(
        uint256 indexed id,
        uint256 indexed agentId,
        address indexed verifier,
        string capability,
        Outcome outcome,
        address counterparty,
        bytes32 evidenceHash,
        string uri,
        uint256 timestamp
    );

    error EmptyCapability();
    error EmptyEvidenceHash();
    error EmptyUri();
    error EvidenceNotFound(uint256 id);

    /// @notice Record one piece of evidence about `agentId` performing a `capability` task.
    /// @param agentId ERC-8004 IdentityRegistry token id of the agent.
    /// @param capability Free-form capability label (e.g. "Solidity Audit").
    /// @param outcome Success / Failure / Disputed.
    /// @param counterparty Who the work was for; `address(0)` if undisclosed.
    /// @param evidenceHash `keccak256` of the canonical off-chain evidence JSON.
    /// @param uri Where that JSON can be fetched.
    /// @return id The new evidence id (1-indexed).
    function submitEvidence(
        uint256 agentId,
        string calldata capability,
        Outcome outcome,
        address counterparty,
        bytes32 evidenceHash,
        string calldata uri
    ) external returns (uint256 id) {
        if (bytes(capability).length == 0) revert EmptyCapability();
        if (evidenceHash == bytes32(0)) revert EmptyEvidenceHash();
        if (bytes(uri).length == 0) revert EmptyUri();

        id = ++evidenceCount;

        evidences[id] = Evidence({
            id: id,
            agentId: agentId,
            capability: capability,
            outcome: outcome,
            counterparty: counterparty,
            evidenceHash: evidenceHash,
            uri: uri,
            verifier: msg.sender,
            timestamp: block.timestamp
        });

        agentEvidenceIds[agentId].push(id);
        agentCapabilityEvidenceIds[agentId][keccak256(bytes(capability))].push(id);

        emit EvidenceSubmitted(
            id,
            agentId,
            msg.sender,
            capability,
            outcome,
            counterparty,
            evidenceHash,
            uri,
            block.timestamp
        );
    }

    function getEvidence(uint256 id) external view returns (Evidence memory) {
        if (id == 0 || id > evidenceCount) revert EvidenceNotFound(id);
        return evidences[id];
    }

    /// @notice Batch read, for frontends that need many records in one call.
    function getEvidenceBatch(uint256[] calldata ids) external view returns (Evidence[] memory list) {
        list = new Evidence[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            if (id == 0 || id > evidenceCount) revert EvidenceNotFound(id);
            list[i] = evidences[id];
        }
    }

    function getAgentEvidenceIds(uint256 agentId) external view returns (uint256[] memory) {
        return agentEvidenceIds[agentId];
    }

    function getAgentEvidenceCount(uint256 agentId) external view returns (uint256) {
        return agentEvidenceIds[agentId].length;
    }

    function getAgentCapabilityEvidenceIds(
        uint256 agentId,
        string calldata capability
    ) external view returns (uint256[] memory) {
        return agentCapabilityEvidenceIds[agentId][keccak256(bytes(capability))];
    }

    function getAgentCapabilityEvidenceCount(
        uint256 agentId,
        string calldata capability
    ) external view returns (uint256) {
        return agentCapabilityEvidenceIds[agentId][keccak256(bytes(capability))].length;
    }
}

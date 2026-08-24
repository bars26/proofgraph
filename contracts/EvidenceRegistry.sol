// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ProofGraph Evidence Registry
/// @notice Stores verifiable evidence about AI agent work.
contract EvidenceRegistry {
    struct Evidence {
        uint256 id;
        address agent;
        string capability;
        bytes32 evidenceHash;
        address verifier;
        uint256 timestamp;
    }

    uint256 public evidenceCount;

    mapping(uint256 => Evidence) private evidences;
    mapping(address => uint256[]) private agentEvidenceIds;
    mapping(address => mapping(bytes32 => uint256[])) private agentCapabilityEvidenceIds;

    event EvidenceRegistered(
        uint256 indexed id,
        address indexed agent,
        string capability,
        bytes32 evidenceHash,
        address indexed verifier,
        uint256 timestamp
    );

    error InvalidAgent();
    error EmptyCapability();
    error EmptyEvidenceHash();
    error EvidenceNotFound(uint256 id);

    function registerEvidence(
        address agent,
        string calldata capability,
        bytes32 evidenceHash
    ) external returns (uint256 id) {
        if (agent == address(0)) revert InvalidAgent();
        if (bytes(capability).length == 0) revert EmptyCapability();
        if (evidenceHash == bytes32(0)) revert EmptyEvidenceHash();

        id = ++evidenceCount;

        evidences[id] = Evidence({
            id: id,
            agent: agent,
            capability: capability,
            evidenceHash: evidenceHash,
            verifier: msg.sender,
            timestamp: block.timestamp
        });

        agentEvidenceIds[agent].push(id);
        agentCapabilityEvidenceIds[agent][keccak256(bytes(capability))].push(id);

        emit EvidenceRegistered(
            id,
            agent,
            capability,
            evidenceHash,
            msg.sender,
            block.timestamp
        );
    }

    function getEvidence(
        uint256 id
    ) external view returns (Evidence memory) {
        if (id == 0 || id > evidenceCount) {
            revert EvidenceNotFound(id);
        }

        return evidences[id];
    }

    function getAgentEvidenceIds(
        address agent
    ) external view returns (uint256[] memory) {
        return agentEvidenceIds[agent];
    }

    function getAgentCapabilityEvidenceIds(
        address agent,
        string calldata capability
    ) external view returns (uint256[] memory) {
        return agentCapabilityEvidenceIds[agent][keccak256(bytes(capability))];
    }

    function getAgentCapabilityEvidenceCount(
        address agent,
        string calldata capability
    ) external view returns (uint256) {
        return agentCapabilityEvidenceIds[agent][keccak256(bytes(capability))].length;
    }

    function getAgentEvidenceCount(
        address agent
    ) external view returns (uint256) {
        return agentEvidenceIds[agent].length;
    }
}

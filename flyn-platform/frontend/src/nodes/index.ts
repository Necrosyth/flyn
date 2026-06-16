/**
 * Node Components Index
 * ----------------------
 * Exports all node components and the nodeTypes configuration.
 */

import GenericNode from './GenericNodeV2';
import DecisionNode from './DecisionNode';

// Node types configuration for React Flow
export const nodeTypes = {
  generic: GenericNode,
  decision: DecisionNode,
};

export { GenericNode, DecisionNode };

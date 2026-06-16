/**
 * ColoredEdge Component
 * ----------------------
 * Custom edge that inherits the color of its source node.
 * Features smooth animation and gradient effects for visual enhancement.
 * Animation only appears when the source node is selected.
 */

import React, { memo } from 'react';
import {
  BaseEdge,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { getNodeColor } from '@/config/nodeColors';
import { useFlowStore } from '@/hooks/useFlowStore';

interface ColoredEdgeData extends Record<string, unknown> {
  sourceNodeType?: string;
  animated?: boolean;
}

type ColoredEdgeType = Edge<ColoredEdgeData, 'colored'>;

const ColoredEdge = ({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style = {},
  selected,
  markerEnd,
}: EdgeProps<ColoredEdgeType>) => {
  // Check if the source node is selected
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);
  const isSourceNodeSelected = source === selectedNodeId;

  // Get the color based on source node type
  const sourceNodeType = (data as ColoredEdgeData)?.sourceNodeType || '';
  const edgeColor = getNodeColor(sourceNodeType);
  
  // Only animate when source node is selected
  const shouldAnimate = isSourceNodeSelected && (data as ColoredEdgeData)?.animated !== false;

  // Calculate the edge path
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
  });

  // Unique gradient ID for this edge
  const gradientId = `edge-gradient-${id}`;
  
  return (
    <>
      {/* SVG Definitions for gradient and animation */}
      <defs>
        {/* Gradient from source color to a slightly faded version */}
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
        >
          <stop offset="0%" stopColor={edgeColor} stopOpacity={1} />
          <stop offset="100%" stopColor={edgeColor} stopOpacity={0.4} />
        </linearGradient>
      </defs>

      {/* Background glow effect when selected or source node is selected */}
      {(selected || isSourceNodeSelected) && (
        <path
          d={edgePath}
          fill="none"
          stroke={edgeColor}
          strokeWidth={8}
          strokeOpacity={0.2}
          style={{
            filter: `drop-shadow(0 0 6px ${edgeColor})`,
          }}
        />
      )}

      {/* Main edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...(style as React.CSSProperties),
          stroke: `url(#${gradientId})`,
          strokeWidth: selected || isSourceNodeSelected ? 3 : 2,
          transition: 'stroke-width 0.2s ease',
        }}
      />

      {/* Animated flow particle - only when source node is selected */}
      {shouldAnimate && (
        <circle r="3" fill={edgeColor}>
          <animateMotion
            dur="2s"
            repeatCount="indefinite"
            path={edgePath}
          />
        </circle>
      )}

      {/* Secondary particle with offset for more dynamic look */}
      {shouldAnimate && (
        <circle r="2" fill={edgeColor} opacity={0.6}>
          <animateMotion
            dur="2s"
            repeatCount="indefinite"
            path={edgePath}
            begin="1s"
          />
        </circle>
      )}
    </>
  );
};

export default memo(ColoredEdge);

/** Node classification and world sizes. GGG ships none, so they follow PoB's `GetNodeTargetSize` cascade (first match wins); in PoE2 they are world units directly. */

import type { NodeKind, TreeNode } from '../types.js';

export interface NodeSize {
  icon: number;
  overlay: number;
  effect: number;
}

export function classifyNode(node: TreeNode): NodeKind {
  if (node.isAscendancyStart) {
    return 'ascendancyStart';
  }

  if (node.ascendancyName) {
    return node.isNotable ? 'ascendancyNotable' : 'ascendancyNormal';
  }

  if (node.isJewelSocket) {
    return 'jewel';
  }

  if (node.isNotable) {
    return 'notable';
  }

  if (node.isMastery) {
    return 'mastery';
  }

  if (node.isKeystone) {
    return 'keystone';
  }

  if (node.classesStart && node.classesStart.length > 0) {
    return 'classStart';
  }

  if (node.isAttribute) {
    return 'attribute';
  }

  return 'normal';
}

export function nodeTargetSize(node: TreeNode): NodeSize {
  if (node.isAscendancyStart) {
    return { icon: 0, overlay: 50, effect: 0 };
  }

  if (node.ascendancyName && !node.isNotable) {
    return { icon: 37, overlay: 80, effect: 0 };
  }

  if (node.isJewelSocket) {
    return { icon: 80, overlay: 80, effect: 0 };
  }

  if (node.ascendancyName) {
    // ascendancy notable
    return { icon: 54, overlay: 100, effect: 0 };
  }

  if (node.isNotable) {
    return { icon: 54, overlay: 80, effect: 380 };
  }

  if (node.isMastery) {
    // "OnlyImage": the node *is* a large pattern image, no overlay.
    return { icon: 380, overlay: 0, effect: 0 };
  }

  if (node.isKeystone) {
    return { icon: 82, overlay: 120, effect: 380 };
  }

  if (node.classesStart && node.classesStart.length > 0) {
    // Class-start node: a normal icon under an effectively invisible frame.
    return { icon: 37, overlay: 1, effect: 0 };
  }

  return { icon: 37, overlay: 54, effect: 0 };
}

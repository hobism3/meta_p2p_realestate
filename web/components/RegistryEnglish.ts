import {Children, cloneElement, isValidElement, type ReactNode} from "react";
import {registryEnglish} from "../lib/registry-english.ts";

/** Translate only app-owned rendered copy, after locale hydration.
 * Form values, URLs, event handlers, enums and original Korean PDF text are untouched.
 * data-registry-source is an explicit opt-out for filenames/source quotations.
 */
export function registryEnglishView(node: ReactNode, en: boolean): ReactNode {
  if (!en) return node;
  if (typeof node === "string") return registryEnglish(node);
  if (Array.isArray(node)) return Children.map(node, child=>registryEnglishView(child,en));
  if (!isValidElement<Record<string, unknown>>(node)) return node;
  if (node.props["data-registry-source"]) return node;
  const next: Record<string, unknown> = {};
  for (const key of ["aria-label","title"]) {
    if (typeof node.props[key] === "string") next[key] = registryEnglish(node.props[key] as string);
  }
  if (node.props.children !== undefined) next.children = registryEnglishView(node.props.children as ReactNode,en);
  return cloneElement(node,next);
}

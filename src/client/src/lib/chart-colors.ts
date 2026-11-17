/**
 * Chart colors for the reports page, drawn from the colors the app already uses, with
 * one meaning per color on every chart:
 *   violet (brand primary, also the "our reply" marker) = the team
 *   orange (the "New" status badge)                    = incoming
 *   slate  (the "Resolved" badge)                      = automated
 * Backlog age is a single violet ramp (light = new, dark = old), not traffic lights.
 *
 * Validated (OKLab CVD separation, normal-vision floor, contrast) against the card
 * surface in each mode. Recharts writes colors as SVG attributes, which can't read CSS
 * variables, so the dark steps are picked in JS.
 */

import { useEffect, useState } from 'react';

const LIGHT = {
  team: '#7c3aed',      // violet-600 = --primary
  incoming: '#ea580c',  // orange-600
  automated: '#94a3b8', // slate-400
  /** under 1 day -> over 7 days */
  age: ['#a78bfa', '#7c3aed', '#5b21b6', '#2e1065'],
};

const DARK: typeof LIGHT = {
  team: '#8b5cf6',      // violet-500
  incoming: '#ea580c',  // orange-600
  automated: '#94a3b8', // slate-400
  /** under 1 day -> over 7 days: on dark, older is brighter */
  age: ['#6d28d9', '#8b5cf6', '#c4b5fd', '#ede9fe'],
};

export type ChartColors = typeof LIGHT;

const isDark = () => document.documentElement.classList.contains('dark');

/** Chart colors for the current theme; follows the theme toggle */
export function useChartColors(): ChartColors {
  const [dark, setDark] = useState(isDark);

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return dark ? DARK : LIGHT;
}

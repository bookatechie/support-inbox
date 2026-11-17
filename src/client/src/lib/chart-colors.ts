/**
 * Chart colors for the reports page, one meaning per color on every chart:
 * blue = incoming, orange = the team, gray = automated. Backlog age is a single blue
 * ramp (light = new, dark = old), not traffic lights.
 *
 * Validated (OKLab CVD separation, normal-vision floor, contrast) against the card
 * surface in each mode. Recharts writes colors as SVG attributes, which can't read CSS
 * variables, so the dark steps are picked in JS.
 */

import { useEffect, useState } from 'react';

const LIGHT = {
  incoming: '#2a78d6',
  team: '#eb6834',
  automated: '#8a8996',
  /** under 1 day -> over 7 days */
  age: ['#86b6ef', '#3987e5', '#1c5cab', '#0d366b'],
};

const DARK: typeof LIGHT = {
  incoming: '#3987e5',
  team: '#d95926',
  automated: '#8a8996',
  /** under 1 day -> over 7 days: on dark, older is brighter */
  age: ['#184f95', '#2a78d6', '#6da7ec', '#b7d3f6'],
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

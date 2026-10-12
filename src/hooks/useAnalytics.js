import { useMemo } from 'react';
import { buildAnalytics } from '../lib/analytics/index.js';

/** Memoised analytics; null before processing. `files` only affects Issue/Rev/plant facts. */
export default function useAnalytics(processedData, summaryData, files) {
  return useMemo(
    () => (processedData && summaryData ? buildAnalytics({ processedData, summaryData, files }) : null),
    [processedData, summaryData, files],
  );
}

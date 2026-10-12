import { KpiCard } from '../../ui-kit/index.js';
import { formatNumber } from '../../../utils/format.js';
import { th } from '../../../lib/analytics/labels.js';

export default function KpiStrip({ kpis }) {
  const stale = kpis.dataAgeDays != null && kpis.dataAgeDays > 7;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="dashboard-kpis">
      <KpiCard label={th.n} value={formatNumber(kpis.totals.n)} />
      <KpiCard label={th.total4} value={formatNumber(kpis.total4)} />
      <KpiCard label={th.parts} value={formatNumber(kpis.parts)} />
      <KpiCard label={th.rows} value={formatNumber(kpis.rows)} />
      <KpiCard label={th.plants} value={`${kpis.plantsWithFiles.length}/4`} />
      <KpiCard label={th.issue} value={<span className="text-base sm:text-lg break-words">{`${kpis.issueDate ?? '-'} / ${kpis.revision ?? '-'} / ${kpis.forecastType ?? '-'}`}</span>} />
      <KpiCard
        label={th.dataAge}
        value={kpis.dataAgeDays == null ? '-' : `${formatNumber(kpis.dataAgeDays)} วัน`}
        className={stale ? '!bg-amber-50 !border-amber-300' : ''}
        delta={stale ? 'เกิน 7 วัน ตรวจว่าเป็นไฟล์ล่าสุด' : null}
      />
    </div>
  );
}

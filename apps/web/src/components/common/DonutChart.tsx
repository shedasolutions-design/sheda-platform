export interface DonutSlice {
  label: string;
  value: string | number;
  color: string;
  percentage: number;
}

/** A small ring chart with a legend, for the seller dashboard. */
export default function DonutChart({ data, size = 120 }: { data: DonutSlice[]; size?: number }) {
  const r = 45;
  const stroke = 12;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#F3F4F6" strokeWidth={stroke} fill="none" />
        {data.map((d, i) => {
          const dash = `${(d.percentage / 100) * c} ${c}`;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={d.color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={dash}
              strokeDashoffset={(-offset * c) / 100}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += d.percentage;
          return el;
        })}
      </svg>
      <dl className="min-w-0 flex-1 basis-40">
        {data.map((d) => (
          <div key={d.label} className="mb-3 flex items-center justify-between gap-2">
            <dt className="flex min-w-0 items-center text-sm text-secondaryText">
              <span className="mr-3 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
              {d.label}
            </dt>
            <dd className="shrink-0 whitespace-nowrap text-right font-bold">{typeof d.value === "string" ? d.value : d.value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

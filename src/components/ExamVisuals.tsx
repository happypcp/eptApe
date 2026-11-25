import React from 'react';

export const ExamVisualRenderer: React.FC<{ visualKey: string; title?: string }> = ({ visualKey, title }) => {
  if (visualKey === 'renewable_bar_chart') {
    const data = [
      { year: '2016', solar: 305, wind: 487, hydro: 1130 },
      { year: '2020', solar: 760, wind: 745, hydro: 1210 },
      { year: '2024', solar: 1620, wind: 1090, hydro: 1285 },
    ];
    const maxVal = 1800;
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title || 'Global Installed Renewable Energy Capacity (Gigawatts)'}
          </h4>
          <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-600 inline-block" /> Solar PV
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-slate-500 inline-block" /> Wind
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" /> Hydro
            </span>
          </div>
        </div>
        <svg viewBox="0 0 600 280" className="w-full h-auto" role="img" aria-label="Grouped bar chart of renewable energy capacity 2016 to 2024">
          {[0, 450, 900, 1350, 1800].map((tick) => {
            const y = 230 - (tick / maxVal) * 190;
            return (
              <g key={tick}>
                <line x1="56" y1={y} x2="570" y2={y} stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeDasharray="3 3" />
                <text x="48" y={y + 4} textAnchor="end" className="fill-slate-500 dark:fill-slate-400 text-[11px] font-mono">
                  {tick}
                </text>
              </g>
            );
          })}
          {data.map((group, idx) => {
            const baseX = 110 + idx * 165;
            const bars = [
              { val: group.solar, fill: '#4338CA', offset: 0 },
              { val: group.wind, fill: '#64748B', offset: 36 },
              { val: group.hydro, fill: '#059669', offset: 72 },
            ];
            return (
              <g key={group.year}>
                {bars.map((b, bi) => {
                  const h = (b.val / maxVal) * 190;
                  const y = 230 - h;
                  return (
                    <g key={bi}>
                      <rect x={baseX + b.offset} y={y} width="28" height={h} rx="3" fill={b.fill} />
                      <text
                        x={baseX + b.offset + 14}
                        y={y - 6}
                        textAnchor="middle"
                        className="fill-slate-700 dark:fill-slate-300 text-[10px] font-mono font-medium"
                      >
                        {b.val}
                      </text>
                    </g>
                  );
                })}
                <text x={baseX + 50} y="254" textAnchor="middle" className="fill-slate-700 dark:fill-slate-300 text-xs font-semibold font-mono">
                  {group.year}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  if (visualKey === 'desalination_diagram') {
    const stages = [
      { num: '01', label: 'Offshore Intake', detail: 'Submerged screen filters debris' },
      { num: '02', label: 'Pre-Filtration', detail: 'Sand & micro-filter beds' },
      { num: '03', label: 'Reverse Osmosis', detail: '60 bar membrane separation' },
      { num: '04', label: 'Remineralization', detail: 'Calcium, pH & UV treatment' },
      { num: '05', label: 'Municipal Storage', detail: 'Potable city water grid' },
    ];
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {title || 'Coastal Seawater Desalination Facility — 5-Stage Process'}
        </h4>
        <svg viewBox="0 0 760 220" className="w-full h-auto" role="img" aria-label="Five stage coastal seawater desalination process diagram">
          {stages.map((st, idx) => {
            const x = 16 + idx * 148;
            return (
              <g key={st.num}>
                <rect
                  x={x}
                  y="32"
                  width="126"
                  height="112"
                  rx="8"
                  className="fill-slate-50 dark:fill-slate-800/80 stroke-slate-300 dark:stroke-slate-700"
                  strokeWidth="1.5"
                />
                <text x={x + 12} y="54" className="fill-indigo-600 dark:fill-indigo-400 text-[11px] font-mono font-bold">
                  STAGE {st.num}
                </text>
                <text x={x + 12} y="78" className="fill-slate-900 dark:fill-slate-100 text-[12px] font-semibold">
                  {st.label}
                </text>
                <text x={x + 12} y="102" className="fill-slate-500 dark:fill-slate-400 text-[10px]">
                  {st.detail.slice(0, 22)}
                </text>
                <text x={x + 12} y="116" className="fill-slate-500 dark:fill-slate-400 text-[10px]">
                  {st.detail.slice(22)}
                </text>
                {idx < stages.length - 1 && (
                  <path
                    d={`M ${x + 126} 88 L ${x + 146} 88 M ${x + 140} 82 L ${x + 146} 88 L ${x + 140} 94`}
                    stroke="#4338CA"
                    strokeWidth="2"
                    fill="none"
                  />
                )}
              </g>
            );
          })}
          {/* Brine discharge loop from Stage 3 */}
          <path d="M 375 144 L 375 182 L 79 182 L 79 162" stroke="#D97706" strokeWidth="1.8" strokeDasharray="4 3" fill="none" />
          <text x="225" y="198" textAnchor="middle" className="fill-amber-700 dark:fill-amber-400 text-[11px] font-medium">
            Concentrated Brine Return (Offshore Diffuser Pipe)
          </text>
        </svg>
      </div>
    );
  }

  if (visualKey === 'market_scene') {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <svg viewBox="0 0 640 300" className="w-full h-auto block" role="img" aria-label="Sunlit European outdoor weekend book and flower market scene">
          <defs>
            <linearGradient id="skyWarm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#DBEAFE" />
              <stop offset="100%" stopColor="#FEF3C7" />
            </linearGradient>
          </defs>
          <rect width="640" height="300" fill="url(#skyWarm)" />
          {/* Historic Facades */}
          <rect x="20" y="34" width="130" height="170" fill="#E2E8F0" stroke="#94A3B8" />
          <rect x="150" y="20" width="160" height="184" fill="#F1F5F9" stroke="#94A3B8" />
          <rect x="310" y="42" width="145" height="162" fill="#E7E5E4" stroke="#A8A29E" />
          <rect x="455" y="28" width="165" height="176" fill="#E2E8F0" stroke="#94A3B8" />
          {/* Windows */}
          {[44, 96, 178, 232, 336, 390, 486, 548].map((wx, i) => (
            <rect key={i} x={wx} y="60" width="28" height="44" rx="3" fill="#475569" opacity="0.7" />
          ))}
          {/* Cobblestone Street */}
          <rect x="0" y="204" width="640" height="96" fill="#CBD5E1" />
          <path d="M0 230 H640 M0 258 H640 M0 284 H640" stroke="#94A3B8" strokeWidth="1" opacity="0.5" />
          {/* Book Stall Left */}
          <path d="M55 135 L235 135 L248 164 L42 164 Z" fill="#4338CA" />
          <path d="M85 135 L105 164 M135 135 L145 164 M185 135 L195 164" stroke="#E0E7FF" strokeWidth="4" />
          <rect x="60" y="164" width="170" height="62" fill="#92400E" />
          {/* Stacked Books */}
          <rect x="74" y="182" width="22" height="10" fill="#F8FAFC" />
          <rect x="76" y="172" width="20" height="10" fill="#EF4444" />
          <rect x="108" y="176" width="26" height="16" fill="#1E293B" />
          <rect x="144" y="178" width="32" height="14" fill="#059669" />
          <rect x="186" y="174" width="28" height="18" fill="#F59E0B" />
          {/* Flower Stall Right */}
          <path d="M365 135 L565 135 L580 164 L350 164 Z" fill="#059669" />
          <rect x="372" y="164" width="186" height="62" fill="#78350F" />
          {/* Flower Bouquets */}
          {[395, 430, 465, 500, 535].map((fx, idx) => (
            <g key={fx}>
              <rect x={fx - 8} y="190" width="16" height="24" rx="2" fill="#E2E8F0" />
              <circle cx={fx} cy="182" r="11" fill={idx % 2 === 0 ? '#F43F5E' : '#F59E0B'} />
              <circle cx={fx - 6} cy="176" r="7" fill={idx % 2 === 0 ? '#FB7185' : '#FBBF24'} />
            </g>
          ))}
          {/* Shoppers Silhouettes */}
          <circle cx="282" cy="178" r="10" fill="#1E293B" />
          <path d="M268 238 L272 192 Q282 188 292 192 L296 238 Z" fill="#334155" />
          <circle cx="322" cy="182" r="9" fill="#0F172A" />
          <path d="M310 238 L314 195 Q322 191 330 195 L334 238 Z" fill="#4338CA" />
        </svg>
        <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
          {title || 'Outdoor Weekend Book & Flower Market — Observe foreground stalls, shoppers, and architectural setting'}
        </div>
      </div>
    );
  }

  // science_lab_scene fallback / default
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <svg viewBox="0 0 640 300" className="w-full h-auto block" role="img" aria-label="University environmental research laboratory scene">
        <rect width="640" height="300" fill="#F8FAFC" />
        {/* Large Lab Window */}
        <rect x="40" y="24" width="560" height="128" rx="6" fill="#E0F2FE" stroke="#CBD5E1" strokeWidth="2" />
        <line x1="226" y1="24" x2="226" y2="152" stroke="#CBD5E1" strokeWidth="3" />
        <line x1="414" y1="24" x2="414" y2="152" stroke="#CBD5E1" strokeWidth="3" />
        {/* Lab Bench */}
        <rect x="30" y="196" width="580" height="20" rx="3" fill="#334155" />
        <rect x="52" y="216" width="536" height="84" fill="#E2E8F0" />
        {/* Researcher 1 */}
        <circle cx="195" cy="116" r="18" fill="#1E293B" />
        <path d="M162 196 L172 142 Q195 134 218 142 L228 196 Z" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="2" />
        {/* Researcher 2 */}
        <circle cx="430" cy="120" r="18" fill="#334155" />
        <path d="M396 196 L406 146 Q430 138 454 146 L464 196 Z" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="2" />
        {/* Microscope */}
        <path d="M278 196 L312 196 M295 196 L295 152 L314 140" stroke="#0F172A" strokeWidth="6" strokeLinecap="round" fill="none" />
        <rect x="282" y="176" width="26" height="6" fill="#4338CA" />
        {/* Water Sample Flasks */}
        <path d="M110 196 L122 162 L134 196 Z" fill="#38BDF8" opacity="0.7" stroke="#0284C7" strokeWidth="2" />
        <path d="M142 196 L154 166 L166 196 Z" fill="#34D399" opacity="0.7" stroke="#059669" strokeWidth="2" />
        {/* Digital Tablet */}
        <rect x="492" y="158" width="64" height="38" rx="4" fill="#1E293B" />
        <polyline points="500,186 514,174 528,179 546,166" fill="none" stroke="#818CF8" strokeWidth="2.5" />
      </svg>
      <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
        {title || 'University Environmental Science Laboratory — Describe the people, equipment, and collaborative task'}
      </div>
    </div>
  );
};

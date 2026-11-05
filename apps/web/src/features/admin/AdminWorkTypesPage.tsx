import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { GitFork, Layers, ChevronRight } from 'lucide-react';

export function AdminWorkTypesPage() {
  const { data: workTypes } = useQuery({
    queryKey: ['workTypes'],
    queryFn: () => apiRequest<any[]>('/work-types'),
  });

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => apiRequest<any[]>('/templates'),
  });

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto text-zinc-100 select-none pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <GitFork className="h-4 w-4 text-zinc-400" />
            Work Types & Templates
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure scanlation production slots, review requirements, default turnaround times, and sequence templates
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Work Types */}
        <div className="rounded-xl border border-zinc-800 bg-[#111215] p-5 space-y-4 shadow-sm">
          <div className="pb-3 border-b border-zinc-800/80">
            <h3 className="text-xs font-semibold text-zinc-100">Configured Work Slots</h3>
          </div>

          <div className="space-y-2.5">
            {workTypes?.map((wt) => (
              <div
                key={wt.id}
                className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/40 flex items-center justify-between text-xs transition-colors hover:border-zinc-700/80"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-zinc-800 text-zinc-200 border border-zinc-700/60">
                      {wt.name} ({wt.code})
                    </span>
                    {wt.requiresReview && <Badge variant="outline">Requires QC</Badge>}
                  </div>
                  <div className="text-[11px] text-zinc-400 leading-normal">{wt.description}</div>
                </div>

                <div className="text-right text-[10px] text-zinc-500 font-mono shrink-0 pl-3">
                  <div>Est: {wt.estimatedWorkloadHours}h</div>
                  <div>Limit: {wt.defaultDeadlineHours}h</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Templates */}
        <div className="rounded-xl border border-zinc-800 bg-[#111215] p-5 space-y-4 shadow-sm">
          <div className="pb-3 border-b border-zinc-800/80 flex items-center gap-2">
            <Layers className="h-4 w-4 text-zinc-400" />
            <h3 className="text-xs font-semibold text-zinc-100">Production Sequence Templates</h3>
          </div>

          <div className="space-y-3">
            {templates?.map((t) => (
              <div key={t.id} className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/40 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-200">{t.name}</span>
                  {t.isDefault && <Badge variant="default">Default</Badge>}
                </div>
                <p className="text-zinc-400 text-[11px] leading-normal">{t.description}</p>

                {/* Steps Flow */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] text-zinc-500 font-mono">
                    Sequence flow ({t.steps?.length} stages):
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {t.steps?.map((step: any, idx: number) => (
                      <React.Fragment key={idx}>
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px] border border-zinc-700/60">
                          {step.workTypeId?.name || `Step ${step.order}`}
                        </span>
                        {idx < t.steps.length - 1 && (
                          <ChevronRight className="h-3 w-3 text-zinc-600" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

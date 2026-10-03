import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GitFork, Layers, Clock, ShieldCheck } from 'lucide-react';

export function AdminWorkTypesPage() {
  const { data: workTypes, isLoading: isWTypesLoading } = useQuery({
    queryKey: ['workTypes'],
    queryFn: () => apiRequest<any[]>('/work-types'),
  });

  const { data: templates, isLoading: isTemplatesLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => apiRequest<any[]>('/templates'),
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-4">
        <h2 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          <GitFork className="h-5 w-5 text-indigo-400" />
          Work Types & Production Templates
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Configure production slots, review requirements, default deadlines, and sequential templates.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Work Types (Specification #7) */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-200">Configured Work Types</h3>

          <div className="space-y-2.5">
            {workTypes?.map((wt) => (
              <div
                key={wt.id}
                className="p-3 rounded-md border border-zinc-800 bg-zinc-950/40 flex items-center justify-between text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded font-mono font-medium"
                      style={{ backgroundColor: `${wt.color}20`, color: wt.color }}
                    >
                      {wt.name} ({wt.code})
                    </span>
                    {wt.requiresReview && <Badge variant="outline">Requires QC</Badge>}
                  </div>
                  <div className="text-[11px] text-zinc-400">{wt.description}</div>
                </div>

                <div className="text-right text-[11px] text-zinc-400 font-mono">
                  <div>Est: {wt.estimatedWorkloadHours}h</div>
                  <div>Deadline: {wt.defaultDeadlineHours}h</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Templates (Specification #8) */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Layers className="h-4 w-4 text-purple-400" />
            Standard Production Pipeline Templates
          </h3>

          <div className="space-y-3">
            {templates?.map((t) => (
              <div key={t.id} className="p-4 rounded-md border border-zinc-800 bg-zinc-950/40 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-200">{t.name}</span>
                  {t.isDefault && <Badge variant="info">Default</Badge>}
                </div>
                <p className="text-zinc-400 text-[11px]">{t.description}</p>

                {/* Steps Flow */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] text-zinc-500 font-mono uppercase">Sequential Steps ({t.steps?.length}):</div>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {t.steps?.map((step: any, idx: number) => (
                      <React.Fragment key={idx}>
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px] border border-zinc-700">
                          {step.workTypeId?.name || `Step ${step.order}`}
                        </span>
                        {idx < t.steps.length - 1 && <span className="text-zinc-600">➔</span>}
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

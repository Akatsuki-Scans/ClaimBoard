import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { SearchIcon, ClockIcon, CheckCircleIcon } from '../../components/ui/icon';

export function MyClaimsPage() {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<'task' | 'manga'>('task');
  const [activeFilter, setActiveFilter] = useState<'All' | 'Active' | 'Due Soon' | 'Overdue' | 'Review' | 'Completed'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Submit Deliverable Modal State
  const [submittingClaim, setSubmittingClaim] = useState<any | null>(null);
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [deliverableLabel, setDeliverableLabel] = useState('');
  const [deliverableNotes, setDeliverableNotes] = useState('');

  const { data: claims, isLoading } = useQuery({
    queryKey: ['claims', 'my'],
    queryFn: () => apiRequest<any[]>('/claims/my').catch(() => []),
  });

  // Submit Deliverable Mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/deliverables/submit', {
        method: 'POST',
        body: JSON.stringify({
          assignmentId: submittingClaim.assignmentId || submittingClaim.id,
          deliverableUrl,
          label: deliverableLabel,
          notes: deliverableNotes,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      setSubmittingClaim(null);
      setDeliverableUrl('');
      setDeliverableLabel('');
      setDeliverableNotes('');
    },
  });

  const filterPills = [
    { key: 'All', label: 'All' },
    { key: 'Active', label: 'Active' },
    { key: 'Due Soon', label: 'Due soon' },
    { key: 'Overdue', label: 'Overdue' },
    { key: 'Review', label: 'Under review' },
    { key: 'Completed', label: 'Completed' },
  ] as const;

  const realClaims = (claims || []).filter((item) => {
    const status = item.status || 'Active';
    if (activeFilter === 'Active' && status !== 'ACTIVE' && status !== 'IN_PROGRESS' && status !== 'CLAIMED') return false;
    if (activeFilter === 'Due Soon' && status !== 'DUE_SOON' && !item.isDueSoon) return false;
    if (activeFilter === 'Overdue' && !item.isOverdue) return false;
    if (activeFilter === 'Review' && status !== 'SUBMITTED' && status !== 'UNDER_REVIEW') return false;
    if (activeFilter === 'Completed' && status !== 'COMPLETED') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const manga = (item.mangaTitle || item.manga?.title || '').toLowerCase();
      if (!manga.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto text-zinc-100 select-none pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">My Claims & Tasks</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Active assignments, approaching deadlines, and deliverable review status
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <SearchIcon className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search my claims..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-3 rounded-lg bg-[#111215] border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700 w-48"
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 relative">
        {filterPills.map((pill) => {
          const isActive = activeFilter === pill.key;
          return (
            <button
              key={pill.key}
              onClick={() => setActiveFilter(pill.key as any)}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-colors z-10 ${
                isActive ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="myClaimsFilterPill"
                  className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-lg -z-10 shadow-sm"
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                />
              )}
              {pill.label}
            </button>
          );
        })}
      </div>

      {/* Claims Table */}
      <div className="rounded-xl border border-zinc-800 bg-[#111215] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th className="py-3 px-4">Series</th>
                <th className="py-3 px-4">Chapter</th>
                <th className="py-3 px-4">Work Slot</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Deadline</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-zinc-500">
                    Loading your claims...
                  </td>
                </tr>
              ) : realClaims.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-zinc-500">
                    No claims found matching this filter
                  </td>
                </tr>
              ) : (
                realClaims.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-medium text-zinc-100">
                        {item.mangaTitle || item.manga?.title || 'Manga'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-zinc-300">
                      Ch. {item.chapterNumber || item.chapter?.chapterNumber}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                        {item.workTypeName || item.workType?.name}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono ${
                          item.status === 'COMPLETED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW'
                            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                            : item.isOverdue
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-zinc-800 text-zinc-300 border border-zinc-700/60'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
                      {item.deadline ? new Date(item.deadline).toLocaleDateString() : 'No deadline'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {item.status === 'COMPLETED' ? (
                        <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20">
                          Completed
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs px-2.5"
                          onClick={() => {
                            setSubmittingClaim(item);
                            setDeliverableUrl(item.lastDeliverableUrl || '');
                            setDeliverableLabel(
                              item.lastDeliverableLabel ||
                                `${item.workTypeName || 'Task'} - ${item.mangaTitle || 'Chapter'} Submission`
                            );
                            setDeliverableNotes('');
                          }}
                        >
                          {item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW' || item.revisionsCount > 0
                            ? 'Edit Deliverable'
                            : 'Submit Work'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deliverable Submission Modal */}
      {submittingClaim && (
        <Modal
          isOpen={true}
          onClose={() => setSubmittingClaim(null)}
          title={
            submittingClaim.status === 'SUBMITTED' ||
            submittingClaim.status === 'UNDER_REVIEW' ||
            submittingClaim.revisionsCount > 0
              ? `Edit Submission: ${submittingClaim.mangaTitle || 'Manga'}`
              : `Submit Deliverable: ${submittingClaim.mangaTitle || 'Manga'}`
          }
          description="Submit production files (Google Drive, Mega, Dropbox, or OneDrive URL) for verification."
        >
          <div className="space-y-4">
            {submittingClaim.revisionsCount > 0 && (
              <div className="p-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300">
                You have submitted <strong>{submittingClaim.revisionsCount} revision(s)</strong>. Submitting again will update your submission to Revision #{submittingClaim.revisionsCount + 1}.
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Deliverable Link (URL) <span className="text-rose-400">*</span>
              </label>
              <Input
                value={deliverableUrl}
                onChange={(e) => setDeliverableUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Release Label <span className="text-rose-400">*</span>
              </label>
              <Input
                value={deliverableLabel}
                onChange={(e) => setDeliverableLabel(e.target.value)}
                placeholder="e.g. Chapter Typeset V1 (PSD / PNG)"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Notes for Reviewer</label>
              <Textarea
                value={deliverableNotes}
                onChange={(e) => setDeliverableNotes(e.target.value)}
                placeholder="Notes on font choice, SFX redraw, or spreads..."
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setSubmittingClaim(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => submitMutation.mutate()}
                isLoading={submitMutation.isPending}
                disabled={!deliverableUrl.trim()}
              >
                {submittingClaim.status === 'SUBMITTED' ||
                submittingClaim.status === 'UNDER_REVIEW' ||
                submittingClaim.revisionsCount > 0
                  ? 'Update Submission'
                  : 'Submit Deliverable'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

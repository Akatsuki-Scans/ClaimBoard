import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  Bookmark,
  Clock,
  Search,
} from 'lucide-react';

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
      setSubmittingClaim(null);
      setDeliverableUrl('');
      setDeliverableLabel('');
      setDeliverableNotes('');
    },
  });

  const filterPills = ['All', 'Active', 'Due Soon', 'Overdue', 'Review', 'Completed'] as const;

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
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Top Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">My Claims</h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          View your production tasks, deadlines, and deliverables
        </p>
      </div>

      {/* Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-3">
        {/* By Task / By Manga */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-lg text-xs">
          <button
            onClick={() => setSubTab('task')}
            className={`px-3 py-1 rounded-md transition-colors ${
              subTab === 'task' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            By Task
          </button>
          <button
            onClick={() => setSubTab('manga')}
            className={`px-3 py-1 rounded-md transition-colors ${
              subTab === 'manga' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            By Manga
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search claims..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 pr-3 rounded-lg bg-zinc-900 border border-zinc-700/80 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none w-52"
          />
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap items-center gap-2">
        {filterPills.map((pill) => (
          <button
            key={pill}
            onClick={() => setActiveFilter(pill)}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${
              activeFilter === pill
                ? 'bg-zinc-800 text-white font-medium border border-zinc-700'
                : 'bg-zinc-900/60 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
            }`}
          >
            {pill}
          </button>
        ))}
      </div>

      {/* Claims Table */}
      <div className="rounded-xl border border-zinc-800 bg-[#121215] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th className="py-3 px-4">Manga</th>
                <th className="py-3 px-4">Chapter</th>
                <th className="py-3 px-4">Work Type</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Deadline</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
              {realClaims.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-zinc-500">
                    No claims found. Claim available slots from the Open Work board.
                  </td>
                </tr>
              ) : (
                realClaims.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-zinc-100">{item.mangaTitle || item.manga?.title || 'Manga'}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-zinc-300">#{item.chapterNumber || item.chapter?.chapterNumber}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className="px-2 py-0.5 rounded text-[11px] font-medium"
                        style={{
                          backgroundColor: `${item.workTypeColor || '#6366f1'}20`,
                          color: item.workTypeColor || '#6366f1',
                        }}
                      >
                        {item.workTypeName || item.workType?.name}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-950/60 text-indigo-300 border border-indigo-800/50">
                        ● {item.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400 font-mono text-[11px]">
                      {item.deadline ? new Date(item.deadline).toLocaleDateString() : 'No deadline'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {item.status === 'COMPLETED' ? (
                        <span className="text-[11px] text-emerald-400 font-medium px-2 py-1 bg-emerald-500/10 rounded border border-emerald-500/20">
                          Completed
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant={item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW' || (item.revisionsCount > 0) ? 'secondary' : 'primary'}
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
                          {item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW' || (item.revisionsCount > 0)
                            ? 'Edit Submission'
                            : 'Submit'}
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
            submittingClaim.status === 'SUBMITTED' || submittingClaim.status === 'UNDER_REVIEW' || (submittingClaim.revisionsCount > 0)
              ? `Edit Submission: ${submittingClaim.mangaTitle || 'Manga'}`
              : `Submit Work: ${submittingClaim.mangaTitle || 'Manga'}`
          }
        >
          <div className="space-y-4">
            {submittingClaim.revisionsCount > 0 && (
              <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
                You have already submitted <strong>{submittingClaim.revisionsCount} revision(s)</strong>. Submitting again will update your submission to Revision #{submittingClaim.revisionsCount + 1}.
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Deliverable Link (URL)</label>
              <Input
                value={deliverableUrl}
                onChange={(e) => setDeliverableUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Release Label</label>
              <Input
                value={deliverableLabel}
                onChange={(e) => setDeliverableLabel(e.target.value)}
                placeholder="e.g. Chapter Redraw V1 (PSD / PNG)"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Notes for Reviewer</label>
              <Textarea
                value={deliverableNotes}
                onChange={(e) => setDeliverableNotes(e.target.value)}
                placeholder="Notes on double spreads, redraw layers, or corrections..."
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
              >
                {submittingClaim.status === 'SUBMITTED' || submittingClaim.status === 'UNDER_REVIEW' || (submittingClaim.revisionsCount > 0)
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

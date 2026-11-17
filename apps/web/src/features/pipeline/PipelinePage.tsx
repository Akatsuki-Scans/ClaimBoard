import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Textarea } from '../../components/ui/Input';
import { DeadlineDatePicker } from '../../components/application/date-picker/DatePicker';
import {
  GitBranch,
  Layers,
  Clock,
  Check,
  CheckCircle2,
  AlertCircle,
  Eye,
  ExternalLink,
  Lock,
  Copy,
  Plus,
  RefreshCw,
  ChevronRight,
  GripVertical,
  Upload,
  FileCheck,
  FileText,
  User,
  Kanban,
  Maximize2,
  ArrowLeft,
  Search,
  BookOpen,
  ArrowRight,
  Calendar,
} from 'lucide-react';
import {
  formatDeadlineCountdown,
  formatInUserTimeZone,
  getBrowserTimeZone,
  getDeadlineUrgency,
  getPresetDateTimeLocal,
  getTimeZoneShortLabel,
  getUrgencyStyles,
  toDateTimeLocalValue,
  zonedDateTimeLocalToIso,
} from '../../lib/deadlines';

interface StageDeliverable {
  id?: string;
  url: string;
  label: string;
  notes?: string;
  revision: number;
  submittedByName?: string;
  createdAt?: string;
}

interface PipelineReview {
  id?: string;
  reviewerName: string;
  status: 'Approved' | 'Changes_Requested';
  comment?: string;
  createdAt?: string;
}

interface PipelineStage {
  assignmentId: string;
  workTypeId: string;
  workTypeCode: string;
  workTypeName: string;
  color: string;
  status: string;
  priority: string;
  isBlocked: boolean;
  blockedReason?: string;
  assignedWorkerId?: string;
  assignedWorkerName?: string;
  activeClaimId?: string;
  deadline?: string;
  submittedAt?: string;
  completedAt?: string;
  hasDeliverables?: boolean;
  deliverablesCount?: number;
  latestDeliverable?: StageDeliverable | null;
  latestReview?: PipelineReview | null;
}

interface ChapterPipeline {
  chapterId: string;
  chapterNumber: number;
  title?: string;
  mangaId: string;
  mangaTitle: string;
  mangaCoverUrl?: string;
  priority: string;
  status: string;
  deadline?: string;
  releaseDate?: string;
  stages: PipelineStage[];
}

// Milanote status columns definition
const MILANOTE_COLUMNS = [
  {
    id: 'BACKLOG',
    title: 'Planning & Backlog',
    description: 'Awaiting assignment or dependent tasks',
    statuses: ['OPEN'],
    targetStatus: 'OPEN',
    accentColor: '#71717a', // zinc
    bgColor: 'bg-zinc-500/10',
    borderColor: 'border-zinc-700/50',
  },
  {
    id: 'IN_PROGRESS',
    title: 'In Production',
    description: 'Active tasks claimed by workers',
    statuses: ['IN_PROGRESS', 'CLAIMED', 'ACTIVE'],
    targetStatus: 'IN_PROGRESS',
    accentColor: '#6366f1', // indigo
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-700/50',
  },
  {
    id: 'UNDER_REVIEW',
    title: 'Under Review',
    description: 'Submitted deliverables awaiting feedback or QC',
    statuses: ['SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED'],
    targetStatus: 'IN_REVIEW',
    accentColor: '#f59e0b', // amber
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-700/50',
  },
  {
    id: 'COMPLETED',
    title: 'Completed & Approved',
    description: 'Verified work ready for publication',
    statuses: ['COMPLETED', 'APPROVED'],
    targetStatus: 'COMPLETED',
    accentColor: '#10b981', // emerald
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-700/50',
  },
];

export function PipelinePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { mangaId: routeMangaId, chapterId: routeChapterId } = useParams<{ mangaId?: string; chapterId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Overview search and filter state
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedMangaFilter, setSelectedMangaFilter] = useState<string>(searchParams.get('mangaId') || 'All');

  // Detail view mode toggle
  const [viewMode, setViewMode] = useState<'milanote' | 'flow'>('milanote');

  // Drag and Drop state
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  // Inspector & Submission Modal states
  const [inspectedStage, setInspectedStage] = useState<PipelineStage | null>(null);
  const [stageDeadlineInput, setStageDeadlineInput] = useState('');
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submissionUrl, setSubmissionUrl] = useState('');
  const [submissionLabel, setSubmissionLabel] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Live Manga query
  const { data: mangaList } = useQuery({
    queryKey: ['manga'],
    queryFn: () => apiRequest<any[]>('/manga').catch(() => []),
  });

  // User timezone preference
  const { data: tzData } = useQuery<{ timezone: string | null }>({
    queryKey: ['deadlines', 'timezone'],
    queryFn: () => apiRequest<{ timezone: string | null }>('/deadlines/timezone').catch(() => ({ timezone: null })),
  });
  const activeTimeZone = tzData?.timezone || getBrowserTimeZone();

  const openInspector = (stage: PipelineStage) => {
    setInspectedStage(stage);
    setStageDeadlineInput(
      toDateTimeLocalValue(stage.deadline, activeTimeZone) || getPresetDateTimeLocal(48, activeTimeZone)
    );
  };

  // Live Pipeline query with real-time automatic polling fallback
  const { data: pipelineData, isLoading, refetch, isFetching } = useQuery<ChapterPipeline[]>({
    queryKey: ['pipeline'],
    queryFn: () => apiRequest<ChapterPipeline[]>('/pipeline').catch(() => []),
    refetchInterval: 4000,
  });

  // Identify active chapter based on route parameters
  const activeChapter = useMemo(() => {
    if (!pipelineData || pipelineData.length === 0) return null;

    // Check if route has chapterId or mangaId
    if (routeChapterId) {
      const match = pipelineData.find(
        (c) =>
          c.chapterId === routeChapterId ||
          c.chapterNumber.toString() === routeChapterId ||
          (routeMangaId && (c.mangaId === routeMangaId || c.mangaTitle.toLowerCase() === routeMangaId.toLowerCase()) && c.chapterNumber.toString() === routeChapterId)
      );
      if (match) return match;
    }

    if (routeMangaId && !routeChapterId) {
      const match = pipelineData.find(
        (c) => c.chapterId === routeMangaId || c.mangaId === routeMangaId
      );
      if (match) return match;
    }

    return null;
  }, [pipelineData, routeMangaId, routeChapterId]);

  // Is this the dedicated chapter detail page?
  const isDetailPage = !!activeChapter;

  // Fetch full deliverables history for inspected assignment
  const { data: assignmentDeliverables, refetch: refetchDeliverables } = useQuery<any[]>({
    queryKey: ['deliverables', inspectedStage?.assignmentId],
    queryFn: () => {
      if (!inspectedStage?.assignmentId) return Promise.resolve([]);
      return apiRequest<any[]>(`/deliverables/assignment/${inspectedStage.assignmentId}`).catch(() => []);
    },
    enabled: !!inspectedStage?.assignmentId,
  });

  // Status Update Mutation (Drag & Drop or quick status button)
  const updateStatusMutation = useMutation({
    mutationFn: async ({ assignmentId, status }: { assignmentId: string; status: string }) => {
      return apiRequest(`/assignments/${assignmentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      if (inspectedStage) {
        setInspectedStage((prev) => (prev ? { ...prev, status: draggedStageId ? prev.status : prev.status } : null));
      }
    },
  });

  // Update Assignment Deadline Mutation
  const updateStageDeadlineMutation = useMutation({
    mutationFn: async ({ assignmentId, deadline }: { assignmentId: string; deadline: string | null }) => {
      return apiRequest(`/assignments/${assignmentId}/deadline`, {
        method: 'PATCH',
        body: JSON.stringify({
          deadline: deadline ? zonedDateTimeLocalToIso(deadline, activeTimeZone) : null,
        }),
      });
    },
    onSuccess: (data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      if (inspectedStage && inspectedStage.assignmentId === variables.assignmentId) {
        setInspectedStage((prev) => (prev ? { ...prev, deadline: data?.deadline || undefined } : null));
      }
    },
  });

  // Submit Deliverable Mutation
  const submitDeliverableMutation = useMutation({
    mutationFn: async () => {
      if (!inspectedStage) return;
      return apiRequest('/deliverables/submit', {
        method: 'POST',
        body: JSON.stringify({
          assignmentId: inspectedStage.assignmentId,
          deliverableUrl: submissionUrl,
          label: submissionLabel || `${inspectedStage.workTypeName} Deliverable`,
          notes: submissionNotes,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['deliverables', inspectedStage?.assignmentId] });
      setIsSubmitModalOpen(false);
      setSubmissionUrl('');
      setSubmissionLabel('');
      setSubmissionNotes('');
      refetchDeliverables();
    },
  });

  // Review Submission Mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ status }: { status: 'Approved' | 'Changes_Requested' }) => {
      if (!inspectedStage) return;
      return apiRequest('/reviews/submit', {
        method: 'POST',
        body: JSON.stringify({
          assignmentId: inspectedStage.assignmentId,
          status,
          comment: reviewComment || (status === 'Approved' ? 'Approved through pipeline inspector.' : 'Changes requested.'),
          severity: 'Moderate',
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['deliverables', inspectedStage?.assignmentId] });
      setReviewComment('');
      setInspectedStage(null);
    },
  });

  const stages: PipelineStage[] = activeChapter?.stages || [];

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, assignmentId: string) => {
    e.dataTransfer.setData('text/plain', assignmentId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedStageId(assignmentId);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumnId !== columnId) {
      setDragOverColumnId(columnId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColumnId(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    setDragOverColumnId(null);
    const assignmentId = e.dataTransfer.getData('text/plain') || draggedStageId;
    setDraggedStageId(null);

    if (!assignmentId) return;
    updateStatusMutation.mutate({ assignmentId, status: targetStatus });
  };

  // Helper to test if a string is a direct image URL
  const isImageUrl = (url?: string) => {
    if (!url) return false;
    return (
      url.match(/\.(jpeg|jpg|gif|png|webp|svg)($|\?)/i) != null ||
      url.includes('images.unsplash.com') ||
      url.includes('cdn.discordapp.com') ||
      url.includes('imgur.com')
    );
  };

  // Helper to copy URL to clipboard
  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // Filtered chapters for the /pipeline index view
  const filteredChapters = useMemo(() => {
    if (!pipelineData) return [];
    return pipelineData.filter((item) => {
      if (selectedMangaFilter !== 'All' && item.mangaId !== selectedMangaFilter) return false;
      if (searchFilter) {
        const query = searchFilter.toLowerCase();
        const manga = item.mangaTitle.toLowerCase();
        const ch = item.chapterNumber.toString();
        const title = (item.title || '').toLowerCase();
        if (!manga.includes(query) && !ch.includes(query) && !title.includes(query)) return false;
      }
      return true;
    });
  }, [pipelineData, selectedMangaFilter, searchFilter]);

  // Calculate chapter completion progress
  const completedStagesCount = stages.filter((s) => s.status === 'COMPLETED' || s.status === 'APPROVED').length;
  const progressPercentage = stages.length > 0 ? Math.round((completedStagesCount / stages.length) * 100) : 0;

  // -------------------------------------------------------------
  // VIEW 1: DEDICATED CHAPTER DETAIL MILANOTE BOARD
  // When visited at /pipeline/:mangaId/:chapterId or /pipeline/:chapterId
  // -------------------------------------------------------------
  if (isDetailPage && activeChapter) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-16">
        {/* Navigation Breadcrumbs & Back Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <Link
              to="/pipeline"
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition-colors"
              title="Back to All Pipelines"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            <div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Link to="/pipeline" className="hover:text-zinc-200 transition-colors">
                  Pipelines
                </Link>
                <ChevronRight className="h-3 w-3 text-zinc-600" />
                <span className="text-zinc-300 font-medium">{activeChapter.mangaTitle}</span>
                <ChevronRight className="h-3 w-3 text-zinc-600" />
                <span className="text-white font-semibold">Ch. {activeChapter.chapterNumber}</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2 mt-0.5">
                <span>{activeChapter.mangaTitle}</span>
                <span className="text-zinc-600">•</span>
                <span className="text-white font-mono">Chapter {activeChapter.chapterNumber}</span>
                {activeChapter.title && (
                  <span className="text-zinc-400 font-normal text-sm">({activeChapter.title})</span>
                )}
              </h1>
            </div>
          </div>

          {/* View Mode Toggle & Refresh */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setViewMode('milanote')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors ${
                  viewMode === 'milanote'
                    ? 'bg-zinc-800 text-white font-medium shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Kanban className="h-3.5 w-3.5 text-zinc-300" />
                Milanote Board
              </button>
              <button
                onClick={() => setViewMode('flow')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors ${
                  viewMode === 'flow'
                    ? 'bg-zinc-800 text-white font-medium shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <GitBranch className="h-3.5 w-3.5 text-zinc-300" />
                Linear Flow
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-xs h-8 px-2.5 text-zinc-400 hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
              Sync
            </Button>
          </div>
        </div>

        {/* Chapter Header Card with BLACK & WHITE ONLY Progress Bar */}
        <div className="rounded-2xl border border-zinc-800/80 bg-[#111317] p-5 shadow-lg">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            {/* Manga Info */}
            <div className="flex items-center gap-4">
              {activeChapter.mangaCoverUrl ? (
                <img
                  src={activeChapter.mangaCoverUrl}
                  alt={activeChapter.mangaTitle}
                  className="h-16 w-12 object-cover rounded-lg border border-zinc-700 shadow-md shrink-0"
                />
              ) : (
                <div className="h-16 w-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-zinc-500" />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-300">
                    {activeChapter.mangaTitle}
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-xs text-zinc-400 font-mono">
                    {activeChapter.priority || 'Normal'} Priority
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white mt-0.5">
                  Chapter {activeChapter.chapterNumber}
                </h2>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-zinc-400">
                  <span>
                    Status: <strong className="text-white font-medium">{activeChapter.status}</strong>
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span>
                    Completed: <strong className="text-white font-mono">{completedStagesCount}</strong> / {stages.length} stages
                  </span>
                  {activeChapter.deadline && (
                    <>
                      <span className="text-zinc-600">•</span>
                      <span
                        className={`font-mono text-[11px] flex items-center gap-1 ${getUrgencyStyles(getDeadlineUrgency(activeChapter.deadline, activeChapter.status)).text}`}
                        title={formatInUserTimeZone(activeChapter.deadline, activeTimeZone, 'full')}
                      >
                        <Calendar className="h-3 w-3" />
                        Target: {formatDeadlineCountdown(activeChapter.deadline, activeChapter.status, activeTimeZone)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* BLACK & WHITE ONLY PROGRESS BAR */}
            <div className="lg:w-80">
              <div className="flex justify-between text-xs mb-1.5 font-mono">
                <span className="text-zinc-400">Production Progress</span>
                <span className="text-white font-bold">{progressPercentage}%</span>
              </div>
              {/* Pure monochrome black and white progress track and fill */}
              <div className="w-full bg-[#1e222a] rounded-full h-2 overflow-hidden border border-zinc-800">
                <div
                  className="h-full bg-white transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* MILANOTE KANBAN DRAG & DROP BOARD */}
        {viewMode === 'milanote' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {MILANOTE_COLUMNS.map((column) => {
              const columnStages = stages.filter((stage) => column.statuses.includes(stage.status));
              const isDragOver = dragOverColumnId === column.id;

              return (
                <div
                  key={column.id}
                  onDragOver={(e) => handleDragOver(e, column.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, column.targetStatus)}
                  className={`rounded-2xl border transition-all duration-200 flex flex-col min-h-[500px] ${
                    isDragOver
                      ? 'border-white/60 bg-zinc-900/60 ring-2 ring-white/20 shadow-lg'
                      : 'border-zinc-800/80 bg-[#0f1115]/90'
                  }`}
                >
                  {/* Column Header */}
                  <div className="p-3.5 border-b border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: column.accentColor }}
                      />
                      <h3 className="text-xs font-semibold text-zinc-200">
                        {column.title}
                      </h3>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 font-semibold">
                      {columnStages.length}
                    </span>
                  </div>

                  {/* Draggable Cards Container */}
                  <div className="p-3 space-y-3 flex-1 overflow-y-auto">
                    {columnStages.length === 0 ? (
                      <div
                        className={`h-36 rounded-xl border border-dashed flex flex-col items-center justify-center p-4 text-center transition-colors ${
                          isDragOver
                            ? 'border-white/50 bg-zinc-900 text-white'
                            : 'border-zinc-800/60 bg-zinc-950/20 text-zinc-600'
                        }`}
                      >
                        <span className="text-xs font-medium">Drag option here</span>
                        <span className="text-[10px] mt-0.5">Move task to {column.title}</span>
                      </div>
                    ) : (
                      columnStages.map((stage) => {
                        const isBeingDragged = draggedStageId === stage.assignmentId;
                        const hasSub = stage.hasDeliverables || !!stage.latestDeliverable;

                        return (
                          <div
                            key={stage.assignmentId}
                            draggable={true}
                            onDragStart={(e) => handleDragStart(e, stage.assignmentId)}
                            onClick={() => openInspector(stage)}
                            className={`group relative rounded-xl border p-4 bg-[#14171d] hover:bg-[#181b22] transition-all duration-150 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-xl ${
                              isBeingDragged
                                ? 'opacity-40 border-dashed border-white/60 scale-95'
                                : 'border-zinc-800/90 hover:border-zinc-600'
                            }`}
                          >
                            {/* Drag Handle & Stage Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2 w-2 rounded-full shrink-0"
                                  style={{ backgroundColor: stage.color || '#ffffff' }}
                                />
                                <span
                                  className="text-xs font-bold px-2 py-0.5 rounded-md text-white border"
                                  style={{
                                    backgroundColor: `${stage.color || '#ffffff'}22`,
                                    borderColor: `${stage.color || '#ffffff'}55`,
                                  }}
                                >
                                  {stage.workTypeCode}
                                </span>
                                <span className="text-xs font-semibold text-zinc-200">
                                  {stage.workTypeName}
                                </span>
                              </div>

                              <div className="flex items-center text-zinc-500 group-hover:text-zinc-300">
                                <GripVertical className="h-4 w-4" />
                              </div>
                            </div>

                            {/* Assignee & Blocked Status */}
                            <div className="mt-3 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5 text-zinc-400">
                                <User className="h-3.5 w-3.5 text-zinc-500" />
                                <span className="truncate max-w-[120px]">
                                  {stage.assignedWorkerName || (
                                    <span className="text-zinc-500 italic">Unassigned</span>
                                  )}
                                </span>
                              </div>

                              {stage.isBlocked && (
                                <span
                                  title={stage.blockedReason || 'Waiting for previous stage'}
                                  className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.5 rounded"
                                >
                                  <Lock className="h-2.5 w-2.5" />
                                  Blocked
                                </span>
                              )}
                            </div>

                            {/* Approved by Admin Indicator */}
                            {(stage.status === 'COMPLETED' || stage.status === 'APPROVED') && (
                              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-900/50 px-2 py-0.5 rounded-md">
                                <CheckCircle2 className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  {stage.latestReview?.reviewerName
                                    ? `Approved by ${stage.latestReview.reviewerName}`
                                    : 'Approved by Admin'}
                                </span>
                              </div>
                            )}

                            {/* Deadline if present */}
                            {stage.deadline && (
                              (() => {
                                const urgency = getDeadlineUrgency(stage.deadline, stage.status);
                                const styles = getUrgencyStyles(urgency);
                                return (
                                  <div
                                    className={`mt-2 text-[11px] flex items-center justify-between font-mono ${styles.text}`}
                                    title={formatInUserTimeZone(stage.deadline, activeTimeZone, 'full')}
                                  >
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3 shrink-0" />
                                      <span>{formatDeadlineCountdown(stage.deadline, stage.status, activeTimeZone)}</span>
                                    </span>
                                    <span className="text-[10px] text-zinc-500">
                                      {formatInUserTimeZone(stage.deadline, activeTimeZone, 'dateOnly')}
                                    </span>
                                  </div>
                                );
                              })()
                            )}

                            {/* MILANOTE SUBMISSION PREVIEW BLOCK */}
                            <div className="mt-3 pt-3 border-t border-zinc-800/80">
                              {hasSub && stage.latestDeliverable ? (
                                <div className="rounded-lg bg-zinc-900/90 border border-zinc-700/60 p-2.5 space-y-2 hover:border-zinc-500 transition-colors">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono text-zinc-300 flex items-center gap-1">
                                      <FileCheck className="h-3 w-3 text-zinc-400" />
                                      Rev #{stage.latestDeliverable.revision} submitted
                                    </span>
                                    <span className="text-[10px] text-zinc-500">
                                      {stage.deliverablesCount && stage.deliverablesCount > 1
                                        ? `+${stage.deliverablesCount - 1} rev`
                                        : ''}
                                    </span>
                                  </div>

                                  {/* Image thumbnail preview if direct image */}
                                  {isImageUrl(stage.latestDeliverable.url) && (
                                    <div className="relative rounded-md overflow-hidden border border-zinc-800 h-24 w-full bg-zinc-950">
                                      <img
                                        src={stage.latestDeliverable.url}
                                        alt="Deliverable preview"
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-1.5">
                                        <span className="text-[10px] text-zinc-200 truncate">
                                          {stage.latestDeliverable.label}
                                        </span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Non-image link chip */}
                                  {!isImageUrl(stage.latestDeliverable.url) && (
                                    <div className="text-xs text-zinc-300 font-medium truncate flex items-center gap-1.5">
                                      <FileText className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                                      <span className="truncate">
                                        {stage.latestDeliverable.label || 'Submission Deliverable'}
                                      </span>
                                    </div>
                                  )}

                                  {/* Click to See Submission Button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openInspector(stage);
                                    }}
                                    className="w-full flex items-center justify-center gap-1 text-[11px] font-medium py-1 px-2 rounded-md bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700 transition-colors"
                                  >
                                    <Eye className="h-3 w-3" />
                                    See Submission
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between text-[11px] text-zinc-500 py-0.5">
                                  <span>No deliverable yet</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openInspector(stage);
                                      setIsSubmitModalOpen(true);
                                    }}
                                    className="text-zinc-300 hover:text-white hover:underline flex items-center gap-0.5 text-[10px]"
                                  >
                                    <Plus className="h-2.5 w-2.5" />
                                    Submit
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Quick Move Option Dropdown (alternative to drag) */}
                            <div className="mt-2.5 flex items-center justify-between text-[10px] text-zinc-500">
                              <span>Move to:</span>
                              <select
                                value={stage.status}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  updateStatusMutation.mutate({
                                    assignmentId: stage.assignmentId,
                                    status: e.target.value,
                                  });
                                }}
                                className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-300 focus:outline-none cursor-pointer"
                              >
                                <option value="OPEN">Planning / Backlog</option>
                                <option value="IN_PROGRESS">In Production</option>
                                <option value="IN_REVIEW">Under Review</option>
                                <option value="COMPLETED">Completed</option>
                              </select>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* LINEAR FLOW VISUAL STEPPER VIEW */}
        {viewMode === 'flow' && (
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-6 shadow-sm overflow-x-auto">
            <div className="min-w-[750px] relative py-4">
              <div className="flex items-center justify-between relative">
                {stages.map((stage: PipelineStage, idx: number) => {
                  const isCompleted = stage.status === 'COMPLETED' || stage.status === 'APPROVED';
                  const isActive = stage.status === 'IN_PROGRESS' || stage.status === 'ACTIVE' || stage.status === 'CLAIMED';
                  const isReview = stage.status === 'SUBMITTED' || stage.status === 'IN_REVIEW';
                  const isLast = idx === stages.length - 1;

                  return (
                    <React.Fragment key={stage.assignmentId || idx}>
                      <div
                        onClick={() => openInspector(stage)}
                        className="flex flex-col items-center group z-10 cursor-pointer"
                      >
                        <div
                          className={`h-11 w-11 rounded-2xl flex items-center justify-center text-xs font-bold transition-all shadow-md ${
                            isCompleted
                              ? 'bg-white text-zinc-950 font-bold scale-105 ring-4 ring-white/20'
                              : isReview
                              ? 'bg-amber-400 text-zinc-950 ring-4 ring-amber-400/20'
                              : isActive
                              ? 'bg-zinc-900 border-2 border-white text-white ring-4 ring-white/20 scale-105'
                              : 'bg-zinc-900 border border-zinc-700 text-zinc-400 group-hover:border-zinc-500'
                          }`}
                        >
                          {isCompleted ? <Check className="h-5 w-5 stroke-[3]" /> : idx + 1}
                        </div>

                        <span
                          className={`text-xs mt-2.5 font-semibold transition-colors ${
                            isCompleted
                              ? 'text-white'
                              : isActive
                              ? 'text-white'
                              : isReview
                              ? 'text-amber-400'
                              : 'text-zinc-400'
                          }`}
                        >
                          {stage.workTypeName}
                        </span>

                        <span className="text-[10px] text-zinc-500 mt-0.5">
                          {stage.assignedWorkerName || 'Open for claim'}
                        </span>

                        {(stage.hasDeliverables || stage.latestDeliverable) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openInspector(stage);
                            }}
                            className="mt-1.5 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700"
                          >
                            <Eye className="h-2.5 w-2.5" />
                            See Submission
                          </button>
                        )}
                      </div>

                      {!isLast && (
                        <div
                          className={`flex-1 h-1 mx-3 rounded-full transition-all ${
                            isCompleted ? 'bg-white' : 'bg-zinc-800'
                          }`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* MILANOTE SUBMISSION INSPECTOR MODAL */}
        {inspectedStage && (
          <Modal
            isOpen={!!inspectedStage}
            onClose={() => setInspectedStage(null)}
            title={`${inspectedStage.workTypeName} (${inspectedStage.workTypeCode})`}
            description={`${activeChapter.mangaTitle} • Chapter ${activeChapter.chapterNumber}`}
            className="max-w-2xl bg-[#111317] border-zinc-800 text-white"
          >
            <div className="space-y-5 text-xs text-zinc-300 mt-1">
              {/* Stage Quick Info & Status Switcher */}
              <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: inspectedStage.color || '#ffffff' }}
                  />
                  <span className="font-semibold text-white">{inspectedStage.workTypeName}</span>
                  <span className="text-zinc-500">|</span>
                  <span className="text-zinc-400">
                    Assigned:{' '}
                    <strong className="text-zinc-200">
                      {inspectedStage.assignedWorkerName || 'Open for Claim'}
                    </strong>
                  </span>
                </div>

                {/* Status selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500 text-[11px]">Status:</span>
                  <select
                    value={inspectedStage.status}
                    onChange={(e) => {
                      const newStatus = e.target.value;
                      updateStatusMutation.mutate({
                        assignmentId: inspectedStage.assignmentId,
                        status: newStatus,
                      });
                      setInspectedStage({ ...inspectedStage, status: newStatus });
                    }}
                    className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                  >
                    <option value="OPEN">OPEN / Planning</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="SUBMITTED">SUBMITTED</option>
                    <option value="IN_REVIEW">IN_REVIEW</option>
                    <option value="CHANGES_REQUESTED">CHANGES_REQUESTED</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>
              </div>

              {/* Inline Stage Deadline Editor */}
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-zinc-300 font-medium">Deadline:</span>
                  {inspectedStage.deadline ? (
                    <span
                      className={`font-mono text-[11px] ${getUrgencyStyles(getDeadlineUrgency(inspectedStage.deadline, inspectedStage.status)).text}`}
                      title={formatInUserTimeZone(inspectedStage.deadline, activeTimeZone, 'full')}
                    >
                      {formatDeadlineCountdown(inspectedStage.deadline, inspectedStage.status, activeTimeZone)} (
                      {formatInUserTimeZone(inspectedStage.deadline, activeTimeZone, 'shortDateTime')}{' '}
                      {getTimeZoneShortLabel(activeTimeZone)})
                    </span>
                  ) : (
                    <span className="text-zinc-500 text-[11px]">Not set ({getTimeZoneShortLabel(activeTimeZone)})</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <DeadlineDatePicker
                    compact
                    timeZone={activeTimeZone}
                    value={stageDeadlineInput}
                    onChange={setStageDeadlineInput}
                    className="w-48"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2.5 text-[11px]"
                    isLoading={updateStageDeadlineMutation.isPending}
                    onClick={() =>
                      updateStageDeadlineMutation.mutate({
                        assignmentId: inspectedStage.assignmentId,
                        deadline: stageDeadlineInput || null,
                      })
                    }
                  >
                    Save
                  </Button>
                </div>
              </div>

              {/* Active Deliverable Submission Details */}
              {inspectedStage.latestDeliverable ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-zinc-800 bg-[#0d0e12] p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
                      <div>
                        <h4 className="font-bold text-white text-sm">
                          {inspectedStage.latestDeliverable.label || 'Submitted Deliverable'}
                        </h4>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Submitted by{' '}
                          <strong className="text-zinc-200">
                            {inspectedStage.latestDeliverable.submittedByName || inspectedStage.assignedWorkerName || 'Worker'}
                          </strong>{' '}
                          • Rev #{inspectedStage.latestDeliverable.revision}
                          {inspectedStage.latestDeliverable.createdAt && (
                            <span> • {formatInUserTimeZone(inspectedStage.latestDeliverable.createdAt, activeTimeZone, 'shortDateTime')}</span>
                          )}
                        </p>
                      </div>

                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-white border border-zinc-700">
                        Rev #{inspectedStage.latestDeliverable.revision}
                      </span>
                    </div>

                    {/* High-res Image Preview if direct image */}
                    {isImageUrl(inspectedStage.latestDeliverable.url) && (
                      <div className="rounded-xl border border-zinc-800 overflow-hidden bg-black max-h-80 flex items-center justify-center group relative">
                        <img
                          src={inspectedStage.latestDeliverable.url}
                          alt="Submission Preview"
                          className="max-h-80 w-auto object-contain"
                        />
                        <a
                          href={inspectedStage.latestDeliverable.url}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute bottom-3 right-3 bg-black/80 hover:bg-black text-white px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 border border-zinc-700 shadow-lg"
                        >
                          <Maximize2 className="h-3 w-3" /> Full Size
                        </a>
                      </div>
                    )}

                    {/* Submission Link & Action Box */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                        <span className="text-xs text-zinc-300 font-mono truncate">
                          {inspectedStage.latestDeliverable.url}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleCopyUrl(inspectedStage.latestDeliverable!.url)}
                          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs flex items-center gap-1"
                        >
                          {copiedUrl ? <Check className="h-3.5 w-3.5 text-white" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedUrl ? 'Copied' : 'Copy'}
                        </button>

                        <a
                          href={inspectedStage.latestDeliverable.url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-semibold flex items-center gap-1"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open Link
                        </a>
                      </div>
                    </div>

                    {/* Worker Notes if any */}
                    {inspectedStage.latestDeliverable.notes && (
                      <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
                        <span className="text-[11px] text-zinc-500 font-medium block mb-1">
                          Notes from worker:
                        </span>
                        <p className="text-xs text-zinc-300 italic whitespace-pre-wrap">
                          "{inspectedStage.latestDeliverable.notes}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* All Revisions History */}
                  {assignmentDeliverables && assignmentDeliverables.length > 1 && (
                    <div className="rounded-xl border border-zinc-800 bg-[#0d0e12] p-4 space-y-2.5">
                      <h5 className="font-semibold text-zinc-200 text-xs flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-zinc-400" />
                        Revision History ({assignmentDeliverables.length} submissions)
                      </h5>
                      <div className="space-y-2">
                        {assignmentDeliverables.map((del: any) => (
                          <div
                            key={del.id || del._id}
                            className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/70 flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-semibold text-zinc-200">
                                Rev #{del.revision}: {del.label}
                              </span>
                              <span className="text-[11px] text-zinc-500 ml-2">
                                {formatInUserTimeZone(del.createdAt, activeTimeZone, 'dateOnly')}
                              </span>
                              {del.notes && <p className="text-[11px] text-zinc-400 mt-0.5">"{del.notes}"</p>}
                            </div>
                            <a
                              href={del.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-white hover:underline flex items-center gap-1 text-[11px]"
                            >
                              <ExternalLink className="h-3 w-3" /> View
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Review & Quality Control Actions */}
                  {inspectedStage.status === 'COMPLETED' || inspectedStage.status === 'APPROVED' || inspectedStage.latestReview?.status === 'Approved' ? (
                    <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          <h5 className="font-bold text-white text-xs">
                            Approved & Completed
                          </h5>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-200 border border-emerald-700/60 font-semibold">
                          {inspectedStage.latestReview?.reviewerName
                            ? `Approved by ${inspectedStage.latestReview.reviewerName}`
                            : 'Approved by Administrator'}
                        </span>
                      </div>

                      <p className="text-xs text-zinc-300">
                        This deliverable was reviewed and <strong>approved</strong> by{' '}
                        <strong className="text-white">
                          {inspectedStage.latestReview?.reviewerName || 'Administrator'}
                        </strong>
                        {inspectedStage.latestReview?.createdAt && (
                          <span> on {formatInUserTimeZone(inspectedStage.latestReview.createdAt, activeTimeZone, 'shortDateTime')}</span>
                        )}
                        . All downstream stages have been unlocked.
                      </p>

                      {inspectedStage.latestReview?.comment && (
                        <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-300 italic">
                          "{inspectedStage.latestReview.comment}"
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-800/80">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reviewMutation.mutate({ status: 'Changes_Requested' })}
                          disabled={reviewMutation.isPending}
                          className="text-amber-400 border-amber-900/60 hover:bg-amber-950/40 text-xs"
                        >
                          <AlertCircle className="h-3.5 w-3.5 mr-1" />
                          Re-open & Request Changes
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsSubmitModalOpen(true)}
                          className="text-xs"
                        >
                          <Upload className="h-3.5 w-3.5 mr-1" />
                          Submit New Revision
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-zinc-800 bg-[#0d0e12] p-4 space-y-3">
                      <h5 className="font-semibold text-zinc-200 text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                        Review & Quality Check
                      </h5>

                      <Input
                        placeholder="Feedback / Review notes (optional)..."
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        className="bg-zinc-900 border-zinc-800 text-xs"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => reviewMutation.mutate({ status: 'Approved' })}
                            disabled={reviewMutation.isPending}
                            className="bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs"
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Approve Submission
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => reviewMutation.mutate({ status: 'Changes_Requested' })}
                            disabled={reviewMutation.isPending}
                            className="text-amber-400 border-amber-900/60 hover:bg-amber-950/40 text-xs"
                          >
                            <AlertCircle className="h-3.5 w-3.5 mr-1" />
                            Request Changes
                          </Button>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsSubmitModalOpen(true)}
                          className="text-xs"
                        >
                          <Upload className="h-3.5 w-3.5 mr-1" />
                          Submit New Revision
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Empty Submission State */
                <div className="rounded-xl border border-dashed border-zinc-800 bg-[#0e1014] p-8 text-center space-y-3">
                  <FileText className="h-8 w-8 text-zinc-600 mx-auto" />
                  <div>
                    <h4 className="font-semibold text-zinc-200 text-sm">No submission deliverable yet</h4>
                    <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                      The assigned worker has not submitted deliverables for this stage. You can submit files or Google Drive links directly.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setIsSubmitModalOpen(true)}
                    className="text-xs mt-2 bg-white text-zinc-950 hover:bg-zinc-200 font-semibold"
                  >
                    <Upload className="h-3.5 w-3.5 mr-1" />
                    Submit Deliverable
                  </Button>
                </div>
              )}
            </div>
          </Modal>
        )}

        {/* SUBMIT / EDIT DELIVERABLE MODAL */}
        {isSubmitModalOpen && inspectedStage && (
          <Modal
            isOpen={isSubmitModalOpen}
            onClose={() => setIsSubmitModalOpen(false)}
            title={`Submit Deliverable: ${inspectedStage.workTypeName}`}
            description={`Provide delivery links (Google Drive, Dropbox, Mega, or image URL) for Chapter ${activeChapter.chapterNumber}`}
            className="max-w-md bg-[#111317] border-zinc-800 text-white"
          >
            <div className="space-y-4 text-xs mt-2">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Deliverable URL *
                </label>
                <Input
                  placeholder="https://drive.google.com/... or https://i.imgur.com/..."
                  value={submissionUrl}
                  onChange={(e) => setSubmissionUrl(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Deliverable Label
                </label>
                <Input
                  placeholder="e.g. Chapter Cleaned PSDs & High-res Raws"
                  value={submissionLabel}
                  onChange={(e) => setSubmissionLabel(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Notes / Instructions
                </label>
                <Textarea
                  placeholder="Any comments, fonts used, or instructions for the next stage..."
                  value={submissionNotes}
                  onChange={(e) => setSubmissionNotes(e.target.value)}
                  rows={3}
                  className="bg-zinc-900 border-zinc-800 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => submitDeliverableMutation.mutate()}
                  disabled={!submissionUrl || submitDeliverableMutation.isPending}
                  className="text-xs bg-white text-zinc-950 hover:bg-zinc-200 font-semibold"
                >
                  {submitDeliverableMutation.isPending ? 'Submitting...' : 'Confirm Submission'}
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: PIPELINES DIRECTORY & CHAPTER OVERVIEW
  // Rendered at /pipeline (showing all series & chapters with black & white progress)
  // -------------------------------------------------------------
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-white" />
            Production Pipelines
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Select a manga chapter below to open its Milanote visual board and drag stages
          </p>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search series or chapter..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="h-8 pl-8 pr-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 w-48 sm:w-56"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1">
            <span className="text-[11px] text-zinc-400">Series:</span>
            <select
              value={selectedMangaFilter}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedMangaFilter(val);
                if (val !== 'All') {
                  setSearchParams({ mangaId: val });
                } else {
                  setSearchParams({});
                }
              }}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer pr-1"
            >
              <option value="All" className="bg-zinc-900">All Manga Series</option>
              {mangaList?.map((m) => (
                <option key={m.id} value={m.id} className="bg-zinc-900">
                  {m.title}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs h-8 px-2.5 text-zinc-400 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-16 text-center text-xs text-zinc-500 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
          <span>Loading chapter pipelines...</span>
        </div>
      ) : filteredChapters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-[#0e1013] p-16 text-center">
          <Layers className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-zinc-200">No chapter pipelines found</h3>
          <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
            {searchFilter || selectedMangaFilter !== 'All'
              ? 'No active pipelines matched your search filters.'
              : 'Chapters in production will automatically appear here with visual progression.'}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link to="/admin/assignments">
              <Button variant="primary" size="sm" className="text-xs bg-white text-zinc-950 hover:bg-zinc-200 font-semibold">
                Create Assignments
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        /* Chapter Pipelines Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredChapters.map((ch) => {
            const chStages = ch.stages || [];
            const done = chStages.filter((s) => s.status === 'COMPLETED' || s.status === 'APPROVED').length;
            const pct = chStages.length > 0 ? Math.round((done / chStages.length) * 100) : 0;
            const targetUrl = `/pipeline/${ch.mangaId}/${ch.chapterId}`;

            return (
              <div
                key={ch.chapterId}
                onClick={() => navigate(targetUrl)}
                className="group rounded-2xl border border-zinc-800 bg-[#111317] hover:bg-[#14171d] hover:border-zinc-700 p-5 shadow-sm transition-all duration-150 cursor-pointer flex flex-col justify-between space-y-4"
              >
                <div>
                  {/* Top Bar with Manga Cover & Title */}
                  <div className="flex items-start gap-3">
                    {ch.mangaCoverUrl ? (
                      <img
                        src={ch.mangaCoverUrl}
                        alt={ch.mangaTitle}
                        className="h-14 w-11 object-cover rounded-md border border-zinc-800 shrink-0"
                      />
                    ) : (
                      <div className="h-14 w-11 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                        <BookOpen className="h-4 w-4 text-zinc-500" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-medium text-zinc-400 block truncate">
                        {ch.mangaTitle}
                      </span>
                      <h3 className="text-sm font-bold text-white group-hover:text-zinc-100 transition-colors mt-0.5 truncate">
                        Chapter {ch.chapterNumber}
                        {ch.title ? ` - ${ch.title}` : ''}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400">
                        <span className="px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 font-mono text-[10px]">
                          {ch.status}
                        </span>
                        <span className="text-zinc-600">•</span>
                        <span className="font-mono text-zinc-400 text-[10px]">{ch.priority} Priority</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage Pills Preview */}
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {chStages.map((st) => {
                      const isComplete = st.status === 'COMPLETED' || st.status === 'APPROVED';
                      const isInProg = st.status === 'IN_PROGRESS' || st.status === 'CLAIMED';
                      return (
                        <span
                          key={st.assignmentId}
                          title={`${st.workTypeName}: ${st.status}`}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                            isComplete
                              ? 'bg-white text-zinc-950 border-white'
                              : isInProg
                              ? 'bg-zinc-800 text-white border-zinc-600'
                              : 'bg-zinc-950 text-zinc-500 border-zinc-800'
                          }`}
                        >
                          {st.workTypeCode}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* BLACK & WHITE ONLY PROGRESS BAR */}
                <div className="pt-2 border-t border-zinc-800/80">
                  <div className="flex justify-between items-center text-xs mb-1.5 font-mono">
                    <span className="text-zinc-400 text-[11px]">
                      {done}/{chStages.length} stages complete
                    </span>
                    <span className="text-white font-bold">{pct}%</span>
                  </div>

                  {/* Strictly Monochrome Progress Track & Bar */}
                  <div className="w-full bg-[#1e222a] rounded-full h-1.5 overflow-hidden border border-zinc-800">
                    <div
                      className="h-full bg-white transition-all duration-300 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Action Link */}
                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-400 group-hover:text-white transition-colors">
                    <span className="text-[11px]">Open Milanote Board</span>
                    <ArrowRight className="h-3.5 w-3.5 transform group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

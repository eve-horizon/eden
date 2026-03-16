import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Source {
  id: string;
  filename: string;
  content_type: string;
  status: string;
  file_size: number | null;
  created_at: string;
  upload_url?: string;
  excerpt?: string;
  eve_job_id?: string | null;
  eve_ingest_id?: string | null;
  error_message?: string | null;
}

interface SourceTask {
  id: string;
  display_id: string;
  title: string;
  role: string | null;
}

type SourceStatus = 'uploaded' | 'processing' | 'extracted' | 'synthesized' | 'done' | 'failed';

// ---------------------------------------------------------------------------
// SourcesPage
// ---------------------------------------------------------------------------

export function SourcesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detail panel state
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [sourceTasks, setSourceTasks] = useState<SourceTask[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchSources = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Source[]>(`/projects/${projectId}/sources`);
      setSources(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Auto-poll every 5s while any source is still processing
  useEffect(() => {
    const hasProcessing = sources.some(
      (s) => s.status === 'processing' || s.status === 'uploaded',
    );
    if (!hasProcessing) return;
    const timer = setInterval(fetchSources, 5000);
    return () => clearInterval(timer);
  }, [sources, fetchSources]);

  const selectSource = useCallback(async (source: Source) => {
    if (selectedSource?.id === source.id) {
      setSelectedSource(null);
      setSourceTasks([]);
      return;
    }
    setSelectedSource(source);
    setDetailLoading(true);
    try {
      const tasks = await api.get<SourceTask[]>(`/sources/${source.id}/tasks`);
      setSourceTasks(tasks);
    } catch {
      setSourceTasks([]);
    } finally {
      setDetailLoading(false);
    }
  }, [selectedSource]);

  const handleUpload = async (file: File) => {
    if (!projectId) return;
    setUploading(true);
    setError(null);
    try {
      // 1. Create source record — returns a presigned S3 upload URL
      const source = await api.post<Source & { upload_url: string }>(
        `/projects/${projectId}/sources`,
        {
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          file_size: file.size,
        },
      );

      // 2. Upload the file to S3 via the presigned URL
      const uploadRes = await fetch(source.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!uploadRes.ok) {
        throw new Error(`File upload failed (${uploadRes.status})`);
      }

      // 3. Confirm — tells Eve the file is ready, triggers ingestion pipeline
      await api.post(`/sources/${source.id}/confirm`);

      // Refresh list
      fetchSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    // Reset so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  return (
    <div data-testid="sources-page" className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-eden-text">Sources</h2>
        <p className="text-sm text-eden-text-2 mt-1">
          Upload documents for AI analysis. Extracted requirements appear as
          changesets.
        </p>
      </div>

      {/* Upload zone */}
      <div
        data-testid="upload-zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`mb-6 border-2 border-dashed rounded-eden p-8 text-center cursor-pointer transition-colors
          ${
            dragOver
              ? 'border-eden-accent bg-eden-accent/5'
              : 'border-eden-border hover:border-eden-accent/40 hover:bg-eden-bg/50'
          }
          ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
        />

        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-eden-surface border border-eden-border flex items-center justify-center">
            <UploadIcon className="w-6 h-6 text-eden-text-2" />
          </div>
          {uploading ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-eden-text">Processing...</p>
              <p className="text-xs text-eden-text-2">
                Creating source record
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium text-eden-text">
                Drop a file here or click to browse
              </p>
              <p className="text-xs text-eden-text-2">
                PDF, Word, Markdown, CSV, Excel, or images
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Source list */}
      {loading ? (
        <ListSkeleton />
      ) : sources.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="bg-eden-surface rounded-eden border border-eden-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-eden-border bg-eden-bg/50">
                <th className="text-left px-4 py-3 font-medium text-eden-text-2">
                  File
                </th>
                <th className="text-left px-4 py-3 font-medium text-eden-text-2 w-28">
                  Type
                </th>
                <th className="text-left px-4 py-3 font-medium text-eden-text-2 w-28">
                  Status
                </th>
                <th className="text-right px-4 py-3 font-medium text-eden-text-2 w-24">
                  Size
                </th>
                <th className="text-right px-4 py-3 font-medium text-eden-text-2 w-32">
                  Uploaded
                </th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  selected={selectedSource?.id === source.id}
                  onClick={() => selectSource(source)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Source detail panel */}
      {selectedSource && (
        <SourceDetailPanel
          source={selectedSource}
          tasks={sourceTasks}
          loading={detailLoading}
          onClose={() => { setSelectedSource(null); setSourceTasks([]); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SourceRow
// ---------------------------------------------------------------------------

function SourceRow({
  source,
  selected,
  onClick,
}: {
  source: Source;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-eden-border last:border-0 cursor-pointer transition-colors
        ${selected ? 'bg-eden-accent/5 border-l-2 border-l-eden-accent' : 'hover:bg-eden-bg/30'}`}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <FileTypeIcon contentType={source.content_type} />
          <span className="text-eden-text font-medium truncate max-w-xs">
            {source.filename}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-eden-text-2 font-mono">
        {shortContentType(source.content_type)}
      </td>
      <td className="px-4 py-3">
        <SourceStatusBadge status={source.status as SourceStatus} />
      </td>
      <td className="px-4 py-3 text-right text-xs text-eden-text-2 font-mono">
        {source.file_size != null ? formatSize(source.file_size) : '--'}
      </td>
      <td className="px-4 py-3 text-right text-xs text-eden-text-2">
        {formatDate(source.created_at)}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// SourceDetailPanel — expanded view below the table
// ---------------------------------------------------------------------------

function SourceDetailPanel({
  source,
  tasks,
  loading,
  onClose,
}: {
  source: Source;
  tasks: SourceTask[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="mt-4 bg-eden-surface rounded-eden border border-eden-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-eden-border bg-eden-bg/30">
        <div className="flex items-center gap-3">
          <FileTypeIcon contentType={source.content_type} />
          <h3 className="text-sm font-semibold text-eden-text">{source.filename}</h3>
          <SourceStatusBadge status={source.status as SourceStatus} />
        </div>
        <button
          onClick={onClose}
          className="text-eden-text-2 hover:text-eden-text transition-colors"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Metadata */}
      <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm border-b border-eden-border">
        <div>
          <p className="text-[10px] font-medium text-eden-text-2 uppercase tracking-wider mb-0.5">
            Type
          </p>
          <p className="text-eden-text font-mono text-xs">{source.content_type}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-eden-text-2 uppercase tracking-wider mb-0.5">
            Size
          </p>
          <p className="text-eden-text text-xs">
            {source.file_size != null ? formatSize(source.file_size) : 'Unknown'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-eden-text-2 uppercase tracking-wider mb-0.5">
            Status
          </p>
          <p className="text-eden-text text-xs capitalize">{source.status}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-eden-text-2 uppercase tracking-wider mb-0.5">
            Uploaded
          </p>
          <p className="text-eden-text text-xs">{formatDate(source.created_at)}</p>
        </div>
      </div>

      {/* Processing progress */}
      {source.status === 'processing' && (
        <div className="px-5 py-3 border-b border-eden-border bg-blue-50/50">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium text-blue-700">
              Ingestion pipeline running
            </span>
            {source.eve_job_id && (
              <span className="text-[10px] font-mono text-blue-500 ml-auto">
                {source.eve_job_id}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {source.status === 'failed' && source.error_message && (
        <div className="px-5 py-3 border-b border-eden-border bg-red-50/50">
          <p className="text-xs text-red-700">{source.error_message}</p>
        </div>
      )}

      {/* Actions */}
      <div className="px-5 py-3 border-b border-eden-border">
        <a
          href={`/api/sources/${source.id}/download`}
          className="eden-btn-secondary text-xs"
          download
        >
          <DownloadIcon className="w-3.5 h-3.5" />
          Download Original
        </a>
      </div>

      {/* Excerpt */}
      {source.excerpt && (
        <div className="px-5 py-4 border-b border-eden-border">
          <h4 className="text-[10px] font-medium text-eden-text-2 uppercase tracking-wider mb-2">
            Excerpt
          </h4>
          <div className="rounded-lg bg-eden-bg/50 border border-eden-border p-3 text-xs text-eden-text leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
            {source.excerpt}
          </div>
        </div>
      )}

      {/* Related tasks */}
      <div className="px-5 py-4">
        <h4 className="text-[10px] font-medium text-eden-text-2 uppercase tracking-wider mb-2">
          Tasks from this source
        </h4>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-eden-text-2 italic">
            No tasks have been created from this source yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 rounded-lg border border-eden-border px-3 py-2"
              >
                <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold flex-shrink-0">
                  T
                </span>
                <span className="text-[10px] font-mono text-eden-text-2">
                  {task.display_id}
                </span>
                <span className="text-xs text-eden-text truncate">{task.title}</span>
                {task.role && (
                  <span className="ml-auto text-[10px] text-eden-text-2 bg-eden-bg px-1.5 py-0.5 rounded flex-shrink-0">
                    {task.role}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const SOURCE_STATUS_STYLES: Record<SourceStatus, string> = {
  uploaded: 'bg-gray-100 text-gray-700',
  processing: 'bg-blue-100 text-blue-800',
  extracted: 'bg-amber-100 text-amber-800',
  synthesized: 'bg-emerald-100 text-emerald-800',
  done: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
};

function SourceStatusBadge({ status }: { status: SourceStatus }) {
  const style = SOURCE_STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${style}`}
    >
      {status === 'processing' && (
        <span className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />
      )}
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortContentType(ct: string): string {
  // Show just the subtype for common MIME types
  const parts = ct.split('/');
  const sub = parts[1];
  if (!sub) return ct;
  return sub.replace('vnd.openxmlformats-officedocument.', '').replace('wordprocessingml.document', 'docx').replace('spreadsheetml.sheet', 'xlsx');
}

// ---------------------------------------------------------------------------
// Empty state & skeleton
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-eden-surface border border-eden-border mb-4">
        <UploadIcon className="w-6 h-6 text-eden-text-2" />
      </div>
      <p className="text-sm text-eden-text-2">
        No sources uploaded. Drop a file above to get started.
      </p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="bg-eden-surface rounded-eden border border-eden-border overflow-hidden">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3 border-b border-eden-border last:border-0"
        >
          <div className="w-8 h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 flex-1 bg-gray-100 rounded animate-pulse" />
          <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
          <div className="h-5 w-20 bg-gray-200 rounded-full animate-pulse" />
          <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
          <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function FileTypeIcon({ contentType }: { contentType: string }) {
  // Simple heuristic for file icon color
  const isPdf = contentType.includes('pdf');
  const isImage = contentType.startsWith('image/');
  const isSpreadsheet = contentType.includes('sheet') || contentType.includes('csv');

  let color = 'text-eden-text-2';
  if (isPdf) color = 'text-red-500';
  else if (isImage) color = 'text-purple-500';
  else if (isSpreadsheet) color = 'text-emerald-500';

  return (
    <svg
      className={`w-5 h-5 flex-shrink-0 ${color}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

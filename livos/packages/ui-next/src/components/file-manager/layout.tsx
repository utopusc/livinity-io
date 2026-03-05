'use client';

import { useState, useMemo, useCallback, useRef, type DragEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  Grid3X3,
  List,
  Home,
  Loader2,
  File,
  Folder,
  Image,
  Film,
  Music,
  FileText,
  Archive,
  MoreVertical,
  Copy,
  Scissors,
  ClipboardPaste,
  Pencil,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Input } from '@/components/ui';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpcReact } from '@/trpc/client';
import { getJwt } from '@/trpc/client';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type FileEntry = {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
};

type ViewMode = 'grid' | 'list';

type Clipboard = {
  paths: string[];
  operation: 'copy' | 'cut';
} | null;

/* ------------------------------------------------------------------ */
/*  File Manager Layout                                                */
/* ------------------------------------------------------------------ */

export function FileManagerLayout() {
  const [currentPath, setCurrentPath] = useState('/Home');
  const [history, setHistory] = useState<string[]>(['/Home']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<Clipboard>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, refetch } = trpcReact.files.list.useQuery({ path: currentPath });
  const utils = trpcReact.useUtils();

  const entries: FileEntry[] = useMemo(() => {
    if (!data) return [];
    return (Array.isArray(data) ? data : (data as any).files ?? []).map((f: any) => ({
      name: f.name,
      type: f.type ?? (f.isDirectory ? 'directory' : 'file'),
      size: f.size,
      modified: f.modified ?? f.lastModified,
    }));
  }, [data]);

  // Sort: directories first, then alphabetical
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [entries]);

  /* ---- Navigation ---- */
  const navigate = useCallback(
    (path: string) => {
      const newHistory = [...history.slice(0, historyIndex + 1), path];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setCurrentPath(path);
      setSelected(new Set());
    },
    [history, historyIndex],
  );

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCurrentPath(history[historyIndex - 1]);
      setSelected(new Set());
    }
  }, [history, historyIndex]);

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCurrentPath(history[historyIndex + 1]);
      setSelected(new Set());
    }
  }, [history, historyIndex]);

  /* ---- Breadcrumb ---- */
  const pathParts = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean);
    return parts.map((part, i) => ({
      name: part,
      path: '/' + parts.slice(0, i + 1).join('/'),
    }));
  }, [currentPath]);

  /* ---- Selection ---- */
  const toggleSelect = useCallback(
    (name: string, e: React.MouseEvent) => {
      setSelected((prev) => {
        const next = new Set(e.ctrlKey || e.metaKey ? prev : []);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      });
    },
    [],
  );

  /* ---- Mutations ---- */
  const mkdirMutation = trpcReact.files.createDirectory.useMutation({
    onSuccess: () => { refetch(); setShowNewFolder(false); setNewFolderName(''); },
  });

  const deleteMutation = trpcReact.files.delete.useMutation({
    onSuccess: () => { refetch(); setSelected(new Set()); },
  });

  const renameMutation = trpcReact.files.rename.useMutation({
    onSuccess: () => { refetch(); setRenaming(null); },
  });

  const copyMutation = trpcReact.files.copy.useMutation({ onSuccess: () => refetch() });
  const moveMutation = trpcReact.files.move.useMutation({ onSuccess: () => refetch() });

  /* ---- Clipboard ---- */
  const handleCopy = () => {
    if (selected.size === 0) return;
    setClipboard({ paths: [...selected].map((n) => `${currentPath}/${n}`), operation: 'copy' });
  };

  const handleCut = () => {
    if (selected.size === 0) return;
    setClipboard({ paths: [...selected].map((n) => `${currentPath}/${n}`), operation: 'cut' });
  };

  const handlePaste = () => {
    if (!clipboard) return;
    clipboard.paths.forEach((path) => {
      if (clipboard.operation === 'copy') {
        copyMutation.mutate({ path, toDirectory: currentPath });
      } else {
        moveMutation.mutate({ path, toDirectory: currentPath });
      }
    });
    setClipboard(null);
  };

  /* ---- Delete ---- */
  const handleDelete = () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} item(s)?`)) return;
    selected.forEach((name) => {
      deleteMutation.mutate({ path: `${currentPath}/${name}` });
    });
  };

  /* ---- Upload (drag & drop + file input) ---- */
  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      await uploadFiles(files, currentPath);
      refetch();
    },
    [currentPath, refetch],
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      await uploadFiles(files, currentPath);
      refetch();
      e.target.value = '';
    },
    [currentPath, refetch],
  );

  /* ---- Context menu for individual items ---- */
  const handleItemDoubleClick = useCallback(
    (entry: FileEntry) => {
      if (entry.type === 'directory') {
        navigate(`${currentPath}/${entry.name}`);
      }
      // File viewing handled by file type detection in future phases
    },
    [currentPath, navigate],
  );

  return (
    <div
      className="flex h-full flex-col bg-surface-0"
      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border bg-surface-0 px-3 py-2">
        <button
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-neutral-100 hover:text-text disabled:opacity-30"
          onClick={goBack}
          disabled={historyIndex === 0}
          aria-label="Go back"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-neutral-100 hover:text-text disabled:opacity-30"
          onClick={goForward}
          disabled={historyIndex >= history.length - 1}
          aria-label="Go forward"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Breadcrumb */}
        <div className="flex flex-1 items-center gap-1 overflow-hidden text-xs">
          <button
            className="shrink-0 text-text-tertiary hover:text-text transition-colors"
            onClick={() => navigate('/Home')}
            aria-label="Home"
          >
            <Home className="h-3.5 w-3.5" />
          </button>
          {pathParts.map((part, i) => (
            <div key={part.path} className="flex items-center gap-1">
              <span className="text-text-tertiary">/</span>
              <button
                className={cn(
                  'truncate transition-colors',
                  i === pathParts.length - 1
                    ? 'text-text font-medium'
                    : 'text-text-tertiary hover:text-text',
                )}
                onClick={() => navigate(part.path)}
              >
                {part.name}
              </button>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {selected.size > 0 && (
            <>
              <ToolbarBtn icon={Copy} label="Copy" onClick={handleCopy} />
              <ToolbarBtn icon={Scissors} label="Cut" onClick={handleCut} />
              <ToolbarBtn icon={Trash2} label="Delete" onClick={handleDelete} destructive />
              <div className="mx-1 h-4 w-px bg-border-emphasis" />
            </>
          )}
          {clipboard && (
            <ToolbarBtn icon={ClipboardPaste} label="Paste" onClick={handlePaste} />
          )}
          <ToolbarBtn icon={FolderPlus} label="New Folder" onClick={() => setShowNewFolder(true)} />
          <ToolbarBtn icon={Upload} label="Upload" onClick={() => fileInputRef.current?.click()} />
          <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileInput} />
          <div className="mx-1 h-4 w-px bg-border-emphasis" />
          <ToolbarBtn
            icon={Grid3X3}
            label="Grid"
            onClick={() => setViewMode('grid')}
            active={viewMode === 'grid'}
          />
          <ToolbarBtn
            icon={List}
            label="List"
            onClick={() => setViewMode('list')}
            active={viewMode === 'list'}
          />
        </div>
      </div>

      {/* New folder input */}
      {showNewFolder && (
        <div className="flex items-center gap-2 border-b border-border bg-surface-1 px-3 py-2">
          <Folder className="h-4 w-4 text-brand" />
          <Input
            autoFocus
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFolderName.trim()) {
                mkdirMutation.mutate({ path: `${currentPath}/${newFolderName.trim()}` });
              }
              if (e.key === 'Escape') setShowNewFolder(false);
            }}
            className="h-7 max-w-xs text-xs"
          />
          <Button
            size="sm"
            onClick={() => {
              if (newFolderName.trim()) mkdirMutation.mutate({ path: `${currentPath}/${newFolderName.trim()}` });
            }}
            loading={mkdirMutation.isPending}
          >
            Create
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowNewFolder(false)}>Cancel</Button>
        </div>
      )}

      {/* Drag overlay */}
      <AnimatePresence>
        {isDraggingOver && (
          <motion.div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand/30 bg-brand/5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-center">
              <Upload className="mx-auto h-8 w-8 text-brand" />
              <p className="mt-2 text-sm font-medium text-brand">Drop files to upload</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <ScrollArea className="relative flex-1">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
          </div>
        ) : sortedEntries.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-text-tertiary">
            <Folder className="h-8 w-8" />
            <p className="text-xs">This folder is empty</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-4 gap-2 p-3 sm:grid-cols-5 lg:grid-cols-6">
            {sortedEntries.map((entry) => (
              <GridItem
                key={entry.name}
                entry={entry}
                isSelected={selected.has(entry.name)}
                onClick={(e) => toggleSelect(entry.name, e)}
                onDoubleClick={() => handleItemDoubleClick(entry)}
                isRenaming={renaming === entry.name}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onRenameSubmit={() => {
                  if (renameValue.trim() && renameValue !== entry.name) {
                    renameMutation.mutate({ path: `${currentPath}/${entry.name}`, newName: renameValue.trim() });
                  } else {
                    setRenaming(null);
                  }
                }}
                onRenameCancel={() => setRenaming(null)}
                onStartRename={() => { setRenaming(entry.name); setRenameValue(entry.name); }}
              />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {sortedEntries.map((entry) => (
              <ListItem
                key={entry.name}
                entry={entry}
                isSelected={selected.has(entry.name)}
                onClick={(e) => toggleSelect(entry.name, e)}
                onDoubleClick={() => handleItemDoubleClick(entry)}
                onStartRename={() => { setRenaming(entry.name); setRenameValue(entry.name); }}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-border bg-surface-1 px-3 py-1.5 text-[11px] text-text-tertiary">
        <span>{sortedEntries.length} items</span>
        {selected.size > 0 && <span className="text-text-secondary">{selected.size} selected</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Grid Item                                                          */
/* ------------------------------------------------------------------ */

function GridItem({
  entry,
  isSelected,
  onClick,
  onDoubleClick,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onStartRename,
}: {
  entry: FileEntry;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onStartRename: () => void;
}) {
  const Icon = getFileIcon(entry);

  return (
    <div
      className={cn(
        'group flex flex-col items-center gap-1.5 rounded-xl p-2 cursor-pointer',
        'transition-colors border',
        isSelected
          ? 'bg-brand/8 border-brand/25 ring-1 ring-brand/20 shadow-sm'
          : 'bg-surface-0 border-border-subtle hover:bg-neutral-50 hover:border-border shadow-sm',
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onStartRename();
      }}
    >
      <Icon
        className={cn(
          'h-8 w-8',
          entry.type === 'directory' ? 'text-brand' : 'text-text-tertiary',
        )}
      />
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onRenameSubmit(); if (e.key === 'Escape') onRenameCancel(); }}
          onBlur={onRenameSubmit}
          className="w-full rounded-md border border-brand bg-white px-1 text-center text-[11px] text-text outline-none focus:ring-1 focus:ring-brand/40"
        />
      ) : (
        <span className="w-full truncate text-center text-[11px] text-text-secondary">
          {entry.name}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  List Item                                                          */
/* ------------------------------------------------------------------ */

function ListItem({
  entry,
  isSelected,
  onClick,
  onDoubleClick,
  onStartRename,
}: {
  entry: FileEntry;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onStartRename: () => void;
}) {
  const Icon = getFileIcon(entry);

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-3 py-2 cursor-pointer',
        'transition-colors',
        isSelected ? 'bg-brand/8' : 'hover:bg-neutral-50',
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0',
          entry.type === 'directory' ? 'text-brand' : 'text-text-tertiary',
        )}
      />
      <span className="flex-1 truncate text-xs text-text-secondary">{entry.name}</span>
      {entry.size != null && entry.type === 'file' && (
        <span className="text-[11px] text-text-tertiary">{formatSize(entry.size)}</span>
      )}
      <button
        className="flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary opacity-0 transition-all group-hover:opacity-100 hover:bg-neutral-100 hover:text-text"
        onClick={(e) => { e.stopPropagation(); onStartRename(); }}
        aria-label="Rename"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar Button                                                     */
/* ------------------------------------------------------------------ */

function ToolbarBtn({
  icon: Icon,
  label,
  onClick,
  active,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
        active ? 'bg-neutral-200 text-text' : '',
        destructive
          ? 'text-error/70 hover:bg-error/8 hover:text-error'
          : 'text-text-tertiary hover:bg-neutral-100 hover:text-text',
      )}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getFileIcon(entry: FileEntry): LucideIcon {
  if (entry.type === 'directory') return Folder;
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return Image;
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return Film;
  if (['mp3', 'wav', 'flac', 'ogg', 'aac'].includes(ext)) return Music;
  if (['txt', 'md', 'json', 'yml', 'yaml', 'xml', 'csv', 'log'].includes(ext)) return FileText;
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return Archive;
  return File;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function uploadFiles(files: globalThis.File[], directory: string) {
  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', directory);

    const jwt = getJwt();
    await fetch('/api/files/upload', {
      method: 'POST',
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      body: formData,
    });
  }
}

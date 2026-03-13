# Old File Manager UI Architecture (v1.x)

## Overview
Complete file manager UI with grid/list views, uploads, file operations (move/copy/delete), drag-drop, favorites, search, trash, external storage, and network shares. Uses tRPC for backend communication, Zustand for state, React Query for data fetching.

---

## 1. LAYOUT STRUCTURE

### Main Window Component: `files-content.tsx`
```
FilesWindowContent
  └─ FilesWindowRouter
      └─ FilesCapabilitiesProvider (mode, currentPath, onNavigate)
          └─ FilesDndWrapper (drag-drop wrapper)
              └─ RewindOverlayProvider
                  ├─ FileViewer (modal/lightbox overlay)
                  ├─ Header (back button, title, mobile menu)
                  └─ Content Grid
                      ├─ Sidebar (left col, optional on mobile)
                      │   └─ SidebarSection
                      │       ├─ SidebarHome
                      │       ├─ SidebarRecents
                      │       ├─ SidebarApps
                      │       ├─ SidebarFavorites
                      │       ├─ SidebarShares
                      │       ├─ SidebarNetworkStorage
                      │       ├─ SidebarExternalStorage
                      │       ├─ SidebarTrash
                      │       └─ SidebarRewind
                      └─ Main Area (right col)
                          ├─ ActionsBar
                          │   ├─ NavigationControls (back/forward)
                          │   ├─ PathBar (breadcrumb)
                          │   ├─ SearchInput
                          │   ├─ ViewToggle (icons/list)
                          │   ├─ SortDropdown (name/type/size/date)
                          │   └─ DesktopActions (New Folder, Upload, Paste)
                          └─ Listing
                              ├─ ListingBody (virtualized)
                              │   ├─ FileItem (icon/list view)
                              │   │   ├─ IconsViewFileItem
                              │   │   └─ ListViewFileItem
                              │   └─ [infinite scroll pagination]
                              └─ Item count display

                      └─ [Floating Islands (separate overlays)]
                          ├─ UploadingIsland (collapsed/expanded)
                          ├─ OperationsIsland (copy/move/archive progress)
                          ├─ AudioIsland (audio player)
                          └─ FormattingIsland (format external drives)
```

### Key Layout Constants
- Header height: 64px (56px content + 8px border)
- Sidebar width: 188px (desktop) / mobile drawer
- Card padding: 16px, gap: 24px (lg) / 12px (mobile)
- View height: `calc(100svh-214px)` (mobile) / `calc(100vh-300px)` (desktop)

---

## 2. DATA SHAPES & tRPC ROUTES

### FileSystemItem (from server response)
```typescript
interface LivinitydFileSystemItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number (bytes)
  modified: number (unix timestamp ms)
  thumbnail?: string (hash, served at /api/files/thumbnail/:hash)
  operations: ('rename' | 'move' | 'copy' | 'delete')[]
}

// Extended on client with upload state
interface FileSystemItem extends LivinitydFileSystemItem {
  isUploading?: boolean
  progress?: number (0-100)
  speed?: number (bytes/sec)
  tempId?: string (unique per upload attempt)
}
```

### tRPC Routes: `files.*`

#### Queries
- `files.list` - List directory with pagination
  - Input: `{path, sortBy, sortOrder, lastFile?, limit?}`
  - Output: `{files[], totalFiles, hasMore, truncatedAt?}`
  - Cursor-based pagination using lastFile name

- `files.recents` - Recent files
  - Output: `LivinitydFileSystemItem[]`

- `files.favorites` - Favorite paths
  - Output: `{path, name}[]`

- `files.search` - Search files
  - Input: `{query, maxResults?}`
  - Output: `LivinitydFileSystemItem[]`

- `files.shares` - Samba shares
  - Output: `{path, name}[]`

- `files.externalDevices` - External drives
  - Output: Device info with mount paths

- `files.viewPreferences` - View/sort preferences
  - Output: `{view: 'icons'|'list', sortBy, sortOrder}`

- `files.operationProgress` - Subscription for copy/move progress
  - Output: `{path, type, progress, speed, eta}[]`

#### Mutations
- `files.createDirectory({path})` - Create folder
- `files.rename({path, newName})` - Rename item
- `files.move({path, toDirectory, collision})` - Move (collision: 'error'|'keep-both'|'replace')
- `files.copy({path, toDirectory, collision})` - Copy
- `files.trash({path})` - Move to trash
- `files.restore({path, collision})` - Restore from trash
- `files.delete({path})` - Permanently delete
- `files.emptyTrash()` - Empty trash
- `files.unarchive({path})` - Extract archive
- `files.archive({paths[]})` - Create zip
- `files.getThumbnail({path})` - Generate thumbnail on-demand

#### HTTP Endpoints (Express, not tRPC)
- `GET /api/files/download?path=...&path=...` - Download file(s) or zip
- `GET /api/files/view?path=...` - View file inline
- `POST /api/files/upload?path=...&collision=...` - Upload (multipart form)
- `GET /api/files/thumbnail/:hash` - Serve thumbnail (cached)

---

## 3. UPLOAD MECHANISM

### Upload Flow (global-files.tsx)
1. User selects file(s) via `<UploadInput>` or drag-drop `<FileUploadDropZone>`
2. `startUpload(files, destinationPath)` called
3. Batch setup:
   - Generate unique `tempId` per file: `upload-{path}-{timestamp}`
   - Create `UploadingFileSystemItem` in state (appears in listing instantly)
   - Create required directories (recursive)
   - Invalidate file list query

4. Concurrent uploads (max 2 parallel):
   - POST to `/api/files/upload?path=...&collision=error`
   - Raw file sent as request body
   - XHR.upload tracks progress every 1000ms

5. Collision handling:
   - Server returns 400 `[destination-already-exists]`
   - Item marked `collided`, added to queue
   - User prompted: Keep Both, Replace, Skip
   - Retry with collision param: `keep-both`|`replace`
   - Apply-to-All for remaining collisions

6. Finalization:
   - Remove from state on success
   - Invalidate file list (triggers refetch)

### UploadingFileSystemItem State
```typescript
{
  tempId: string
  name: string
  path: string
  type: string (mimetype)
  size: number
  isUploading: boolean
  status: 'uploading' | 'collided' | 'retrying' | 'error' | 'cancelled'
  progress: number (0-100)
  speed: number (bytes/sec)
  thumbnail?: string (object URL for images)
}
```

### UploadStats (calculated from uploadingItems)
```typescript
{
  totalProgress: number (0-100, weighted by file size)
  totalSpeed: number (sum of all speeds)
  totalUploaded: number (bytes)
  totalSize: number (bytes, excl. cancelled)
  eta: string (e.g., "2m 30s")
}
```

---

## 4. STATE MANAGEMENT (Zustand Store)

### useFilesStore composition (store/use-files-store.ts)
Combines multiple slices:

#### SelectionSlice
```typescript
selectedItems: FileSystemItem[]
isSelectingOnMobile: boolean
setSelectedItems(items) / clearSelectedItems()
isItemSelected(item)
```

#### ClipboardSlice
```typescript
clipboardItems: FileSystemItem[]
clipboardMode: 'copy' | 'cut' | null
copyItemsToClipboard() / cutItemsToClipboard()
hasItemsInClipboard() / clearClipboard()
isItemInClipboard(item)
```

#### FileViewerSlice
```typescript
viewerItem: FileSystemItem | null
setViewerItem(item)
```

#### NewFolderSlice
```typescript
newFolder: FileSystemItem | null (ephemeral, shows in listing while creating)
```

#### DragAndDropSlice
```typescript
draggedItems: FileSystemItem[]
isDraggingOverDropZone: boolean
```

#### RenameSlice
```typescript
renamingItemPath: string | null
setRenamingItemPath(path)
```

#### InteractionSlice
```typescript
(mobile selection UI state)
```

---

## 5. FILE OPERATIONS

### useFilesOperations Hook
Provides mutation-wrapped tRPC calls with collision handling:

```typescript
// Basic
renameItem({item, newName})

// Movement
moveItems({fromPaths, toDirectory})
moveSelectedItems({toDirectory})
copyItems({fromPaths, toDirectory})
pasteItemsFromClipboard({toDirectory})

// Compression
archiveSelectedItems()
extractSelectedItems()

// Trash
trashSelectedItems() / trashDraggedItems()
restoreSelectedItems()
deleteSelectedItems()
emptyTrash()

// Download
downloadSelectedItems() - POST to /api/files/download?path=...&path=...

// Collision resolution (for Rewind restore)
resolveCopyCollisionsOrAbort({fromPaths, toDirectory})
executeCopyWorkItems({workItems})
```

### Collision Handling
- Implements queue with single confirmation dialog at a time
- "Apply to All" option when multiple collisions
- Options: Keep Both (append " (2)"), Replace, Skip
- Custom error handling with i18n messages

---

## 6. GRID/LIST VIEW IMPLEMENTATION

### ViewToggle (view-toggle.tsx)
Toggle between `icons` and `list` views. Persisted in `files.viewPreferences`.

### Icons View
Component: `IconsViewFileItem`
- Vertical layout: icon + name below
- Wraps icon in `FileItemIcon` with optional shared badge overlay
- Name rendered with `TruncatedFilename` (ellipsis on overflow)
- Circular upload progress on icon

### List View
Component: `ListViewFileItem`
- Horizontal layout: checkbox + icon + [name + size/type + date in columns]
- CSS styling: `list-view-file-item.css` for row styles
- Selection styling:
  - `data-selected="true"` / `data-selection-position="first|middle|last|standalone"`
  - Rounded corners with "first/last" position logic

### Sorting
Options: name, type, modified, size
Order: ascending, descending
Implemented server-side in `files.list` route
Client-side fallback when all items loaded (for sort changes without refetch)

### Pagination
- Cursor-based: `lastFile` (filename) as cursor
- Initial load: 250 items
- On scroll-end: fetch next 250
- Virtualized via `VirtualizedList` (react-window)

---

## 7. FILE VIEWER COMPONENTS

### FileViewer (modal overlay)
Component: `file-viewer/index.tsx`
- Replaces listing when item selected
- `viewerItem` from store
- Arrow key navigation: Left/Right for prev/next previewable item

### Viewer Types
Lazy-loaded except AudioViewer:
- `ImageViewer` - img tag with zoom controls
- `VideoViewer` - HTML5 video with controls
- `PdfViewer` - PDF.js embedded
- `AudioViewer` - floating island with player controls
- `DownloadDialog` - fallback for unsupported types

### Supported File Types (FILE_TYPE_MAP)
```typescript
{
  'image/jpeg': {nameTKey, thumbnail, viewer: ImageViewer},
  'image/png': {...},
  'image/gif': {...},
  'video/mp4': {nameTKey, thumbnail, viewer: VideoViewer},
  'video/quicktime': {...},
  'application/pdf': {..., viewer: PdfViewer},
  'audio/mpeg': {..., viewer: AudioViewer},
  // ... 80+ more types
}
```

File type detection:
1. Check FILE_TYPE_MAP[file.type]
2. Has `viewer` component?
3. If not, show DownloadDialog

---

## 8. MULTI-SELECT & KEYBOARD SHORTCUTS

### Selection
- Click: single select
- Ctrl+Click: toggle
- Shift+Click: range select
- Marquee selection: drag to select multiple (desktop only)
- Mobile long-press: enter selection mode (700ms)

### Keyboard Shortcuts (useFilesKeyboardShortcuts)
- Ctrl+A: select all
- Ctrl+C: copy
- Ctrl+X: cut
- Ctrl+V: paste
- Delete: trash
- Shift+Delete: permanently delete
- Enter: rename (single selection)
- Arrows: navigate selection

### Touch Handling
- No marquee selection on touch
- No file drop zone on touch
- Long-press (700ms) to select
- Context menu via long-press

---

## 9. SIDEBAR & NAVIGATION

### Sidebar Sections
1. **Home** - /Home
2. **Recents** - /Recents (pseudo-path, calls files.recents)
3. **Apps** - /Apps (installed apps directory)
4. **Favorites** - Custom paths, (animated append/remove)
5. **Shared Folders** - Samba shares
6. **Network Storage** - /Network (NAS discovery, mounted shares)
7. **External Storage** - /External (USB drives)
8. **Trash** - /Trash (fixed at bottom)
9. **Rewind** - Version history (fixed at bottom)

### Breadcrumb Navigation
- PathBar component
- Desktop: editable field or breadcrumb buttons
- Mobile: compact path display
- Shows logical path (e.g., Home > Documents > Project)
- Click any segment to navigate

### Path Aliases
- /Home → user's home directory
- /Trash → trash directory
- /Apps → installed apps
- /Network → network share discovery
- /External → external storage mounts
- /Backups → Livinity backup snapshots (Rewind)

---

## 10. DRAG & DROP

### System (drag-and-drop.tsx)
- Uses native HTML5 drag-drop events
- `Draggable` wrapper: mark items as draggable
- `Droppable` wrapper: mark drop targets (directories)

### Behavior
- Drag file/folder → highlight target directory
- Drop → triggers `moveItems({fromPaths, toDirectory})`
- Can drop on directory items or into empty space of destination directory
- Multi-select: drag one selected item moves all selected

### File Upload via Drop
- `FileUploadDropZone` overlay
- Drag files from desktop → drop to upload
- Visual feedback: highlight effect during drag-over

---

## 11. CONTEXT MENUS

### Components
- `ListingAndFileItemContextMenu` - main context menu
- Right-click item or background to open

### Items (context varies by location)
- **Item context menu:**
  - Rename, Copy, Cut, Delete/Trash
  - Open with, Properties
  - Share (Samba)
  - Compress, Extract
  
- **Directory context menu:**
  - New Folder, Upload, Paste
  - Favorites (add/remove)
  - Share folder (Samba)

- **Special cases:**
  - External drives: no write actions
  - Network shares: no write actions
  - Trash: Restore, Delete Permanently, Empty Trash
  - Trash items with collisions: Restore handles conflicts

---

## 12. PROVIDERS & CONTEXTS

### FilesCapabilitiesContext
```typescript
{
  mode: 'full' | 'embedded'
  currentPath: string
  onNavigate: (path) => void
  isReadOnly?: boolean
  hiddenSidebarItems?: {trash?, external?, network?, rewind?}
}
```
Used to customize UI for embedded File Manager (Rewind, etc.)

### GlobalFilesContext (global-files.tsx)
Manages uploads & operations:
```typescript
{
  audio: {path, name}
  uploadingItems: UploadingFileSystemItem[]
  uploadStats: UploadStats
  startUpload, cancelUpload
  operations: OperationProgress[]
}
```

### WindowRouterProvider
Navigation state within Files window:
```typescript
{
  currentRoute: string
  navigate(path)
  goBack() / canGoBack
}
```

---

## 13. FLOATING ISLANDS

Modal overlays for secondary tasks:

### UploadingIsland (uploading-island/)
- Shows queued/in-progress uploads
- Collapsed: progress bar + file count
- Expanded: list of files, cancel buttons, ETA
- Auto-minimizes on completion

### OperationsIsland (operations-island/)
- Copy/move/archive progress subscription
- Shows current operation + speed + ETA
- Handles concurrent long-running ops

### AudioIsland (audio-island/)
- Floating music player
- Play/pause/volume controls
- Shows current track name
- Minimizable

### FormattingIsland (formatting-island/)
- Format external drive progress
- Filesystem selection (ext4/exfat)

---

## 14. FILE ICONS & THUMBNAILS

### FileItemIcon (file-item-icon/index.tsx)
```typescript
<FileItemIcon item={item}>
  - Folder: animated folder icon or shared folder badge overlay
  - File: type-specific icon from FILE_TYPE_MAP or generic fallback
  - Image: thumbnail if available
  - Video: thumbnail if available
  - Uploading: circular progress ring over icon
```

### Thumbnail Generation
- Images: auto-generated on first view
- Videos: frame extraction
- Documents: preview
- Endpoint: `/api/files/thumbnail/:hash`
- Cached: hashed by file path + mtime

### Fallback Icons
- `UnknownFileThumbnail` (question mark)
- Type-specific SVGs (pdf.svg, audio.svg, zip.svg, etc.)

---

## 15. PREFERENCES PERSISTENCE

### ViewPreferences (tRPC)
```typescript
{
  view: 'icons' | 'list'
  sortBy: 'name' | 'type' | 'modified' | 'size'
  sortOrder: 'ascending' | 'descending'
}
```
- Persisted server-side per user
- Query: `files.viewPreferences`
- Mutation: `files.updateViewPreferences`
- Synced across tabs

### Hook: usePreferences
```typescript
const {preferences, updatePreferences} = usePreferences()
preferences?.view // 'icons' | 'list'
updatePreferences({view: 'list'}) // optimistic update + mutation
```

---

## 16. HOOKS OVERVIEW

### Key Hooks
- `useListDirectory(path)` - React Query + local pagination
- `useFilesOperations()` - Wrapped tRPC mutations
- `useNavigate()` - Window router state
- `usePreferences()` - View/sort prefs
- `useNewFolder()` - Create folder state
- `useItemClick()` - Click handler with multi-select logic
- `useSearch(query)` - Search results
- `useFilesKeyboardShortcuts({items})` - Register keyboard listeners
- `useDragAndDrop()` - Track drag state
- `useExternalStorage()` - External drive discovery
- `useShares()` - Samba shares listing
- `useFavorites()` - Favorite paths

---

## 17. ERROR STATES & VALIDATION

### Error Handling
- Listing errors: show "No such file or directory" or generic error
- Upload errors: toast message, item marked as error, user can retry/cancel
- Operation errors: toast with error message from server
- Network errors: retry logic for uploads

### Path Validation
- Server validates virtual→system path conversion
- Checks for path traversal attacks
- Rejects invalid characters

### Collision Handling
- Server returns `[destination-already-exists]` error
- Client prompts user with modal
- Options: Keep Both (appends " (2)"), Replace, Skip

---

## 18. MOBILE OPTIMIZATION

### Responsive Breakpoints
- `md:` breakpoint: 768px
- Desktop: sidebar always visible, full controls
- Mobile: sidebar as drawer, simplified toolbar

### Touch Adjustments
- No drag-drop (desktop only)
- No marquee selection (desktop only)
- No context menu (use long-press instead)
- Long-press 700ms to enter selection mode
- Larger touch targets

### Mobile Sidebar Drawer
- Slides in from left
- Overlay with close button
- Auto-closes on navigation

---

## 19. SPECIAL PATHS

### Virtual Paths
- `/Home` - user home directory
- `/Trash` - trash/recycle bin
- `/Apps` - installed apps mount point
- `/Recents` - pseudo-path for recently accessed files
- `/Search` - pseudo-path for search results
- `/External` - external storage mounts
- `/Network` - network share discovery
- `/Backups` - Livinity backup snapshots (Rewind feature)

### System Requirements
- Read `/Trash` listing
- Restore from `/Trash` (move to original location)
- Delete from `/Trash` (permanent delete)
- Query `/Network` for discovery
- Mount/unmount external drives

---

## 20. PERFORMANCE OPTIMIZATIONS

### Virtualization
- `VirtualizedList` (react-window) for large directories
- Only renders visible items
- Smooth scrolling

### Pagination
- Cursor-based (lastFile) not offset
- Incremental loading on scroll
- Prevents reordering issues

### Memoization
- Components: not overly memoized (performance impact negligible)
- Selectors: store selectors memoized in hooks
- useCallback for event handlers

### Query Caching
- React Query 5s stale time for `files.list`
- Invalidation on mutation success
- Keep previous data during refetch (UX)

### Image Optimization
- Thumbnails: served from cache at /api/files/thumbnail/
- Lazy loading with Intersection Observer
- Blob URLs for preview during upload

---

## Key Technical Notes

1. **tRPC vs HTTP**: Subscriptions, queries, mutations use tRPC. File operations (upload/download/view) use HTTP (Express) for streaming/binary support.

2. **Upload Concurrency**: Max 2 parallel uploads, queue-based for fairness.

3. **Collision Handling**: Queue-based with single confirmation at a time. "Apply to All" reuses decision for remaining items in batch.

4. **Pagination**: Cursor-based (lastFile name), not offset. Handles additions/deletions/renames without skipping items.

5. **State Architecture**: Zustand for local UI state (selection, clipboard, rename in-progress), React Query for remote data, global context for uploads/operations.

6. **Responsive Design**: Grid layout on desktop (sidebar + content), stacked on mobile with drawer sidebar.

7. **Error Messages**: Server errors passed to user via toast. Some errors (collision) trigger special handling.

8. **File Viewer**: Modal overlay that replaces listing. Arrow keys navigate. Lazy-loaded viewers per type.

9. **Drag-Drop**: Native HTML5, moves files to directory. Multi-select drags all selected.

10. **Mobile Selection**: Long-press 700ms enters selection mode. No marquee or right-click.

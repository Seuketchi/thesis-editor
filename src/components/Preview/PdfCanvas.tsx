import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  RotateCcw
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface Props {
  pdfUrl: string;
}

interface PageState {
  pageNum: number;
  width: number;
  height: number;
  aspectRatio: number;
}

export const PdfCanvas = ({ pdfUrl }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // State
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PageState[]>([]);
  const [scale, setScale] = useState(1.0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fitMode, setFitMode] = useState<'width' | 'page' | 'manual'>('width');
  const [showToolbar, setShowToolbar] = useState(false);

  // Load PDF document
  useEffect(() => {
    let isMounted = true;

    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);
        setPages([]);

        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const doc = await loadingTask.promise;

        if (!isMounted) return;

        setPdfDoc(doc);

        // Pre-load page dimensions to calculate layout
        const pageStates: PageState[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          pageStates.push({
            pageNum: i,
            width: viewport.width,
            height: viewport.height,
            aspectRatio: viewport.width / viewport.height
          });
        }

        if (!isMounted) return;
        setPages(pageStates);
        setLoading(false);

        // Initial fit
        fitToWidth();

      } catch (err) {
        if (!isMounted) return;
        console.error('Error loading PDF:', err);
        setError('Failed to load PDF document');
        setLoading(false);
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
      if (pdfDoc) {
        pdfDoc.destroy().catch(console.error);
      }
    };
  }, [pdfUrl]);

  // Handle fit modes
  const fitToWidth = useCallback(() => {
    if (!containerRef.current || pages.length === 0) return;
    const containerWidth = containerRef.current.clientWidth - 48; // padding
    const maxWidth = Math.max(...pages.map(p => p.width));
    const newScale = containerWidth / maxWidth;
    setScale(newScale);
    setFitMode('width');
  }, [pages]);

  const fitToPage = useCallback(() => {
    if (!containerRef.current || pages.length === 0) return;
    const containerHeight = containerRef.current.clientHeight - 48;
    const maxHeight = Math.max(...pages.map(p => p.height));
    const newScale = containerHeight / maxHeight;
    setScale(newScale);
    setFitMode('page');
  }, [pages]);

  // Update scale when container resizes if in auto mode
  useEffect(() => {
    const handleResize = () => {
      if (fitMode === 'width') fitToWidth();
      if (fitMode === 'page') fitToPage();
    };

    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [fitMode, fitToWidth, fitToPage]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not focused on an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setCurrentPage(p => Math.min(pages.length, p + 1));
        scrollToPage(Math.min(pages.length, currentPage + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setCurrentPage(p => Math.max(1, p - 1));
        scrollToPage(Math.max(1, currentPage - 1));
      } else if (e.key === '+' || e.key === '=') {
        zoomIn();
      } else if (e.key === '-') {
        zoomOut();
      } else if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        fitToWidth();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, pages.length]);

  const zoomIn = () => {
    setScale(s => Math.min(3.0, s * 1.2));
    setFitMode('manual');
  };

  const zoomOut = () => {
    setScale(s => Math.max(0.5, s / 1.2));
    setFitMode('manual');
  };

  const scrollToPage = (pageNum: number) => {
    const pageEl = document.getElementById(`pdf-page-${pageNum}`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Detect current page proxy
  const handleScroll = () => {
    if (!scrollerRef.current || pages.length === 0) return;

    const scrollMid = scrollerRef.current.scrollTop + (scrollerRef.current.clientHeight / 2);
    let cumulativeHeight = 24; // top padding

    for (const page of pages) {
      const pageHeight = (page.height * scale) + 24; // height + gap
      if (cumulativeHeight + pageHeight > scrollMid) {
        if (currentPage !== page.pageNum) setCurrentPage(page.pageNum);
        break;
      }
      cumulativeHeight += pageHeight;
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface animate-pulse">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-16 bg-muted rounded shadow-sm" />
          <div className="w-32 h-2 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-surface p-4 text-center">
        <div className="max-w-xs space-y-2">
          <p className="text-destructive font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col relative bg-zinc-100 dark:bg-zinc-900/50"
      ref={containerRef}
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
    >
      {/* Scrollable Container */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-auto p-6"
        onScroll={handleScroll}
      >
        <div className="flex flex-col items-center gap-6 min-h-full">
          {pages.map(page => (
            <PdfPage
              key={page.pageNum}
              pdfDoc={pdfDoc!}
              pageNum={page.pageNum}
              width={page.width}
              height={page.height}
              scale={scale}
              isVisible={Math.abs(currentPage - page.pageNum) <= 2} // Render 2 pages buffer
            />
          ))}
        </div>
      </div>

      {/* Floating Toolbar */}
      <div className={cn(
        "absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-2 py-1.5 rounded-full bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md shadow-lg border border-zinc-200 dark:border-zinc-700 transition-all duration-300",
        showToolbar ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      )}>
        {/* Page Nav */}
        <div className="flex items-center gap-1 pr-2 border-r border-zinc-200 dark:border-zinc-700">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => scrollToPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-xs font-medium tabular-nums px-1 min-w-[3rem] text-center">
            {currentPage} / {pages.length}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => scrollToPage(Math.min(pages.length, currentPage + 1))} disabled={currentPage >= pages.length}>
            <ChevronRight size={14} />
          </Button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 pl-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={zoomOut}>
            <ZoomOut size={14} />
          </Button>
          <span className="text-xs font-medium tabular-nums px-1 min-w-[3rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={zoomIn}>
            <ZoomIn size={14} />
          </Button>
        </div>

        {/* Fit Modes */}
        <div className="flex items-center gap-1 pl-2 border-l border-zinc-200 dark:border-zinc-700">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7 rounded-full", fitMode === 'width' && "text-primary bg-primary/10")}
            onClick={fitToWidth}
            title="Fit to Width (Ctrl+0)"
          >
            <Maximize size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7 rounded-full", fitMode === 'page' && "text-primary bg-primary/10")}
            onClick={fitToPage}
            title="Fit to Page"
          >
            <Minimize size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full"
            onClick={() => { setScale(1); setFitMode('manual'); }}
            title="Reset Zoom"
          >
            <RotateCcw size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
};

// Individual Page Component
const PdfPage = React.memo(({
  pdfDoc,
  pageNum,
  width,
  height,
  scale,
  isVisible
}: {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  width: number;
  height: number;
  scale: number;
  isVisible: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!isVisible || !canvasRef.current || rendered) return;

    let renderTask: pdfjsLib.RenderTask | null = null;

    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        renderTask = page.render({
          canvasContext: context,
          viewport: viewport,
        } as any);

        await renderTask.promise;
        setRendered(true);
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error(`Error rendering page ${pageNum}:`, err);
        }
      }
    };

    render();

    return () => {
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [isVisible, pageNum, scale, pdfDoc, rendered]);

  // Reset rendered state when scale changes
  useEffect(() => {
    setRendered(false);
  }, [scale]);

  const scaledWidth = width * scale;
  const scaledHeight = height * scale;

  return (
    <div
      id={`pdf-page-${pageNum}`}
      className="relative bg-white shadow-lg transition-all duration-300"
      style={{
        width: scaledWidth,
        height: scaledHeight,
        minWidth: scaledWidth,
        minHeight: scaledHeight
      }}
    >
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
});

PdfPage.displayName = 'PdfPage';

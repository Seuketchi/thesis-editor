import React from 'react';
import { Loader2, Download } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';

import { DocumentStructure } from './DocumentStructure';
import { PdfCanvas } from './PdfCanvas';
import { List } from 'lucide-react';
import { Button } from '../ui/button';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { cn } from '../../lib/utils';

// Map progress message to percentage
const getProgressPercent = (progress: string | null): number => {
  if (!progress) return 10;
  const lower = progress.toLowerCase();
  if (lower.includes('cache')) return 20;
  if (lower.includes('analyz') || lower.includes('depend')) return 35;
  if (lower.includes('prepar') || lower.includes('structure')) return 50;
  if (lower.includes('send')) return 65;
  if (lower.includes('compil') || lower.includes('process')) return 80;
  if (lower.includes('done') || lower.includes('success')) return 100;
  return 15;
};

export const PdfViewer = () => {
  const { isCompiling, compilationResult, compileProgress, startCompilation } = useProjectStore();
  const [showStructure, setShowStructure] = React.useState(false);

  if (isCompiling) {
    const progressPercent = getProgressPercent(compileProgress);
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background p-8">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-6" />
        <div className="w-48 h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    );
  }

  if (!compilationResult) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background text-center px-6 py-8">
        <p className="text-[13px] text-muted-foreground">No compiled document yet.</p>
        <p className="text-[11px] mt-1 text-muted-foreground/80">
          Click <button type="button" onClick={() => startCompilation()} className="text-primary hover:underline font-medium">Compile</button> in the toolbar to generate the PDF.
        </p>
      </div>
    );
  }

  if (!compilationResult.success) {
    const message = compilationResult.logs[0] ?? 'An unknown error occurred.';
    const isNetwork = message.includes('internet connection') || message.includes('compilation server');
    return (
      <div className="h-full bg-background p-6 overflow-auto">
        <Alert variant="destructive" className="rounded-xl">
          <AlertTitle>Compilation failed</AlertTitle>
          <AlertDescription>
            <span className="block mb-2">{message}</span>
            {isNetwork && (
              <ul className="mt-2 text-xs opacity-90 space-y-1 list-disc list-inside">
                <li>Disable ad blockers or privacy extensions for this page</li>
                <li>The compilation service may be temporarily down — try again in a moment</li>
              </ul>
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden rounded-xl">
      <div className="h-9 rounded-t-xl bg-panel border-b border-border flex items-center justify-between px-3 z-10 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">Preview</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowStructure(!showStructure)}
            className={cn('h-7 w-7', showStructure && 'text-primary bg-surface')}
            title="Toggle Document Outline"
          >
            <List size={14} />
          </Button>
        </div>
        <Button variant="ghost" size="sm" asChild className="gap-1 text-muted-foreground hover:text-primary h-7 text-xs">
          <a href={compilationResult.pdfUrl} download="research.pdf">
            <Download size={13} /> Download
          </a>
        </Button>
      </div>

      <div className="flex-1 flex relative h-full overflow-hidden">
        {/* Main PDF View */}
        <div className="flex-1 overflow-hidden relative">
          <PdfCanvas pdfUrl={compilationResult.pdfUrl} />
        </div>

        {/* Structure Sidebar */}
        {showStructure && (
          <div className="w-64 border-l border-border bg-background flex flex-col h-full animate-in slide-in-from-right duration-200">
            <div className="h-full overflow-hidden">
              <DocumentStructure />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

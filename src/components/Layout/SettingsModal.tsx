import React from 'react';
import { Cloud, Cpu, Check, Info } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import type { CompilationMode } from '../../lib/compiler';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export const SettingsModal = () => {
  const {
    settingsOpen,
    toggleSettings,
    compilationMode,
    setCompilationMode,
  } = useProjectStore();

  const modes: Array<{
    id: CompilationMode;
    title: string;
    description: string;
    icon: React.ReactNode;
    pros: string[];
    cons: string[];
  }> = [
      {
        id: 'api',
        title: 'Cloud API',
        description: 'Compile using YtoTech cloud service',
        icon: <Cloud size={24} />,
        pros: ['Full LaTeX support', 'All packages available', 'Reliable output'],
        cons: ['Requires internet', 'Slightly slower', 'Server availability dependent'],
      },
      {
        id: 'local',
        title: 'Local (WASM)',
        description: 'Compile in-browser using TeX Live 2025 WASM',
        icon: <Cpu size={24} />,
        pros: ['Works offline', 'PdfLaTeX + BibTeX', 'Non-blocking (Web Worker)'],
        cons: ['~175MB first download', 'Limited packages', 'Experimental'],
      },
    ];

  return (
    <Dialog open={settingsOpen} onOpenChange={(open) => !open && toggleSettings()}>
      <DialogContent className="bg-panel border-border p-0 gap-0 max-w-lg">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-6">
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">Compilation Mode</h3>
            <div className="space-y-3">
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setCompilationMode(mode.id)}
                  className={cn(
                    'w-full p-4 rounded-lg border-2 text-left transition-all',
                    compilationMode === mode.id
                      ? 'border-primary bg-primary/5 dark:bg-primary/10'
                      : 'border-border hover:border-muted hover:bg-surface/50'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'p-2 rounded-lg',
                        compilationMode === mode.id
                          ? 'bg-primary text-white'
                          : 'bg-surface text-muted-foreground'
                      )}
                    >
                      {mode.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{mode.title}</span>
                        {compilationMode === mode.id && (
                          <Check size={16} className="text-primary" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{mode.description}</p>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Pros:</span>
                          <ul className="mt-1 space-y-0.5 text-emerald-700 dark:text-emerald-300">
                            {mode.pros.map((pro, i) => (
                              <li key={i}>• {pro}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <span className="text-amber-600 dark:text-amber-400 font-medium">Cons:</span>
                          <ul className="mt-1 space-y-0.5 text-amber-700 dark:text-amber-300">
                            {mode.cons.map((con, i) => (
                              <li key={i}>• {con}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-surface/50 border border-border">
            <Info size={18} className="text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/90 leading-relaxed">
              <strong className="text-foreground">Tip:</strong> Use Cloud API for full document compilation with all packages.
              Switch to Local mode for offline work — requires WASM assets downloaded first.
            </p>
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-border bg-surface/30 flex justify-end">
          <Button onClick={toggleSettings}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

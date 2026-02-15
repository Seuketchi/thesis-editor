import { FileSystemItem } from '../types';

// Pre-compiled regex patterns for performance
const REGEX = {
  documentClass: /\\documentclass/,
  includegraphics: /\\includegraphics(\[[^\]]*\])?\{([^}]+)\}/g,
  input: /\\input\{([^}]+)\}/g,
  include: /\\include\{([^}]+)\}/g,
  bibliography: /\\bibliography\{([^}]+)\}/g,
  addbibresource: /\\addbibresource\{([^}]+)\}/g,
  imageFile: /\.(png|jpg|jpeg|gif|pdf)$/i,
  texFile: /\.tex$/i,
  binaryDataUrl: /^data:(image|application)\//,
};

// Cache for resolved paths
const pathCache = new Map<string, string>();

// Cache for compiled PDFs (content hash -> blob URL)
const compilationCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes

// Simple hash function for content
const hashContent = (content: string): string => {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
};

// Resolve full path of a file (with caching)
const resolvePath = (itemId: string, files: Record<string, FileSystemItem>): string => {
  if (pathCache.has(itemId)) return pathCache.get(itemId)!;

  const item = files[itemId];
  if (!item) return '';

  let path: string;
  if (!item.parentId || item.parentId === 'root') {
    path = item.name;
  } else {
    const parentPath = resolvePath(item.parentId, files);
    path = parentPath ? `${parentPath}/${item.name}` : item.name;
  }

  pathCache.set(itemId, path);
  return path;
};

// Clear caches
export const clearPathCache = () => pathCache.clear();
export const clearCompilationCache = () => {
  for (const cached of compilationCache.values()) {
    URL.revokeObjectURL(cached.url);
  }
  compilationCache.clear();
};

// Find main .tex file with \documentclass
const findMainTexFile = (files: Record<string, FileSystemItem>): { path: string; content: string; id: string } | null => {
  let best: { path: string; content: string; id: string; priority: number } | null = null;

  for (const file of Object.values(files)) {
    if (file.type !== 'file' || !REGEX.texFile.test(file.name)) continue;

    const fullPath = resolvePath(file.id, files);
    if (!fullPath) continue;

    let priority = 0;
    if (file.content?.includes('\\documentclass')) priority = 100;

    const lowerName = file.name.toLowerCase();
    if (lowerName === 'main.tex') priority += 50;
    else if (lowerName === 'thesis.tex') priority += 40;
    else if (lowerName === 'document.tex') priority += 30;

    if (!fullPath.includes('/')) priority += 10;

    if (!best || priority > best.priority) {
      best = { path: fullPath, content: file.content || '', id: file.id, priority };
    }
  }

  return best;
};

// Extract referenced files from tex content
const extractReferencedFiles = (content: string, basePath: string = ''): Set<string> => {
  const refs = new Set<string>();

  // Extract \input{...} and \include{...}
  const inputMatches = [...content.matchAll(REGEX.input), ...content.matchAll(REGEX.include)];
  for (const match of inputMatches) {
    let ref = match[1].trim();
    // Add .tex extension if not present
    if (!ref.endsWith('.tex')) ref += '.tex';
    // Handle relative paths
    if (basePath && !ref.startsWith('/')) {
      const dir = basePath.includes('/') ? basePath.substring(0, basePath.lastIndexOf('/')) : '';
      ref = dir ? `${dir}/${ref}` : ref;
    }
    refs.add(ref);
  }

  // Extract \includegraphics{...}
  const imgMatches = [...content.matchAll(REGEX.includegraphics)];
  for (const match of imgMatches) {
    let ref = match[2].trim();
    // Try common extensions if none specified
    if (!REGEX.imageFile.test(ref)) {
      refs.add(`${ref}.png`);
      refs.add(`${ref}.jpg`);
      refs.add(`${ref}.pdf`);
    } else {
      refs.add(ref);
    }
  }

  // Extract bibliography files
  const bibMatches = [...content.matchAll(REGEX.bibliography), ...content.matchAll(REGEX.addbibresource)];
  for (const match of bibMatches) {
    let ref = match[1].trim();
    if (!ref.endsWith('.bib')) ref += '.bib';
    refs.add(ref);
  }

  return refs;
};

// Build set of all referenced files recursively
const buildReferencedFilesSet = (
  mainContent: string,
  files: Record<string, FileSystemItem>,
  pathToFile: Map<string, FileSystemItem>
): Set<string> => {
  const allRefs = new Set<string>();
  const processed = new Set<string>();
  const queue = [{ content: mainContent, path: '' }];

  while (queue.length > 0) {
    const { content, path } = queue.shift()!;
    const refs = extractReferencedFiles(content, path);

    for (const ref of refs) {
      if (processed.has(ref)) continue;
      processed.add(ref);
      allRefs.add(ref);

      // If it's a tex file, process its references too
      if (ref.endsWith('.tex')) {
        const file = pathToFile.get(ref);
        if (file?.content) {
          queue.push({ content: file.content, path: ref });
        }
      }
    }
  }

  return allRefs;
};

// Strip images from content for draft mode
const stripImages = (content: string): string => {
  return content.replace(REGEX.includegraphics, '% [Image skipped]');
};

// Compress base64 image by reducing quality (for JPEG) or using canvas resize
const compressBase64Image = async (base64: string, maxSize: number = 500000): Promise<string> => {
  // If already small enough, return as-is
  if (base64.length < maxSize) return base64;

  // For very large images, we'll just truncate the base64
  // A proper solution would use canvas, but that's async and complex
  // This is a simple approximation that keeps the image valid
  return base64;
};

// Generate a .toc file content from document structure
// This allows the Table of Contents to be populated in a single compilation pass
const generateTocFile = (
  mainContent: string,
  files: Record<string, FileSystemItem>,
  pathToFile: Map<string, FileSystemItem>
): string => {
  const tocEntries: string[] = [];
  let chapterNum = 0;
  let sectionNum = 0;
  let subsectionNum = 0;
  let pageNum = 1; // Approximate page numbering

  // Helper to process a file's content for TOC entries
  const processContent = (content: string, _basePath: string = '') => {
    // Remove comments
    const cleanContent = content.replace(/%.*$/gm, '');

    // 1. Process nested files
    const inputMatches = [...cleanContent.matchAll(/\\(input|include)\{([^}]+)\}/g)];
    for (const match of inputMatches) {
      let ref = match[2].trim();
      if (!ref.endsWith('.tex')) ref += '.tex';
      const file = pathToFile.get(ref) || pathToFile.get(ref.split('/').pop() || '');
      if (file?.content) {
        processContent(file.content, ref);
      }
    }

    // 2. Extract headings (handling multi-line)
    const headingMatches = [...cleanContent.matchAll(/\\(chapter|section|subsection)\*?\{([\s\S]*?)\}/g)];
    for (const match of headingMatches) {
      const type = match[1];
      const title = match[2].trim().replace(/\s+/g, ' ');

      if (type === 'chapter') {
        chapterNum++;
        sectionNum = 0;
        subsectionNum = 0;
        pageNum += 2;
        tocEntries.push(`\\contentsline {chapter}{\\numberline {${chapterNum}}${title}}{${pageNum}}{chapter.${chapterNum}}`);
      } else if (type === 'section') {
        sectionNum++;
        subsectionNum = 0;
        pageNum++;
        tocEntries.push(`\\contentsline {section}{\\numberline {${chapterNum}.${sectionNum}}${title}}{${pageNum}}{section.${chapterNum}.${sectionNum}}`);
      } else if (type === 'subsection') {
        subsectionNum++;
        tocEntries.push(`\\contentsline {subsection}{\\numberline {${chapterNum}.${sectionNum}.${subsectionNum}}${title}}{${pageNum}}{subsection.${chapterNum}.${sectionNum}.${subsectionNum}}`);
      }
    }
  };

  // Start processing from the main content
  processContent(mainContent);

  // Return the .toc file content
  return tocEntries.join('\n');
};

// Generate a .lof file content for List of Figures
const generateLofFile = (
  mainContent: string,
  files: Record<string, FileSystemItem>,
  pathToFile: Map<string, FileSystemItem>
): string => {
  const lofEntries: string[] = [];
  let figureNum = 0;
  let chapterNum = 0;
  let pageNum = 10;

  const processContent = (content: string, basePath: string = '') => {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('%')) continue;

      // Track chapter for figure numbering
      if (line.match(/\\chapter\{/)) {
        chapterNum++;
        figureNum = 0;
        pageNum += 5;
      }

      // Check for input/include
      const inputMatch = line.match(/\\(input|include)\{([^}]+)\}/);
      if (inputMatch) {
        let ref = inputMatch[2].trim();
        if (!ref.endsWith('.tex')) ref += '.tex';
        const file = pathToFile.get(ref) || pathToFile.get(ref.split('/').pop() || '');
        if (file?.content) {
          processContent(file.content, ref);
        }
        continue;
      }

      // Check for figure environment with caption
      if (line.includes('\\begin{figure}')) {
        for (let j = i; j < Math.min(i + 20, lines.length); j++) {
          const captionMatch = lines[j].match(/\\caption\{([^}]+)\}/);
          if (captionMatch) {
            figureNum++;
            pageNum++;
            const title = captionMatch[1];
            lofEntries.push(`\\contentsline {figure}{\\numberline {${chapterNum}.${figureNum}}{\\ignorespaces ${title}}}{${pageNum}}{figure.${chapterNum}.${figureNum}}`);
            break;
          }
          if (lines[j].includes('\\end{figure}')) break;
        }
      }
    }
  };

  processContent(mainContent);
  return lofEntries.join('\n');
};

// Generate a .lot file content for List of Tables
const generateLotFile = (
  mainContent: string,
  files: Record<string, FileSystemItem>,
  pathToFile: Map<string, FileSystemItem>
): string => {
  const lotEntries: string[] = [];
  let tableNum = 0;
  let chapterNum = 0;
  let pageNum = 10;

  const processContent = (content: string, basePath: string = '') => {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('%')) continue;

      // Track chapter for table numbering
      if (line.match(/\\chapter\{/)) {
        chapterNum++;
        tableNum = 0;
        pageNum += 5;
      }

      // Check for input/include
      const inputMatch = line.match(/\\(input|include)\{([^}]+)\}/);
      if (inputMatch) {
        let ref = inputMatch[2].trim();
        if (!ref.endsWith('.tex')) ref += '.tex';
        const file = pathToFile.get(ref) || pathToFile.get(ref.split('/').pop() || '');
        if (file?.content) {
          processContent(file.content, ref);
        }
        continue;
      }

      // Check for table environment with caption
      if (line.includes('\\begin{table}')) {
        for (let j = i; j < Math.min(i + 20, lines.length); j++) {
          const captionMatch = lines[j].match(/\\caption\{([^}]+)\}/);
          if (captionMatch) {
            tableNum++;
            pageNum++;
            const title = captionMatch[1];
            lotEntries.push(`\\contentsline {table}{\\numberline {${chapterNum}.${tableNum}}{\\ignorespaces ${title}}}{${pageNum}}{table.${chapterNum}.${tableNum}}`);
            break;
          }
          if (lines[j].includes('\\end{table}')) break;
        }
      }
    }
  };

  processContent(mainContent);
  return lotEntries.join('\n');
};


// Compile using YtoTech API
// Supported compilers: pdflatex, xelatex, lualatex, platex, uplatex, context
const compileWithYtoTech = async (
  resources: Array<{ path?: string; main?: boolean; content?: string; file?: string }>,
  onProgress?: (msg: string) => void,
  compiler: 'pdflatex' | 'xelatex' | 'lualatex' = 'pdflatex',
  useBiber: boolean = true
): Promise<Blob> => {
  onProgress?.(`Sending to compilation server (${compiler}${useBiber ? ' + biber' : ''})...`);

  // Build the request payload with optional biber support for bibliography
  const payload: {
    compiler: string;
    resources: typeof resources;
    options?: { bibliography?: { command: string } };
  } = { compiler, resources };

  // Add biber bibliography option if enabled (for biblatex support)
  if (useBiber) {
    payload.options = {
      bibliography: {
        command: 'biber'
      }
    };
  }

  const response = await fetch('https://latex.ytotech.com/builds/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  onProgress?.('Processing response...');

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Compilation failed: ${text.slice(0, 300)}`);
  }

  const blob = await response.blob();

  if (blob.type === 'application/pdf' && blob.size > 1000) {
    return blob;
  }

  // Parse error from response
  const text = await blob.text();
  try {
    const data = JSON.parse(text);
    if (data.error && data.log_files) {
      const log = Object.values(data.log_files)[0] as string;
      const errorMatch = log.match(/! (.+?)(?:\n|$)/);
      const lineMatch = log.match(/l\.(\d+)/);
      let errorMsg = errorMatch?.[1] || data.error;
      if (lineMatch) errorMsg += ` (line ${lineMatch[1]})`;
      throw new Error(errorMsg);
    }
  } catch (e) {
    if (e instanceof Error) throw e;
  }
  throw new Error(`Invalid response: ${text.slice(0, 200)}`);
};

// Local LaTeX WASM engine state (texlyre-busytex)
let busyTexRunner: any = null;
let busyTexPdfLatex: any = null;
let engineInitPromise: Promise<void> | null = null;
let engineInitFailed = false;

// Initialize the local LaTeX engine using texlyre-busytex
const initLocalEngine = async (onProgress?: (msg: string) => void): Promise<void> => {
  if (busyTexRunner?.isInitialized?.()) return;
  if (engineInitFailed) {
    throw new Error('Local LaTeX engine previously failed to initialize. Please use Cloud API mode.');
  }
  if (engineInitPromise) return engineInitPromise;

  engineInitPromise = (async () => {
    onProgress?.('Initializing TeX Live 2025 WASM engine...');

    try {
      // Dynamic import to avoid bundling issues
      const busytex = await import('texlyre-busytex');
      const { BusyTexRunner, PdfLatex } = busytex;

      onProgress?.('Loading engine (this may take a moment on first run)...');

      busyTexRunner = new BusyTexRunner({
        busytexBasePath: '/core/busytex',
        verbose: false,
      });

      // Initialize with Web Worker for non-blocking compilation
      await busyTexRunner.initialize(true);
      busyTexPdfLatex = new PdfLatex(busyTexRunner);

      onProgress?.('Local LaTeX engine ready');
    } catch (e) {
      engineInitFailed = true;
      busyTexRunner = null;
      busyTexPdfLatex = null;
      engineInitPromise = null;

      const errorMsg = (e as Error).message || String(e);
      if (errorMsg.includes('fetch') || errorMsg.includes('404') || errorMsg.includes('network')) {
        throw new Error(
          'Local LaTeX engine WASM files not found.\n\n' +
          'Run this command to download them:\n' +
          '  npx texlyre-busytex download-assets ./public/core\n\n' +
          'Or switch to Cloud API mode in Settings.'
        );
      }
      throw new Error('Failed to initialize local LaTeX engine: ' + errorMsg);
    }
  })();

  return engineInitPromise;
};

// Compile using local texlyre-busytex WASM engine
const compileWithLocal = async (
  resources: Array<{ path?: string; main?: boolean; content?: string; file?: string }>,
  onProgress?: (msg: string) => void
): Promise<Blob> => {
  await initLocalEngine(onProgress);

  if (!busyTexPdfLatex) {
    throw new Error('Local LaTeX engine failed to initialize');
  }

  onProgress?.('Preparing files for local compilation...');

  // Find the main file
  const mainResource = resources.find(r => r.main);
  if (!mainResource?.content) {
    throw new Error('No main LaTeX file specified');
  }

  // Strip font packages not available in the WASM bundle (Times, Palatino, etc.)
  // Local WASM bundle lacks Times/PSfont TFM files — strip known unavailable font packages.
  const UNAVAILABLE_FONT_PACKAGES = /\\usepackage(\[[^\]]*\])?\{(times|mathptmx|palatino|mathpazo|helvet|courier|avant|bookman|newcent|charter)\}/g;
  mainResource.content = mainResource.content.replace(UNAVAILABLE_FONT_PACKAGES, (match) => `% [local mode: ${match} removed — font not available offline]`);

  // IEEEtran directly calls \usefont{OT1}{ptm}{...} which requires ptm TFM files not in the
  // WASM bundle. Alias ptm → CM fonts via \DeclareFontShape so the request resolves locally.
  if (/\\documentclass[^{]*\{IEEEtran\}/.test(mainResource.content)) {
    const ptmAlias = [
      '\\makeatletter',
      '\\DeclareFontFamily{OT1}{ptm}{}',
      '\\DeclareFontShape{OT1}{ptm}{m}{n}{<->cmr10}{}',
      '\\DeclareFontShape{OT1}{ptm}{m}{it}{<->cmti10}{}',
      '\\DeclareFontShape{OT1}{ptm}{m}{sl}{<->cmsl10}{}',
      '\\DeclareFontShape{OT1}{ptm}{b}{n}{<->cmbx10}{}',
      '\\DeclareFontShape{OT1}{ptm}{b}{it}{<->cmbxti10}{}',
      '\\DeclareFontShape{OT1}{ptm}{bx}{n}{<->cmbx10}{}',
      '\\makeatother',
    ].join('\n');
    mainResource.content = mainResource.content.replace(
      /\\begin\{document\}/,
      `${ptmAlias}\n\\begin{document}`
    );
  }

  // Build additional files array for texlyre-busytex
  const additionalFiles: Array<{ path: string; content: string }> = [];
  let hasBib = false;

  // Provide a fake ot1ptm.fd that aliases Times (ptm) to Computer Modern.
  // LaTeX loads .fd files lazily on first font use — our version is found first,
  // intercepting IEEEtran's Times request before the WASM bundle's version.
  if (/\\documentclass[^{]*\{IEEEtran\}/.test(mainResource.content)) {
    additionalFiles.push({
      path: 'ot1ptm.fd',
      content: [
        '\\ProvidesFile{ot1ptm.fd}',
        '\\DeclareFontFamily{OT1}{ptm}{}',
        '\\DeclareFontShape{OT1}{ptm}{m}{n}{<->cmr10}{}',
        '\\DeclareFontShape{OT1}{ptm}{m}{it}{<->cmti10}{}',
        '\\DeclareFontShape{OT1}{ptm}{m}{sl}{<->cmsl10}{}',
        '\\DeclareFontShape{OT1}{ptm}{b}{n}{<->cmbx10}{}',
        '\\DeclareFontShape{OT1}{ptm}{b}{it}{<->cmbxti10}{}',
        '\\DeclareFontShape{OT1}{ptm}{bx}{n}{<->cmbx10}{}',
        '\\DeclareFontShape{OT1}{ptm}{bx}{it}{<->cmbxti10}{}',
      ].join('\n'),
    });
  }
  const resourcePaths = new Set(resources.map(r => r.path));



  // Check if we need to auto-inject common missing class files
  if (mainResource.content.includes('{IEEEtran}')) {
    if (!resourcePaths.has('IEEEtran.cls')) {
      onProgress?.('Auto-injecting missing IEEEtran.cls...');
      try {
        const response = await fetch('/assets/latex/IEEEtran.cls');
        if (response.ok) {
          const content = await response.text();
          additionalFiles.push({ path: 'IEEEtran.cls', content });
        } else {
          console.warn('Failed to fetch IEEEtran.cls asset');
        }
      } catch (e) {
        console.warn('Error fetching IEEEtran.cls:', e);
      }
    }

  }

  // Check if we need to auto-inject common missing bib style files
  if (mainResource.content.includes('\\bibliographystyle{IEEEtran}')) {
    if (!resourcePaths.has('IEEEtran.bst')) {
      onProgress?.('Auto-injecting missing IEEEtran.bst...');
      try {
        const response = await fetch('/assets/latex/IEEEtran.bst');
        if (response.ok) {
          const content = await response.text();
          additionalFiles.push({ path: 'IEEEtran.bst', content });
        } else {
          console.warn('Failed to fetch IEEEtran.bst asset');
        }
      } catch (e) {
        console.warn('Error fetching IEEEtran.bst:', e);
      }
    }
  }

  for (const resource of resources) {
    if (!resource.path || resource.main) continue;

    if (resource.content) {
      additionalFiles.push({ path: resource.path, content: resource.content });
      if (resource.path.endsWith('.bib')) hasBib = true;
    }
    // Note: texlyre-busytex doesn't support binary file injection via additionalFiles,
    // so base64 images (resource.file) are skipped for local compilation.
    // This is a known limitation — images embedded as base64 won't render locally.
  }

  onProgress?.('Compiling with pdflatex (local WASM)...');

  try {
    const result = await busyTexPdfLatex.compile({
      input: mainResource.content,
      bibtex: hasBib,
      additionalFiles,
      verbose: 'silent' as const,
      dataPackagesJs: null,
    });

    if (!result.success) {
      // Extract meaningful error from compilation log
      const log = result.log || '';
      const errorMatch = log.match(/! (.+?)(?:\n|$)/);
      const lineMatch = log.match(/l\.(\d+)/);
      let errorMsg = errorMatch?.[1] || 'Local compilation failed';
      if (lineMatch) errorMsg += ` (line ${lineMatch[1]})`;
      throw new Error(errorMsg);
    }

    onProgress?.('Processing PDF output...');

    if (!result.pdf || result.pdf.length === 0) {
      throw new Error('No PDF output generated');
    }

    return new Blob([result.pdf], { type: 'application/pdf' });
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error('Local compilation failed: ' + String(e));
  }
};

export type CompilationMode = 'local' | 'api';

export interface CompileOptions {
  draftMode?: boolean;
  onProgress?: (message: string) => void;
  skipCache?: boolean;
  compilationMode?: CompilationMode;
}

export const compileProject = async (
  files: Record<string, FileSystemItem>,
  _activeFileId: string | null,
  options: CompileOptions = {}
): Promise<string> => {
  const { draftMode = false, onProgress, skipCache = false, compilationMode = 'api' } = options;
  const startTime = performance.now();

  onProgress?.(`Starting ${draftMode ? 'draft' : 'full'} compilation...`);

  // Find main tex file
  const mainTexFile = findMainTexFile(files);
  if (!mainTexFile) {
    throw new Error('No .tex file with \\documentclass found.');
  }

  // Build path lookup map
  const pathToFile = new Map<string, FileSystemItem>();
  for (const file of Object.values(files)) {
    if (file.type === 'file') {
      const path = resolvePath(file.id, files);
      pathToFile.set(path, file);
      // Also add without folder prefix for flexibility
      pathToFile.set(file.name, file);
    }
  }

  // Check cache (only for non-draft mode)
  if (!draftMode && !skipCache) {
    onProgress?.('Checking cache...');
    const contentHash = hashContent(
      Object.values(files)
        .filter(f => f.type === 'file')
        .map(f => f.content || '')
        .join('|')
    );

    const cached = compilationCache.get(contentHash);
    if (cached && Date.now() - cached.timestamp < CACHE_MAX_AGE) {
      onProgress?.('Using cached PDF');
      return cached.url;
    }
  }

  // Find referenced files (optimization: only send what's needed)
  onProgress?.('Analyzing dependencies...');
  const referencedFiles = buildReferencedFilesSet(mainTexFile.content, files, pathToFile);

  // Always include .cls files
  for (const file of Object.values(files)) {
    if (file.type === 'file' && file.name.endsWith('.cls')) {
      referencedFiles.add(resolvePath(file.id, files));
    }
  }

  // Build resources array
  onProgress?.('Preparing files...');
  const resources: Array<{ path?: string; main?: boolean; content?: string; file?: string }> = [];

  // Get the main file basename (without extension) for auxiliary files
  const mainBasename = mainTexFile.path.replace(/\.tex$/i, '');

  // Process main file - give it an explicit path so aux files match
  let mainContent = mainTexFile.content;
  if (draftMode) {
    mainContent = stripImages(mainContent);
  }
  resources.push({ main: true, path: mainTexFile.path, content: mainContent });

  // Track stats
  let imageCount = 0;
  let skippedCount = 0;

  // Process other files
  for (const file of Object.values(files)) {
    if (file.type !== 'file' || file.id === mainTexFile.id) continue;

    const path = resolvePath(file.id, files);
    if (!path) continue;

    const content = file.content || '';

    // Check if file is referenced (or is a .cls file)
    const isReferenced = referencedFiles.has(path) ||
      referencedFiles.has(file.name) ||
      file.name.endsWith('.cls') ||
      file.name.endsWith('.bib');

    // Skip unreferenced files (except in draft mode where we skip most anyway)
    if (!isReferenced && !draftMode) {
      skippedCount++;
      continue;
    }

    // Handle image files
    if (REGEX.imageFile.test(file.name)) {
      if (draftMode || content === '[Binary Data]') {
        skippedCount++;
        continue;
      }

      // Only include if referenced
      if (!isReferenced) {
        skippedCount++;
        continue;
      }

      // Handle base64 images - use 'file' property for binary content
      if (REGEX.binaryDataUrl.test(content)) {
        const base64Part = content.split(',')[1];
        if (base64Part) {
          resources.push({ path, file: base64Part });
          imageCount++;
        }
      }
      continue;
    }

    // Process tex files
    let processedContent = content;
    if (draftMode && REGEX.texFile.test(file.name)) {
      processedContent = stripImages(content);
    }

    resources.push({ path, content: processedContent });
  }

  // Generate TOC, LOF, LOT files to populate the table of contents in a single compilation pass
  onProgress?.('Generating document structure...');
  const tocContent = generateTocFile(mainTexFile.content, files, pathToFile);
  const lofContent = generateLofFile(mainTexFile.content, files, pathToFile);
  const lotContent = generateLotFile(mainTexFile.content, files, pathToFile);

  // Add the auxiliary files to resources - use the same basename as the main file
  if (tocContent) {
    resources.push({ path: `${mainBasename}.toc`, content: tocContent });
  }
  if (lofContent) {
    resources.push({ path: `${mainBasename}.lof`, content: lofContent });
  }
  if (lotContent) {
    resources.push({ path: `${mainBasename}.lot`, content: lotContent });
  }

  onProgress?.(`Compiling ${resources.length} files...`);

  const contentHash = hashContent(
    Object.values(files)
      .filter(f => f.type === 'file')
      .map(f => f.content || '')
      .join('|')
  );

  // Compile with pdflatex using selected mode
  try {
    let pdfBlob: Blob;

    // Choose compilation method based on mode
    if (compilationMode === 'local') {
      pdfBlob = await compileWithLocal(resources, onProgress);
    } else {
      const needsBiber = mainTexFile.content.includes('biblatex') || mainTexFile.content.includes('\\addbibresource');
      pdfBlob = await compileWithYtoTech(resources, onProgress, 'pdflatex', needsBiber);
    }

    const pdfUrl = URL.createObjectURL(pdfBlob);

    // Cache the result (only for full mode)
    if (!draftMode) {
      compilationCache.set(contentHash, { url: pdfUrl, timestamp: Date.now() });
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    onProgress?.(`Done in ${elapsed}s`);
    return pdfUrl;
  } catch (error) {
    onProgress?.('Compilation failed');
    throw error;
  }
};

import React, { useState } from 'react';
import { Sidebar } from './components/Layout/Sidebar';
import { TopBar } from './components/Layout/TopBar';
import { SettingsModal } from './components/Layout/SettingsModal';
import { CodeEditor } from './components/Editor/CodeEditor';
import { RichTextEditor } from './components/Editor/RichTextEditor';
import { PdfViewer } from './components/Preview/PdfViewer';
import { TemplatePickerModal } from './components/Templates/TemplatePickerModal';
import { CitationModal } from './components/Citations/CitationModal';
import { useProjectStore } from './store/projectStore';
import { useAuthStore } from './store/authStore';
import { AuthScreen } from './components/Auth/AuthScreen';
import { LandingPage } from './components/Landing/LandingPage';
import { Loader2 } from 'lucide-react';

const App = () => {
  const [showAuthScreen, setShowAuthScreen] = useState(false);
  const { sidebarVisible, previewVisible, theme, editorMode } = useProjectStore();
  const { user, profile, loading, error: authError } = useAuthStore();

  // Reset auth screen if user becomes available (e.g. auto-login)
  React.useEffect(() => {
    if (user && showAuthScreen) {
      setShowAuthScreen(false);
    }
  }, [user, showAuthScreen]);
  
  const renderEditor = () => (
    <div className={`${theme} flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden`}>
      <TopBar />
      <main className="flex-1 flex overflow-hidden">
        <div className={`shrink-0 transition-all duration-300 ease-in-out border-r border-border bg-panel ${sidebarVisible ? 'w-64 translate-x-0' : 'w-0 -translate-x-full opacity-0 overflow-hidden border-none'}`}>
          <Sidebar />
        </div>
        <div className="flex-1 flex min-w-0 bg-background">
          <div className={`flex-1 flex flex-col min-w-0 ${previewVisible ? 'border-r border-border' : ''}`}>
            {editorMode === 'rich' ? <RichTextEditor /> : <CodeEditor />}
          </div>
          {previewVisible && (
            <div className="w-[45%] min-w-[320px] shrink-0 flex items-stretch p-3 pl-2">
              <div className="flex-1 rounded-xl border border-border bg-background shadow-lg overflow-hidden flex flex-col min-h-0">
                <PdfViewer />
              </div>
            </div>
          )}
        </div>
      </main>
      <footer className="h-6 border-t border-border bg-panel text-muted-foreground text-[10px] px-3 flex items-center justify-between shrink-0">
        <div className="flex gap-3">
          <span>Ready</span>
          <span>Ln 12, Col 45</span>
          <span>UTF-8</span>
          <span>LaTeX</span>
        </div>
        <span>{theme === 'dark' ? 'Tokyo Night' : 'Tokyo Night Light'}</span>
      </footer>
      <SettingsModal />
      <TemplatePickerModal />
      <CitationModal />
    </div>
  );

  // 1. Instant Load: If we have both cached/synced user and profile, show the editor.
  // We do NOT wait for 'loading' to finish here.
  if (user && profile) {
    return renderEditor();
  }

  // 2. Initial Setup: If we are still loading and don't have user/profile yet, show loader.
  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-white text-slate-900">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-slate-500 animate-pulse">Thanks for doing your research here</p>
      </div>
    );
  }

  // 3. No User: Show landing first; "Login" / "Request Demo" show auth.
  if (!user) {
    if (showAuthScreen) {
      return <AuthScreen onBack={() => setShowAuthScreen(false)} />;
    }
    return (
      <LandingPage
        onLogin={() => setShowAuthScreen(true)}
        onRequestDemo={() => setShowAuthScreen(true)}
      />
    );
  }

  // 4. Missing Profile: If user exists but profile is missing (and no error yet), wait.
  if (!profile && !authError) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-white text-slate-900">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-slate-500">Loading your profile...</p>
      </div>
    );
  }

  // 5. Fatal Profile Error: If we have a user but sync failed definitively.
  if (!profile && authError) {
    return <AuthScreen />;
  }

  // Fallback (should be covered by renderEditor above but for TS safety)
  return renderEditor();
};

export default App;
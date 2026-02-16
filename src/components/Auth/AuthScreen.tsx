import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowUp, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

const TYPING_PLACEHOLDERS = [
  'Skip the noise. Research here.',
  'Stop searching. Research here.',
  'Forget the rest. Research here.',
  'Done wasting time? Research here.',
  'No more confusion. Research here.',
  'Lost in results? Research here.',
  'Tired of dead ends? Research here.',
  'Need real answers? Research here.',
  'Want better sources? Research here.',
  'Overwhelmed elsewhere? Research here.',
  'Find it faster. Research here.',
  'Get it right. Research here.',
  'Trust your sources. Research here.',
  'Discover better. Research here.',
  'Know for certain. Research here.',
  'Everywhere else fails. Research here.',
  'The search ends here. Research here.',
  'This is the place. Research here.',
  "You've arrived. Research here.",
  'Finally found it? Research here.',
  'Not there. Research here.',
  'Just research here.',
  'Simply research here.',
  'Always research here.',
  'Only research here.',
];

interface AuthScreenProps {
  onBack?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onBack }) => {
  const { error: globalError, clearError, signInWithGoogle } = useAuthStore();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [typingIndex, setTypingIndex] = useState(0);
  const [typingText, setTypingText] = useState('');
  const [typingDirection, setTypingDirection] = useState<'forward' | 'back'>('forward');

  // Typing effect for right panel search placeholder
  useEffect(() => {
    const full = TYPING_PLACEHOLDERS[typingIndex];
    const isPauseAtEnd = typingDirection === 'forward' && typingText.length >= full.length;
    const delay = isPauseAtEnd ? 1500 : typingDirection === 'forward' ? 80 : 40;

    const t = setTimeout(() => {
      if (typingDirection === 'forward') {
        if (typingText.length >= full.length) {
          setTypingDirection('back');
        } else {
          setTypingText(full.slice(0, typingText.length + 1));
        }
      } else {
        if (typingText.length <= 0) {
          setTypingDirection('forward');
          setTypingIndex((i) => (i + 1) % TYPING_PLACEHOLDERS.length);
        } else {
          setTypingText(typingText.slice(0, -1));
        }
      }
    }, delay);

    return () => clearTimeout(t);
  }, [typingIndex, typingText, typingDirection]);

  const handleActionStart = () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    handleActionStart();

    try {
      if (isSignUp) {
        localStorage.setItem('auth_mode', 'signup');
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setSuccess('Check your email for the confirmation link!');
      } else {
        localStorage.setItem('auth_mode', 'signin');
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          if (error.message === 'Invalid login credentials') {
            throw new Error('Invalid email or password. If you haven\'t signed up yet, please switch to "Sign Up".');
          }
          throw error;
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      handleActionStart();
      await signInWithGoogle(isSignUp);
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left: Form (40%) */}
      <div className="w-full md:w-[40%] md:min-w-[40%] md:max-w-[40%] flex flex-col justify-center px-8 py-12 sm:px-12 lg:px-16 max-w-[480px] md:max-w-none mx-auto">
        {onBack && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-4 left-4 gap-1.5 text-muted-foreground"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Button>
        )}

        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {isSignUp ? 'Create your account' : 'Welcome back'}
        </h1>

        <div className="mt-6 space-y-4">
          <Button
            variant="outline"
            className="w-full h-11 border-border bg-background hover:bg-muted/50"
            onClick={handleGoogleLogin}
            disabled={loading}
            type="button"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <svg className="mr-2 h-4 w-4" viewBox="0 0 488 512" aria-hidden="true">
                <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" />
              </svg>
            )}
            Continue with Google
          </Button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-xs text-muted-foreground">OR</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 border-border"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 border-border"
                required
              />
            </div>

            <p className="text-xs text-muted-foreground">
              By continuing, you agree to the{' '}
              <a href="#" className="underline hover:text-foreground">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="underline hover:text-foreground">Privacy Policy</a>.
            </p>

            {(error || globalError) && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error || globalError}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="bg-primary/10 text-primary border-primary/20">
                <AlertTitle>Success</AlertTitle>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <Button className="w-full h-11 bg-foreground text-background hover:bg-foreground/90" type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue
            </Button>
          </form>

          <p className="text-sm text-muted-foreground text-center pt-2">
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="font-medium text-foreground underline hover:no-underline"
            >
              {isSignUp ? 'Log in' : 'Sign up'}
            </button>
          </p>
        </div>

        <p className="mt-10 flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          SSO available on Business and Enterprise plans.
        </p>
      </div>

      {/* Right: Gradient + search / typing (60%) */}
      <div className="hidden md:flex md:flex-[0_0_60%] items-center justify-center p-12 bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5">
        <div className="w-full max-w-lg">
          <div className="rounded-xl border border-border bg-background/95 shadow-lg p-3 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={typingText}
              className="flex-1 bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Ask Researchere…"
              aria-hidden
            />
            <span className="inline-block w-0.5 h-4 bg-primary animate-pulse" aria-hidden />
            <Button
              type="button"
              size="icon"
              className="h-9 w-9 rounded-full bg-foreground text-background hover:bg-foreground/90 shrink-0"
              aria-label="Search"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Write your research. We handle the LaTeX.
          </p>
        </div>
      </div>
    </div>
  );
};

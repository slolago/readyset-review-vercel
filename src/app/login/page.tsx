'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Image from 'next/image';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch {
      toast.error('Failed to sign in. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-frame-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-frame-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-frame-bg flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col items-center justify-center p-12 overflow-hidden">
        {/* Gradient background blobs */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(122,0,223,0.25)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(6,147,227,0.15)_0%,transparent_60%)]" />
        <div className="absolute inset-0 border-r border-frame-border" />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 text-center">
          <Image
            src="/logo-horizontal.png"
            alt="Ready Set"
            width={200}
            height={56}
            className="object-contain mx-auto mb-12"
            priority
          />
          <h2 className="text-3xl font-bold text-white mb-4 leading-tight">
            Review. Collaborate.<br />
            <span className="gradient-text">Ship faster.</span>
          </h2>
          <p className="text-frame-textSecondary text-base max-w-xs mx-auto">
            Professional media review platform built for creative teams.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 justify-center mt-10">
            {['Video review', 'Annotations', 'Version control', 'Team collaboration'].map((f) => (
              <span
                key={f}
                className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-frame-textSecondary"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-10">
            <Image
              src="/logo-horizontal.png"
              alt="Ready Set"
              width={160}
              height={44}
              className="object-contain"
              priority
            />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
            <p className="text-frame-textSecondary text-sm mt-2">
              Sign in to access your projects and review media with your team.
            </p>
          </div>

          {/* Card */}
          <div className="bg-frame-card border border-frame-border rounded-2xl p-6 shadow-xl">
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-4 rounded-xl transition-all duration-150 shadow-sm hover:shadow-md text-sm"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-frame-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-frame-card px-3 text-xs text-frame-textMuted">
                  Secure authentication
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 text-xs text-frame-textMuted">
              <div className="w-4 h-4 rounded-full bg-frame-green/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-2.5 h-2.5 text-frame-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Your data is protected with enterprise-grade security</span>
            </div>
          </div>

          <p className="text-center text-frame-textMuted text-xs mt-6">
            By continuing, you agree to our{' '}
            <span className="text-frame-textSecondary hover:text-white cursor-pointer transition-colors">Terms of Service</span>
            {' '}and{' '}
            <span className="text-frame-textSecondary hover:text-white cursor-pointer transition-colors">Privacy Policy</span>.
          </p>

          <p className="text-center text-frame-textMuted text-xs mt-3">
            &copy; {new Date().getFullYear()} Ready Set. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

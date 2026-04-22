import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-inter',
});
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'Ready Set — Media Review Platform',
  description: 'Professional video and image review platform for creative teams',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-frame-bg text-frame-textPrimary min-h-screen`}>
        <AuthProvider>
          <ConfirmProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#13131f',
                color: '#ffffff',
                border: '1px solid #22223a',
                borderRadius: '10px',
                fontSize: '13px',
                padding: '10px 14px',
              },
              success: {
                iconTheme: {
                  primary: '#00d084',
                  secondary: '#13131f',
                },
              },
              error: {
                iconTheme: {
                  primary: '#f05252',
                  secondary: '#13131f',
                },
              },
            }}
          />
          </ConfirmProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

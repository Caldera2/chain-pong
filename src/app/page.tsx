'use client';

import dynamic from 'next/dynamic';

const GameApp = dynamic(() => import('@/components/GameApp'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen gradient-bg flex items-center justify-center">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-neon-blue to-neon-purple animate-pulse" />
    </div>
  ),
});

export default function Home() {
  return <GameApp />;
}

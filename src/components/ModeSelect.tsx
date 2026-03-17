'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';

export default function ModeSelect() {
  const { setScreen, setGameMode, difficulty, setDifficulty, boards, selectedBoard, setSelectedBoard } = useGameStore();

  const ownedBoards = boards.filter((b) => b.owned);
  const currentBoard = boards.find((b) => b.id === selectedBoard)!;

  const startGame = (mode: 'pvp' | 'computer') => {
    setGameMode(mode);
    if (mode === 'pvp') {
      setScreen('matchmaking');
    } else {
      setScreen('game');
    }
  };

  return (
    <div className="min-h-screen gradient-bg pt-20 pb-24 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold text-white mb-2 text-center">Choose Your Mode</h1>
          <p className="text-gray-400 text-center mb-10">Select how you want to play</p>
        </motion.div>

        {/* Game Mode Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          <motion.div
            onClick={() => startGame('computer')}
            className="group relative overflow-hidden rounded-3xl p-8 text-left cursor-pointer"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            role="button"
            tabIndex={0}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-neon-green/20 to-emerald-900/20" />
            <div className="absolute inset-[1px] rounded-3xl border border-neon-green/20 group-hover:border-neon-green/50 transition-colors" />
            <div className="relative">
              <div className="text-6xl mb-4">🤖</div>
              <h2 className="text-2xl font-bold text-white mb-2">vs Computer</h2>
              <p className="text-gray-400 mb-4">Practice your skills against AI opponents</p>
              <div className="flex items-center gap-2 text-neon-green font-medium">
                <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                Instant Match
              </div>

              {/* Difficulty selector */}
              <div className="mt-6 flex gap-2" onClick={(e) => e.stopPropagation()}>
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <span
                    key={d}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setDifficulty(d); }}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
                      difficulty === d
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50'
                        : 'bg-white/5 text-gray-400 border border-transparent hover:border-white/20'
                    }`}
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div
            onClick={() => startGame('pvp')}
            className="group relative overflow-hidden rounded-3xl p-8 text-left cursor-pointer"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            role="button"
            tabIndex={0}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-neon-pink/20 to-rose-900/20" />
            <div className="absolute inset-[1px] rounded-3xl border border-neon-pink/20 group-hover:border-neon-pink/50 transition-colors" />
            <div className="relative">
              <div className="text-6xl mb-4">⚔️</div>
              <h2 className="text-2xl font-bold text-white mb-2">PvP Match</h2>
              <p className="text-gray-400 mb-4">Challenge real players and earn ETH</p>
              <div className="flex items-center gap-2 text-neon-pink font-medium">
                <span className="w-2 h-2 rounded-full bg-neon-pink animate-pulse" />
                2,847 Online
              </div>
              <div className="mt-6 text-sm text-gray-500">Stake: 0.002 ETH per match</div>
            </div>
          </motion.div>
        </div>

        {/* Board Selector */}
        <motion.div
          className="glass rounded-2xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h3 className="text-lg font-bold text-white mb-4">Select Board</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {ownedBoards.map((board) => (
              <button
                key={board.id}
                onClick={() => setSelectedBoard(board.id)}
                className={`flex-shrink-0 w-28 p-3 rounded-xl text-center transition-all ${
                  selectedBoard === board.id
                    ? 'ring-2 ring-offset-2 ring-offset-[#0a0a0f] bg-white/10'
                    : 'bg-white/5 hover:bg-white/10'
                }`}
                style={{ borderColor: selectedBoard === board.id ? board.color : 'transparent' }}
              >
                <div className="text-3xl mb-1">{board.perkIcon}</div>
                <div className="text-sm font-medium text-white">{board.name}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{board.perk}</div>
              </button>
            ))}
          </div>
          {currentBoard.perk !== 'None' && (
            <div className="mt-4 flex items-center gap-2 text-sm">
              <span style={{ color: currentBoard.color }} className="font-medium">
                Active Perk: {currentBoard.perk}
              </span>
              <span className="text-gray-500">— {currentBoard.perkDescription}</span>
            </div>
          )}
        </motion.div>

        <motion.button
          onClick={() => setScreen('lobby')}
          className="mt-6 text-gray-500 hover:text-white transition-colors mx-auto block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          ← Back to Lobby
        </motion.button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';

const CANVAS_W = 800;
const CANVAS_H = 500;
const PADDLE_W = 12;
const PADDLE_H = 90;
const BALL_R = 8;
const WIN_SCORE = 7;

export default function PongGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { gameMode, difficulty, setScreen, addWin, addLoss, boards, selectedBoard, usedPerks, markPerkUsed } = useGameStore();
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [perkActive, setPerkActive] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [started, setStarted] = useState(false);

  const board = boards.find((b) => b.id === selectedBoard)!;
  const perkUsed = usedPerks[selectedBoard] || false;

  // Countdown
  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    } else {
      setStarted(true);
    }
  }, [countdown]);

  const activatePerk = useCallback(() => {
    if (perkUsed || board.perk === 'None') return;
    markPerkUsed(selectedBoard);
    setPerkActive(true);
    setTimeout(() => setPerkActive(false), 3000);
  }, [perkUsed, board.perk, markPerkUsed, selectedBoard]);

  // Game loop
  useEffect(() => {
    if (!started || gameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    let playerY = CANVAS_H / 2 - PADDLE_H / 2;
    let opponentY = CANVAS_H / 2 - PADDLE_H / 2;
    let ballX = CANVAS_W / 2;
    let ballY = CANVAS_H / 2;
    let ballVX = 5 * (Math.random() > 0.5 ? 1 : -1);
    let ballVY = 3 * (Math.random() > 0.5 ? 1 : -1);
    let mouseY = CANVAS_H / 2;
    let pScore = 0;
    let oScore = 0;
    let particles: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];
    let trail: { x: number; y: number; age: number }[] = [];

    const aiSpeed = difficulty === 'easy' ? 2.5 : difficulty === 'medium' ? 4 : 6;
    const aiReaction = difficulty === 'easy' ? 0.4 : difficulty === 'medium' ? 0.7 : 0.95;

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseY = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
    };

    const handleTouch = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      mouseY = ((e.touches[0].clientY - rect.top) / rect.height) * CANVAS_H;
    };

    canvas.addEventListener('mousemove', handleMouse);
    canvas.addEventListener('touchmove', handleTouch, { passive: false });

    const addParticles = (x: number, y: number, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.5) * 8,
          life: 1,
          color,
        });
      }
    };

    const resetBall = () => {
      ballX = CANVAS_W / 2;
      ballY = CANVAS_H / 2;
      ballVX = 5 * (Math.random() > 0.5 ? 1 : -1);
      ballVY = 3 * (Math.random() > 0.5 ? 1 : -1);
    };

    let animId: number;
    const loop = () => {
      // Clear
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Draw center line
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CANVAS_W / 2, 0);
      ctx.lineTo(CANVAS_W / 2, CANVAS_H);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw center circle
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(CANVAS_W / 2, CANVAS_H / 2, 60, 0, Math.PI * 2);
      ctx.stroke();

      // Player paddle follows mouse
      const targetY = mouseY - PADDLE_H / 2;
      playerY += (targetY - playerY) * 0.15;
      playerY = Math.max(0, Math.min(CANVAS_H - PADDLE_H, playerY));

      // AI paddle
      const aiTarget = ballY - PADDLE_H / 2 + (Math.random() - 0.5) * (1 - aiReaction) * 60;
      const aiDiff = aiTarget - opponentY;
      if (Math.abs(aiDiff) > 2) {
        opponentY += Math.sign(aiDiff) * Math.min(Math.abs(aiDiff), aiSpeed);
      }
      opponentY = Math.max(0, Math.min(CANVAS_H - PADDLE_H, opponentY));

      // Ball movement
      let speedMult = 1;
      if (perkActive && board.perk === 'Fireball') speedMult = 1.3;
      if (perkActive && board.perk === 'Slow-Mo') speedMult = 0.5;

      ballX += ballVX * speedMult;
      ballY += ballVY * speedMult;

      // Perk: Gravity Well curves ball
      if (perkActive && board.perk === 'Gravity Well') {
        ballVX += 0.1;
      }

      // Wall bounce
      if (ballY - BALL_R <= 0 || ballY + BALL_R >= CANVAS_H) {
        ballVY *= -1;
        addParticles(ballX, ballY, 'rgba(255,255,255,0.5)', 5);
      }

      // Paddle collision - Player (left)
      if (
        ballX - BALL_R <= PADDLE_W + 20 &&
        ballY >= playerY &&
        ballY <= playerY + PADDLE_H &&
        ballVX < 0
      ) {
        ballVX = Math.abs(ballVX) * 1.05;
        const hitPos = (ballY - playerY) / PADDLE_H - 0.5;
        ballVY = hitPos * 8;
        addParticles(ballX, ballY, board.color, 10);

        // Perk: Lightning makes paddle wider (visual done below)
      }

      // Paddle collision - Opponent (right)
      if (
        ballX + BALL_R >= CANVAS_W - PADDLE_W - 20 &&
        ballY >= opponentY &&
        ballY <= opponentY + PADDLE_H &&
        ballVX > 0
      ) {
        ballVX = -Math.abs(ballVX) * 1.05;
        const hitPos = (ballY - opponentY) / PADDLE_H - 0.5;
        ballVY = hitPos * 8;
        addParticles(ballX, ballY, '#ff4444', 10);
      }

      // Score
      if (ballX < 0) {
        oScore++;
        setOpponentScore(oScore);
        addParticles(0, ballY, '#ff4444', 20);
        resetBall();
      }
      if (ballX > CANVAS_W) {
        pScore++;
        setPlayerScore(pScore);
        addParticles(CANVAS_W, ballY, board.color, 20);
        resetBall();
      }

      // Check win
      if (pScore >= WIN_SCORE || oScore >= WIN_SCORE) {
        if (pScore >= WIN_SCORE) addWin(0.002);
        else addLoss();
        setGameOver(true);
        return;
      }

      // Trail
      trail.push({ x: ballX, y: ballY, age: 0 });
      trail = trail.filter((t) => t.age < 10);

      // Draw trail
      trail.forEach((t) => {
        t.age++;
        const alpha = 1 - t.age / 10;
        ctx.fillStyle = `rgba(0, 212, 255, ${alpha * 0.3})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, BALL_R * (1 - t.age / 10), 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw paddles
      const playerPaddleH = perkActive && board.perk === 'Lightning' ? PADDLE_H * 1.4 : PADDLE_H;

      // Player paddle
      const pgrd = ctx.createLinearGradient(10, playerY, 10, playerY + playerPaddleH);
      pgrd.addColorStop(0, board.color);
      pgrd.addColorStop(1, board.color + '88');
      ctx.fillStyle = pgrd;
      ctx.shadowColor = board.color;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.roundRect(10, playerY, PADDLE_W, playerPaddleH, 6);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Opponent paddle
      const ogrd = ctx.createLinearGradient(CANVAS_W - 22, opponentY, CANVAS_W - 22, opponentY + PADDLE_H);
      ogrd.addColorStop(0, '#ff4466');
      ogrd.addColorStop(1, '#ff446688');
      ctx.fillStyle = ogrd;
      ctx.shadowColor = '#ff4466';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.roundRect(CANVAS_W - 22, opponentY, PADDLE_W, PADDLE_H, 6);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw ball
      const ballAlpha = perkActive && board.perk === 'Invisibility' ? 0.15 : 1;
      ctx.globalAlpha = ballAlpha;
      const bgrd = ctx.createRadialGradient(ballX, ballY, 0, ballX, ballY, BALL_R);
      bgrd.addColorStop(0, '#ffffff');
      bgrd.addColorStop(1, board.color);
      ctx.fillStyle = bgrd;
      ctx.shadowColor = board.color;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      // Particles
      particles = particles.filter((p) => p.life > 0);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.03;
        p.vx *= 0.98;
        p.vy *= 0.98;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Score display
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.font = 'bold 64px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(pScore), CANVAS_W / 2 - 60, 70);
      ctx.fillText(String(oScore), CANVAS_W / 2 + 60, 70);

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousemove', handleMouse);
      canvas.removeEventListener('touchmove', handleTouch);
    };
  }, [started, gameOver, difficulty, board, perkActive, addWin, addLoss]);

  // Key handler for perk
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !perkUsed && board.perk !== 'None' && started) {
        activatePerk();
      }
      if (e.code === 'Escape') {
        setScreen('lobby');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [perkUsed, board.perk, started, activatePerk, setScreen]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4">
      {/* Countdown */}
      {!started && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center z-20 bg-black/60"
          exit={{ opacity: 0 }}
        >
          <motion.span
            key={countdown}
            className="text-8xl font-bold neon-text text-neon-blue"
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
          >
            {countdown === 0 ? 'GO!' : countdown}
          </motion.span>
        </motion.div>
      )}

      {/* HUD */}
      <div className="w-full max-w-[800px] flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold" style={{ color: board.color }}>{playerScore}</span>
          <span className="text-gray-600 text-sm">YOU</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {gameMode === 'pvp' ? 'PvP Match' : `vs AI (${difficulty})`}
          </span>
          <span className="text-sm text-gray-600">First to {WIN_SCORE}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-600 text-sm">{gameMode === 'pvp' ? 'OPPONENT' : 'CPU'}</span>
          <span className="text-3xl font-bold text-neon-pink">{opponentScore}</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative rounded-2xl overflow-hidden border border-white/10" style={{ boxShadow: `0 0 30px ${board.color}22` }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block max-w-full cursor-none"
          style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
        />
      </div>

      {/* Perk Button */}
      {board.perk !== 'None' && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={activatePerk}
            disabled={perkUsed}
            className={`px-6 py-2 rounded-xl font-semibold text-sm transition-all ${
              perkUsed
                ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                : 'btn-primary text-white hover:scale-105'
            }`}
          >
            {perkActive ? '⚡ ACTIVE' : perkUsed ? '✓ Used' : `${board.perkIcon} ${board.perk} [SPACE]`}
          </button>
          {!perkUsed && (
            <span className="text-gray-500 text-sm">Press SPACE to activate</span>
          )}
        </div>
      )}

      {/* Game Over Overlay */}
      {gameOver && (
        <motion.div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="glass rounded-3xl p-10 text-center max-w-md"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring' }}
          >
            <div className="text-6xl mb-4">
              {playerScore >= WIN_SCORE ? '🏆' : '😢'}
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">
              {playerScore >= WIN_SCORE ? 'Victory!' : 'Defeat'}
            </h2>
            <p className="text-gray-400 mb-2">
              {playerScore} - {opponentScore}
            </p>
            {playerScore >= WIN_SCORE && (
              <div className="text-neon-green font-semibold mb-6">+0.002 ETH earned!</div>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  setPlayerScore(0);
                  setOpponentScore(0);
                  setGameOver(false);
                  setPerkActive(false);
                  setCountdown(3);
                  setStarted(false);
                }}
                className="btn-primary px-6 py-3 rounded-xl font-semibold text-white"
              >
                Play Again
              </button>
              <button
                onClick={() => setScreen('lobby')}
                className="btn-secondary px-6 py-3 rounded-xl font-semibold text-white"
              >
                Lobby
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Controls hint */}
      <div className="mt-4 text-gray-600 text-sm text-center">
        Move mouse/touch to control paddle • ESC to exit
      </div>
    </div>
  );
}

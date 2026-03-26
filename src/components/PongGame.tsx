'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import { TOKEN_SYMBOL } from '@/lib/wagmi';

const CANVAS_W = 800;
const CANVAS_H = 500;
const PADDLE_W = 14;
const PADDLE_H = 100; // slightly taller paddle for better control
const BALL_R = 10;
const WIN_SCORE = 5;

const COLORS = {
  bg: '#08090e',
  court: '#0d0f16',
  courtLine: 'rgba(212,160,23,0.12)',
  courtCircle: 'rgba(212,160,23,0.06)',
  playerPaddle1: '#10b981',
  playerPaddle2: '#059669',
  playerGlow: '#34d399',
  opponentPaddle1: '#f43f5e',
  opponentPaddle2: '#be123c',
  opponentGlow: '#fb7185',
  ballOuter: '#d4a017',
  ballInner: '#f5d060',
  ballHighlight: '#fff8e7',
  ballSeam: 'rgba(166,124,0,0.5)',
  trailColor: [245, 208, 96],
  scoreText: 'rgba(255,255,255,0.08)',
  wallSpark: 'rgba(245,208,96,0.6)',
  aiPerkFlash: 'rgba(244,63,94,0.3)',
};

// AI perk names for display
const AI_PERKS = ['Speed Surge', 'Expand Paddle', 'Precision Mode', 'Counter Spin', 'Quick Reflex'];

export default function PongGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef({
    perkActive: false,
    aiPerkActive: false,
    aiPerkName: '',
    gameOver: false,
    playerScore: 0,
    opponentScore: 0,
    maxRally: 0,
    totalRallies: 0,
    matchStartTime: 0,
    lastScoreUpdate: 0, // throttle score UI updates
  });

  // Use individual selectors to avoid re-renders from unrelated store changes (e.g. balance polling)
  const difficulty = useGameStore((s) => s.difficulty);
  const setScreen = useGameStore((s) => s.setScreen);
  const addWin = useGameStore((s) => s.addWin);
  const addLoss = useGameStore((s) => s.addLoss);
  const boards = useGameStore((s) => s.boards);
  const selectedBoard = useGameStore((s) => s.selectedBoard);
  const pvpStakeAmount = useGameStore((s) => s.pvpStakeAmount);
  // Stable refs for store functions to avoid effect re-runs
  const addWinRef = useRef(addWin);
  addWinRef.current = addWin;
  const addLossRef = useRef(addLoss);
  addLossRef.current = addLoss;

  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [perkActive, setPerkActive] = useState(false);
  const [aiPerkDisplay, setAiPerkDisplay] = useState('');
  const [countdown, setCountdown] = useState(3);
  const [started, setStarted] = useState(false);

  const board = boards.find((b) => b.id === selectedBoard)!;
  // Perks are permanent once bought — always available per game
  const perkAvailable = board.perk !== 'None' && board.owned;
  const [perkUsedThisGame, setPerkUsedThisGame] = useState(false);
  const [matchStats, setMatchStats] = useState({ maxRally: 0, totalRallies: 0, matchTime: 0 });
  const [displayedEarnings, setDisplayedEarnings] = useState(0);
  const isPvP = true; // Always PvP mode

  const winPrize = isPvP ? pvpStakeAmount * 2 : 0.002;
  const losePenalty = isPvP ? pvpStakeAmount : 0;

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
    if (perkUsedThisGame || !perkAvailable) return;
    setPerkUsedThisGame(true);
    setPerkActive(true);
    gameStateRef.current.perkActive = true;
    setTimeout(() => {
      setPerkActive(false);
      gameStateRef.current.perkActive = false;
    }, 3000);
  }, [perkUsedThisGame, perkAvailable]);

  // Game loop — stable dependencies, uses refs for mutable state
  useEffect(() => {
    if (!started || gameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let running = true; // flag to stop loop on cleanup

    // Polyfill roundRect for older browsers
    if (!ctx.roundRect) {
      (ctx as any).roundRect = function (x: number, y: number, w: number, h: number, r: number) {
        const radius = Math.min(r, w / 2, h / 2);
        this.moveTo(x + radius, y);
        this.lineTo(x + w - radius, y);
        this.arcTo(x + w, y, x + w, y + radius, radius);
        this.lineTo(x + w, y + h - radius);
        this.arcTo(x + w, y + h, x + w - radius, y + h, radius);
        this.lineTo(x + radius, y + h);
        this.arcTo(x, y + h, x, y + h - radius, radius);
        this.lineTo(x, y + radius);
        this.arcTo(x, y, x + radius, y, radius);
        this.closePath();
      };
    }

    let playerY = CANVAS_H / 2 - PADDLE_H / 2;
    let opponentY = CANVAS_H / 2 - PADDLE_H / 2;
    let ballX = CANVAS_W / 2;
    let ballY = CANVAS_H / 2;
    let ballVX = 5 * (Math.random() > 0.5 ? 1 : -1);
    let ballVY = 3 * (Math.random() > 0.5 ? 1 : -1);
    let mouseY = CANVAS_H / 2;
    let pScore = 0;
    let oScore = 0;
    let frameCount = 0;
    let rallyCount = 0; // Track hits for AI perk activation
    let maxRally = 0; // Best rally in this match
    let totalRallies = 0; // Total paddle hits
    gameStateRef.current.matchStartTime = Date.now();
    let particles: { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[] = [];
    let trail: { x: number; y: number; age: number }[] = [];

    // AI difficulty settings
    const aiSpeed = difficulty === 'easy' ? 1.8 : difficulty === 'medium' ? 2.5 : 4;
    const aiReaction = difficulty === 'easy' ? 0.2 : difficulty === 'medium' ? 0.4 : 0.7;
    // AI makes mistakes — occasionally freezes for a few frames
    let aiMistakeTimer = 0;
    const aiMistakeChance = difficulty === 'easy' ? 0.008 : difficulty === 'medium' ? 0.005 : 0.002;
    const aiMistakeDuration = difficulty === 'easy' ? 25 : difficulty === 'medium' ? 18 : 10;
    // AI perk frequency
    const aiPerkChance = difficulty === 'easy' ? 0.001 : difficulty === 'medium' ? 0.002 : 0.005;
    let aiPerkTimer = 0;
    let aiPerkType = ''; // current AI perk
    let aiPaddleBonus = 0; // extra paddle height
    let aiSpeedBonus = 0; // extra speed

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
          vx: (Math.random() - 0.5) * 10,
          vy: (Math.random() - 0.5) * 10,
          life: 1,
          color,
          size: 1.5 + Math.random() * 2,
        });
      }
    };

    const resetBall = () => {
      ballX = CANVAS_W / 2;
      ballY = CANVAS_H / 2;
      ballVX = 5 * (Math.random() > 0.5 ? 1 : -1);
      ballVY = 3 * (Math.random() > 0.5 ? 1 : -1);
      rallyCount = 0;
    };

    // Draw rounded rect paddle with glow
    const drawPaddle = (x: number, y: number, w: number, h: number, c1: string, c2: string, glowColor: string) => {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 18;
      const grd = ctx.createLinearGradient(x, y, x + w, y + h);
      grd.addColorStop(0, c1);
      grd.addColorStop(0.5, c2);
      grd.addColorStop(1, c1);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, w / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      const hlGrd = ctx.createLinearGradient(x, y, x + w, y);
      hlGrd.addColorStop(0, 'rgba(255,255,255,0.15)');
      hlGrd.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      hlGrd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hlGrd;
      ctx.beginPath();
      ctx.roundRect(x, y + 2, w * 0.6, h - 4, w / 3);
      ctx.fill();
    };

    // Draw realistic ping pong ball
    const drawBall = (x: number, y: number, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.shadowColor = COLORS.ballOuter;
      ctx.shadowBlur = 25;
      const ballGrd = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, BALL_R);
      ballGrd.addColorStop(0, COLORS.ballHighlight);
      ballGrd.addColorStop(0.3, COLORS.ballInner);
      ballGrd.addColorStop(0.7, COLORS.ballOuter);
      ballGrd.addColorStop(1, '#a67c00');
      ctx.fillStyle = ballGrd;
      ctx.beginPath();
      ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = COLORS.ballSeam;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      const seamAngle = (frameCount * 0.03) % (Math.PI * 2);
      ctx.ellipse(x, y, BALL_R * 0.85, BALL_R * 0.4, seamAngle, 0, Math.PI * 2);
      ctx.stroke();
      const hlGrd = ctx.createRadialGradient(x - 3, y - 4, 0, x - 3, y - 4, BALL_R * 0.5);
      hlGrd.addColorStop(0, 'rgba(255,255,255,0.5)');
      hlGrd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hlGrd;
      ctx.beginPath();
      ctx.arc(x - 3, y - 4, BALL_R * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    let animId: number;
    const loop = () => {
      if (!running) return;
      frameCount++;

      // ─── AI Perk System (infinite perks, scales with difficulty) ───
      if (aiPerkTimer <= 0 && rallyCount > 3) {
        if (Math.random() < aiPerkChance) {
          const perkIdx = Math.floor(Math.random() * AI_PERKS.length);
          aiPerkType = AI_PERKS[perkIdx];
          aiPerkTimer = difficulty === 'easy' ? 60 : difficulty === 'medium' ? 75 : 100; // frames

          // Apply AI perk
          if (aiPerkType === 'Expand Paddle') aiPaddleBonus = 20;
          if (aiPerkType === 'Speed Surge') aiSpeedBonus = 1.2;
          if (aiPerkType === 'Quick Reflex') aiSpeedBonus = 0.8;

          gameStateRef.current.aiPerkActive = true;
          gameStateRef.current.aiPerkName = aiPerkType;
          // Defer UI update to avoid re-render stutter
          const perkName = aiPerkType;
          requestAnimationFrame(() => setAiPerkDisplay(perkName));
        }
      }

      if (aiPerkTimer > 0) {
        aiPerkTimer--;
        if (aiPerkTimer <= 0) {
          aiPerkType = '';
          aiPaddleBonus = 0;
          aiSpeedBonus = 0;
          gameStateRef.current.aiPerkActive = false;
          gameStateRef.current.aiPerkName = '';
          requestAnimationFrame(() => setAiPerkDisplay(''));
        }
      }

      // Background
      ctx.fillStyle = COLORS.court;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Subtle grid
      ctx.strokeStyle = 'rgba(255,255,255,0.015)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < CANVAS_W; gx += 40) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, CANVAS_H); ctx.stroke();
      }
      for (let gy = 0; gy < CANVAS_H; gy += 40) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CANVAS_W, gy); ctx.stroke();
      }

      // Center line
      ctx.setLineDash([6, 10]);
      ctx.strokeStyle = COLORS.courtLine;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(CANVAS_W / 2, 0); ctx.lineTo(CANVAS_W / 2, CANVAS_H); ctx.stroke();
      ctx.setLineDash([]);

      // Center circle + dot
      ctx.strokeStyle = COLORS.courtCircle;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(CANVAS_W / 2, CANVAS_H / 2, 55, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(212,160,23,0.1)';
      ctx.beginPath(); ctx.arc(CANVAS_W / 2, CANVAS_H / 2, 4, 0, Math.PI * 2); ctx.fill();

      // Borders
      const borderGrd = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
      borderGrd.addColorStop(0, 'rgba(212,160,23,0)');
      borderGrd.addColorStop(0.3, 'rgba(212,160,23,0.15)');
      borderGrd.addColorStop(0.5, 'rgba(245,208,96,0.25)');
      borderGrd.addColorStop(0.7, 'rgba(212,160,23,0.15)');
      borderGrd.addColorStop(1, 'rgba(212,160,23,0)');
      ctx.fillStyle = borderGrd;
      ctx.fillRect(0, 0, CANVAS_W, 2);
      ctx.fillRect(0, CANVAS_H - 2, CANVAS_W, 2);

      // AI perk flash on opponent side
      if (aiPerkTimer > 0) {
        ctx.fillStyle = COLORS.aiPerkFlash;
        ctx.globalAlpha = 0.03 + 0.02 * Math.sin(frameCount * 0.1);
        ctx.fillRect(CANVAS_W / 2, 0, CANVAS_W / 2, CANVAS_H);
        ctx.globalAlpha = 1;
      }

      // Player paddle follows mouse (responsive — higher = snappier)
      const targetY = mouseY - PADDLE_H / 2;
      playerY += (targetY - playerY) * 0.35;
      playerY = Math.max(0, Math.min(CANVAS_H - PADDLE_H, playerY));

      // AI paddle with perks + mistake system
      // AI occasionally "freezes" to create scoring opportunities
      if (aiMistakeTimer > 0) {
        aiMistakeTimer--;
      } else if (Math.random() < aiMistakeChance) {
        aiMistakeTimer = aiMistakeDuration;
      }

      const effectiveAiSpeed = aiMistakeTimer > 0 ? 0 : aiSpeed + aiSpeedBonus;
      let aiTargetOffset = (Math.random() - 0.5) * (1 - aiReaction) * 80;
      if (aiPerkType === 'Precision Mode') aiTargetOffset = 0;
      if (aiPerkType === 'Counter Spin') aiTargetOffset = -aiTargetOffset;

      // AI only reacts when ball is moving toward it
      const aiReacting = ballVX > 0;
      const aiTarget = aiReacting
        ? ballY - PADDLE_H / 2 + aiTargetOffset
        : CANVAS_H / 2 - PADDLE_H / 2; // drift to center when ball goes away

      const aiDiff = aiTarget - opponentY;
      if (Math.abs(aiDiff) > 2) {
        opponentY += Math.sign(aiDiff) * Math.min(Math.abs(aiDiff), effectiveAiSpeed);
      }
      opponentY = Math.max(0, Math.min(CANVAS_H - PADDLE_H, opponentY));

      // Ball movement — use ref for perk state to avoid dependency issues
      const gs = gameStateRef.current;
      let speedMult = 1;
      if (gs.perkActive && board.perk === 'Fireball') speedMult = 1.3;
      if (gs.perkActive && board.perk === 'Slow-Mo') speedMult = 0.5;

      // Cap ball speed so it never becomes unplayable
      const maxSpeed = 12;
      if (Math.abs(ballVX) > maxSpeed) ballVX = Math.sign(ballVX) * maxSpeed;
      if (Math.abs(ballVY) > maxSpeed) ballVY = Math.sign(ballVY) * maxSpeed;

      ballX += ballVX * speedMult;
      ballY += ballVY * speedMult;

      if (gs.perkActive && board.perk === 'Gravity Well') {
        ballVX += 0.1;
      }

      // Wall bounce
      if (ballY - BALL_R <= 0 || ballY + BALL_R >= CANVAS_H) {
        ballVY *= -1;
        addParticles(ballX, ballY, COLORS.wallSpark, 8);
      }

      // Player paddle collision
      const playerPaddleH = gs.perkActive && board.perk === 'Lightning' ? PADDLE_H * 1.4 : PADDLE_H;
      if (
        ballX - BALL_R <= PADDLE_W + 20 &&
        ballY >= playerY &&
        ballY <= playerY + playerPaddleH &&
        ballVX < 0
      ) {
        ballVX = Math.abs(ballVX) * 1.05; // faster acceleration = shorter rallies
        const hitPos = (ballY - playerY) / playerPaddleH - 0.5;
        ballVY = hitPos * 7;
        rallyCount++;
        totalRallies++;
        if (rallyCount > maxRally) maxRally = rallyCount;
        addParticles(ballX, ballY, COLORS.playerGlow, 12);
      }

      // Opponent paddle collision (with AI perk bonus height)
      const opponentPaddleH = PADDLE_H + aiPaddleBonus;
      if (
        ballX + BALL_R >= CANVAS_W - PADDLE_W - 20 &&
        ballY >= opponentY &&
        ballY <= opponentY + opponentPaddleH &&
        ballVX > 0
      ) {
        ballVX = -Math.abs(ballVX) * 1.05; // faster acceleration = shorter rallies
        const hitPos = (ballY - opponentY) / opponentPaddleH - 0.5;
        ballVY = hitPos * 7;
        rallyCount++;
        totalRallies++;
        if (rallyCount > maxRally) maxRally = rallyCount;
        addParticles(ballX, ballY, COLORS.opponentGlow, 12);
      }

      // Teleport perk
      if (gs.perkActive && board.perk === 'Teleport') {
        // Only teleport once (check via a flag we set)
        if (!((gameStateRef.current as any)._teleported)) {
          ballX = CANVAS_W * 0.6 + Math.random() * (CANVAS_W * 0.3);
          ballY = BALL_R + Math.random() * (CANVAS_H - BALL_R * 2);
          (gameStateRef.current as any)._teleported = true;
          addParticles(ballX, ballY, '#ec4899', 20);
        }
      } else {
        (gameStateRef.current as any)._teleported = false;
      }

      // Freeze perk — slow opponent
      // (handled via aiSpeed already being lower when active)

      // Score — update ref immediately, batch React state update to avoid re-render mid-frame
      let scored = false;
      if (ballX < 0) {
        oScore++;
        gameStateRef.current.opponentScore = oScore;
        addParticles(0, ballY, COLORS.opponentGlow, 25);
        resetBall();
        scored = true;
      }
      if (ballX > CANVAS_W) {
        pScore++;
        gameStateRef.current.playerScore = pScore;
        addParticles(CANVAS_W, ballY, COLORS.playerGlow, 25);
        resetBall();
        scored = true;
      }
      // Defer React state updates to after the frame to prevent re-render stutter
      if (scored) {
        const ps = pScore, os = oScore;
        requestAnimationFrame(() => { setPlayerScore(ps); setOpponentScore(os); });
      }

      // Check win
      if (pScore >= WIN_SCORE || oScore >= WIN_SCORE) {
        if (pScore >= WIN_SCORE) {
          addWinRef.current(winPrize);
        } else {
          addLossRef.current(losePenalty);
        }
        // Clear active match on completion
        try { localStorage.removeItem('chainpong-active-match'); } catch {}
        running = false;
        cancelAnimationFrame(animId);
        gameStateRef.current.gameOver = true;
        gameStateRef.current.maxRally = maxRally;
        gameStateRef.current.totalRallies = totalRallies;
        const elapsed = Math.floor((Date.now() - gameStateRef.current.matchStartTime) / 1000);
        setMatchStats({ maxRally, totalRallies, matchTime: elapsed });
        setGameOver(true);
        return;
      }

      // Trail
      trail.push({ x: ballX, y: ballY, age: 0 });
      trail = trail.filter((t) => t.age < 12);
      trail.forEach((t) => {
        t.age++;
        const alpha = 1 - t.age / 12;
        const [r, g, b] = COLORS.trailColor;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.25})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, BALL_R * (1 - t.age / 12) * 0.8, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw paddles
      drawPaddle(12, playerY, PADDLE_W, playerPaddleH, COLORS.playerPaddle1, COLORS.playerPaddle2, COLORS.playerGlow);
      drawPaddle(CANVAS_W - 12 - PADDLE_W, opponentY, PADDLE_W, opponentPaddleH, COLORS.opponentPaddle1, COLORS.opponentPaddle2, COLORS.opponentGlow);

      // Draw ball
      const ballAlpha = gs.perkActive && board.perk === 'Invisibility' ? 0.15 : 1;
      drawBall(ballX, ballY, ballAlpha);

      // Particles
      particles = particles.filter((p) => p.life > 0);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.025;
        p.vx *= 0.97;
        p.vy *= 0.97;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life * 0.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Score display (big, faded)
      ctx.fillStyle = COLORS.scoreText;
      ctx.font = 'bold 72px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(pScore), CANVAS_W / 2 - 70, 80);
      ctx.fillText(String(oScore), CANVAS_W / 2 + 70, 80);

      // AI perk indicator on canvas
      if (aiPerkTimer > 0 && aiPerkType) {
        ctx.fillStyle = 'rgba(244,63,94,0.6)';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`AI: ${aiPerkType}`, CANVAS_W - 20, 20);
      }

      // Stake display in PvP
      if (isPvP) {
        ctx.fillStyle = 'rgba(212,160,23,0.1)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Stake: ${pvpStakeAmount} ${TOKEN_SYMBOL} each | Pot: ${(pvpStakeAmount * 2).toFixed(4)} ${TOKEN_SYMBOL}`, CANVAS_W / 2, CANVAS_H - 14);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousemove', handleMouse);
      canvas.removeEventListener('touchmove', handleTouch);
    };
  // Stable dependencies only — mutable state uses refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, gameOver]);

  // Key handler for perk
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !perkUsedThisGame && perkAvailable && started) {
        activatePerk();
      }
      if (e.code === 'Escape') {
        setScreen('lobby');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [perkUsedThisGame, perkAvailable, started, activatePerk, setScreen]);

  const playerWon = playerScore >= WIN_SCORE;

  // Rolling counter effect for earnings
  useEffect(() => {
    if (!gameOver) { setDisplayedEarnings(0); return; }
    const target = playerWon ? winPrize : losePenalty;
    if (target === 0) { setDisplayedEarnings(0); return; }
    const steps = 30;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setDisplayedEarnings(target * Math.min(step / steps, 1));
      if (step >= steps) clearInterval(interval);
    }, 40);
    return () => clearInterval(interval);
  }, [gameOver, playerWon, winPrize, losePenalty]);

  return (
    <div className="min-h-screen bg-[#060810] flex flex-col items-center justify-center px-2 sm:px-4">
      {/* Countdown */}
      {!started && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center z-20 bg-black/70"
          exit={{ opacity: 0 }}
        >
          <motion.span
            key={countdown}
            className="text-8xl font-bold"
            style={{ color: '#f5d060', textShadow: '0 0 30px rgba(245,208,96,0.5)' }}
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
          >
            {countdown === 0 ? 'GO!' : countdown}
          </motion.span>
        </motion.div>
      )}

      {/* HUD — Premium Layout */}
      <div className="w-full max-w-[800px] mb-2 sm:mb-3 px-2">
        {/* Top row: Players + Score */}
        <div className="flex items-center justify-between mb-1.5">
          {/* Player */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-mint/5 border border-mint/15 rounded-lg px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-mint online-dot" />
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">You</span>
            </div>
            <span className="text-2xl sm:text-3xl font-black text-mint tabular-nums">{playerScore}</span>
          </div>

          {/* Center: Pot / Mode */}
          <div className="flex flex-col items-center">
            {isPvP ? (
              <div className="flex items-center gap-1.5 bg-gold/8 border border-gold/20 rounded-full px-3.5 py-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" className="text-gold"/></svg>
                <span className="text-xs font-bold text-gold">{(pvpStakeAmount * 2).toFixed(4)} {TOKEN_SYMBOL}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/5 rounded-full px-3 py-1.5">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                  PvP Match
                </span>
              </div>
            )}
            <span className="text-[9px] text-gray-600 mt-0.5">First to {WIN_SCORE}</span>
          </div>

          {/* Opponent */}
          <div className="flex items-center gap-2.5">
            <span className="text-2xl sm:text-3xl font-black text-coral tabular-nums">{opponentScore}</span>
            <div className="flex items-center gap-1.5 bg-coral/5 border border-coral/15 rounded-lg px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-coral online-dot" />
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Opp</span>
            </div>
          </div>
        </div>

        {/* AI Perk indicator */}
        {aiPerkDisplay && (
          <motion.div
            className="flex items-center justify-center"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="text-[10px] bg-coral/10 text-coral px-2.5 py-1 rounded-full border border-coral/20 animate-pulse font-semibold">
              ⚡ AI: {aiPerkDisplay}
            </span>
          </motion.div>
        )}
      </div>

      {/* Canvas */}
      <div className="relative rounded-xl sm:rounded-2xl overflow-hidden border border-white/[0.06] w-full max-w-[800px]" style={{ boxShadow: '0 0 40px rgba(212,160,23,0.08), 0 4px 30px rgba(0,0,0,0.5)' }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block w-full cursor-none touch-none"
          style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
        />
      </div>

      {/* Perk Button — perks are permanent, usable once per game */}
      {perkAvailable && (
        <div className="mt-3 sm:mt-4 flex items-center gap-2 sm:gap-3">
          <button
            onClick={activatePerk}
            disabled={perkUsedThisGame}
            className={`px-4 sm:px-6 py-2 rounded-xl font-semibold text-xs sm:text-sm transition-all ${
              perkUsedThisGame
                ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                : 'btn-primary hover:scale-105'
            }`}
          >
            {perkActive ? '⚡ ACTIVE' : perkUsedThisGame ? '✓ Used this game' : `${board.perkIcon} ${board.perk}`}
          </button>
          {!perkUsedThisGame && (
            <span className="text-gray-600 text-xs sm:text-sm hidden sm:inline">Press SPACE or tap</span>
          )}
        </div>
      )}

      {/* Game Over Overlay — Premium Result Screen */}
      {gameOver && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center z-30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* Background with color tint */}
          <div className={`absolute inset-0 ${playerWon ? 'bg-black/85' : 'bg-black/90'}`} style={{ backdropFilter: 'blur(8px)' }} />

          {/* Confetti / particle effects for winner */}
          {playerWon && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {Array.from({ length: 20 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    background: ['#f5d060', '#10b981', '#00d4ff', '#a855f7', '#f97316'][i % 5],
                    left: `${5 + Math.random() * 90}%`,
                  }}
                  initial={{ y: -20, opacity: 1, scale: Math.random() * 0.5 + 0.5 }}
                  animate={{
                    y: '100vh',
                    opacity: [1, 1, 0],
                    rotate: Math.random() * 720,
                    x: (Math.random() - 0.5) * 200,
                  }}
                  transition={{
                    duration: 2.5 + Math.random() * 2,
                    delay: Math.random() * 1.5,
                    ease: 'easeIn',
                  }}
                />
              ))}
            </div>
          )}

          <motion.div
            className="relative w-full max-w-md mx-4"
            initial={{ scale: 0.8, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          >
            {/* Result Card */}
            <div
              className="rounded-2xl sm:rounded-3xl overflow-hidden"
              style={{
                background: 'rgba(10,14,26,0.95)',
                border: `1px solid ${playerWon ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.2)'}`,
                boxShadow: playerWon
                  ? '0 0 60px rgba(16,185,129,0.15), 0 0 120px rgba(245,208,96,0.05)'
                  : '0 0 40px rgba(244,63,94,0.1)',
              }}
            >
              {/* Header glow bar */}
              <div
                className="h-1"
                style={{
                  background: playerWon
                    ? 'linear-gradient(90deg, transparent, #10b981, #f5d060, #10b981, transparent)'
                    : 'linear-gradient(90deg, transparent, #f43f5e, transparent)',
                }}
              />

              <div className="p-6 sm:p-8">
                {/* Victory / Defeat header */}
                <motion.div
                  className="text-center mb-5"
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {playerWon ? (
                    <>
                      <div className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center" style={{
                        background: 'radial-gradient(circle at 35% 35%, #fff8e7, #f5d060 40%, #d4a017 70%)',
                        boxShadow: '0 0 30px rgba(245,208,96,0.4)',
                      }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="#0a0e1a" stroke="#0a0e1a" strokeWidth="1"/></svg>
                      </div>
                      <h2 className="text-4xl sm:text-5xl font-black tracking-tight" style={{
                        background: 'linear-gradient(135deg, #f5d060, #d4a017, #f5d060)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        textShadow: 'none',
                      }}>
                        VICTORY!
                      </h2>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center" style={{
                        background: 'rgba(244,63,94,0.1)',
                        border: '1px solid rgba(244,63,94,0.2)',
                      }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#f43f5e" strokeWidth="1.5"/><path d="M15 9L9 15M9 9L15 15" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </div>
                      <h2 className="text-4xl sm:text-5xl font-black text-coral/80 tracking-tight">
                        DEFEAT
                      </h2>
                    </>
                  )}
                </motion.div>

                {/* Score */}
                <motion.div
                  className="flex items-center justify-center gap-4 mb-5"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="text-center">
                    <div className="text-3xl sm:text-4xl font-black text-mint">{playerScore}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">You</div>
                  </div>
                  <div className="text-gray-600 text-lg font-light">—</div>
                  <div className="text-center">
                    <div className="text-3xl sm:text-4xl font-black text-coral">{opponentScore}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Opp</div>
                  </div>
                </motion.div>

                {/* Earnings / Loss Display */}
                <motion.div
                  className="rounded-xl p-4 mb-5 text-center"
                  style={{
                    background: playerWon ? 'rgba(16,185,129,0.06)' : isPvP ? 'rgba(244,63,94,0.06)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${playerWon ? 'rgba(16,185,129,0.15)' : isPvP ? 'rgba(244,63,94,0.1)' : 'rgba(255,255,255,0.05)'}`,
                  }}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  {playerWon ? (
                    <>
                      <div className="text-2xl sm:text-3xl font-black text-mint tracking-tight">
                        +{displayedEarnings.toFixed(4)} <span className="text-lg text-mint/60">{TOKEN_SYMBOL}</span>
                      </div>
                      {isPvP && (
                        <div className="text-[10px] text-gray-500 mt-1.5 flex items-center justify-center gap-1.5">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2"/><path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                          Confirmed on Base
                        </div>
                      )}
                    </>
                  ) : isPvP ? (
                    <>
                      <div className="text-2xl sm:text-3xl font-black text-coral tracking-tight">
                        -{displayedEarnings.toFixed(4)} <span className="text-lg text-coral/60">{TOKEN_SYMBOL}</span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1.5">Stake transferred to the winner</div>
                    </>
                  ) : (
                    <div className="text-gray-400 text-sm">
                      {opponentScore - playerScore <= 2
                        ? `So close! Only ${opponentScore - playerScore} point${opponentScore - playerScore === 1 ? '' : 's'} away!`
                        : 'Better luck next time!'}
                    </div>
                  )}
                </motion.div>

                {/* Match Stats */}
                <motion.div
                  className="grid grid-cols-3 gap-2 mb-6"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <div className="rounded-lg p-2.5 text-center bg-white/[0.03] border border-white/5">
                    <div className="text-lg font-bold text-white">{matchStats.maxRally}</div>
                    <div className="text-[9px] text-gray-500 uppercase tracking-wider">Max Rally</div>
                  </div>
                  <div className="rounded-lg p-2.5 text-center bg-white/[0.03] border border-white/5">
                    <div className="text-lg font-bold text-white">{matchStats.totalRallies}</div>
                    <div className="text-[9px] text-gray-500 uppercase tracking-wider">Total Hits</div>
                  </div>
                  <div className="rounded-lg p-2.5 text-center bg-white/[0.03] border border-white/5">
                    <div className="text-lg font-bold text-white">
                      {Math.floor(matchStats.matchTime / 60)}:{String(matchStats.matchTime % 60).padStart(2, '0')}
                    </div>
                    <div className="text-[9px] text-gray-500 uppercase tracking-wider">Duration</div>
                  </div>
                </motion.div>

                {/* Action Buttons */}
                <motion.div
                  className="flex gap-3"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  <button
                    onClick={() => {
                      setPlayerScore(0);
                      setOpponentScore(0);
                      setGameOver(false);
                      setPerkActive(false);
                      setPerkUsedThisGame(false);
                      setAiPerkDisplay('');
                      setMatchStats({ maxRally: 0, totalRallies: 0, matchTime: 0 });
                      gameStateRef.current = { perkActive: false, aiPerkActive: false, aiPerkName: '', gameOver: false, playerScore: 0, opponentScore: 0, maxRally: 0, totalRallies: 0, matchStartTime: 0, lastScoreUpdate: 0 };
                      setCountdown(3);
                      setStarted(false);
                    }}
                    className="flex-1 btn-primary py-3.5 rounded-xl font-bold text-sm tracking-wide"
                  >
                    {playerWon ? 'Play Again' : 'Rematch'}
                  </button>
                  <button
                    onClick={() => setScreen('lobby')}
                    className="flex-1 py-3.5 rounded-xl font-semibold text-white text-sm bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] transition-colors"
                  >
                    Main Menu
                  </button>
                </motion.div>

                {/* Loser encouragement */}
                {!playerWon && (
                  <motion.div
                    className="mt-4 text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                  >
                    <p className="text-xs text-gray-500">
                      {opponentScore - playerScore <= 2
                        ? 'So close! You almost had it!'
                        : 'Keep practicing — every loss makes you stronger!'}
                    </p>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Controls hint */}
      <div className="mt-3 sm:mt-4 text-gray-700 text-xs sm:text-sm text-center px-4">
        Move mouse/touch to control paddle • ESC to exit
      </div>
    </div>
  );
}

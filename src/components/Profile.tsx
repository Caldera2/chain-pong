'use client';

import { useGameStore } from '@/lib/store';
import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { markWalletIntent } from '@/components/Providers';
import { CHAIN_NAME, IS_TESTNET } from '@/lib/wagmi';
import { apiUpdateProfile, apiExportKey } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, Trophy, Gamepad2, TrendingUp, Wallet, ShoppingBag,
  ChevronRight, LogOut, KeyRound, Eye, EyeOff, Pencil, Check, Copy,
  Shield, ExternalLink
} from 'lucide-react';

export default function Profile() {
  const {
    username, setUsername, wins, gamesPlayed, totalEarnings, walletBalance,
    boards, selectedBoard, setScreen, logout, userEmail, isConnected, address,
    authMethod, gameWallet, leaderboard, playerRank
  } = useGameStore();
  const [editing, setEditing] = useState(false);
  const [tempName, setTempName] = useState(username);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  const ownedBoards = boards.filter((b) => b.owned);
  const currentBoard = boards.find((b) => b.id === selectedBoard)!;
  const displayWallet = authMethod === 'email' ? gameWallet : (isConnected && address ? address : null);
  const shortWallet = displayWallet ? `${displayWallet.slice(0, 6)}...${displayWallet.slice(-4)}` : null;
  const displayName = username.startsWith('0x') && username.includes('...') ? 'Player' : username;
  const rankDisplay = leaderboard.length > 0 ? `#${playerRank}` : 'Unranked';

  const saveName = async () => {
    await apiUpdateProfile({ username: tempName });
    setUsername(tempName);
    setEditing(false);
  };

  const handleExportKey = async () => {
    if (!confirm('This will reveal your private key. Anyone with this key has full control of your wallet. Continue?')) return;
    setKeyLoading(true);
    try {
      const res = await apiExportKey();
      if (res.success && res.data) {
        setPrivateKey(res.data.privateKey);
        setShowPrivateKey(true);
      }
    } catch {}
    setKeyLoading(false);
  };

  return (
    <div className="min-h-screen bg-background pt-16 sm:pt-20 pb-24 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div>
          <button onClick={() => setScreen('lobby')} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-3">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
        </div>

        {/* Profile Card */}
        <Card>
          <CardContent className="p-5 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-violet-500/20 border border-border mx-auto mb-3 flex items-center justify-center text-2xl">
              {displayName.charAt(0).toUpperCase()}
            </div>
            {editing ? (
              <div className="flex items-center justify-center gap-2 mb-2">
                <Input
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className="max-w-[180px] text-center"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }}
                />
                <Button size="sm" onClick={saveName}><Check className="w-3 h-3" /></Button>
              </div>
            ) : (
              <h2 className="font-heading text-xl font-bold mb-0.5">
                {displayName}
                <button onClick={() => setEditing(true)} className="ml-2 text-muted-foreground hover:text-foreground">
                  <Pencil className="w-3 h-3 inline" />
                </button>
              </h2>
            )}
            <p className="text-xs text-muted-foreground">
              {authMethod === 'email' ? 'Email' : 'Wallet'} · Rank {rankDisplay}
            </p>
            {shortWallet && (
              <p className="text-[10px] text-muted-foreground/60 font-mono mt-1">{shortWallet}</p>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="p-3 text-center">
              <Trophy className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <p className="text-lg font-bold font-heading text-emerald-400">{wins}</p>
              <p className="text-[10px] text-muted-foreground">Wins</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Gamepad2 className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
              <p className="text-lg font-bold font-heading">{gamesPlayed}</p>
              <p className="text-[10px] text-muted-foreground">Played</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <TrendingUp className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold font-heading text-primary">{totalEarnings.toFixed(4)}</p>
              <p className="text-[10px] text-muted-foreground">ETH Earned</p>
            </CardContent>
          </Card>
        </div>

        {/* Wallet */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" /> Wallet
              </h3>
              {displayWallet && (
                <Badge variant="outline" className="text-[10px]">
                  {authMethod === 'email' ? 'Game Wallet' : 'Connected'}
                </Badge>
              )}
            </div>

            {displayWallet ? (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Address</span>
                    <span className="font-mono text-xs">{shortWallet}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Network</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      {CHAIN_NAME}
                      {IS_TESTNET && <Badge variant="outline" className="text-[8px] border-yellow-500/30 text-yellow-500">Test</Badge>}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Balance</span>
                    <span className="text-primary font-semibold">
                      {authMethod === 'wallet' ? walletBalance.toFixed(4) : totalEarnings.toFixed(4)} ETH
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="flex-1" onClick={() => setScreen('withdraw')}>Withdraw</Button>
                  {authMethod === 'email' && (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setScreen('deposit')}>Deposit</Button>
                  )}
                </div>
              </>
            ) : (
              <ConnectButton.Custom>
                {({ openConnectModal, mounted }) => (
                  mounted && <Button className="w-full" onClick={() => { markWalletIntent(); openConnectModal(); }}><Wallet className="w-4 h-4" /> Connect Wallet</Button>
                )}
              </ConnectButton.Custom>
            )}
          </CardContent>
        </Card>

        {/* Active Board */}
        {currentBoard && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Active Board</h3>
                <button onClick={() => setScreen('shop')} className="text-xs text-primary hover:underline">Change</button>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{currentBoard.perkIcon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{currentBoard.name}</p>
                  <p className="text-xs text-muted-foreground">{currentBoard.perk === 'None' ? 'No perk' : currentBoard.perk}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* My Boards */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">My Boards ({ownedBoards.length})</h3>
              <button onClick={() => setScreen('shop')} className="text-xs text-primary hover:underline flex items-center gap-1">
                <ShoppingBag className="w-3 h-3" /> Shop
              </button>
            </div>
            {ownedBoards.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {ownedBoards.map((board) => (
                  <div key={board.id} className="rounded-lg border border-border p-2 text-center">
                    <span className="text-lg block">{board.perkIcon}</span>
                    <p className="text-[9px] text-muted-foreground truncate mt-0.5">{board.name}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No boards yet</p>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        <Card>
          <CardContent className="p-0">
            <button
              onClick={() => setScreen('transactions')}
              className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <span className="text-sm">Transaction History</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Account</h3>
            <div className="space-y-2 text-sm">
              {authMethod === 'email' && userEmail && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="text-xs truncate ml-4">{userEmail}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method</span>
                <Badge variant="outline" className="text-[10px]">{authMethod === 'email' ? 'Email' : 'Wallet'}</Badge>
              </div>
            </div>

            {/* Export Key */}
            {authMethod === 'email' && (
              <>
                <Separator />
                {!showPrivateKey ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleExportKey}
                    disabled={keyLoading}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    {keyLoading ? 'Loading...' : 'Export Private Key'}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-destructive/5 border border-destructive/10 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-3.5 h-3.5 text-destructive" />
                        <span className="text-xs text-destructive font-medium">Never share this key</span>
                      </div>
                      <div className="bg-background rounded-md p-2 font-mono text-[10px] text-primary break-all select-all">
                        {privateKey}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          navigator.clipboard.writeText(privateKey || '');
                          setKeyCopied(true);
                          setTimeout(() => setKeyCopied(false), 2000);
                        }}
                      >
                        {keyCopied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1"
                        onClick={() => { setShowPrivateKey(false); setPrivateKey(null); }}
                      >
                        <EyeOff className="w-3 h-3" /> Hide
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            <Separator />
            <Button variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={logout}>
              <LogOut className="w-4 h-4" /> Log Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

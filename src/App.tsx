import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  TrendingDown, 
  Diamond, 
  Box, 
  History, 
  Wallet, 
  ArrowRightLeft,
  Search,
  LayoutDashboard,
  User as UserIcon,
  LogOut,
  Activity
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Block {
  id: string;
  name: string;
  price: number;
  lastPrice: number;
  trend: number;
}

interface User {
  id: string;
  username: string;
  balance: number;
}

interface Holding {
  user_id: string;
  block_id: string;
  amount: number;
  avg_buy_price: number;
}

interface TradeEvent {
  username: string;
  type: 'buy' | 'sell';
  blockName: string;
  amount: number;
  price: number;
  time: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [marketPrices, setMarketPrices] = useState<Block[]>([]);
  const [priceHistory, setPriceHistory] = useState<Record<string, { time: string, price: number }[]>>({});
  const [activityFeed, setActivityFeed] = useState<TradeEvent[]>([]);
  const [username, setUsername] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [tradeAmount, setTradeAmount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'market' | 'portfolio'>('market');
  const [advisorMessage, setAdvisorMessage] = useState<{ text: string, type: 'buy' | 'sell' } | null>(null);
  const [pendingTrade, setPendingTrade] = useState<{ blockId: string, entryPrice: number, amount: number, timeLeft: number } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const advisorSound = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    advisorSound.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
  }, []);

  useEffect(() => {
    if (!selectedBlock) {
      setAdvisorMessage(null);
      return;
    }

    const interval = setInterval(() => {
      if (!selectedBlock || !priceHistory[selectedBlock.id]) return;
      
      const history = priceHistory[selectedBlock.id];
      if (history.length < 10) return;

      const prices = history.map(h => h.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const currentPrice = selectedBlock.price;

      // If price is near the 10-tick low, it's a strong buy signal
      const isAtLow = currentPrice <= minPrice * 1.01; // Within 1% of low
      const isAtHigh = currentPrice >= maxPrice * 0.99; // Within 1% of high

      if (isAtLow) {
        setAdvisorMessage({ 
          text: `Advisor: ${selectedBlock.name} is at a 10-tick LOW! High probability of a recovery. Start a 5s UP prediction now!`, 
          type: 'buy' 
        });
        advisorSound.current?.play().catch(() => {});
      } else if (isAtHigh) {
        setAdvisorMessage({ 
          text: `Advisor: ${selectedBlock.name} is at a 10-tick HIGH! It might drop soon. Avoid UP predictions for now.`, 
          type: 'sell' 
        });
        advisorSound.current?.play().catch(() => {});
      }
      
      setTimeout(() => setAdvisorMessage(null), 12000);
    }, 15000);

    return () => clearInterval(interval);
  }, [selectedBlock?.id, selectedBlock?.price]);

  // Handle Pending Trade Countdown
  useEffect(() => {
    if (!pendingTrade) return;

    if (pendingTrade.timeLeft <= 0) {
      const currentBlock = marketPrices.find(b => b.id === pendingTrade.blockId);
      if (currentBlock && user) {
        const isProfit = currentBlock.price > pendingTrade.entryPrice;
        const resultAmount = isProfit ? pendingTrade.amount * 2 : 0;
        
        // Update balance on server
        fetch('/api/update-balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId: user.id, 
            amount: resultAmount - pendingTrade.amount, // Net change
            isWin: isProfit,
            blockName: currentBlock.name,
            tradeAmount: pendingTrade.amount,
            entryPrice: pendingTrade.entryPrice,
            exitPrice: currentBlock.price
          })
        }).then(res => res.json()).then(data => {
          setUser(data.user);
          setPendingTrade(null);
        });
      }
      return;
    }

    const timer = setTimeout(() => {
      setPendingTrade(prev => prev ? { ...prev, timeLeft: prev.timeLeft - 1 } : null);
    }, 1000);

    return () => clearTimeout(timer);
  }, [pendingTrade?.timeLeft, marketPrices]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'MARKET_UPDATE') {
        setMarketPrices(data.prices);
        setPriceHistory(data.history);
      } else if (data.type === 'TRADE_EVENT') {
        setActivityFeed(prev => [data.event, ...prev].slice(0, 10));
      }
    };

    return () => socket.close();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      setUser(data.user);
      setHoldings(data.holdings);
      localStorage.setItem('smp_username', username);
    } catch (err) {
      setError('Failed to login');
    } finally {
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    const savedUsername = localStorage.getItem('smp_username');
    if (savedUsername) {
      setUsername(savedUsername);
    }
  }, []);

  const handleTrade = async () => {
    if (!user || !selectedBlock || pendingTrade) return;
    if (user.balance < tradeAmount) {
      setError('Insufficient diamonds');
      return;
    }

    setPendingTrade({
      blockId: selectedBlock.id,
      entryPrice: selectedBlock.price,
      amount: tradeAmount,
      timeLeft: 5
    });
    setError(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4 font-sans text-white">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-[#2a2a2a] border border-white/10 rounded-2xl p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-emerald-500 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
              <Box className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Earth Stocks</h1>
            <p className="text-gray-400 mt-2">The ultimate block market</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Minecraft Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                placeholder="Enter your username..."
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              {isLoggingIn ? 'Connecting...' : 'Enter Market'}
              <ArrowRightLeft className="w-5 h-5" />
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  const selectedHistory = selectedBlock ? priceHistory[selectedBlock.id] || [] : [];

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white font-sans selection:bg-emerald-500/30">
      {/* Navigation */}
      <nav className="border-b border-white/5 bg-[#1a1a1a]/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Box className="w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight hidden sm:block">Earth Stocks</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
              <Diamond className="w-4 h-4 text-cyan-400" />
              <span className="font-mono font-medium">{user.balance.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
                <UserIcon className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium hidden sm:block">{user.username}</span>
              <button 
                onClick={() => {
                  localStorage.removeItem('smp_username');
                  window.location.reload();
                }}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-400 hover:text-white"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Market/Portfolio */}
          <div className="lg:col-span-8 space-y-6">
            {/* Tabs */}
            <div className="flex gap-4 p-1 bg-white/5 rounded-xl w-fit border border-white/5">
              <button
                onClick={() => setActiveTab('market')}
                className={cn(
                  "px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                  activeTab === 'market' ? "bg-emerald-500 text-white shadow-lg" : "text-gray-400 hover:text-white"
                )}
              >
                <LayoutDashboard className="w-4 h-4" />
                Market
              </button>
              <button
                onClick={() => setActiveTab('portfolio')}
                className={cn(
                  "px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                  activeTab === 'portfolio' ? "bg-emerald-500 text-white shadow-lg" : "text-gray-400 hover:text-white"
                )}
              >
                <Wallet className="w-4 h-4" />
                Portfolio
              </button>
            </div>

            {/* Content */}
            <AnimatePresence mode="wait">
              {activeTab === 'market' ? (
                <motion.div
                  key="market"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  {/* Advisor Notification */}
                  <AnimatePresence>
                    {advisorMessage && (
                      <motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={cn(
                          "p-4 rounded-xl border flex items-center gap-3 mb-6 shadow-lg",
                          advisorMessage.type === 'buy' 
                            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" 
                            : "bg-cyan-500/20 border-cyan-500/50 text-cyan-400"
                        )}
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                          advisorMessage.type === 'buy' ? "bg-emerald-500" : "bg-cyan-500"
                        )}>
                          <Activity className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-sm">Market Advisor</p>
                          <p className="text-xs opacity-90">{advisorMessage.text}</p>
                        </div>
                        <button 
                          onClick={() => setAdvisorMessage(null)}
                          className="text-xs font-bold opacity-50 hover:opacity-100"
                        >
                          Dismiss
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Chart Section */}
                  {selectedBlock && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 shadow-xl"
                    >
                      <div className="flex justify-between items-center mb-6">
                        <div>
                          <h2 className="text-2xl font-bold flex items-center gap-2">
                            {selectedBlock.name} History
                          </h2>
                          <p className="text-sm text-gray-400">Real-time price tracking (Last 30 ticks)</p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <Diamond className="w-5 h-5 text-cyan-400" />
                            <span className="text-3xl font-mono font-bold">{selectedBlock.price.toFixed(2)}</span>
                          </div>
                          <p className={cn(
                            "text-sm font-bold",
                            selectedBlock.trend >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}>
                            {selectedBlock.trend >= 0 ? '+' : ''}{((selectedBlock.price - selectedBlock.lastPrice) / selectedBlock.lastPrice * 100).toFixed(2)}%
                          </p>
                        </div>
                      </div>
                      
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={selectedHistory}>
                            <defs>
                              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                            <XAxis 
                              dataKey="time" 
                              stroke="#666" 
                              fontSize={10} 
                              tickLine={false} 
                              axisLine={false}
                              interval="preserveStartEnd"
                            />
                            <YAxis 
                              stroke="#666" 
                              fontSize={10} 
                              tickLine={false} 
                              axisLine={false}
                              domain={['auto', 'auto']}
                            />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                              itemStyle={{ color: '#10b981' }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="price" 
                              stroke="#10b981" 
                              strokeWidth={3}
                              fillOpacity={1} 
                              fill="url(#colorPrice)" 
                              animationDuration={300}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {marketPrices.map((block) => (
                      <motion.div
                        key={block.id}
                        layoutId={block.id}
                        onClick={() => setSelectedBlock(block)}
                        className={cn(
                          "p-4 rounded-2xl border transition-all cursor-pointer group",
                          selectedBlock?.id === block.id 
                            ? "bg-emerald-500/10 border-emerald-500/50 shadow-lg shadow-emerald-500/5" 
                            : "bg-[#1a1a1a] border-white/5 hover:border-white/20"
                        )}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                              <Box className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div>
                              <h3 className="font-bold">{block.name}</h3>
                              <p className="text-xs text-gray-500 uppercase tracking-wider">BLOCK_ID: {block.id}</p>
                            </div>
                          </div>
                          <div className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold",
                            block.trend >= 0 ? "text-emerald-400 bg-emerald-400/10" : "text-rose-400 bg-rose-400/10"
                          )}>
                            {block.trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {Math.abs(((block.price - block.lastPrice) / block.lastPrice) * 100).toFixed(2)}%
                          </div>
                        </div>
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Current Price</p>
                            <div className="flex items-center gap-1.5">
                              <Diamond className="w-4 h-4 text-cyan-400" />
                              <span className="text-xl font-mono font-bold">{block.price.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="portfolio"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-4"
                >
                  {holdings.length === 0 ? (
                    <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-12 text-center">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <History className="w-8 h-8 text-gray-600" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">No holdings yet</h3>
                      <p className="text-gray-400">Start trading blocks to build your portfolio!</p>
                    </div>
                  ) : (
                    <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-white/5 bg-white/2">
                            <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Block</th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Avg Price</th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Current</th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Profit/Loss</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {holdings.map((holding) => {
                            const currentBlock = marketPrices.find(b => b.id === holding.block_id);
                            const currentPrice = currentBlock?.price || 0;
                            const profit = (currentPrice - holding.avg_buy_price) * holding.amount;
                            const profitPercent = ((currentPrice - holding.avg_buy_price) / holding.avg_buy_price) * 100;

                            return (
                              <tr key={holding.block_id} className="hover:bg-white/2 transition-colors">
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center">
                                      <Box className="w-4 h-4 text-emerald-400" />
                                    </div>
                                    <span className="font-medium">{currentBlock?.name || holding.block_id}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 font-mono">{holding.amount}</td>
                                <td className="px-6 py-4 font-mono text-gray-400">{holding.avg_buy_price.toFixed(2)}</td>
                                <td className="px-6 py-4 font-mono">{currentPrice.toFixed(2)}</td>
                                <td className={cn(
                                  "px-6 py-4 font-mono font-bold",
                                  profit >= 0 ? "text-emerald-400" : "text-rose-400"
                                )}>
                                  {profit >= 0 ? '+' : ''}{profit.toFixed(2)} ({profitPercent.toFixed(1)}%)
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Column: Trading Panel & Activity */}
          <div className="lg:col-span-4 space-y-6">
            <div className="sticky top-24 space-y-6">
              <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 shadow-xl">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-emerald-500" />
                  Trade Center
                </h2>

                {selectedBlock ? (
                  <div className="space-y-6">
                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-400">Selected Block</span>
                        <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded uppercase">Live</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center">
                          <Box className="w-7 h-7 text-emerald-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold">{selectedBlock.name}</h3>
                          <div className="flex items-center gap-1.5">
                            <Diamond className="w-3 h-3 text-cyan-400" />
                            <span className="text-sm font-mono text-gray-300">{selectedBlock.price.toFixed(2)} / unit</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-2">
                          <label className="text-sm font-medium text-gray-400">Amount</label>
                          <span className="text-xs text-gray-500">Max: {Math.floor(user.balance / selectedBlock.price)}</span>
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            min="1"
                            value={tradeAmount}
                            onChange={(e) => setTradeAmount(Math.max(1, parseInt(e.target.value) || 0))}
                            className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono"
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
                            <button onClick={() => setTradeAmount(10)} className="text-[10px] font-bold bg-white/5 hover:bg-white/10 px-2 py-1 rounded transition-colors">10x</button>
                            <button onClick={() => setTradeAmount(100)} className="text-[10px] font-bold bg-white/5 hover:bg-white/10 px-2 py-1 rounded transition-colors">100x</button>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-white/2 rounded-xl border border-dashed border-white/10">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-400">Total Value</span>
                          <div className="flex items-center gap-1">
                            <Diamond className="w-3 h-3 text-cyan-400" />
                            <span className="font-mono font-bold">{(selectedBlock.price * tradeAmount).toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Remaining Balance</span>
                          <div className="flex items-center gap-1">
                            <Diamond className="w-3 h-3 text-cyan-400" />
                            <span className="font-mono">{(user.balance - (selectedBlock.price * tradeAmount)).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      {error && (
                        <motion.p 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-rose-400 text-sm font-medium bg-rose-400/10 p-3 rounded-lg border border-rose-400/20"
                        >
                          {error}
                        </motion.p>
                      )}

                      <div className="grid grid-cols-1 gap-4">
                        {pendingTrade ? (
                          <div className="bg-cyan-500/20 border border-cyan-500/50 rounded-xl p-4 text-center">
                            <p className="text-sm text-cyan-400 font-bold mb-1">Trade in Progress...</p>
                            <div className="text-3xl font-mono font-bold text-white">
                              {pendingTrade.timeLeft}s
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">
                              Entry: {pendingTrade.entryPrice.toFixed(2)} | Target: &gt; {pendingTrade.entryPrice.toFixed(2)}
                            </p>
                          </div>
                        ) : (
                          <button
                            onClick={handleTrade}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex flex-col items-center"
                          >
                            <span>Start 5s Prediction</span>
                            <span className="text-[10px] opacity-80">Win 2x if price goes UP</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="w-8 h-8 text-gray-600" />
                    </div>
                    <p className="text-gray-400">Select a block from the market to start trading</p>
                  </div>
                )}
              </div>

              {/* Global Activity Feed */}
              <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  Global Activity
                </h3>
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {activityFeed.length === 0 ? (
                    <p className="text-xs text-gray-600 text-center py-4 italic">Waiting for market activity...</p>
                  ) : (
                    activityFeed.map((event, i) => (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-start gap-3 text-xs border-b border-white/5 pb-3 last:border-0"
                      >
                        <div className={cn(
                          "w-2 h-2 rounded-full mt-1.5 shrink-0",
                          event.type === 'buy' ? "bg-emerald-500" : "bg-rose-500"
                        )} />
                        <div className="flex-1">
                          <p className="font-medium">
                            <span className="text-white">{event.username}</span>
                            <span className="text-gray-500"> {event.type === 'buy' ? 'bought' : 'sold'} </span>
                            <span className="text-emerald-400">{event.amount} {event.blockName}</span>
                          </p>
                          <div className="flex justify-between mt-1 text-[10px] text-gray-600">
                            <span>@ {event.price.toFixed(2)}</span>
                            <span>{event.time}</span>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 mt-12 bg-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Box className="w-5 h-5 text-emerald-500" />
            <span className="font-bold tracking-tight">Earth Stocks</span>
          </div>
          <p className="text-gray-500 text-sm">© 2026 Earth Stocks Network. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

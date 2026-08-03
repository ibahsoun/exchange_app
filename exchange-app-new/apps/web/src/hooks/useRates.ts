import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { useRatesStore } from '@/stores/rates.store';
import type { LiveRate, MarketSummary } from '@/stores/rates.store';

const API_BASE = '/api';
const WS_URL = window.location.origin;

/**
 * Hook that:
 * 1. Fetches initial rates via REST
 * 2. Subscribes to WebSocket for realtime updates
 * 3. Populates the zustand store
 *
 * Call once at the app root or layout level.
 */
export function useRatesConnection() {
  const socketRef = useRef<Socket | null>(null);
  const { setRates, setSummary, setConnected } = useRatesStore();

  useEffect(() => {
    // 1. Initial REST fetch
    async function fetchInitial() {
      try {
        const [ratesRes, summaryRes] = await Promise.all([
          fetch(`${API_BASE}/rates/latest`),
          fetch(`${API_BASE}/rates/summary`),
        ]);

        if (ratesRes.ok) {
          const rates: LiveRate[] = await ratesRes.json();
          setRates(rates);
        }

        if (summaryRes.ok) {
          const summary: MarketSummary = await summaryRes.json();
          setSummary(summary);
        }
      } catch {
        // API not available yet — will get data from WebSocket
      }
    }

    fetchInitial();

    // 2. WebSocket connection
    const socket = io(`${WS_URL}/ws/rates`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('rates:update', (rates: LiveRate[]) => {
      setRates(rates);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [setRates, setSummary, setConnected]);
}

/**
 * Read-only hook to access current rates from the store.
 * Use in any component that needs rate data.
 */
export function useRates() {
  return useRatesStore((s) => s.rates);
}

/** Get a specific pair */
export function useRate(base: string, quote: string) {
  return useRatesStore((s) => s.rates.find((r) => r.base === base && r.quote === quote));
}

/** Market summary */
export function useMarketSummary() {
  return useRatesStore((s) => s.summary);
}

/** WebSocket connection status */
export function useRatesConnected() {
  return useRatesStore((s) => s.connected);
}

/** Last update time */
export function useRatesLastUpdated() {
  return useRatesStore((s) => s.lastUpdated);
}

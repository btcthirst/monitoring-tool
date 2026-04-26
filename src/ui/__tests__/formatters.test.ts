import {
  formatAddress,
  formatProfit,
  formatPercent,
  formatSlippage,
  formatFee,
  formatTradeSize,
  formatRelativeTime,
  formatSeparator,
  formatKeyValue,
  resolveSymbol,
  formatCurrency,
  visibleLength,
} from '../formatters';

describe('ui formatters', () => {
  describe('addresses', () => {
    it('should abbreviate long addresses', () => {
      const addr = 'So11111111111111111111111111111111111111112';
      expect(formatAddress(addr, 4, 4)).toBe('So11...1112');
    });

    it('should return full address if short enough', () => {
      expect(formatAddress('ABC', 4, 4)).toBe('ABC');
    });
  });

  describe('resolveSymbol', () => {
    it('should resolve known mints', () => {
      expect(resolveSymbol('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe('USDC');
      expect(resolveSymbol('So11111111111111111111111111111111111111112')).toBe('SOL');
    });

    it('should return abbreviated address for unknown mints', () => {
      expect(resolveSymbol('11111111111111111111111111111111')).toBe('1111...1111');
    });
  });

  describe('profit and percentages', () => {
    it('should format profit with sign', () => {
      // Chalk adds ANSI codes, we can check for substring
      expect(formatProfit(1.23)).toContain('+1.23');
      expect(formatProfit(-1.23)).toContain('-1.23');
      expect(formatProfit(0)).toContain('0.000000');
    });

    it('should format percentages', () => {
      expect(formatPercent(5.5)).toContain('+5.50%');
      expect(formatPercent(-2.1)).toContain('-2.10%');
    });

    it('should format slippage', () => {
      expect(formatSlippage(0.0005)).toContain('0.050%'); // 0.05%
      expect(formatSlippage(0.005)).toContain('0.500%');  // 0.5%
      expect(formatSlippage(0.02)).toContain('2.000%');   // 2%
    });

    it('should format fee', () => {
      expect(formatFee(0.0025)).toContain('0.25%');
    });
  });

  describe('trade size', () => {
    it('should format trade size with given symbol', () => {
      expect(formatTradeSize(1000, 'SOL')).toContain('1000 SOL');
    });
  });

  describe('time', () => {
    it('should format relative time', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 5000)).toBe('5s ago');
      expect(formatRelativeTime(now - 70000)).toBe('1m ago');
      expect(formatRelativeTime(now - 3700000)).toBe('1h ago');
      expect(formatRelativeTime(now - 90000000)).toBe('1d ago');
      expect(formatRelativeTime(now)).toBe('just now');
    });
  });

  describe('UI elements', () => {
    it('should format separator', () => {
      expect(formatSeparator('-', 5)).toContain('-----');
    });

    it('should format key-value', () => {
      const formatted = formatKeyValue('Key', 'Value', 5);
      expect(formatted).toContain('Key');
      expect(formatted).toContain('Value');
      expect(visibleLength(formatted)).toBe(5 + 1 + 5); // keyWidth + space + value.length
    });
  });

  describe('ANSI handling', () => {
    it('should calculate visible length correctly', () => {
      const colored = '\x1b[32mHello\x1b[0m';
      expect(visibleLength(colored)).toBe(5);
    });


    it('should format currency with $ for USDC/USDT', () => {
      expect(formatCurrency(100, 'USDC')).toContain('$100');
      expect(formatCurrency(100, 'USDT')).toContain('$100');
    });

    it('should format currency with suffix for other tokens', () => {
      expect(formatCurrency(100, 'SOL')).toContain('100 SOL');
    });
  });
});

import {
  formatAddress,
  formatAbbreviated,
  formatProfit,
  formatPercent,
  formatSlippage,
  formatFee,
  formatPrice,
  formatTradeSize,
  formatRelativeTime,
  formatSeparator,
  formatKeyValue,
  formatStatus,
  visibleLength,
  padVisible,
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

  describe('numbers', () => {
    it('should abbreviate large numbers', () => {
      expect(formatAbbreviated(1500)).toBe('1.50K');
      expect(formatAbbreviated(1500000)).toBe('1.50M');
      expect(formatAbbreviated(1500000000)).toBe('1.50B');
      expect(formatAbbreviated(123)).toBe('123');
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

  describe('price and trade size', () => {
    it('should format price with symbol', () => {
      expect(formatPrice(100, 'USDC')).toBe('100 USDC');
    });

    it('should format trade size', () => {
      expect(formatTradeSize(1000)).toContain('1000 USDC');
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

    it('should format status', () => {
      expect(formatStatus('success', 'Done')).toContain('✅');
      expect(formatStatus('success', 'Done')).toContain('Done');
      expect(formatStatus('error', 'Fail')).toContain('❌');
    });
  });

  describe('ANSI handling', () => {
    it('should calculate visible length correctly', () => {
      const colored = '\x1b[32mHello\x1b[0m';
      expect(visibleLength(colored)).toBe(5);
    });

    it('should pad considering visible length', () => {
      const colored = '\x1b[32mHi\x1b[0m'; // length 2
      const padded = padVisible(colored, 5);
      expect(visibleLength(padded)).toBe(5);
      expect(padded.endsWith('   ')).toBe(true);
    });
  });
});

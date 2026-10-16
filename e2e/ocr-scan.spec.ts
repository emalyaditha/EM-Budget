import { test, expect } from '@playwright/test';
import { registerUser, loginUser, uniqueEmail } from './auth';

/**
 * The only test that covers the whole capture chain: canvas preprocessing,
 * tesseract, the parser and the scanner form. Unit tests prove the parser reads
 * good text; this proves the engine still hands it text worth reading.
 *
 * Amounts are asserted as a range rather than exactly, because OCR of a rendered
 * image can misread one digit. Every bug this guards is orders of magnitude, not
 * off-by-one: a grouped total used to be recorded as a fraction of itself.
 */
test.describe('Receipt scan end to end', () => {
  test.setTimeout(240000);

  test('reads merchant, grouped amount and day-first date off a real scan', async ({ page }) => {
    const user = uniqueEmail('e2e-ocr');
    await registerUser(page, user);
    await loginUser(page, user);

    // Deliberately built from the shapes that broke: a comma-grouped total, a
    // DD/MM date, a subtotal larger than the discount, and a "NO REFUNDS" footer.
    const dataUrl: string = await page.evaluate(() => {
      const lines: Array<[string, number]> = [
        ['KEELLS SUPER', 34],
        ['NO 42 GALLE ROAD', 20],
        ['DATE : 02/10/2026  14:22', 20],
        ['BASMATI RICE 5Kg     1,250.00', 22],
        ['FRESH MILK 1L          480.00', 22],
        ['SUBTOTAL             1,730.00', 22],
        ['DISCOUNT                80.00', 22],
        ['TOTAL                1,650.00', 26],
        ['CASH                 2,000.00', 22],
        ['CHANGE                   350.00', 22],
        ['THANK YOU. NO REFUNDS AFTER 7 DAYS', 18],
      ];
      const canvas = document.createElement('canvas');
      canvas.width = 700;
      canvas.height = 640;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas context');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      let y = 60;
      for (const [text, size] of lines) {
        ctx.font = `${size}px monospace`;
        ctx.fillText(text, 40, y);
        y += size + 22;
      }
      return canvas.toDataURL('image/png');
    });

    await page.getByText('Ledger Registry').first().click();
    await expect(page.locator('#receipt-scanner-root')).toBeVisible({ timeout: 20000 });

    await page.locator('#receipt-scanner-root input[type="file"]').setInputFiles({
      name: 'receipt.png',
      mimeType: 'image/png',
      buffer: Buffer.from(dataUrl.split(',')[1], 'base64'),
    });
    await page.getByRole('button', { name: /Start OCR Scan/i }).click();

    const root = page.locator('#receipt-scanner-root');
    await expect(root).toContainText('Extracted Details', { timeout: 180000 });

    const field = (label: string) =>
      root.locator(`label:has-text("${label}") + input, label:has-text("${label}") ~ input`).first();

    await expect(field('Merchant / Title')).toHaveValue(/KEELLS/i);
    await expect(field('Date')).toHaveValue('2026-10-02');

    const amount = Number(await field('Amount').inputValue());
    // The regression this exists for: 1,650.00 used to come out as 1.65.
    expect(amount).toBeGreaterThanOrEqual(1000);
    expect(amount).toBeLessThan(2000);
  });
});

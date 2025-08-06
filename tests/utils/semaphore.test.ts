import { Semaphore } from '@/utils/semaphore.js';

describe('Semaphore', () => {
  it('should allow immediate acquisition when permits available', async () => {
    const semaphore = new Semaphore(2);
    
    const start = Date.now();
    await semaphore.acquire();
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(10); // Should be immediate
  });

  it('should queue when no permits available', async () => {
    const semaphore = new Semaphore(1);
    
    // Acquire the only permit
    await semaphore.acquire();
    
    // Try to acquire another - should queue
    const promise = semaphore.acquire();
    
    // Release after short delay
    setTimeout(() => semaphore.release(), 50);
    
    const start = Date.now();
    await promise;
    const duration = Date.now() - start;
    
    expect(duration).toBeGreaterThan(40);
  });

  it('should handle multiple concurrent acquisitions', async () => {
    const semaphore = new Semaphore(2);
    const results: number[] = [];
    
    const promises = Array(5).fill(null).map(async (_, i) => {
      await semaphore.acquire();
      results.push(i);
      setTimeout(() => semaphore.release(), 10);
    });
    
    await Promise.all(promises);
    
    expect(results).toHaveLength(5);
    expect(results.sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
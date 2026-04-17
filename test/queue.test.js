'use strict';

const { PrintQueue, Priority, JobState } = require('../lib/queue');

describe('PrintQueue', () => {
  let queue;
  let printFn;

  beforeEach(() => {
    printFn = jest.fn().mockResolvedValue({ success: true, jobId: '123' });
    queue = new PrintQueue({
      printFunction: printFn,
      maxRetries: 1,
      retryDelay: 10
    });
  });

  afterEach(() => {
    queue.destroy();
  });

  it('should enqueue a job and start processing', async () => {
    const job = queue.enqueue('data');
    expect(job).toBeDefined();
    expect(job.state).toBe(JobState.PROCESSING);
    
    // Wait for processQueue (async)
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(printFn).toHaveBeenCalledWith(job);
    expect(job.state).toBe(JobState.COMPLETED);
  });

  it('should respect priorities', async () => {
    queue.pause();
    const jobLow = queue.enqueue('low', { priority: Priority.LOW });
    const jobHigh = queue.enqueue('high', { priority: Priority.HIGH });
    
    expect(queue.getJobs().queued[0].id).toBe(jobHigh.id);
    expect(queue.getJobs().queued[1].id).toBe(jobLow.id);
  });

  it('should handle retries on failure', async () => {
    queue.destroy(); // Recreate with longer delay
    queue = new PrintQueue({
      printFunction: printFn,
      maxRetries: 2,
      retryDelay: 100 // Longer delay for testing states
    });

    printFn.mockRejectedValueOnce(new Error('Generic failure'));
    const job = queue.enqueue('data');
    
    // First attempt fails, state becomes RETRYING (we wait less than 100ms)
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(job.state).toBe(JobState.RETRYING);
    expect(job.attempts).toBe(1);

    // After retryDelay, it should be processed again
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(job.attempts).toBe(2);
    expect(job.state).toBe(JobState.COMPLETED);
  });

  it('should fail after max retries', async () => {
    printFn.mockRejectedValue(new Error('Permanent failure'));
    const job = queue.enqueue('data', { maxRetries: 1 });
    
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(job.state).toBe(JobState.FAILED);
    expect(job.attempts).toBe(1);
  });

  it('should support deduplication', () => {
    queue = new PrintQueue({
      printFunction: printFn,
      deduplication: true,
      deduplicationWindowMs: 1000
    });

    const job1 = queue.enqueue('unique data');
    const job2 = queue.enqueue('unique data'); // Duplicate

    expect(job1).toBeDefined();
    expect(job2).toBeNull();
  });

  it('should emit events correctly', async () => {
    const enqueuedSpy = jest.fn();
    const completedSpy = jest.fn();
    
    queue.on('enqueued', enqueuedSpy);
    queue.on('completed', completedSpy);
    
    queue.enqueue('data');
    
    expect(enqueuedSpy).toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(completedSpy).toHaveBeenCalled();
  });
});

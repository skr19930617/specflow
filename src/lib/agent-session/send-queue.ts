// Per-handle FIFO send serializer with poison-state tracking.
// When a SessionError occurs, the queue enters a "poisoned" state and
// rejects all subsequent enqueues immediately.

import { SessionError } from "./errors.js";

export class SendQueue {
	private tail: Promise<void> = Promise.resolve();
	private poisonError: SessionError | null = null;

	/** Returns true if the queue has been poisoned by a SessionError. */
	get poisoned(): boolean {
		return this.poisonError !== null;
	}

	/**
	 * Enqueue a function for serial execution.
	 * If the queue is poisoned, rejects immediately without executing `fn`.
	 */
	enqueue<T>(fn: () => Promise<T>): Promise<T> {
		if (this.poisonError) {
			return Promise.reject(this.poisonError);
		}
		// Wrap fn so that tasks queued before the poison was set still check
		// the poisoned state when their turn arrives.
		const guardedFn = (): Promise<T> => {
			if (this.poisonError) {
				return Promise.reject(this.poisonError);
			}
			return fn();
		};
		const result: Promise<T> = this.tail.then(guardedFn);
		this.tail = result.then(
			() => {},
			(err: unknown) => {
				if (err instanceof SessionError) {
					this.poisonError = err;
				}
			},
		);
		return result;
	}
}

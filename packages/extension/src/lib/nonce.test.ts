import { describe, expect, it } from "vitest";

import { generateNonce } from "./nonce.js";

describe("generateNonce", () => {
	it("uses randomUUID when available", () => {
		const cryptoObj = {
			randomUUID: () => "fixed-uuid",
			getRandomValues: <T extends Uint8Array>(array: T): T => array,
		};

		expect(generateNonce(cryptoObj)).toBe("fixed-uuid");
	});

	it("falls back to getRandomValues when randomUUID is unavailable (insecure context)", () => {
		const cryptoObj = {
			getRandomValues: <T extends Uint8Array>(array: T): T => {
				array.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

				return array;
			},
		};

		expect(generateNonce(cryptoObj)).toBe("000102030405060708090a0b0c0d0e0f");
	});

	it("falls back when randomUUID is present but not a function", () => {
		const cryptoObj = {
			randomUUID: undefined,
			getRandomValues: <T extends Uint8Array>(array: T): T => {
				array.fill(255);

				return array;
			},
		};

		expect(generateNonce(cryptoObj)).toBe("ff".repeat(16));
	});
});

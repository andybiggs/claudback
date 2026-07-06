// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildSelector } from "./selector.js";

describe("buildSelector", () => {
	it("prefers a unique id", () => {
		document.body.innerHTML = `
			<div>
				<button id="submit-button">Submit</button>
			</div>
		`;
		const el = document.getElementById("submit-button");
		if (!el) {
			throw new Error("fixture element not found");
		}

		const selector = buildSelector(el);

		expect(selector).toBe("#submit-button");
		expect(document.querySelector(selector)).toBe(el);
	});

	it("builds a path using classes when there is no id", () => {
		document.body.innerHTML = `
			<div class="card">
				<p class="description">Some text</p>
			</div>
		`;
		const el = document.querySelector(".description");
		if (!el) {
			throw new Error("fixture element not found");
		}

		const selector = buildSelector(el);

		expect(document.querySelector(selector)).toBe(el);
	});

	it("disambiguates siblings with nth-of-type", () => {
		document.body.innerHTML = `
			<ul class="list">
				<li>First</li>
				<li>Second</li>
				<li>Third</li>
			</ul>
		`;
		const items = document.querySelectorAll(".list li");
		const second = items[1];

		const selector = buildSelector(second);

		expect(selector).toContain("nth-of-type(2)");
		expect(document.querySelector(selector)).toBe(second);
	});

	it("finds the original element for each fixture", () => {
		document.body.innerHTML = `
			<div id="root">
				<section>
					<span>A</span>
					<span>B</span>
					<span id="target">C</span>
				</section>
			</div>
		`;
		const target = document.getElementById("target");
		if (!target) {
			throw new Error("fixture element not found");
		}

		const selector = buildSelector(target);

		expect(document.querySelector(selector)).toBe(target);
	});
});

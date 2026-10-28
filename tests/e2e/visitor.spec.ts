import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const branchId = "11111111-1111-4111-8111-111111111111";
const route = `/check-in/${branchId}`;

test.beforeEach(async ({ page }) => {
	await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js**", async (request) => {
		await request.fulfill({
			contentType: "application/javascript",
			body: `window.turnstile={render:function(_element,options){options.callback("test-turnstile-token");return "widget"},reset:function(){},remove:function(){},getResponse:function(){return "test-turnstile-token"}};window.onloadTurnstileCallback?.();`,
		});
	});
});

test("visitor sees pending and terminal status without another action", async ({ page, request }) => {
	await page.goto(route);
	await expect(page.getByRole("heading", { name: "Welcome to Lagos Branch" })).toBeVisible();
	await expect(page.getByText("Example Organization", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "24-hour" }).click();
	await expect(page.getByRole("button", { name: "24-hour" })).toHaveAttribute("aria-pressed", "true");
	await page.getByLabel("Full name").fill("Visitor Example");
	await page.getByLabel("Phone number").fill("+2348012345678");
	await page.getByLabel("Purpose").fill("Project meeting");
	await page.getByLabel("Department (optional)").selectOption({ label: "Operations" });
	await page.getByLabel("Host (optional)").selectOption({ label: "Ada Host" });
	await page.getByRole("button", { name: "Check in" }).click();
	await expect(page.getByText("Reception is reviewing your visit")).toBeVisible();
	await expect(page.getByRole("button", { name: "Check in another visitor" })).toBeVisible();
	await page.reload();
	await expect(page.getByText("Reception is reviewing your visit")).toBeVisible();
	await expect(page.getByRole("button", { name: "Check in", exact: true })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "24-hour" })).toHaveAttribute("aria-pressed", "true");
	await page.getByRole("button", { name: "Stopwatch" }).click();
	await expect(page.getByLabel("Elapsed visit time")).toHaveText("00:00:00");
	await expect(page.getByText("Starts when reception admits you.")).toBeVisible();
	const admittedAt = new Date(Date.now() - 65_000);
	await request.post("http://127.0.0.1:54331/__test/visit-status", {
		data: {
			status: "approved_on_site",
			admitted_at: admittedAt.toISOString(),
		},
	});
	await page.reload();
	await expect(page.getByText("Time since reception admitted you.")).toBeVisible();
	await expect(page.getByLabel("Elapsed visit time")).toHaveText(/^00:01:/);
	await request.post("http://127.0.0.1:54331/__test/visit-status", {
		data: {
			status: "checked_out",
			time_out: new Date(admittedAt.getTime() + 65_000).toISOString(),
		},
	});
	await page.reload();
	await expect(page.getByText("You have checked out")).toBeVisible();
	await expect(page.getByLabel("Elapsed visit time")).toHaveText("00:01:05");
	await expect(page.getByText("Stopped at checkout.")).toBeVisible();
	await expect(page.getByRole("button", { name: "Check in", exact: true })).toHaveCount(0);
});

test("a shared tablet can hand off to the next visitor", async ({ page }) => {
	await page.goto(route);
	await page.getByLabel("Full name").fill("First Visitor");
	await page.getByLabel("Phone number").fill("+2348012345678");
	await page.getByLabel("Purpose").fill("Meeting");
	await page.getByRole("button", { name: "Check in", exact: true }).click();
	await expect(page.getByText("Reception is reviewing your visit")).toBeVisible();
	page.once("dialog", async (dialog) => {
		expect(dialog.type()).toBe("confirm");
		expect(dialog.message()).toContain("This visit is still active");
		await dialog.accept();
	});
	await page.getByRole("button", { name: "Check in another visitor" }).click();
	await expect(page.getByLabel("Full name")).toHaveValue("");
	await page.reload();
	await expect(page.getByLabel("Full name")).toBeVisible();
	await expect(page.getByText("First Visitor")).toHaveCount(0);
});

test("check-in and login surfaces have no serious accessibility violations", async ({ page }) => {
	await page.goto(route);
	const checkIn = await new AxeBuilder({ page }).analyze();
	expect(checkIn.violations.filter((issue) => ["critical", "serious"].includes(issue.impact ?? ""))).toEqual([]);
	await page.goto("/login");
	await expect(page).toHaveTitle("Sign in | TGM Check-in");
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
	const login = await new AxeBuilder({ page }).analyze();
	expect(login.violations.filter((issue) => ["critical", "serious"].includes(issue.impact ?? ""))).toEqual([]);
});

test("public and host pages reflow at phone and tablet widths", async ({ page }) => {
	for (const width of [320, 390, 768, 1200]) {
		await page.setViewportSize({ width, height: 760 });
		for (const [path, heading] of [
			[route, "Welcome to Lagos Branch"],
			["/login", "Sign in"],
			["/host-decision", "Visitor request"],
		]) {
			await page.goto(path);
			await expect(page.getByRole("heading", { name: heading })).toBeVisible();
			await expect(page.locator("#main-content")).toHaveCount(1);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
			);
			expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(1);
		}
	}
});

test("validation moves focus to the first invalid visitor field", async ({ page }) => {
	await page.goto(route);
	await page.getByRole("button", { name: "Check in", exact: true }).click();
	await expect(page.getByLabel("Full name")).toBeFocused();
	await expect(page.getByRole("alert").filter({ hasText: "Please correct" })).toBeVisible();
});

test("visitor form reflows at a simulated 200 percent zoom and keeps primary controls touch sized", async ({
	page,
}) => {
	await page.setViewportSize({ width: 640, height: 800 });
	await page.goto(route);
	await expect(page.getByRole("heading", { name: "Welcome to Lagos Branch" })).toBeVisible();
	for (const name of ["12-hour", "24-hour", "Stopwatch", "Check in"]) {
		const height = await page
			.getByRole("button", { name, exact: name === "Check in" })
			.evaluate((element) => element.getBoundingClientRect().height);
		expect(height, `${name} touch target`).toBeGreaterThanOrEqual(44);
	}
	await page.evaluate(() => {
		document.documentElement.style.zoom = "2";
	});
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	);
	expect(overflow).toBeLessThanOrEqual(1);
});

test("clock swipes through the three views in both directions", async ({ page }) => {
	await page.goto(route);
	await page.getByRole("button", { name: "12-hour" }).click();
	async function swipe(startX: number, endX: number) {
		await page.evaluate(
			({ startX, endX }) => {
				const clock = document.querySelector('[aria-label="Branch clock and visit stopwatch"]');
				if (!clock) throw new Error("Clock missing");
				const start = new Touch({
					identifier: 1,
					target: clock,
					clientX: startX,
				});
				const end = new Touch({ identifier: 1, target: clock, clientX: endX });
				clock.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [start] }));
				clock.dispatchEvent(new TouchEvent("touchend", { bubbles: true, changedTouches: [end] }));
			},
			{ startX, endX },
		);
	}
	await swipe(200, 100);
	await expect(page.getByRole("button", { name: "24-hour" })).toHaveAttribute("aria-pressed", "true");
	await swipe(200, 100);
	await expect(page.getByRole("button", { name: "Stopwatch" })).toHaveAttribute("aria-pressed", "true");
	await swipe(100, 200);
	await expect(page.getByRole("button", { name: "24-hour" })).toHaveAttribute("aria-pressed", "true");
});

test("host preview survives refresh and requires confirmation", async ({ page, request }) => {
	await request.post("http://127.0.0.1:54331/__test/host-decision-reset");
	await page.goto(`/host-decision#token=${"a".repeat(64)}`);
	await expect(page.getByText("Host Visitor")).toBeVisible();
	await expect(page.getByRole("button", { name: "Approve visit" })).toBeVisible();
	await expect(page).toHaveURL(/\/host-decision$/);
	await page.reload();
	await expect(page.getByText("Host Visitor")).toBeVisible();
	await page.getByRole("button", { name: "Approve visit" }).click();
	await expect(page.getByText("Approve this visitor request?")).toBeVisible();
	await page.getByRole("button", { name: "Cancel" }).click();
	await expect(page.getByRole("button", { name: "Approve visit" })).toBeFocused();
	await page.getByRole("button", { name: "Approve visit" }).click();
	await page.getByRole("button", { name: "Confirm approval" }).click();
	await expect(page.getByText("Approved. Reception will admit the visitor.")).toBeVisible();
	await page.reload();
	await expect(page.getByText("This decision link is invalid.")).toBeVisible();
});

test("home routes into the new account flow", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("invalid QR and unknown branch show distinct public exits", async ({ page }) => {
	await page.goto("/check-in/not-a-branch-code");
	await expect(page.getByRole("heading", { name: "Invalid check-in code" })).toBeVisible();
	await page.goto(`/check-in/${"f".repeat(8)}-${"f".repeat(4)}-4fff-8fff-${"f".repeat(12)}`);
	await expect(page.getByRole("heading", { name: "Check-in code unavailable" })).toBeVisible();
});

test("unapproved privacy and a directory outage have different public recovery states", async ({ page }) => {
	await page.goto("/check-in/44444444-4444-4444-8444-444444444444");
	await expect(page.getByRole("heading", { name: "Check-in is not configured" })).toBeVisible();
	await page.goto("/check-in/55555555-5555-4555-8555-555555555555");
	await expect(page.getByRole("heading", { name: "Check-in temporarily unavailable" })).toBeVisible();
});

test("host preview distinguishes expired and invalid links", async ({ page }) => {
	await page.goto(`/host-decision#token=${"b".repeat(64)}`);
	await expect(page.getByText("This decision link has expired. Ask reception for help.")).toBeVisible();
	await page.goto(`/host-decision#token=${"c".repeat(64)}`);
	await expect(page.getByText("This decision link is invalid. Ask reception to send a current link.")).toBeVisible();
});

test("invitation token moves from the fragment to an HttpOnly cookie", async ({ page, context }) => {
	const token = "b".repeat(64);
	await page.goto(`/invite#token=${token}`);
	await expect(page).toHaveURL(/\/login$/);
	const cookies = await context.cookies();
	const invitation = cookies.find((item) => item.name === "tgm_invitation");
	expect(invitation?.value).toBe(token);
	expect(invitation?.httpOnly).toBe(true);
});

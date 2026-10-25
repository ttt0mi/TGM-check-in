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
	await expect(page.getByText("Example Organization")).toBeVisible();
	await page.getByRole("button", { name: "24-hour" }).click();
	await expect(page.getByRole("button", { name: "24-hour" })).toHaveAttribute("aria-pressed", "true");
	await page.getByLabel("Full name").fill("Visitor Example");
	await page.getByLabel("Phone number").fill("+2348012345678");
	await page.getByLabel("Purpose").fill("Project meeting");
	await page.getByLabel("Department (optional)").selectOption({ label: "Operations" });
	await page.getByLabel("Host (optional)").selectOption({ label: "Ada Host" });
	await page.getByRole("button", { name: "Check in" }).click();
	await expect(page.getByText("Reception is reviewing your visit")).toBeVisible();
	await page.reload();
	await expect(page.getByText("Reception is reviewing your visit")).toBeVisible();
	await expect(page.getByRole("button", { name: "Check in" })).toHaveCount(0);
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
	await expect(page.getByRole("button", { name: "Check in" })).toHaveCount(0);
});

test("check-in and login surfaces have no serious accessibility violations", async ({ page }) => {
	await page.goto(route);
	const checkIn = await new AxeBuilder({ page }).analyze();
	expect(checkIn.violations.filter((issue) => ["critical", "serious"].includes(issue.impact ?? ""))).toEqual([]);
	await page.goto("/login");
	const login = await new AxeBuilder({ page }).analyze();
	expect(login.violations.filter((issue) => ["critical", "serious"].includes(issue.impact ?? ""))).toEqual([]);
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

test("host decision token is removed from the address bar", async ({ page }) => {
	await page.goto(`/host-decision#token=${"a".repeat(64)}`);
	await expect(page.getByRole("button", { name: "Approve visit" })).toBeVisible();
	await expect(page).toHaveURL(/\/host-decision$/);
	await page.getByRole("button", { name: "Approve visit" }).click();
	await expect(page.getByText("Approved. Reception will admit the visitor.")).toBeVisible();
});

test("home routes into the new account flow", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
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
